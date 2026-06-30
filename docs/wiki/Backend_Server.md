# Backend Server

> **Özet:** Plannivo backend'i, ESM modülleri kullanan bir Node.js + Express uygulamasıdır; `backend/server.js` içinde ~70 router'ı `/api` altına mount eder, güvenlik/oran-sınırlama/CSRF/JWT middleware zincirini kurar ve Iyzico ödeme callback'ini elle yönetir. Socket.IO gerçek-zamanlı yayını, Redis cache, PostgreSQL `pg` Pool ve birçok cron işi/zamanlayıcı bu giriş noktasında başlatılır.
>
> **Kütüphaneler:** Express 5, Node.js (ESM), `pg`, Socket.io, ioredis/redis, Helmet, express-rate-limit, node-cron, Winston, Decimal.js, jsonwebtoken.
>
> **Bağlantılar:** [[Database]], [[Authentication_Authorization]], [[Notifications_System]], [[Deployment_Infrastructure]], [[Frontend_Shell]], [[Payments_Currency]], [[Shared_Backend_Utilities]], [[Operations_Scripts]]

---

## Sorumluluk

`backend/server.js` (~1888 satır) tüm backend'in tek giriş noktasıdır. Görevleri:

1. Ortam değişkenlerini yükle (`backend/.env`, sonra kök `.env`), `DISABLE_LOGIN` ön-önceliklendirmesini uygula (`backend/utils/loginLock.js`).
2. Express app + HTTP server oluştur, Socket.IO'yu (`socketService`) ve bildirim gerçek-zamanlı servisini başlat.
3. Arka plan servislerini (cache, backup, döviz kuru, finansal mutabakat) bloklamayan şekilde başlat.
4. Güvenlik + gövde-ayrıştırma + CSRF middleware zincirini kur.
5. ~70 router'ı `/api/*` altına doğru sırayla mount et.
6. Iyzico ödeme callback'ini (`POST /api/finances/callback/iyzico`) doğrudan handler olarak yönet.
7. Cron işleri ve `setInterval` temizlik görevlerini zamanla.
8. Zarif kapatma (graceful shutdown) + global hata yakalayıcılarını bağla.

## Bootstrap Sırası

Dosyanın üst kısmı, route'lar gelmeden önce servisleri başlatır:

- `metricsService.start()` — 60s'de bir metrik toplar (`backend/services/metricsService.js`).
- `socketService.initialize(server)` — Socket.IO sunucusunu HTTP server'a bağlar.
- `notificationRealtimeService.initialize()` — Postgres `LISTEN/NOTIFY` tabanlı canlı bildirimler.
- `initializeCache()` — Redis cache servisini test eder (salt-okunur moda toleranslı).
- `initializeBackupService()` — Günlük 02:00 yedek + aylık temizlik (`BACKUPS_ENABLED !== 'false'` ise).
- `ExchangeRateService.startScheduler()` — Döviz kurları cron'u (bkz. [[Payments_Currency]]).
- `initializeReconciliationService()` — `RECONCILIATION_INTERVAL_MINUTES` (varsayılan 60) periyodik finansal mutabakat (`RECONCILIATION_ENABLED !== 'false'` ise).

`app.set('trust proxy', [...])` Docker/nginx arkası içindir; `app.disable('etag')` ile dinamik API yanıtlarında 304 önlenir.

## Middleware Zinciri (sıralı)

Route'lardan ÖNCE şu sırayla uygulanır (`backend/middlewares/security.js` + `errorHandler.js` + `performance.js`):

