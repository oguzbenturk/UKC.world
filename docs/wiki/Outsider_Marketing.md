# Outsider & Marketing

> **Özet:** Girişsiz (misafir) gezilebilen tüm halka açık vitrini kapsar — Duotone Pro Center Urla marka landing'i, akademi/kiralama/rescue/stay/experience tanıtım sayfaları, mağaza vitrini (feature-flag arkasında), iletişim sayfası ve Google yorumları — artı arka-tarafta voucher/promosyon, pazarlama kampanyaları ve GDPR onay (consent) altyapısı. Misafir göz atabilir ama her aksiyon (rezervasyon/satın alma) login ister; mağaza `publicShopEnabled` bayrağı veya mağaza-personeli rolü ile açılır.
>
> **Kütüphaneler:** React 18 + Vite (lazy routes), react-i18next (çok-dil), TailwindCSS + Ant Design + Heroicons, Express 5 (ESM), PostgreSQL, axios (Google Places), Redis cache, GTM (`dataLayer` üzerinden `analyticsService`).
>
> **Bağlantılar:** [[Frontend_Shell]], [[Products_Shop_Inventory]], [[Lessons_Services_Packages]], [[Accommodation_Rentals]], [[Memberships]], [[Authentication_Authorization]], [[Notifications_System]], [[Customers_CRM]], [[Weather_WindReport]], [[Proposals_Quotes]], [[Misc_Integrations]]

---

## Sorumluluk

Bu modül, **henüz müşteri olmayan veya giriş yapmamış ziyaretçinin** gördüğü her şeyi yönetir:

1. **Splash / dünya girişi:** `src/features/public/PublicHome.jsx` — arka-plan videolu "Enter the World" açılışı; ilk ziyarette dil seçim modalı (`LanguageSelectModal`). Giriş yapmamış kullanıcı `/` → bu sayfayı görür; `outsider` rolü ise `/guest`'e yönlenir.
2. **Misafir hub'ı:** `src/features/outsider/pages/GuestLandingPage.jsx` (`/guest`) — tüm hizmetleri (shop, academy, rentals, **rescue**, membership, care, stay, experience, community) kart ızgarasında toplar.
3. **Hizmet landing sayfaları:** akademi, kiralama, rescue, stay, experience, ders disiplinleri ve mağaza için zengin tanıtım sayfaları.
4. **Pazarlama operasyonu (arka-taraf):** voucher/promosyon kodları, çok-kanallı pazarlama kampanyaları, GDPR onay enforcement'ı ve ürün önerileri.

**Landing-page dürüstlüğü (önemli zemin gerçeği):** Site 2025'te kuruldu, **tek gerçek müşteri** Duotone Urla, canlı ödeme yalnız Iyzico. Pazarlama metinleri abartısız tutulur (bkz. MEMORY `landing_page_honesty_remake`).

## Backend

