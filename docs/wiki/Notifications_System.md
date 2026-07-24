# Notifications System

> **Özet:** Plannivo'nun çok kanallı bildirim altyapısı: uygulama içi (in-app) bildirim merkezi, e-posta (nodemailer SMTP + Resend teslimat takibi), Telegram botu (grammy) ve Socket.io üzerinden realtime push. Tüm in-app bildirimler tek bir birleşik dispatcher'dan (`notificationDispatcherUnified.js`) geçer; tercih kontrolü, idempotency ve Telegram fan-out burada yapılır.
>
> **Kütüphaneler:** Express, PostgreSQL (`LISTEN/NOTIFY`), Socket.io, nodemailer (DKIM imzalı SMTP), Resend + Svix (webhook imza doğrulama), grammy (Telegram Bot API), node-cron, Decimal/UUID.
>
> **Bağlantılar:** [[Backend_Server]], [[Database]], [[Authentication_Authorization]], [[Bookings_Calendar]], [[Warranty_Repairs]], [[Payments_Currency]], [[Chat_Community_Events]], [[Deployment_Infrastructure]], [[Architecture_Overview]]

---

## Sorumluluk

Bu modül, sistemde gerçekleşen olayları (rezervasyon oluşturma, ders atama, ödeme, garanti talebi, rating isteği vb.) kullanıcılara dört kanaldan iletir:

1. **In-app** — `notifications` tablosuna yazılır, [[Frontend_Shell]] içindeki çan ikonu ve NotificationCenter'da gösterilir.
2. **Realtime** — PostgreSQL `LISTEN/NOTIFY` → Socket.io ile o anda bağlı kullanıcıya anlık iletilir.
3. **E-posta** — transactional + marketing e-postalar; nodemailer SMTP ile gönderilir, Resend webhook'ları ile teslimat durumu izlenir.
4. **Telegram** — kullanıcı hesabını bota bağladıysa, ders/rezervasyon olayları Telegram mesajı olarak fan-out edilir.

Marketing rızası (consent) kontrolü hem in-app (`marketingConsentService`) hem e-posta hem Telegram katmanında uygulanır — transactional bildirimler her zaman gider, marketing bildirimleri sadece opt-in kullanıcılara.

## Backend