1. `securityHeaders` (Helmet — CSP, HSTS; prod'da `unsafe-eval` yok) + `securityResponseHeaders` (X-Frame-Options DENY, nosniff, `X-Powered-By` silinir).
2. `compression({ threshold: 1024 })`.
3. `requestLogger` + `responseMetrics` (yanıt süresi/cache metrikleri).
4. **CORS** — `configureCORS()` allowlist'i (localhost portları + `ukc.plannivo.com` + `FRONTEND_URL`); Iyzico callback yolu (`/api/finances/callback/`) ayrı `callbackCors` kullanır (sandbox/prod iyzipay origin'leri).
5. `/api/media` router'ı — **rate-limit'ten ÖNCE** mount edilir (shop ızgarası onlarca resim ister; 429'a takılmamalı, uzun-cache'lenebilir).
6. **Rate limiting** — `/api/auth` için `authRateLimit` (prod 20 istek/15dk), `/api` için `apiRateLimit` (prod 300 istek/dk). `SKIP_RATE_LIMIT=true` dev'de atlar.
7. `express.json({ limit: '10mb' })` + `urlencoded` — webhook imza doğrulaması için `req.rawBody` saklanır.
8. `/api` için `Cache-Control: no-store` (dinamik veri).
9. `sanitizeInput()` — XSS temizliği (`xss` kütüphanesi; `<`/`>` içermeyen string'lerde hızlı-yol).
10. **CSRF** — `csrfMiddleware` (double-submit cookie). `Bearer` token'lı istekleri ve `CSRF_EXEMPT_PREFIXES`'i atlar (callback'ler, public auth, webhook'lar, agent, public warranty/proposals). Bkz. [[Authentication_Authorization]].
11. `req.socketService` her route'a enjekte edilir.

`POST /api/client-errors` (auth yok, sınırlı gövde) frontend hatalarını backend loguna yazar; prod'da tarayıcı konsolu erişilemez olduğundan kritiktir.

## Route Mount Sırası ve Auth Kalıbı

Auth iki şekilde uygulanır: ya mount düzeyinde `app.use('/api/x', authenticateJWT, xRouter)`, ya da router içinde route-bazında (public GET'ler için). Önemli kalıplar:

- **Public (auth yok):** `/api/auth`, `/api/2fa`, `/api/telegram`, `/api/spotify`, `/api/gdpr`, `/api/member-offerings`, `/api/repair-requests`, `/api/public/forms`, `/api/public/warranty`, `/api/public/proposals`, `/api/public/legal-documents`, `/api/weather`, `/api/google-reviews`, `/api/assistant`, `/api/settings`, `/api/team-settings`.
- **Mount-auth (`authenticateJWT`):** `/api/users`, `/api/finances`, `/api/wallet`, `/api/shop-orders`, `/api/accommodation`, `/api/dashboard`, `/api/notifications`, `/api/admin`, vb.
- **Route-bazında auth:** `/api/instructors` (GET / public), `/api/products` + `/api/shop/products` (misafir gezme), `/api/services` (paket kataloğu public), `/api/events` (GET /public public), `/api/bookings`, `/api/group-bookings`.
- **Agent:** `/api/agent` → `authenticateAgentRequest` (n8n/Kai için `X-Kai-Agent-Secret`; `backend/middlewares/authenticateAgent.js`).
- **Metrics:** `/api/metrics` → `authenticateJWT` + `authorizeRoles(['admin','super_admin'])`.

**Sıra-bağımlı incelikler (yorumlarda belirtilmiş):**
- `instructorAvailabilityRouter`, generic `/:id` route'unun `/me/availability`'yi yutmaması için `instructorsRouter`'dan ÖNCE mount edilir.
- `familyRouter`, `studentsRouter`'dan önce mount edilir.
- Iyzico POST callback'i `/api/finances` JWT middleware'inden ÖNCE tanımlanır (anonim gateway POST'u).

Finansal route'lar (`/api/finances`, `/api/rentals`, `/api/finances/daily-operations`) `triggerFinancialReconciliation` middleware'ini de taşır (bkz. aşağı + [[Finances_Wallet]]).

Alias mount'lar: `/api/shop/orders` → `shopOrdersRouter`, `/api/shop/products` → `productsRouter`.

## Iyzico Ödeme Callback (kritik handler)

`POST /api/finances/callback/iyzico` (`server.js` ~508–1381). Iyzico, kullanıcı ödemeyi tamamladıktan sonra buraya POST eder. Güvenlik: `iyzicoCallbackLimiter` (IP başına 5dk'da 30), token uzunluk doğrulaması, `verifyPayment(token)` ile kriptografik doğrulama (`backend/services/paymentGateways/iyzicoGateway.js`), ve her işlem tipi için **idempotent** durum kontrolü.

Tek token, basket/conversationId önekine göre çok sayıda varlık tipine yönlendirilir:
- Cüzdan yatırma (`wallet_deposit_requests` → `approveDepositFromCallback`), rental ödemesi (`metadata.type === 'rental_payment'`).
- Shop siparişi (`gateway_token` veya `ORD-` conversationId; ertelenmiş cüzdan kesintileri, voucher kullanımı, manager komisyonu).
- Booking (`BKG-`), grup-booking katılımcı (`GBKP-`) / organizatör (`GBKO_`).
- Üyelik (`MO-` / member_purchases.gateway_transaction_id) — iptal edilmiş üyeliği DİRİLTMEZ; cüzdan credit+debit çifti.
- Konaklama (`ACC-`), paket satın alma (`PKG-` / customer_packages.gateway_transaction_id; outsider→student yükseltme + bekleyen voucher kullanımı).

Her başarılı durum Socket.IO ile bildirir ve `${FRONTEND_URL}/payment/callback?status=...`'a yönlendirir. GET callback'i ASLA state değiştirmez, sadece yönlendirir. Bir safety-net hata middleware'i ham JSON yerine her zaman yönlendirme döndürür.

## DB Bağlantısı (db.js)

`backend/db.js` tek `pg.Pool` örneğini export eder (bkz. [[Database]] tam detay için). Öne çıkanlar:
- Bağlantı string'i önceliği: `LOCAL_DATABASE_URL` → `DATABASE_URL` → `DB_HOST/DB_NAME/DB_USER`.
- **Üretim koruması:** non-prod ortamda string `217.154.201.29` (prod IP) içeriyorsa hard-fail.
- Pool: `max: 20, min: 10`, `idleTimeout 30s`, `keepAlive`, `maxUses: 7500`; başlangıçta önceden ısıtılır.
- Tüm sorgular yavaş-sorgu (>1500ms) ve havuz-doygunluğu uyarıları için enstrümante edilir.
- `pg.types` parser'ları: timestamp (OID 1114) UTC olarak, DATE (OID 1082) ham `YYYY-MM-DD` string olarak okunur (saat dilimi kaymalarını önler).

## Redis ve Socket.IO

- **Redis:** `backend/services/cacheService.js` üzerinden; salt-okunur Redis'e toleranslı (cache başarısızsa app cache'siz devam eder). `backend/middlewares/cache.js` route-düzeyi cache yardımcıları sağlar.
- **Socket.IO:** `backend/services/socketService.js`; `emitToChannel(channel, event, payload)` kalıbı (`user:<id>`, `general`). Mesaj temizliği `MessageCleanupService` (5 gün) ile yapılır. Detay için [[Notifications_System]].

## Cron İşleri ve Zamanlayıcılar

`server.listen` callback'i içinde başlatılır:
- `MessageCleanupService.startScheduler()` — sohbet mesajı saklama.
- `startLessonReminderJob()` (`backend/jobs/lessonReminderJob.js`) — `*/15 * * * *` node-cron; 23-25h penceresindeki onaylı bookinglere ders hatırlatma e-postası (`reminder_sent_at` ile tekil).
- `initializeTelegramBot(...)` — Telegram webhook + komut handler'ları (bloklamaz).
- `cron.schedule('15 4 * * *', pruneStaleLinkCodes)` — bayat telegram link kodları temizliği (Europe/Istanbul).
- `setInterval`'lar: bayat `pending_payment` member_purchases (30dk eşik), bayat customer_packages (2s eşik, ilişkili pending bookingleri de iptal eder), bayat `bank_transfer_receipts` (7 gün, ilişkili kayıtları iptal eder).

Diğer cron'lar servislerde tanımlıdır: `BackupService`, `ExchangeRateService`, `reconciliationService`, `notificationAlertService`.

## Hata Yönetimi ve Kapatma

- `backend/middlewares/errorHandler.js` — Winston logger (`logs/error.log`, `logs/combined.log` + console), `AppError` sınıfları, `globalErrorHandler`, `handleNotFound`, `requestLogger`. `logger` tüm backend'de paylaşılan tek logger örneğidir.
- 404 handler + `handleNotFound` + `globalErrorHandler` zincirin sonunda.
- `gracefulShutdown` — SIGTERM/SIGINT/uncaughtException/unhandledRejection'da: Socket.IO'yu kapat (deadlock önlemek için HTTP'den önce), bildirim listener'ı + Redis'i kapat, 30s zorla-çıkış zamanlayıcısı.
- Sunucu yalnızca `NODE_ENV !== 'test'` ve `JEST_WORKER_ID` yokken dinlemeye başlar; `app` test için export edilir.

## Teşhis ve Sistem Route'ları (system.js / debug.js)

İki küçük router, sağlık/teşhis ve geliştirici-amaçlı sorgular için ayrı tutulur. Her ikisi de `server.js`'de mount düzeyinde `authenticateJWT` ile korunur ve route içinde ek olarak `authorizeRoles` ile kapı kontrolü yapar (`backend/middlewares/authorize.js`).

### `/api/system` — Sistem durumu ve metrikler (`backend/routes/system.js`)

`app.use('/api/system', authenticateJWT, systemRouter)` (server.js ~1472). `metricsService`'i (`backend/services/metricsService.js`) ve `pool`'u (`backend/db.js`) kullanır; logger paylaşılan Winston örneğidir.

- `GET /database-status` — `users` ↔ `roles` JOIN ile `student` rolündeki kullanıcı sayısını sayar; sıfırsa `{ needsInitialization: true }` döndürür (ilk kurulum tespiti).
- `POST /initialize-database` — `authorizeRoles(['admin'])`; tek transaction içinde mock öğrenci/eğitmen verisi ekler (seed). Hatada `ROLLBACK`.
- `POST /:entityType/:id/update-references` — varlık adı değişiminde `bookings`/`rentals` notlarına referans satırı ekler (students/instructors/equipment).
- `GET /performance-metrics` — `metricsService.getSnapshot({ reset })` ile çalışma-zamanı metrik anlık görüntüsü; `?reset=true` ile sayaçları sıfırlar. Daha geniş metrik akışı için bkz. [[Shared_Backend_Utilities]] ve [[Dashboard_Metrics_Admin]].

### `/api/debug` — Geliştirici teşhis uçları (`backend/routes/debug.js`)

`app.use('/api/debug', authenticateJWT, debugRouter)` (server.js ~1516). Tüm route'lar `authorizeRoles(['developer', 'admin'])` ile kısıtlıdır ve `console.log` ile yoğun teşhis çıktısı üretir.

- `GET /bookings` — `information_schema` üzerinden `bookings` tablosunun var-olma durumunu, **kolon yapısını** (`column_name`/`data_type`), satır sayısını ve son 5 örnek booking'i (student/instructor JOIN ile) döndürür. Tablo yoksa `listAllTables()` ile tüm public tablo adlarını listeler.
- `POST /create-test-booking` — bugün için tek bir test booking'i seed eder (rastgele eğitmen/öğrenci/servis; gerekirse "Debug Test Service" oluşturur). `resolveActorId`/`appendCreatedBy` (`backend/utils/auditUtils.js`) ile aktör damgalanır.
- `GET /all-bookings` — tüm booking'leri JOIN'lerle döndürür; hiç yoksa bir örnek booking seed eder. (İsmine rağmen kimlik doğrulamasız DEĞİLDİR — eski yorum yanıltıcı.)

> **Güvenlik notu (prod'da maruz teşhis ucu):** `/api/debug/*` route'ları ham DB şemasını, tablo listesini ve örnek satırları döndürür ve prod ortamında da mount edilir. Yalnızca `developer`/`admin` rolleri erişebilir; bu rollerin sıkı tutulması ve gerekirse prod'da bu router'ın mount'tan çıkarılması/feature-flag'lenmesi önerilir. `create-test-booking`/`all-bookings` prod verisine yazabilir — geliştirme dışında kullanılmamalıdır. İlgili tek-seferlik bakım/onarım betikleri için bkz. [[Operations_Scripts]].

## Dikkat / Tuzaklar

- **Nodemon `backend/middlewares/`'i izlemez** — buradaki düzenlemeler dev'de zorla restart gerektirir (MEMORY: `project_nodemon_skips_middlewares`).
- **CSRF muafiyeti:** anonim POST route'ları `CSRF_EXEMPT_PREFIXES`'e eklenmezse 403 alır (`security.js`; MEMORY: `project_csrf_public_route_exemption`).
- **Para = Decimal.js** — callback handler'ı dahil her parasal hesap `new Decimal(...)` kullanır; kayan nokta YASAK.
- Iyzico callback'i tek devasa handler'dır; her dal kendi idempotency anahtarını/durum guard'ını taşır — yeni ödeme tipleri eklerken bu kalıbı koru.
- `triggerFinancialReconciliation` middleware'i `res.end`'i sarmalar ve başarılı (2xx) yanıtlardan sonra asenkron mutabakatı tetikler; senkron yanıtı bloklamaz.
- Rate-limit `apiRateLimit` `/api/media`'dan SONRA gelir; resim isteklerini bilerek kotanın dışında tutar.
