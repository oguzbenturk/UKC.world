# Payments & Currency

> **Özet:** Ödeme ağ geçidi katmanı (canlı tek gateway: **Iyzico**, ek olarak PayTR/Binance Pay iskelesi) `paymentGatewayService` arkasında bir adaptör deseniyle soyutlanır; başarı ya senkron geri-çağrı (`/api/finances/callback/iyzico`) ya da imzalı webhook (`/api/webhooks/iyzico`) ile doğrulanır ve cüzdana kredi olarak yazılır. Çoklu para birimi `currency_settings` tablosundan (EUR taban) yönetilir; oranlar `CurrencyService` + `ExchangeRateService` cron'u ile harici kaynaklardan (Yahoo/Open-ER/ECB) marjlı olarak güncellenir. Iyzico yerel para birimlerini (TRY/EUR/USD/GBP) doğrudan gönderir, çift-dönüşüm kaybını önler.
>
> **Kütüphaneler:** `iyzipay` (Node SDK), Express (ESM), PostgreSQL (`pg`), Decimal.js (dönüşüm matematiği), `axios` + `node-cron` (oran çekimi), `crypto` (HMAC webhook imza doğrulama), React 18 (PaymentCallback).
>
> **Bağlantılar:** [[Finances_Wallet]], [[Bookings_Calendar]], [[Memberships]], [[Products_Shop_Inventory]], [[Notifications_System]], [[Database]]

---

## Sorumluluk
Bu modül **dış para girişini** (kart/mevduat) güvenli biçimde alıp doğrular ve içeriye [[Finances_Wallet]] defterine bağlar; ayrıca platformun **çoklu para birimi** altyapısını sağlar:
- Gateway-bağımsız bir başlatma katmanı (`initiateGatewayDeposit`) ve sağlayıcı adaptörleri (`paymentGateways/*`).
- Iyzico Checkout Form başlatma, callback/webhook doğrulama, iade (`refund`).
- Para birimi tanımları, dönüşüm (`convertCurrency`/`convertToTRY`) ve otomatik oran güncelleme (marj + audit log).
- Hizmet/paket için para-birimi-başına fiyatlar (`multiCurrencyPriceService`, `service_prices`/`package_prices`).

## Backend

### Gateway soyutlama — `backend/services/paymentGatewayService.js` + `paymentGateways/`
- `initiateGatewayDeposit({gateway, amount, currency, userId, ...})` — sağlayıcı anahtarını normalize eder, `normalizeGatewayPayload` ile yükü sanitize eder, `getGateway()` ile uygulamayı çözer, idempotency key üretir ve `executeWithRetries` (timeout/"temporarily unavailable" üzerine retry) ile çağırır.
- `paymentGateways/index.js` — `getGateway()` / `supportedGateways` kayıt defteri.
- `paymentGateways/iyzicoGateway.js` — **canlı gateway.** İçerir:
  - `initiateDeposit(...)` — Iyzico Checkout Form oluşturur. **Para birimi stratejisi:** Iyzico'nun yerel desteklediği `TRY/EUR/USD/GBP` doğrudan gönderilir (dönüşüm YOK, `exchangeRate = 1.0`) — böylece "bizim kur → TRY → banka kuru → kart kuru" çift-dönüşüm kaybı (eski hatada €50 → ~$151) önlenir; desteklenmeyen para birimi `CurrencyService.convertToTRY` ile TRY'ye düşülür. Hard limit 99.999,99. `basketId = USR_{userId}_TRX_{ts}` ile callback'te userId geri çözülür. Kayıtlı kart için `iyzico_card_user_key` taşınır.
  - `verifyPayment(token)` — `checkoutForm.retrieve` ile token'ı **kriptografik olarak** doğrular (`paymentStatus === 'SUCCESS'`).
  - `refundPayment({paymentTransactionId|token, amount, currency})` — `paymentTransactionId` yoksa token'dan çözer; iadeyi orijinal para biriminde (yoksa TRY) yapar; `logPaymentEvent`/`sendPaymentAlert` ile loglar.
  - **Circuit breaker** (CLOSED→OPEN→HALF_OPEN, 5 ardışık hata → 60s soğuma) Iyzico kesintisine karşı koruma sağlar (in-memory, process başına).
  - Credentials yoksa dev'de MOCK yanıt döner, prod'da hata fırlatır.