### Rotalar (`backend/routes/`)
- `notifications.js` — `/api/notifications` (JWT zorunlu). Push subscribe/unsubscribe, `POST /send` (admin/manager; marketing consent filtresiyle), `GET /user` (sayfalı liste + unread sayısı), `PATCH /:id/read`, `PATCH /read-all`, `DELETE /clear-all`, ve `GET|PUT /settings` (24 ayrı toggle: `weather_alerts`, `booking_updates`, `payment_notifications`, `telegram_notifications` …). PUT partial-merge yapar (belirtilmeyen toggle'ları sıfırlamaz).
- `telegram.js` — `/api/telegram`. `POST /webhook` (grammy `webhookCallback`, `x-telegram-bot-api-secret-token` doğrulamalı, prod'da secret zorunlu), `GET /status`, `POST /link-code`, `DELETE /chats/:chatId`, `POST /unlink`, `POST /test`.
- `notification-workers.js` — `/api/notification-workers` (admin/manager/developer veya `x-worker-drain-secret`). `GET /state` (kuyruk metrikleri), `POST /drain` (graceful shutdown için kuyruğu boşaltır).
- `resendWebhook.js` — `/api/webhooks/resend`. Svix imzalı Resend olaylarını (`email.delivered/bounced/complained/opened/clicked`) `email_deliveries` tablosuna uygular. CSRF-exempt `/api/webhooks/` prefix'i altında, `req.rawBody` ile imza kontrolü (bkz. [[Backend_Server]] CSRF notu).
- `paymentWebhooks.js` — `/api/webhooks` (iyzico/paytr/binance-pay). Ödeme sağlayıcı geri çağrıları; doğrudan bildirim yazmaz ama ödeme akışını tetikler (bkz. [[Payments_Currency]]).

### Servisler (`backend/services/`)
- **`notificationDispatcherUnified.js`** — TÜM in-app bildirimlerin tek giriş noktası. `dispatchNotification({ userId, type, title, message, data, idempotencyKey, client })` ve `dispatchToStaff({ type, roles, excludeUserIds, … })`. İçinde:
  - `NOTIFICATION_TYPES` — ~50 geçerli tip seti (booking_*, rental_*, package_purchase, accommodation_booking, shop_order, payment, warranty_claim_*, friend_request, weather …). Bilinmeyen tip `general`'a düşürülür.
  - `PREFERENCE_MAP` — tip → `notification_settings` kolonu eşlemesi. Haritada olmayan tipler her zaman gönderilir (transactional). Tercih sorgusu 10 sn TTL'li in-memory cache (`_prefCache`) ile hızlandırılır.
  - In-app insert başarılı olunca `deliverTelegram()` **best-effort** (await edilmeden) çağrılır — Telegram hatası asla in-app kaydını bloklamaz.
- **`notificationWriter.js`** — `insertNotification()` tek SQL: `INSERT INTO notifications (...) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`. Idempotency anahtarı ile çift kaydı engeller.
- **`notificationDispatcher.js`** — düşük-seviye iş kuyruğu (`NotificationDispatcher` sınıfı). Global + per-tenant round-robin kuyruklar, `NOTIFICATION_QUEUE_CONCURRENCY` (varsayılan 8), `MAX_QUEUE_LENGTH` (20000) kapasite aşımında en eski işi düşürme, idempotency cache, `awaitIdle()` drain desteği. Metrikler `metrics/notificationMetrics.js`'e yazılır.
- **`notificationWorkerState.js`** — worker kimliği/rengi, `drainWorker()` (graceful shutdown sırasında kuyruğu boşaltır), `getWorkerState()`. `notification-workers.js` rotası bunu kullanır.
- **`notificationRealtimeService.js`** — boot'ta pool'dan tek bir client alıp `LISTEN notification_events` yapar. DB trigger'ı bildirim INSERT/UPDATE'inde JSON payload yayar; servis bunu `user:<id>` kanalına `notification:new` / `notification:update` Socket.io eventi olarak iletir. Bağlantı koparsa 5 sn aralıkla yeniden bağlanır (3 başarısızlıktan sonra durur).
- **`socketService.js`** — Socket.io singleton. JWT ile `authenticate`, `user:<id>` / `role:<role>` / `general` odalarına katılım, kanal yetkilendirme (`isChannelAllowed` — rol hiyerarşisi), `emitToChannel`. Chat fan-out'u da burada (bkz. [[Chat_Community_Events]]).
- **`emailService.js`** — nodemailer transport. SMTP env'leri varsa SMTP, yoksa `streamTransport`'a (dış teslimatsız önizleme) düşer. **DKIM imzalama** (`DKIM_DOMAIN/SELECTOR/PRIVATE_KEY`) spam'den kaçmak için. `sendEmail()` marketing consent kontrolü yapar, başarılı/başarısız her gönderimi `recordEmailSend()` ile `email_deliveries`'e loglar. Varsayılan from `no-reply@plannivo.com`, reply-to `info@plannivo.com`.
- **`emailDeliveryService.js`** — `email_deliveries` log tablosu yönetimi (migration 276). `recordEmailSend()` (gönderim anı, best-effort, asla throw etmez) + `applyEmailEvent()` (Resend webhook eşleme: önce `provider_id`, sonra 5 gün içindeki en yeni alıcı+konu eşleşmesi). Durum ilerlemesi forward-only ama `bounced/complained/failed` her zaman kazanır (geç gelen "opened" bir bounce'u maskeleyemez).
- **`telegramService.js`** — grammy `Bot`. `initialize()` (token doğrula, webhook kaydet ya da dev'de long-polling), `sendToChat()` (429/5xx retry + 403'te chat'i soft-disable), `sendToUser()` (kullanıcının tüm aktif chat'lerine fan-out), `generateLinkCode()` / `consumeLinkCode()` (tek kullanımlık TTL'li bağlama kodu), `unlinkChat()`, `pruneStaleLinkCodes()`. Her gönderim `telegram_delivery_log`'a yazılır.
- **`telegramBotHandlers.js`** — grammy komut handler'ları: `/start <code>`, `/link`, bare-kod paste, `/unlink`, `/status`, `/help`. `consumeLinkCode` ile hesap bağlama.
- **`telegramTemplates/index.js`** — `buildTelegramMessageForType(type, data)` — bildirim tipini HTML Telegram mesajına çevirir (ders atandı/yeniden planlandı/iptal/tamamlandı, yeni rezervasyon, rating, kiralama, garanti). Template'i olmayan tipler `null` döner → Telegram'a gitmez (in-app only). `warranty.js` ayrı garanti template'i.
- **`emailTemplates/*`** — markalı e-posta gövdeleri: `welcomeEmail`, `verificationEmail`, `lessonReminder`, `waiverConfirmation`, ve garanti ailesi (`warrantyClaimSubmitted`, `warrantyStatusChange`, `warrantyClaimClosed`, `warrantyActivityDigest`, `warrantyStaffLink`) — hepsi `brandedLayout.js` üzerinden (bkz. [[Warranty_Repairs]]).
- **`welcomeEmailService.js`** — yeni kullanıcıya parola-sıfırlama linkli karşılama e-postası (`skipConsentCheck: true`, transactional).
- **`bookingNotificationService.js`** — rezervasyon yaşam döngüsü olaylarını dinleyip `dispatchNotification` / `dispatchToStaff` çağıran katman; retry/idempotency mantığı ve rating-isteği niyetleri (`rate_lesson`) burada. `rescheduleNotifications.js` rotası ile yeniden-planlama bildirimlerini besler. `notifyInstructorAssigned({bookingId, instructorUserId})` (in-app + Telegram, tip `booking_assigned`) staff-created rezervasyonlarda TÜM üç create yolundan çağrılır: `POST /bookings/`, `POST /bookings/calendar` VE `POST /bookings/group` (grup/semi-private — 2026-07-23'te eklendi; öncesinde grup derslerinde eğitmen Telegram bildirimi hiç gitmiyordu). Ayrıca Model B davet akışında `ensureGroupCalendarBooking()` takvim satırını ilk oluşturduğunda da tetiklenir.

### Alerting (kuyruk sağlık alarmları)

- **`alerts/notificationAlertService.js`** — bildirim kuyruğunun sağlığını izleyip eşik aşımında bir **webhook** (Slack uyumlu, `{ text }` JSON gövdesi) ile alarm gönderen `NotificationAlertService`. Webhook URL'i `SLACK_ALERT_WEBHOOK_URL` ya da `SLACK_WEBHOOK_URL` env'inden gelir; URL yoksa alarm sessizce no-op olur. Modül import edildiğinde tek bir singleton oluşturulup `initialize()` edilir (`backend/server.js:107` → `import './services/alerts/notificationAlertService.js'`).
  - `metrics/notificationMetrics.js` EventEmitter'ına abone olur: `failed`, `dropped`, `queueDepth`, `processed`. Bu metrikleri `notificationDispatcher.js` kuyruğu yayar (bkz. yukarıdaki `notificationDispatcher` maddesi).
  - **Eşikler (hepsi env ile ayarlanabilir):**
    - **Failure spike** — `NOTIFICATION_ALERT_FAILURE_WINDOW_MS` (varsayılan 5 dk) penceresinde `NOTIFICATION_ALERT_FAILURE_THRESHOLD` (varsayılan 20) başarısızlık → "Notification failures spiking". Pencere kayan bir timestamp listesiyle tutulur.
    - **Backlog** — `queueDepth ≥ NOTIFICATION_ALERT_BACKLOG_THRESHOLD` (varsayılan 500) → "Notification backlog growing".
    - **Latency** — bir işin `durationMs` (işlem süresi) veya `waitMs` (kuyrukta bekleme) değeri `NOTIFICATION_ALERT_LATENCY_THRESHOLD_MS`'i (varsayılan 5000 ms) aşarsa → "Slow notification processing" / "queue wait time high". Hem `failed` hem `processed` event'inde kontrol edilir.
    - **Capacity drop** — `dropped` event'i `reason === 'capacity'` ile gelirse (kuyruk kapasite aşımında en eski işi düşürdüğünde) → "Notification queue dropping jobs".
  - **Cooldown / de-dup:** her alarm türü ayrı bir anahtarla (`failures`, `backlog`, `latency-duration`, `latency-wait`, `dropped-capacity`) `notifyOnce()` üzerinden gönderilir; aynı anahtar `NOTIFICATION_ALERT_COOLDOWN_MS` (varsayılan 5 dk) içinde tekrar gönderilmez. Webhook POST hatası yutulur (loglanır, throw etmez) — alarm altyapısı asıl bildirim akışını asla bloklamaz. `shutdown()` tüm event listener'larını çıkarır.

### Reschedule (yeniden-planlama) onay bildirimleri

- **`rescheduleNotifications.js`** rotası — `/api/reschedule-notifications` (JWT zorunlu, `backend/server.js:1471`'de mount; `authorize.js`'te `'/reschedule-notifications' → 'bookings'` izin grubuna eşlenir). `booking_reschedule_notifications` tablosu üzerinden öğrenciye "dersin yeniden planlandı" onayı sunan, in-app NotificationCenter'dan ayrı, **kalıcı bir onay kuyruğu** sağlar:
  - `GET /pending` — geçerli öğrencinin `status='pending'` reschedule kayıtları; `bookings`/`services`/`users` ile join'lenip canlı tarih, başlangıç saati ve değişikliği yapan kişinin adıyla zenginleştirilir.
  - `PATCH /:id/confirm` — kaydı `confirmed`'a çeker (`confirmed_at = NOW()`); sadece kendi `status='pending'` kaydı, aksi halde 404.
  - `PATCH /:id/dismiss` — kaydı `dismissed`'a çeker.
  - `POST /confirm-all` — öğrencinin tüm pending kayıtlarını tek seferde onaylar, `confirmedCount` döner.
  - Rotalar `student`, `outsider`, `instructor`, `admin`, `manager` rollerine açık (`authorizeRoles`).
- **`bookingNotificationService` köprüsü:** Bu rota tabloyu yalnızca OKUR/onaylar; satırları **yazan** taraf `PUT /bookings/:id` içindeki yeniden-planlama dalıdır (`backend/routes/bookings.js:5680` civarı). Bir rezervasyonun tarih/saat/eğitmeni değiştiğinde aynı blok hem `booking_reschedule_notifications`'a `pending` satır ekler hem de `dispatchNotification({ type: 'booking_rescheduled_by_admin' })` ile öğrenciye in-app + Telegram bildirimi atar — yani reschedule tablosu (kalıcı onay) ile birleşik dispatcher (anlık bildirim) yan yana beslenir. Kullanıcı silinince satırlar `users.js`'te (`DELETE FROM booking_reschedule_notifications WHERE student_user_id = $1 OR changed_by = $1`) temizlenir. Tablo migration `159_create_booking_reschedule_notifications` ile gelir; status CHECK = `pending|confirmed|dismissed`.

### Sunucu entegrasyonu (`backend/server.js`)
- Boot'ta `socketService.initialize(server)` + `notificationRealtimeService.initialize()`.
- `initializeTelegramBot({ webhookUrl, webhookSecret, attachHandlers: attachTelegramHandlers })` — non-blocking; bot kimlik doğrulaması başarısız olsa bile sunucu ayakta kalır.
- Günlük cron (`15 4 * * *`, Europe/Istanbul) → `pruneStaleLinkCodes()`.
- Graceful shutdown'da `notificationRealtimeService.shutdown()`.

## Frontend

- **`src/features/notifications/pages/NotificationCenter.jsx`** — Ant Design Tabs (Tümü / Okunmamış) + sayfalı liste. `useNotificationList` / `useNotificationActions` hook'larıyla `/api/notifications/user`'a bağlanır. Bildirime tıklayınca tipine göre yönlendirir: `accommodation_booking` → `/calendars/stay`, `shop_order` → `/services/shop?orderId=`, `new_booking_alert` → `/calendars/lessons?bookingId=&date=`, aksi halde `data.cta.href` / `data.link`. `rate_lesson` niyetinde rating bağlamını `sessionStorage`'a yazar.
- Çan ikonu / okunmamış rozeti uygulama kabuğunda (bkz. [[Frontend_Shell]]); realtime güncelleme Socket.io `notification:new` eventiyle gelir.
- Telegram bağlama UI'ı Ayarlar → Telegram bölümünde (`/api/telegram/link-code` + `/test`).

## Veri Modeli

| Tablo | Amaç |
|---|---|
| `notifications` | In-app bildirim kayıtları (user_id, type, title, message, data JSONB, status, `idempotency_key` UNIQUE, read_at). DB trigger `notification_events` kanalına NOTIFY yayar. |
| `notification_settings` | Kullanıcı başına 24 toggle; eksik satır = tüm varsayılanlar true. `telegram_notifications` migration 244'te eklendi. |
| `push_subscriptions` | Web-push abonelikleri (endpoint + p256dh/auth anahtarları), `(user_id, endpoint)` unique. |
| `email_deliveries` | Giden e-posta teslimat günlüğü (migration 276). provider_id (Resend email_id), recipient, subject, notification_type, related_entity_type/id, status CHECK, error. FK yok (alıcılar çoğu zaman user değil). |
| `user_telegram_chats` | Kullanıcı ↔ Telegram chat bağı (multi-device; migration 246). `active`, `last_error_at/reason` ile soft-disable (migration 249). |
| `telegram_link_codes` | Tek kullanımlık bağlama kodları (TTL ~5 dk, `consumed_at`); migration 244. |
| `telegram_delivery_log` | Telegram gönderim denetim günlüğü (migration 250): status (sent/failed/blocked/rate-limited), error_code, attempts. |

İlgili migration'lar: `244_add_telegram_integration`, `245_extend_notification_enum_for_telegram`, `246_user_telegram_chats_multi`, `249..soft_disable`, `250_telegram_delivery_log`, `276_create_email_deliveries` (bkz. [[Database]]).

## Akış / İş Mantığı

**In-app + realtime + Telegram (tek olay):**
1. Bir servis (ör. `bookingNotificationService`) `dispatchNotification({ userId, type, title, message, data, idempotencyKey })` çağırır.
2. Dispatcher tipi doğrular, `PREFERENCE_MAP` üzerinden kullanıcı tercihini kontrol eder (cache'li). Kapalıysa `{ sent: false, reason: 'user-preference-disabled' }`.
3. `insertNotification()` → `notifications` tablosuna `ON CONFLICT (idempotency_key) DO NOTHING` ile yazar.
4. DB trigger `NOTIFY notification_events` yayar → `notificationRealtimeService` payload'u alıp `socketService.emitToChannel('user:<id>', 'notification:new', …)` ile o an bağlı istemciye iletir.
5. Paralelde `deliverTelegram()` — `buildTelegramMessageForType` null değilse ve `telegram_notifications` açıksa, kullanıcının tüm aktif chat'lerine `sendToUser()` ile gönderir.

**E-posta + teslimat takibi:**
1. `sendEmail()` consent kontrolü → nodemailer SMTP (DKIM imzalı) ile gönderir → `recordEmailSend(status='sent')`.
2. Resend olayları `/api/webhooks/resend`'e POST eder; Svix imzası doğrulanır → `applyEmailEvent()` ilgili `email_deliveries` satırını günceller (delivered/opened/bounced…).
3. UI (ör. garanti talebi) `listDeliveriesForEntity()` ile per-alıcı durumu gösterir.

**Telegram hesap bağlama:**
1. Kullanıcı Ayarlar'da "Connect Telegram" → `POST /api/telegram/link-code` → TTL'li kod + `t.me/<bot>?start=<code>` deep-link.
2. Kullanıcı botta `/start <code>` (veya bare-kod) → `consumeLinkCode()` chat'i `user_telegram_chats`'e bağlar (başka kullanıcıdan taşır, transaction içinde).

## Dikkat / Tuzaklar

- **Telegram fan-out fail-open ve best-effort:** await edilmez; `deliverTelegram` içindeki tercih sorgusu pool'u doğrudan kullanır (transactional client release edilmiş olur). Bir DB blip'i bildirimi sessizce DÜŞÜRMEMELİ — bu yüzden hata durumunda mesaj yine gönderilir.
- **Webhook secret zorunluluğu:** prod'da `TELEGRAM_WEBHOOK_SECRET` yoksa `/api/telegram/webhook` 503 döner (sahte update koruması). `RESEND_WEBHOOK_SECRET` yoksa Resend webhook'u UNVERIFIED kabul edip uyarı loglar (rollout grace).
- **rawBody bağımlılığı:** Hem Resend (Svix) hem ödeme webhook'ları `req.rawBody`'ye dayanır; `express.json`'ın `verify` callback'i bunu global yakalar. `sanitizeInput` gövdeyi mutasyona uğratabileceğinden imza/eşleme RAW gövdeden yapılır (bkz. [[Backend_Server]]).
- **Dev'de polling tehlikesi:** `TELEGRAM_DEV_POLLING=true` ile long-polling açmak, prod ile AYNI bot token'ı kullanıyorsa `deleteWebhook` çağırıp prod'un update'lerini çalar. Sadece ayrı token'da aç.
- **SMTP yoksa e-posta uçar:** `EMAIL_TRANSPORT=none` veya SMTP env'leri eksikse `streamTransport`'a düşülür — e-posta DIŞARI GİTMEZ, sadece loglanır. Lokal dev'de bu beklenen davranış.
- **Idempotency çift kaydı önler:** `notifications.idempotency_key` UNIQUE + dispatcher'ın in-memory cache'i birlikte çalışır; aynı olay için tutarlı bir anahtar üretmek çağıranın sorumluluğundadır (ör. `booking-created:<id>:student:<uid>`).
- **İki dispatcher var:** `notificationDispatcher.js` (kuyruk/worker altyapısı, metrikler, drain) ile `notificationDispatcherUnified.js` (gerçek in-app yazma + tercih + Telegram) farklı şeylerdir; yeni bildirim eklerken **Unified** olanı kullanın.
- **Realtime sadece `user:<id>`'a yayar:** çift bildirimi önlemek için role/general kanalına yaymaz; kullanıcı çevrimdışıysa realtime kaçar ama in-app kaydı NotificationCenter'da durur.
