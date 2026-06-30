# Lessons, Services & Packages

> **Özet:** Ders hizmetlerinin (private / semi-private / group + yeni `rescue_boat`) ve satılan paketlerin (saat bazlı VEYA adet/"sefer" bazlı) tüm yaşam döngüsünü yönetir: katalog CRUD, çoklu para birimi fiyat, üyelik %50 indirimi, paket satın alma ve cross-package FIFO saat tüketimi/havuzu. Çekirdek değer akışı `booking_package_consumption` defteri (migration 278) üzerinden DONMUŞ saat-başı oranla işler; sonradan fiyat düzenleme/tier yükseltme bu defteri kontrollü şekilde yeniden fiyatlar.
>
> **Kütüphaneler:** Express 5 (ESM), PostgreSQL (`pg`), Decimal.js (finansal), React 18 + Ant Design, TanStack Query, uuid.
>
> **Bağlantılar:** [[Bookings_Calendar]], [[Finances_Wallet]], [[Memberships]], [[Instructors_Payroll]], [[Accommodation_Rentals]], [[Customers_CRM]], [[Payments_Currency]], [[Database]]

---

## Sorumluluk

Bu modül üç katmanı kapsar:

1. **Hizmet katalogu (`services`)** — bir akademinin sattığı her şeyin tanımı: dersler, kiralama segmentleri, kurtarma teknesi. Disiplin (`discipline_tag`: kite/wing/kite_foil/efoil/premium/accessory/**rescue_boat**) ve kategori (`lesson_category_tag`: private/semi-private/group/supervision/**rescue_boat**) etiketleriyle sınıflanır.
2. **Paket katalogu (`service_packages`)** — önceden ödenen saat/gün/gece demetleri. Saf ders paketinden tatil-tipi "all_inclusive / downwinders / camps" demetlerine kadar `package_type` ile ayrışır.
3. **Müşteri paketleri (`customer_packages`)** — bir müşterinin satın aldığı somut bakiye (`remaining_hours`, `rental_days_remaining`, `accommodation_nights_remaining`). Dersler bu bakiyeyi FIFO tüketir.

Müşteri tarafındaki paket yönetimi UI'si (`CustomerPackageManager`) → bkz. [[Customers_CRM]].

## Backend

### Ana rota dosyası: `backend/routes/services.js` (~4050 satır)

- **Hizmet CRUD:** `GET /` (300 sn cache), `POST /` (satır 2609), `PUT /:id` (2899), `DELETE /:id`. `POST /` gövdeden `disciplineTag`, `lessonCategoryTag`, `levelTag`, `rentalSegment`, `memberDiscountPercent`, `insuranceRate` alıp `services` tablosuna yazar; ardından `setServicePrices` ile çoklu-para fiyatı `service_prices` tablosuna senkronlar. Eksik para birimi FK hatasını `ensureCurrencyExists` önler.
- **Paket katalog CRUD:** `GET /packages` (admin/manager), `GET /packages/public` (auth'suz, academy landing için, LATERAL ile accommodation_unit çözümü), `GET /packages/available` (öğrenci/outsider, `package_type` filtresi), `POST /packages` (2037'de `PUT`).
- **Paket satın alma:** `POST /packages/purchase` (842) — wallet / credit_card (Iyzico) / bank_transfer / pay_later. Çoklu-para wallet düşümü `FOR UPDATE` ile yarış-güvenli; yetersiz bakiyede diğer para birimlerini dener. `proRataTotalHours` ile paket saatini orantılı küçültüp fiyatı ölçekler (`scale = reqH / total_hours`). Voucher/promo entegrasyonu var. `customer_packages` her zaman **EUR base** fiyatla kaydedilir (earnings hesabı para-bağımsız kalsın diye).
- **Müşteri-paket işlemleri:** `PATCH /customer-packages/:id/price` (fiyat düzenle), `POST /customer-packages/:id/upgrade` + `/upgrade/preview` (tier yükseltme, dryRun ile önizleme), `POST /customer-packages/:id/cancel`, `DELETE /customer-packages/:id`, `use-hours` / `use-rental-days` / `use-accommodation-nights`.

### Servisler (`backend/services/`)

- **`packagePoolService.js`** — `getEligiblePackagesForLesson()`: "bir dersi hangi paketler fonlayabilir" sorusunun TEK kaynağı. Kural (owner kararı): paketler ders TÜRÜ (lesson_category_tag) VE disiplini (discipline_tag) eşleşince zincirlenir; etiketsiz legacy paketler izin-verici dahil edilir, etiket yoksa `lesson_service_name` adına geri düşülür. FIFO sırası `purchase_date ASC`.
- **`packageConsumptionService.js`** — Cross-package FIFO spillover'ın kalbi. `consumeAcrossPackages()` uygun paketlerden en eskiden başlayarak saat çeker, biri biterse sonrakine taşar, tüm havuz tükenince nakde ("cash overflow") düşer. Her çekim `booking_package_consumption`'a DONMUŞ `rate_per_hour` ile yazılır (`recordConsumptionLedger`). `GUARDED_CONSUME_SQL` yarış-güvenli azaltma yapar; `status = 'used_up'` (saat ≤0 + rental/accom de bittiyse). İptal/silmede `restoreFromLedger` (released_at ile, satır SİLMEZ), duration-down'da `releaseHoursFromLedger` (LIFO), soft-delete geri-yüklemede `reconsumeFromLedger`. Kill switch: `PACKAGE_SPILLOVER_ENABLED=false` → tek paketle sınırlar.
- **`customerPackageService.js`** — `forceDeleteCustomerPackage` (kullanılmış saatleri servis saat-ücretiyle düşüp kalanı iade; açık indirimleri `deleteDiscount` ile ters çevirip çift-sayımı önler), `updateCustomerPackagePrice` (cascade: wallet delta + discount rebase + manager komisyon + instructor earnings), `upgradeCustomerPackage` (frozen-rate kuralının TEK istisnası — aktif defter satırlarını yeni tier oranına yeniden fiyatlar, ilk oranı `original_rate_per_hour`'da saklar).
- **`membershipPricingService.js`** — Üye %50 fiyatlamasının TEK kaynağı (rescue_boat için). `hasActiveMembership(db, userId)`, `isRescueService(service)`, `rescueMemberDiscountPercent(service)`, `computeRescueMemberDiscount(service, gross, isMember)`. Asıl sahibi [[Memberships]] olsa da ders fiyatına bu modül üzerinden girer.
- **`bookingFundingService.js`** — Var olan bir booking'i sonradan **cash ↔ package** arasında atomik çevirir (`POST /bookings/:id/switch-funding`). cash→package: havuzdan FIFO çekip nakdi iade eder; package→cash: saatleri iade edip servis nakit oranıyla yeniden ücretlendirir. v1: tek katılımcı.
- **`serviceRevenueLedger.js`** — Ders/kiralama/konaklama gelirini `service_revenue_ledger` tablosuna toplayan finans-raporu projeksiyonu (booking/rental/accommodation tek tabloya upsert; komisyon dahil). Tüketim defterinden ayrıdır.
- **`discountService.js`** (ders indirimleri açısından) ve **`multiCurrencyPriceService.js`** (ders/paket fiyatı: `setServicePrices`, `getServicePriceInCurrency`).

### Yetkili-eğitmen eşleştirme: `backend/routes/instructorSkills.js`

`GET /instructors/qualified?service_id=` servisin `discipline_tag`/`lesson_category_tag`/`level_tag` değerlerini `instructor_skills` ile eşleştirir. **DİKKAT:** `rescue_boat` skill-kontrol DIŞINDADIR — booking oluşturmada (`bookings.js:2253`) `serviceDisciplineTag !== 'rescue_boat'` koşuluyla beceri kontrolü atlanır.

## Frontend

- **`src/features/services/pages/LessonServices.jsx`** — Ders hizmetleri tablosu (disiplin/kategori `Tag`, kapasite, çoklu-para fiyat). `DISCIPLINE_MAP`'e `rescue_boat: '🚤 Rescue'` eklenmiş. Yeni/düzenle akışı `StepLessonServiceModal`.
- **`src/features/services/pages/PackageManagement.jsx`** (~1895 satır) — "Experience Packages" yönetimi. `PACKAGE_TYPES` 9 tip (lesson, rental, accommodation, lesson_rental, accommodation_lesson, accommodation_rental, all_inclusive, downwinders, camps). Drawer-tabanlı oluşturucu (Info/Components/Pricing/Image). **Rescue mantığı:** seçili ders servisi `rescue_boat` ise birim etiketi "hours"→"trips/sefer" olur (alan `totalHours` kalır), `isRescuePackage`/`isRescueRecord` yardımcıları. Paketin `disciplineTag`'ı bağlı ders servisinden miras alınır (FIFO havuzu eşleşsin diye), `lessonCategoryTag` rescue'de NULL bırakılır. Bileşen-başı fiyat hesaplayıcı (saat×oran + gün×oran + gece×oran) toplamı otomatik `prices` alanına yazar.
- **`src/features/services/components/ServiceForm.jsx`**, **`StepLessonServiceModal.jsx`** (adım-adım ders oluşturucu), **`LessonPackageManager.jsx`** — hizmet/paket form bileşenleri. `AccommodationUnitEditor.jsx` konaklama paketleri için.

## Veri Modeli

| Tablo | Rol | Kritik alanlar |
|---|---|---|
| `services` | Hizmet katalogu | `discipline_tag`, `lesson_category_tag`, `level_tag`, `member_discount_percent` (mig 281), `rental_segment`, `insurance_rate`, `package_id` |
| `service_packages` | Paket katalogu | `package_type`, `total_hours`, `sessions_count`, `includes_lessons/rental/accommodation`, `lesson_service_id`, `accommodation_unit_id`, `package_hourly_rate` |
| `customer_packages` | Müşteri bakiyesi | `remaining_hours`/`used_hours`, `purchase_price` (EUR base) + `original_price`, **`status` enum: `active`/`waiting_payment`/`used_up`/`pending_payment`/`cancelled` — `'completed' GEÇERSİZ**, `rental_days_remaining`, `accommodation_nights_remaining` |
| `booking_package_consumption` | FIFO tüketim defteri (mig 278) | `booking_id`, `participant_id`, `customer_package_id`, `hours_used`, **`rate_per_hour` (DONMUŞ)**, `seq` (LIFO sıra), `released_at`, `original_rate_per_hour` (mig 279) |
| `service_prices` / `package_prices` | Çoklu-para fiyat | `currency_code`, `price` |
| `instructor_skills` | Eğitmen yetkinliği | `discipline_tag`, `lesson_categories[]`, `max_level` |

**Defter sözleşmesi (mig 278):** Bir booking'in defter satırı YOKSA → legacy booking; tüm yollar `bookings.customer_package_id` + `package_hours_used`'a geri düşer. `bookings.package_hours_used` = released-olmayan `hours_used` toplamı; `cash_hours_used` = nakit taşma bacağı.

## Akış / İş Mantığı

1. **Paket oluştur → sat:** Admin `PackageManagement`'tan paket tanımlar (`POST /services/packages`). Müşteri/staff `POST /services/packages/purchase` ile satın alır → `customer_packages` satırı (`active`), EUR base fiyatla.
2. **Ders rezervasyonu paketi tüketir:** Booking oluşturulurken `consumeAcrossPackages` uygun paketlerden FIFO saat çeker; biten paketten sonrakine taşar (spillover), havuz tükenince nakde düşer. Her çekim defterde dondurulmuş oranla kaydedilir → bkz. [[Bookings_Calendar]].
3. **Frozen-rate kuralı:** Sonradan paket fiyatı düzenlenirse (`updateCustomerPackagePrice`) geçmiş tüketim oranı DEĞİŞMEZ (revenue/komisyon stabil). TEK istisna: **tier yükseltme** (`upgradeCustomerPackage`) — aktif satırları yeni tier oranıyla yeniden fiyatlar, ilk oranı `original_rate_per_hour`'da saklar.
4. **Lesson ↔ package switch:** Booking detayından `POST /bookings/:id/switch-funding` ile sonradan nakit↔paket çevrilir; defter yazımı + wallet + earnings/komisyon tek transaction'da atomik commit eder → bkz. [[Finances_Wallet]].
5. **Üye %50 (rescue):** Booking oluşturmada (`bookings.js`) `hasActiveMembership` + `computeRescueMemberDiscount` ile aktif üyeye `member_discount_percent` (default 50) uygulanır; net tutar wallet'e bu şekilde yazılır → bkz. [[Memberships]].
6. **Silme/iptal geri-sarımı:** Defter `restoreFromLedger`/`releaseHoursFromLedger`/`reconsumeFromLedger` ile saatleri tam olarak iade eder — artık duration'dan TAHMİN edilmez (orphan-earnings/phantom-refund bug sınıfını kapatır).

## Dikkat / Tuzaklar

- **`customer_packages.status` enum'ında `'completed' YOKTUR**; biten paket `'used_up'`. Yanlış değer `PUT /bookings/:id`'de 500 döngüsüne yol açtı (proje hafızası: `customer_package_status_enum`).
- **Frozen rate vs. upgrade:** `booking_package_consumption.rate_per_hour` bilerek dondurulur. Sadece `upgradeCustomerPackage` bunu ezer; düz fiyat-düzenleme (`updateCustomerPackagePrice`) ASLA geçmiş satırları yeniden fiyatlamaz.
- **Rescue özel davranışı:** `rescue_boat` ders gibi satılır ama (a) eğitmen-skill kontrolü baypas edilir, (b) `lesson_category_tag` paketlerde NULL kalır, (c) UI'de "saat" yerine "sefer/trip" gösterilir (alan adı yine `totalHours`), (d) üye %50 indirimi `services.member_discount_percent` üzerinden gelir.
- **EUR base zorunluluğu:** `customer_packages.purchase_price` her zaman EUR'da saklanır; müşteri TRY ödese bile. Earnings/refund hesapları buna dayanır — para birimi karıştırılmamalı.
- **İade çift-sayımı:** İndirimli bir paket silinirken önce açık `discount` satırları `deleteDiscount` ile ters çevrilmeli; aksi halde tam `purchase_price` iadesi + duran indirim kredisi = müşteriye phantom bakiye (proje hafızası: `membership_discount_overrefund_fix`).
- **Spillover kill switch:** `PACKAGE_SPILLOVER_ENABLED=false` ortam değişkeni tüm tüketimi ilk eşleşen paketle sınırlar — defter altyapısı yine de yazılır.
- **`backend/db/migrations/` AUTHORITATIVE'dir** (`backend/migrations/` DEĞİL). İlgili migrasyonlar: 278 (defter), 279 (original_rate), 281 (rescue_boat + member_discount_percent).