- `paymentGateways/paytrGateway.js`, `binancePayGateway.js`, `sharedValidation.js` — ek sağlayıcı iskeleleri (varsayılan `enabledGateways: ['iyzico','paytr','binance_pay']`, ama yalnızca Iyzico canlı).

### Sağlayıcı kayıt defteri zinciri — `paymentGatewayService.js` → `paymentGateways/index.js`
Sağlayıcı çözümü açık bir iki-katmanlı zincirdir; `paymentGatewayService.js` doğrudan adaptör import etmez, **yalnızca kayıt defterine** danışır:
- `paymentGatewayService.js` üst kısmında `import { getGateway, supportedGateways } from './paymentGateways/index.js'` ile registry'yi içe aktarır; `normalizeGatewayPayload` ise `paymentGateways/sharedValidation.js`'ten gelir.
- `initiateGatewayDeposit` içinde `getGateway(normalizedGateway)` çağrısı çalışan sağlayıcı uygulamasını döndürür (bulunamazsa `null` → hata); servisin `getSupportedGateways`/listeleme uçları `supportedGateways` dizisini döndürür.
- `paymentGateways/index.js` **kayıt defteridir (registry)**: tek bir `gateways` objesi tutar — şu an **yalnızca `iyzico`** kayıtlı (`{ iyzico: { initiateDeposit: iyzicoInitiateDeposit } }`). `getGateway(key)` anahtarı `key.toLowerCase()` ile normalize edip eşleşen uygulamayı (yoksa `null`) döndürür; `supportedGateways = Object.freeze(Object.keys(gateways))` ile dondurulmuş canlı-sağlayıcı listesidir.
- **Sonuç:** PayTR/Binance Pay adaptör dosyaları diskte var olsa da `index.js` `gateways` objesine eklenmediği için `getGateway('paytr')`/`getGateway('binance_pay')` `null` döner — yeni bir sağlayıcıyı canlıya almak için adaptörü yazıp **bu registry'ye kaydetmek** gerekir.

### Ödeme alarmları & audit — `backend/services/alertService.js`
Slack tabanlı kritik-ödeme alarm ve denetim-log katmanı; `iyzicoGateway.js` ve `backend/routes/wallet.js` tarafından tüketilir ([[Notifications_System]]):
- **Slack webhook (opsiyonel):** `process.env.SLACK_WEBHOOK_URL` varsa `@slack/webhook`'un `IncomingWebhook`'unu kurar; env yoksa `slackWebhook = null` ve tüm alarmlar **sessizce atlanır** (log dışında etkisiz).
- `sendPaymentAlert(type, data)` — `alertTemplates` haritasından şablon seçer (`payment_failed`, `refund_requested`, `suspicious_activity`, `rate_limit_exceeded`, `large_transaction`, `payment_success`) ve bloklu Slack mesajı gönderir; bilinmeyen tip için ham JSON fallback'i atar. **Slack hatası ödeme akışını ASLA engellemez** (try/catch + `logger.error`).
- `logPaymentEvent(action, data)` — yapılandırılmış audit-trail logu; `cardNumber`/`cvv`/`cardToken` gibi **hassas alanları siler**, log seviyesini action adına göre seçer (`failed`/`error` → error, `suspicious`/`blocked` → warn, aksi halde info), zenginleştirilmiş `logData`'yı döndürür.
- `checkSuspiciousActivity(data)` — yüksek tutar (>10.000), kısa sürede çok işlem (`recentTransactionCount > 5`), çok-IP (`differentIpCount > 3`) örüntülerini tarar; bir tane bile yakalanırsa `suspicious_activity` alarmı + `suspicious_detected` logu üretir.
- `checkLargeTransaction(data)` — para-birimi başına eşik (`TRY:5000`, `EUR/USD/GBP:200`) aşılırsa `large_transaction` alarmı + logu.
- Iyzico iade akışında (`refundPayment`) `logPaymentEvent`/`sendPaymentAlert` ile iade olayları loglanır/alarmlanır.

