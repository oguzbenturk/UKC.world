# Shared Backend Utilities

> **Özet:** `backend/utils`, `backend/shared`, `backend/constants` ve `backend/config` altındaki domain-ötesi yardımcılar, enum'lar ve sabitlerdir; finansal hesap bölüşümü, kullanıcı sanitizasyonu, upload doğrulama, audit/aktör çözümü, zaman/çalışma-saati ve standart hata kodlarını tek kaynaktan sağlar. Cüzdan/booking enum'larının ve rol listelerinin TEK doğruluk kaynağıdır. Birkaç dosyanın frontend aynası vardır ve sapma riski taşır.
>
> **Kütüphaneler:** Node.js (ESM), PostgreSQL (`pg`), `jsonwebtoken`, `bcryptjs`, `sharp` (lazy), `decimal.js` (çağıran servislerde), Express middleware sözleşmesi
>
> **Bağlantılar:** [[Finances_Wallet]], [[Authentication_Authorization]], [[Bookings_Calendar]], [[Backend_Server]], [[Forms_Waivers_Compliance]], [[Instructors_Payroll]], [[Lessons_Services_Packages]]

---

## Sorumluluk

Bu modül grubu, hiçbir tek özelliğe ait olmayan ama her yerde tekrar tekrar gereken davranışları merkezîleştirir. Amaç tekrar eden kuralları (rol listeleri, cüzdan tip isimleri, hata kodları, çalışma saatleri) tek yerde tutarak sürüklenmeyi (drift) önlemektir. Hiçbiri HTTP route tanımlamaz; saf yardımcı (pure helper) veya küçük middleware'lerdir.

Dört kök altında toplanır:
- `backend/utils/` — finansal/güvenlik/zaman/görsel yardımcıları (saf fonksiyonlar + birkaç middleware).
- `backend/shared/` — hata kodu kataloğu ve frontend ile ortak (aynalanan) rol mantığı.
- `backend/constants/` — cüzdan/booking enum'ları ve rol erişim listeleri.
- `backend/config/` — feragatname (waiver) içeriği ve metadata.

---

## Finansal Yardımcılar

### `backend/utils/paymentSplit.js`
Paket + nakit bölüşümü için saf hesaplama. `splitPackageAndCash({ servicePrice, duration, packageRemaining, packagePrice, packageTotalHours })` saatleri böler: `packageHours = min(duration, packageRemaining)`, geri kalanı `cashHours`. Nakit tutar, paket saatlerinin paket-saat-başı oranıyla (purchase price / total hours) indirimli değerlendirilmesiyle hesaplanır ve negatife düşmemesi için `Math.max(0, …)` ile sabitlenir. `wantsToUsePackage(participant)` UI'dan gelen `usePackage`, `customerPackageId` veya `paymentStatus` ('package'/'partial') alanlarından paket niyetini çıkarır. Bkz. [[Lessons_Services_Packages]].

### `backend/utils/instructorEarnings.js`
Ders değeri ve eğitmen kazanç türetiminin tek kaynağı. `deriveLessonAmount(...)` paket dersinde saat-başı paket oranıyla, nakit derste base/servis fiyatından ders tutarını hesaplar. `deriveEffectivePackageHours(...)` toplam/used+remaining/sessions×duration adaylarından geçerli ilk pozitifi seçer. `deriveTotalEarnings({ lessonAmount, commissionRate, commissionType, lessonDuration })` `'fixed'`/`'fixed_per_hour'` → `rate×duration`, `'fixed_per_lesson'` → düz tutar, diğer → yüzde hesaplar. `partialLessonValue(...)` kısmi paket bookinginde tarihsel "nakit'i tam-süre değerinin ÜSTÜNE ekleme" çift-sayma hatasını düzeltir: nakit'i ödediği saatlere atfeder, böylece komisyon ve yüzdeli eğitmen kazancı şişmez. `toNumber`/`safeNumber` güvenli sayı dönüşümü sağlar. Bkz. [[Instructors_Payroll]].

### `backend/utils/discountAmounts.js`
İndirim toplamı yardımcıları — `managerCommissionService` ile `bookingUpdateCascadeService` arasındaki dairesel import'u kırmak için ayrı dosyada yaşar. `getActiveDiscountAmount(client, entityType, entityId)` `discounts` tablosundan `(entity_type, entity_id)` için tüm aktif indirimleri (entity-geneli + per-participant) toplar. `discountSumLateral(alias, entityType, entityIdExpr)` rapor sorgularına `LEFT JOIN LATERAL` SQL fragmanı üretir; böylece raporlar ham fiyat sütunlarını toplamak yerine indirimleri cascade servisleriyle aynı şekilde düşer. İndirimler ayrı tabloda yaşar — ham fiyat asla mutasyona uğramaz. Bkz. [[Finances_Wallet]].