### Rotalar
- `backend/routes/marketing.js` — `/api/marketing/campaigns` CRUD; `server.js`'te `authenticateJWT` + her uçta `authorizeRoles(['admin','manager'])`. `POST /campaigns/:id/send` şu an gerçek gönderimi yapmaz; yalnız `sent_count`'u artırır (gönderim mantığı `TODO`).
- `backend/routes/vouchers.js` — voucher/promosyon/hediye sistemi. **Kullanıcı uçları:** `POST /validate` (kod doğrula), `POST /redeem-wallet` (sadece `wallet_credit` voucher'ı cüzdana yatır), `GET /my`. **Admin uçları** (`admin`/`manager`): `POST /`, `GET /`, `GET/PUT/DELETE /:id`, `POST /bulk` (1-1000 kod üret, sadece `admin`), `POST /:id/assign`, `GET /:id/redemptions`. **Kampanya uçları:** `/campaigns` CRUD + `GET /campaigns/:id` istatistik.
- `backend/routes/googleReviews.js` — `GET /api/google-reviews` **auth'suz**; Google Places Details'ten en fazla 5 adet 4-5 yıldız yorum çeker, Redis'te **1 saat** cache'ler. `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID` env yoksa `503` döner.

### Servisler
- `backend/services/voucherService.js` — tüm voucher iş mantığı. Tipler: `percentage | fixed_amount | wallet_credit | free_service | package_upgrade`. Kapsam (`applies_to`): `all/lessons/rentals/accommodation/packages/wallet/shop/specific`. Kod **case-insensitive** (`UPPER(code)=UPPER($1)`); `resolveVoucherLookupCode` istemcinin gönderdiği voucher-satırı-UUID'sini gerçek koda çözer. `validateVoucher` kullanım limiti / ilk-alışveriş / min-tutar / para-birimi eşleşmesini denetler; `applyWalletCredit` cüzdana `recordTransaction` ile yatırır; `redeemVoucher` `voucher_redemptions`'a yazar. `isFirstTimePurchaser` bookings/packages/rentals'a bakar. Iyzico checkout callback'inde voucher redemption `server.js` içinde de tetiklenir.
- `backend/services/marketingCampaignService.js` — `marketing_campaigns` CRUD + `updateCampaignAnalytics` (sent/opened/clicked/converted sayaç artırma). Email/popup/SMS/WhatsApp/soru (question) kampanya tiplerini destekler; `popup_style`/`question_answers` JSONB.
- `backend/services/marketingConsentService.js` — **GDPR enforcement (KRİTİK).** Bildirimleri `TRANSACTIONAL` (her zaman izinli) vs `MARKETING` (açık opt-in gerekli) olarak sınıflar (`classifyNotification`). `canSendCommunication`/`filterUsersByConsent` `user_consents` tablosundan kanal-bazlı (`marketing_email/sms/whatsapp_opt_in`) izni doğrular; **kayıt yoksa pazarlama engellenir** (opt-in modeli, fail-safe). `in_app` ve `telegram` her zaman izinli (telegram yalnız transaksiyonel). Bkz. [[Notifications_System]].
- `backend/services/recommendationService.js` — `recommended_products` üzerinden role-göre (student/instructor/all) öne çıkan ürünler; öncelik sıralı (bkz. [[Products_Shop_Inventory]]).

## Frontend

### Halka açık sayfalar — `src/features/outsider/pages/`
- **Hub & marka:** `GuestLandingPage.jsx` (`/guest`, hizmet kart ızgarası), `AcademyLandingPage.jsx` (`/academy`, sticky-nav disiplin showcase'leri), `RentalLandingPage.jsx` (`/rental`), `RescueBoatPage.jsx` (`/rescue` — **yeni**), `StayLandingPage.jsx` (`/stay`), `ExperienceLandingPage.jsx` (`/experience`), `ContactPage.jsx` (`/contact`), `OutsiderPackagesPage.jsx`.
- **Ders disiplinleri:** `KiteLessonsPublicPage.jsx`, `FoilLessonsPage.jsx`, `WingLessonsPage.jsx`, `EFoilLessonsPage.jsx`, `PremiumLessonsPage.jsx` (`/academy/*-lessons`). Bkz. [[Lessons_Services_Packages]].
- **Mağaza vitrini:** `ShopLandingPage.jsx` (`/shop` — hero carousel + hot deals + kategoriler), `ShopCategoryPage.jsx` (`/shop/:section`), `ProductDetailPage.jsx` (`/shop/product/:id`). Bkz. [[Products_Shop_Inventory]].
- **Stay alt sayfaları:** `StayHomePage`, `StayHotelPage`, `StayBookingPage`. **Experience alt sayfaları:** `ExperienceKitePackagesPage`, `ExperienceWingPackagesPage`, `ExperienceCampsPage`, `ExperienceDownwindersPage`, `ExperienceBookPackagePage`. **Rental showcase'leri:** `RentalStandard/Premium/Sls/Dlab/EFoilShowcasePage`, `RentalPremiumPage`, `CareLandingPage` (`/care`).
- **Pazarlama yönetimi:** `src/features/marketing/pages/MarketingPage.jsx` — admin/manager kampanya stüdyosu (email/popup/SMS/WhatsApp/soru editörleri + TinyMCE + canlı önizleme). `src/features/public/PublicHome.jsx` splash.

### Misafir-mod kapıları
- **Guest mode:** `AppRoutes.jsx`'te `PUBLIC ROUTES - Accessible without authentication (Guest Mode)` bloğu; sayfalar göz atılabilir ama **aksiyonlar login ister** (rezervasyon/checkout korumalı route'a düşer).
- **Mağaza kapısı:** `/shop`, `/shop/browse`, `/shop/:section` yalnız `featureFlags.publicShopEnabled || isShopStaff(user?.role)` ise render olur, aksi halde `/`'e `Navigate`. `/shop/product/:id` recommendation linkleri kırılmasın diye **açık bırakılır**. Bayrak `src/shared/config/featureFlags.js` (`VITE_PUBLIC_SHOP_ENABLED`, default `false`).
- **Rescue kartları:** `GuestLandingPage` `SERVICE_CONFIG`'inde `key:'rescue' → /rescue` (cyan accent, LifebuoyIcon); `AcademyLandingPage` nav'ında `rescue-section` (fallback "🚤 Rescue"). `RescueBoatPage`, public `GET /api/services`'i `disciplineTag === 'rescue_boat'`'a filtreler ve her karta "⭐ Members X% off" rozeti basar (`memberDiscountPercent`). Bkz. MEMORY `rescue_boat_service`.

### Yardımcı bileşenler / araçlar
- `GoogleReviewsStrip` (`@/shared/components/ui`) — `/api/google-reviews`'i çeker, GuestLanding/AcademyLanding altında gösterir.
- `usePageSEO` (`@/shared/utils/seo`) — her sayfada `<title>`/meta yönetir.
- `AcademyCrossSellBanner`, `ContactOptionsBanner` (`src/features/outsider/components/`) — sayfalar arası çapraz-satış / iletişim kanalları (WhatsApp/telefon CTA, GTM event basar).
- **GTM analytics:** `src/shared/services/analyticsService.js` `track(event, payload)` → `window.dataLayer.push({ event, ... })`. Public satın-alma/lead/whatsapp/call event'leri buradan akar (GTM-NJ3FBHV6, bkz. MEMORY `gtm_analytics_setup`).

## Veri Modeli

- **`voucher_codes`** (migration `102_create_voucher_system.sql`, PK = **UUID**): `code (UNIQUE)`, `name`, `voucher_type`, `discount_value`, `max_discount`, `min_purchase_amount`, `currency`, `applies_to`, `usage_type` (`single_global|single_per_user|multi_limited|multi_per_user|unlimited`), `max_total_uses`, `max_uses_per_user`, `valid_from/until`, `visibility` (`public|private|role_based`), `requires_first_purchase`, `can_combine`, `is_active`, `campaign_id`. İlişkili: `voucher_redemptions` (`voucher_code_id`, `user_id`, `status='applied'`, tutarlar) ve `voucher_campaigns`.
- **`marketing_campaigns`** (migration `106_create_marketing_campaigns.sql`, PK = **SERIAL**): `name`, `type`, `template_type`, `audience`, email alanları (`email_subject/content/html`), popup alanları (`popup_title/message/button_*/image_url/style(JSONB)`), `sms_content`, `whatsapp_content/media_url`, soru alanları (`question_text/subtitle/bg_*/answers(JSONB)`), `send_immediately`, `schedule_date`, `status`, analitik sayaçlar (`sent/opened/clicked/converted_count`), `created_by`.
- **`user_consents`** — kullanıcı-başına `marketing_email_opt_in`, `marketing_sms_opt_in`, `marketing_whatsapp_opt_in` (opt-in modeli; kayıt yoksa hepsi kapalı sayılır).
- **`recommended_products`** — `(product_id, recommended_for_role) UNIQUE`, `priority`, `is_featured`, `metadata(JSONB)`.

## Akış / İş Mantığı

### Misafir → müşteri huni
1. Ziyaretçi `/` → `PublicHome` (video splash + dil seçimi) → `/guest` hub'ı.
2. Hub kartından bir hizmete gider (örn. `/academy`, `/rescue`, `/shop`). Sayfaları **girişsiz** gezer.
3. Rezervasyon/satın alma denediğinde korumalı route login'e yönlendirir (`/login`); sonrası `/dashboard` veya rol-bazlı landing.

### Voucher kullanımı
1. Müşteri checkout'ta kod girer → `POST /api/vouchers/validate` (bağlam: lessons/shop/wallet…) → indirim hesaplanır.
2. Saf `wallet_credit` voucher'ı doğrudan `POST /redeem-wallet` ile cüzdana yatırılır. Diğerleri checkout sırasında uygulanır; redemption `voucher_redemptions`'a yazılır (Iyzico callback'inde de). Bkz. [[Finances_Wallet]] / [[Payments_Currency]].

### Google yorumları
1. `GoogleReviewsStrip` `GET /api/google-reviews` çağırır → Redis cache (1 saat) → yoksa Places Details API → 4-5 yıldız filtre + en yeni 5 → cache'le → döndür.

## Dikkat / Tuzaklar

- **Misafir gezebilir, aksiyon edemez:** Public route'lar yalnız **göz atma** içindir; satın-alma/rezervasyon her zaman auth ister. Bir landing sayfasına yazma-aksiyonu eklerken korumalı route'a yönlendirmeyi unutma (bkz. [[Authentication_Authorization]]).
- **Mağaza çift kapı:** Vitrin `publicShopEnabled` bayrağı **veya** `isShopStaff(role)` ile açılır; ikisi de yoksa `/`'e atılır. `/shop/product/:id` bilinçli olarak açık bırakılmıştır (recommendation derin-linkleri). Bayrak `false`'ken müşteri mağazayı göremez ama admin/manager/developer görebilir.
- **GDPR onayı fail-safe:** `marketingConsentService` kayıt yoksa **pazarlamayı engeller** (opt-in). Bilinmeyen bildirim tipi varsayılan olarak `marketing` (güvenli taraf) sınıflanır. Yeni transaksiyonel tip eklerken `TRANSACTIONAL_TYPES` setine eklemezsen iletişim sessizce bloklanabilir. `in_app`/`telegram` daima geçer.
- **Kampanya gönderimi henüz yarım:** `POST /api/marketing/campaigns/:id/send` gerçekten email/SMS/WhatsApp **göndermez**; sadece `sent_count`'u artırır (`TODO`). Gerçek fan-out [[Notifications_System]]'e bağlanmalı.
- **Google Reviews env'e bağlı + cache'li:** Anahtarlar yoksa `503`; API yavaşsa `504`. 1 saatlik Redis cache yüzünden yeni yorumlar anında görünmez. Sadece ≥4 yıldız gösterilir.
- **Landing-page dürüstlüğü:** Pazarlama kopyası abartılmamalı — gerçek: 2025 kuruluş, tek müşteri Duotone Urla, yalnız Iyzico canlı. Sahte istatistik/müşteri sayısı eklenmemeli (bkz. MEMORY `landing_page_honesty_remake`).
- **Rescue = ders disiplini, ayrı tablo değil:** Rescue hizmetleri `services` tablosunda `category='lesson'`, `discipline_tag='rescue_boat'` olarak yaşar; `RescueBoatPage` bunları public servis listesinden filtreler. Aktif üyeye `services.member_discount_percent` (default %50) indirim rozeti gösterilir. Bkz. [[Lessons_Services_Packages]] ve [[Memberships]].
- **Voucher kodu UUID karışıklığı:** İstemci bazen `/validate` sonrası voucher **satırı UUID**'sini geri gönderir; `resolveVoucherLookupCode` bunu gerçek `code` string'ine çevirir. Doğrudan UUID ile `getVoucherByCode` çağırmak başarısız olur.
- **Voucher PK = UUID, kampanya PK = SERIAL:** `voucher_codes.id` UUID, `marketing_campaigns.id`/`proposals.id` SERIAL — finans/birleştirmede id tipini karıştırma.