### Callback — `backend/server.js` (`/api/finances/callback/iyzico`)
- `POST /api/finances/callback/iyzico` (server.js ~508) — Iyzico kullanıcı ödemeyi tamamladıktan sonra **buraya POST eder** (CORS bypass'lı, rate-limit'li, `express.urlencoded`). Akış: token doğrula (`verifyPayment`) → kayıtlı kart anahtarını sakla → token (`gateway_transaction_id`) ile eşleşeni bul:
  1. **Mevduat (deposit):** `wallet_deposit_requests` → `approveDepositRequest` cüzdana kredi.
  2. **Mağaza siparişi:** `shop_orders` (gateway_token veya order_number) → ertelenmiş wallet düşümlerini idempotent (`shop-order-charge:{order}:{currency}`) uygula, siparişi tamamla ([[Products_Shop_Inventory]]).
  3. **Booking / grup booking** ([[Bookings_Calendar]]) ve **üyelik satın alma** ([[Memberships]]) — token ile çözülüp ücret/komisyon kaydedilir.
  - Sonunda frontend'e `?status=...&type=...` ile yönlendirir; `GET` varyantı (server.js ~1386) tarayıcı geri-dönüşü için yönlendirir; ayrı bir safety-net error handler (~1398) callback rotasını sarar.