### `backend/utils/financialValidation.js` — DİKKAT (legacy/tehlikeli)
`validateAndCorrectFinancialData(pool, userId)` eski (legacy) **`transactions`** tablosunu okuyup `payment/credit/charge/debit/refund` tiplerinden bakiye türetir ve uyumsuzluk varsa `users.balance` + `users.total_spent` sütunlarının ÜSTÜNE yazar.
- **Tehlike:** Sistemin geri kalanı cüzdan gerçeğini `wallet_transactions` üzerinden tutar (bkz. [[Finances_Wallet]]). Bu yardımcı legacy `transactions` tablosunu okur ve denormalize `users.balance/total_spent` sütunlarını mutasyona uğratır — wallet ile **tutarsızlık riski** yaratır.
- **Çağrı durumu:** Repo genelinde bu fonksiyon hiçbir yerden çağrılmaz (yalnızca tanımlı). Yani şu an inaktif/ölü koddur; geçmiş bir tasarımın kalıntısıdır. Tekrar devreye sokulmadan önce kaynağın `wallet_transactions`'a taşınması gerekir.

---

## Güvenlik / Kimlik Yardımcıları

### `backend/utils/sanitizeUser.js`
`sanitizeUser(user)` API yanıtlarından hassas alanları siler. `SENSITIVE_FIELDS`: `password_hash`, `two_factor_secret`, `two_factor_backup_codes`, `iyzico_card_user_key`, `last_login_ip`, `failed_login_attempts`, `account_locked`, `account_locked_at`. Kullanıcı objesi her dış yüzeye dönerken bundan geçmelidir. Bkz. [[Authentication_Authorization]].

### `backend/utils/uploadValidation.js`
Multer dosya doğrulamasının saf (test edilebilir) çekirdeği. `IMAGE_MIME_TO_EXT`, `DOC_MIME_TO_EXT`, `AUDIO_MIME_TO_EXT` izinli MIME→uzantı haritalarıdır. **MIME = doğruluk kaynağı** (dosyanın gerçek byte'larıyla eşleşir); uzantı yalnızca "yeterince yakın" ya da yok olmalıdır. `EXT_ALIASES` değiştirilebilir uzantı gruplarıdır (`.jpg/.jpeg/.jfif/.pjpeg`, `.heic/.heif`, `.tif/.tiff`) — telefon/screenshot araçlarının ürettiği uyuşmazlıkları kabul ederek "fotoğrafımı yükleyemiyorum" hatalarını azaltır. `validateMimeAndExtension(file, allowedMap)` MIME haritada yoksa reddeder; varsa `extMatchesExpected` ile uzantıyı kontrol eder (uzantı yoksa MIME'a güvenir).

### `backend/utils/auditUtils.js`
Audit sütunları için aktör UUID çözümü. `resolveActorId(req, { fallbackToSystem })` `req.user.id` / `user_id` / `userId` / `auth.userId` / `session.userId` adaylarından UUID regex'iyle doğrulanmış değeri döner; yoksa null veya (opsiyonel) sistem aktörü. `resolveSystemActorId()` `SYSTEM_ACTOR_USER_ID` / `AUDIT_SYSTEM_USER_ID` / `SYSTEM_USER_ID` env'lerinden geçerli UUID çözer (webhook gibi otomatik akışlar için). `appendCreatedBy(columns, values, actorId, { includeUpdated })` parametreli INSERT'lere `created_by`/`updated_by` sütun+değer ekler. Geçersiz UUID'ler `logger.warn`/`logger.error` ile loglanır, audit satırı null kalır.

### `backend/utils/auth.js`
JWT/parola yardımcıları + middleware. `authenticateJWT` `Authorization: Bearer` token'ını `HS256` ile doğrular, `temp2fa` token'larını tam-oturum olarak reddeder, `req.user`'ı set eder. `authorizeRoles(...roles)` DB'den `roles.name` okuyarak rol kontrolü yapar (JWT'deki role değil, canlı DB rolü). `generateToken(user)` 24h `id/email/name` token üretir. `encryptData`/`compareEncryptedData` bcrypt sarmalayıcılarıdır. **DİKKAT:** `JWT_SECRET` set değilse modül import anında `throw` eder (fatal startup). Bkz. [[Authentication_Authorization]].

### `backend/utils/loginLock.js`
Acil durum giriş kilidi. `isAuthCreationDisabled()` parola login / public kayıt / 2FA tamamlama / JWT API erişimini (logout hariç) reddeder. `DISABLE_LOGIN_FORCE` (process env) her zaman kilitler. `applyDisableLoginEnvPrecedence(backendDirname)` env dosya öncelik sorununu çözer: **kök `.env`, `backend/.env`'i ezer** (db.js `override:true` ile backend env'i dondurduğundan). Sunucu başlangıcında `dotenv.config` sonrası bir kez çağrılmalıdır.