### Webhook — `backend/routes/paymentWebhooks.js` + `paymentGatewayWebhookService.js`
- `POST /api/webhooks/{iyzico,paytr,binance-pay}` — sunucu-sunucu bildirim. `paymentGatewayWebhookService.js`:
  - **HMAC imza doğrulama** (sağlayıcı başına şema; `WEBHOOK_REQUIRE_SIGNATURE=true` ile prod'da fail-closed) — imza olmadan sahte bir POST cüzdanı kredilendirebilir.
  - `SUCCESS_STATUSES`/`FAILURE_STATUSES` setleriyle durumu eşler, `approveDepositRequest`/`rejectDepositRequest` çağırır (idempotent).

### Para birimi — `backend/services/currencyService.js` + `exchangeRateService.js` + `multiCurrencyPriceService.js`
- `CurrencyService` (statik sınıf, Decimal.js): `getActiveCurrencies`, `convertCurrency(amount, from, to[, client])` (EUR tabana çevirip hedefe), `convertToTRY` (gateway için), `getExchangeRate`, `updateExchangeRateWithAudit` (eski/yeni oran + `currency_update_logs`), `forceRefreshRate`, `updateRateMargin` (`raw_rate × (1+marj)` → `exchange_rate`). Oran kaynakları öncelik sırasıyla: **Yahoo Finance → Open-ER → FXRates → ECB → cached** (`fetchRateWithFallback`).
- `ExchangeRateService` — `node-cron` ile **akıllı zamanlama** (Europe/Istanbul; iş saatleri saatlik, akşam 2 saatte bir, gece 4 saatte bir ≈ free-tier-güvenli 435 güncelleme/ay). `updateDueCurrencies` her para birimini kendi `update_frequency_hours`'una göre günceller; hata olursa admin'lere bildirim ([[Notifications_System]]).
- `multiCurrencyPriceService.js` — `service_prices`/`package_prices` CRUD (hizmet/paket için para-birimi-başına fiyat).

### Rotalar — `backend/routes/currencies.js`
`POST /update-rates` (admin, manuel tetik), `GET /active` (public, cache'li), `GET /` (admin, tümü), `GET /base`, `POST /convert`, `POST /` (yeni para birimi), `PUT /:currencyCode/rate`, marj/oto-güncelleme toggle'ları. Cache `cacheMiddleware`/`cacheInvalidationMiddleware` ile yönetilir.

## Frontend
- `src/features/finances/pages/PaymentCallback.jsx` (`/payment/callback`, `AppRoutes.jsx`) — Iyzico dönüş ekranı. `status`/`type` query param'larına göre dallanır:
  - **Cüzdan mevduatı** (type yok): sekmeyi otomatik kapatır (orijinal sekme Socket.IO ile makbuzu gösterir).
  - **Mağaza siparişi**: başarıda sepeti temizler (`shop:cartClear` + localStorage), sipariş onay/başarısızlık ekranı.
  - **Booking / grup booking / üyelik**: onay ekranı / offerings sayfasına yönlendirme.
- Para birimi yönetimi UI'si Ayarlar altında (`currency_settings` CRUD, oran/marj düzenleme) — `CurrencyService` uçlarını tüketir.

## Veri Modeli
- **`currency_settings`** — `currency_code`, `currency_name`, `symbol`, `exchange_rate` (1 EUR başına; EUR taban = 1.0), `raw_rate`, `rate_margin_percent`, `base_currency`, `is_active`, `auto_update_enabled`, `update_frequency_hours`, `last_updated_at`/`last_update_status`/`last_update_source`.
- **`currency_update_logs`** — oran değişim denetim izi (old/new/percent/source/status/triggered_by).
- **`service_prices`** / **`package_prices`** — (entity_id, currency_code, price).
- **`wallet_deposit_requests`** — gateway mevduat istekleri (`gateway`, `gateway_transaction_id` = Iyzico token, `status`, `amount`, `currency`, `metadata`) ([[Finances_Wallet]]).
- `users.iyzico_card_user_key` — kayıtlı kart için Iyzico kullanıcı anahtarı.
- Ücret/iade sonuçları daima **`wallet_transactions`**'a yazılır ([[Finances_Wallet]]).

## Akış/İş Mantığı
1. **Mevduat başlat:** kullanıcı `POST /wallet/deposit` → `initiateGatewayDeposit` → Iyzico Checkout Form içeriği döner; `wallet_deposit_requests` satırı `pending` + `gateway_transaction_id` saklanır.
2. **Kullanıcı öder** → Iyzico `/api/finances/callback/iyzico`'ya POST eder → `verifyPayment(token)` doğrular → eşleşen deposit/order/booking/membership bulunur → cüzdana kredi/ücret yazılır (idempotent).
3. **Webhook** (varsa) aynı sonucu sunucu-sunucu teyit eder (HMAC imzalı, idempotent) — callback ve webhook çift tetiklense bile idempotency key çift-kredilendirmeyi önler.
4. **İade:** admin iade başlatır → `refundPayment` (Iyzico) + cüzdanda karşılık iade kredisi ([[Finances_Wallet]] `getEntityNetCharges` ile tam tutar).
5. **Oran güncelleme:** cron `updateDueCurrencies` → harici kaynak + marj → `currency_settings.exchange_rate` + `currency_update_logs`.

## Dikkat/Tuzaklar
- **Iyzico tek CANLI gateway'dir** (PayTR/Binance Pay yalnızca iskele). Yeni gateway eklerken adaptör desenini ve `enabledGateways`'i izle.
- **Çift-dönüşüm kaybı tuzağı:** Iyzico'nun yerel desteklediği para birimini ASLA TRY'ye çevirme — doğrudan gönder (`exchangeRate = 1.0`). Yalnızca desteklenmeyen para birimi TRY'ye düşülür.
- **Webhook imzası kritik güvenliktir:** imza doğrulaması olmadan sahte POST cüzdanı kredilendirebilir; prod'da `WEBHOOK_REQUIRE_SIGNATURE=true` ile fail-closed olmalı.
- **Idempotency:** callback + webhook + gateway retry aynı ödemeyi birden çok kez tetikleyebilir; `idempotencyKey` (UNIQUE indeks) ve sipariş `payment_status` kontrolü çift işlemeyi engeller.
- **Callback CORS/CSRF bypass:** Iyzico `sandbox-api.iyzipay.com`/`api.iyzipay.com`'dan POST ettiği için `/api/finances/callback/` CORS'tan ve CSRF'ten muaftır; token uzunluğu (10–512) ve kriptografik doğrulama ile korunur. Public callback prefiksleri `CSRF_EXEMPT_PREFIXES` içinde olmalı (yoksa 403).
- **`exchange_rate` "1 EUR başına bu para biriminden kaç tane"** demektir (EUR taban). Dönüşümler önce EUR'a, sonra hedefe gider; marj `raw_rate` üzerinden uygulanır. Para matematiği Decimal.js (float YASAK).
- **Circuit breaker in-memory'dir** (process başına) — çok-instance dağıtımda her node kendi durumunu tutar.
- Iyzico callback'i public reverse-proxy URL'sine ihtiyaç duyar; `FRONTEND_URL` ayarlı olmalı (backend `localhost:4000` iç adresi callback için kullanılamaz).