---

## Zaman / Görsel Yardımcılar

### `backend/utils/timeUtils.js`
Takvim zaman yardımcıları. `parseHHMM(t)` `'08:30'` → 510 dk, sayı `8.5` → 510 dk. `decimalHourToHHMM(9.5)` → `'09:30'`. `getWorkingHours(pool)` `settings` tablosundan `calendar_working_hours` değerini okur; **modül-düzeyi 15 dakikalık cache** ile (admin config nadiren değişir). Herhangi bir hatada `08:00–21:00` fallback döner. `bookings.js` ve `bookingService.js` tarafından tüketilir. Bkz. [[Bookings_Calendar]].

### `backend/utils/imageOptimizer.js`
Upload-tarafı görsel optimizasyonu (delivery-tarafı `routes/media.js`'in karşılığı — bkz. [[Products_Shop_Inventory]]). `optimizeImageInPlace(absPath, { maxDim=2000, quality=82 })` `sharp`'ı **lazy import** eder, en uzun kenarı `maxDim`'e düşürür, EXIF orientation'ı pişirip metadata'yı siler ve WebP'ye yeniden kodlar. **Güvenlik sözleşmesi (media.js aynası): herhangi bir hata → orijinal dosya dokunulmadan kalır, fonksiyon `null` döner, upload ASLA başarısız olmaz.** Animasyonlu (multi-frame) görseller atlanır; WebP daha küçük değilse orijinal korunur. `optimizeUploadedFile(file)` multer dosya objesini yerinde günceller (`filename/path/size/mimetype`), `optimizeUploadedFiles(files)` `.array()` upload'larını sırayla işler (peak bellek düşük).

---

## Standartlar ve Enum'lar (TEK KAYNAK)

### `backend/shared/errorCodes.js`
`ERROR_CODES` (donmuş) tüm route'ların serbest-metin yerine kullanması gereken stabil makine-okunur hata anahtarları kataloğudur (Auth, Voucher, generic vb.). `sendError(res, status, code, fallbackMessage, extra)` `{ error: <EN fallback>, code, ...extra }` şeklinde standart yanıt üretir. `errorParams` dinamik mesajlar için interpolasyon değeri taşır (örn. `{ minutes: 30 }`). Frontend `src/i18n/errorCodes.js` içindeki `ERROR_KEY_MAP` bu kodları i18n anahtarlarına çevirir — **iki dosya senkron tutulmalıdır** (yeni kod eklenince her ikisine de eklenmeli).

### `backend/shared/utils/roleUtils.js`
`ROLES` enum'u (outsider→developer), `ROLE_HIERARCHY`, `getRoleLevel`, `hasPermission(userRole, requiredRole)`, `isStaffRole`, `isAdminRole`, ve `PAY_AT_CENTER_ALLOWED_ROLES` ([admin, manager, trusted_customer]). Başlık yorumu açıkça **"Mirrors the frontend roleUtils.js"** der → `src/shared/utils/roleUtils.js` ile birebir ayna. **DİKKAT — sapma riski:** iki kopya elle senkron tutulur; biri değiştirilip diğeri unutulursa backend/frontend yetki kararları ayrışır. Bkz. [[Authentication_Authorization]].

### `backend/constants/roles.js`
Erişim listelerinin kanonik yeri. **Rol UUID'leri kasten burada YOK** — ortamlar arası sürüklenir ve reseed'de bozulur; rol id'leri çalışma anında isimle DB'den çözülür. `PAY_AT_CENTER_ALLOWED_ROLES` = `['admin','manager','trusted_customer']`. `STAFF_NEGATIVE_BALANCE_ROLES` = müşteri adına satış/booking yapıp cüzdanı NEGATİFE itebilecek "front-desk seller" listesi: `admin, manager, owner, super_admin, front_desk, receptionist`. **`front_desk` ve `receptionist` AYNI masa rolünün iki adıdır ve HER ZAMAN birlikte bulunmalıdır** (migration 261 `Recepsion`→`receptionist` yeniden adlandırdı; `front_desk` legacy kod aliasıdır). `isStaffNegativeBalanceRole(role)` rolü lower-case'leyip tire/boşlukları alt çizgiye normalize ederek toleranslı test eder ('Front Desk'/'front-desk' → 'front_desk'). NOT: `bookings.js`/`rentals.js` ek olarak `'instructor'`'a da izin veren kendi varyantlarını tutar.

### `backend/constants/transactions.js`
Cüzdan/booking string enum'larının TEK kaynağı (donmuş objeler). Cash-basis gruplamaları: `PAYMENT_TYPES`, `REFUND_TYPES`, `EXCLUDED_REVENUE_TYPES` (charge/rental_charge gibi gelirden hariç tutulanlar), `SERVICE_TYPE_TO_PAYMENT_TYPES`. Cüzdan ledger tipleri `TRANSACTION_TYPE` (PAYMENT, DEDUCTION, PACKAGE_PURCHASE, *_CHARGE_ADJUSTMENT, DISCOUNT_ADJUSTMENT). `WALLET_ENTITY_TYPE` (manager_payment, instructor_payment, customer_package, accommodation_booking, booking, rental) — `wallet_transactions.entity_type` + `discounts.entity_type` ile paylaşılır, buradaki rename tüm tüketicilere yayılır. `WALLET_TX_STATUS` (completed/cancelled/pending/failed), `BOOKING_STATUS`, `PAYMENT_STATUS` (paid/unpaid/.../package/partial/refunded), `PAYMENT_METHOD` (wallet/pay_later/credit_card/cash/...), `TX_DIRECTION` (credit/debit). Bkz. [[Finances_Wallet]], [[Payments_Currency]].

### `backend/config/waiverContent.js`
Feragatname (liability waiver) içeriği ve metadata. `WAIVER_VERSION = '2.0'`, `WAIVER_LANGUAGE = 'en'`, `EFFECTIVE_DATE = 2026-01-01`, `COMPANY_NAME = 'Duotone Pro Center'`. `waiverContent` objesi dijital imza toplama için master şablondur (giriş, risk üstlenimi, kapsanan aktiviteler: kitesurf/windsurf/wing foil/SUP/surf/kiralama/eğitim). İmzalanan sürüm bu sabitlerle damgalanır; sürüm artışı yeniden imza gerektirir. Bkz. [[Forms_Waivers_Compliance]].

---

## Veri Modeli (dolaylı dokunulan tablolar)

- `discounts (entity_type, entity_id, amount, participant_user_id)` — `discountAmounts.js` okur.
- `settings (key='calendar_working_hours', value JSONB {start,end})` — `timeUtils.js` okur.
- `users (balance, total_spent)` — yalnızca legacy `financialValidation.js` yazar (riskli).
- `transactions` (LEGACY) — yalnızca `financialValidation.js` okur; canlı akış `wallet_transactions` kullanır.
- audit sütunları: `created_by`, `updated_by` (UUID) — `auditUtils.js` doldurur.

---

## Dikkat / Tuzaklar

- **`financialValidation.js` aktif değil ama tehlikeli:** legacy `transactions` tablosundan denormalize `users.balance/total_spent` üzerine yazar. Çağrılmıyor; tekrar bağlanırsa wallet gerçeğiyle (bkz. [[Finances_Wallet]]) çakışır.
- **Frontend aynaları sapma riski:** `roleUtils.js` (backend ⇄ `src/shared/utils/roleUtils.js`) ve `errorCodes.js` (`ERROR_CODES` ⇄ `src/i18n/errorCodes.js` `ERROR_KEY_MAP`) elle senkron tutulur. Birini değiştirip diğerini unutmak yetki/i18n hatası doğurur.
- **`front_desk` + `receptionist` ikilisi:** rol listelerinde ikisi de bulunmalı; biri eksik kalırsa receptionist masası sessizce yetki kaybeder (geçmişte birkaç kez regress etti).
- **`auth.js` import-time throw:** `JWT_SECRET` yoksa sunucu hiç açılmaz (kasıtlı fail-fast).
- **`imageOptimizer` asla upload'u fail etmez:** sharp yoksa/hata varsa sessizce orijinali korur — eksik optimizasyon log'a yansır ama kullanıcı görmez.
- **`enum`'lar donmuş (`Object.freeze`):** `transactions.js` değerleri runtime'da mutasyona uğratılamaz; rename buradan yapılmalı ki tüm tüketiciler güncellensin.
- **`timeUtils` 15dk cache:** çalışma saatleri ayarı değişirse cache TTL'i (15 dk) dolana dek eski değer dönebilir; kritikse process restart gerekir.
