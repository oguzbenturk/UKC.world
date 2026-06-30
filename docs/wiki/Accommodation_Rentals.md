# Accommodation & Rentals

> **Özet:** Konaklama (stay) birimlerinin ve ekipman kiralamanın (rentals) yönetimi, rezervasyonu ve fiyatlandırması. Konaklama; kişi sayısına göre (occupancy) fiyatlandırma, "kişi başı ücret" (per-person), hafta sonu/tatil tarifeleri ve uzun konaklama indirimlerini destekler. Ekipman kiralaması; `services` kataloğundan ekipman seçimi, paket-gün kullanımı ve cüzdan/iyzico/pay-later ödeme akışlarıyla çalışır.
>
> **Kütüphaneler:** Express 5 (ESM), PostgreSQL (`pg`), Decimal.js, React 18, Ant Design, dayjs, TanStack Query.
>
> **Bağlantılar:** [[Bookings_Calendar]], [[Finances_Wallet]], [[Lessons_Services_Packages]], [[Outsider_Marketing]], [[Products_Shop_Inventory]], [[Customers_CRM]], [[Payments_Currency]], [[Instructors_Payroll]], [[Database]]

---

## Sorumluluk

Bu düğüm iki ayrı ama yakın akrabası olan iş alanını kapsar:

1. **Konaklama (Accommodation / "Stay")** — Akademinin kendi mülkleri (`category = 'own'`) veya dış oteller (`category = 'hotel'`) için gece bazlı rezervasyon. Misafir, oda/birim seçer, check-in/check-out tarihlerini takvimden işaretler, kişi sayısı + ödeme yöntemi belirler. Fiyat; gece sayısı × (occupancy/per-person/hafta sonu/tatil tarifesi) − uzun konaklama indirimi formülüyle hesaplanır.
2. **Ekipman Kiralama (Rentals)** — Kite/wing/board gibi ekipmanların (aslında `services` tablosundaki kayıtlar) günlük kiralanması. Müşteri portföyünden bir müşteriye, bir veya birden çok ekipman, gün sayısı ve fiyat atanır; paket-gün (`rental_days`) varsa ondan düşülür, yoksa cüzdandan tahsil edilir.

Her ikisi de finansal kayıtları [[Finances_Wallet]] cüzdan defterine, indirimleri ayrı `discounts` tablosuna ([[Lessons_Services_Packages]] ile aynı `discountService`) ve yönetici komisyonlarını `manager_commissions` tablosuna ([[Instructors_Payroll]]) yazar.

---

## Backend

### Rotalar — Konaklama: `backend/routes/accommodation.js`
`server.js` içinde `app.use('/api/accommodation', authenticateJWT, accommodationRouter)` ile **tüm rota grubu JWT arkasında** mount edilir. Ayrıca `server.js`'de showroom için ayrı bir **public** uç vardır: `GET /api/accommodation/units/public`.

**Birimler (units) CRUD:**
- `GET /units` — `cacheMiddleware(120)`; status/type/guests/checkIn/checkOut filtreli. `upcoming_bookings` alt-sorgu ile döner; tarih aralığı verilirse çakışan birimler JS tarafında elenir.
- `GET /units/:id` — `cacheMiddleware(300)`; birim + `upcoming_bookings` (iptal/tamamlanmış ve `pending_payment`/`failed` hariç).
- `POST /units` / `PUT /units/:id` / `DELETE /units/:id` — yalnız `admin`, `manager`. Cache invalidation paterni `api:GET:/api/accommodation/units*`. DELETE; aktif rezervasyon varsa 400 verir, yoksa iptal/tamamlanmış rezervasyonları FK için önce siler.
- `GET /unit-types` — dropdown için tipler (`Room, Suite, Apartment, Villa, Bungalow, Cabin` + DB'deki distinct).

**Rezervasyonlar (bookings):**
- `GET /bookings` — staff (`admin/manager/front_desk/receptionist`); `discountSumLateral('ab_disc', 'accommodation_booking', 'ab.id')` ile indirim sonrası `total_after_discount` döner. Konaklama indirimleri `ab.total_price`'a değil `discounts` tablosuna işlenir.
- `GET /package-stays` — `customer_packages` içindeki check-in tarihli (`includes_accommodation` veya `accommodation_nights_total > 0`) ve henüz bir `accommodation_bookings` kaydı olmayan paket-konaklamaları sentetik olarak listeler (`booking_source = 'package'`).
- `POST /bookings` — **herhangi bir kimliği doğrulanmış kullanıcı**. Akış aşağıda "Akış" bölümünde. Ödeme yöntemleri: `wallet | pay_later | credit_card | bank_transfer (deposit)`.
- `PATCH /bookings/:id/complete` — tamamlar; `revenueSnapshotService.writeAccommodationSnapshot` + `recordAccommodationCommission` (fire-and-forget).
- `PATCH /bookings/:id/confirm` — `pending → confirmed`; komisyon kaydı.
- `PATCH /bookings/:id/cancel` — staff + sahibi olan müşteri (ownership kontrolü). Ödeme `paid` ise cüzdana `releaseLockedFunds` ile iade, `payment_status = refunded`.
- `PATCH /bookings/:id` (edit) — `FOR UPDATE` kilidi + çakışma kontrolü. Fiyat değişiminde `delta` cüzdana yansıtılır: `pay_later` → `accommodation_charge_adjustment`; wallet-paid → ek `lockFundsForBooking`/`releaseLockedFunds`. `recomputeDiscountForAccommodationBooking` + `recomputeManagerCommissionForEntity` koşulsuz çağrılır (salt fiyat düzenlemesinde komisyonun donmasını önlemek için).
- `DELETE /bookings/:id` — staff veya kendi `created_by`; `cancelCommission`.
- `GET /admin/pending-deposits` + `PATCH /admin/pending-deposits/:id/action` — banka havalesi depozitolarının (`bank_transfer_receipts`) admin onay/red akışı; onayda `payment_status='paid', status='confirmed'`, redde `failed/cancelled`. Socket: `pending-accommodation-deposit:*`.

### Rotalar — Kiralama: `backend/routes/rentals.js`
`app.use('/api/rentals', authenticateJWT, triggerFinancialReconciliation, rentalsRouter)`.

- Listeleme: `GET /`, `/recent`, `/active`, `/upcoming`, `/overdue`, `/completed`, `/pending`, `/:id`, `/user/:userId`. Hepsi `RENTAL_DISCOUNT_JOIN` ile `effective_total_price = GREATEST(total_price − discount, 0)` döner. **Instructor'lar dışlanır** (`ALLOW_ROLES_EXCEPT_INSTRUCTOR = ['admin','manager']`) — UI gizli + server 403.
- `POST /` — `admin/manager/instructor/student/outsider/receptionist`. Staff dışı kullanıcılar `pending` durumla başlar (admin onayı gerekir). Fiyat; `equipment_ids` (services) × `rental_days`. Paket-gün varsa (`use_package` + `customer_package_id`) `rental_days_remaining`'den düşülür ve ücret 0 olur. Aksi halde cüzdandan `rental_charge` ile tahsil (EUR yetmezse başka para birimi cüzdanı denenir). `discount_percent` formda girilirse `applyDiscount` ile uygulanır.
- `PUT /:id` — fiyat/durum/ekipman düzenleme; fiyat değişince `recomputeDiscountForRental` + `recomputeManagerCommissionForEntity`; `cancelled`'a geçişte komisyon iptali.
- `DELETE /:id` — **yalnız `admin`**; `forceDeleteRental` servisine devreder (iade dahil).
- Durum geçişleri: `PATCH /:id/activate` (komisyon kaydı + bildirim), `/:id/complete` (snapshot + komisyon), `/:id/cancel` (iade + paket-gün geri yükleme + komisyon iptali), `/:id/deposit-returned`.

### Servisler
- **`backend/services/accommodationPricingService.js`** — gece bazlı fiyat motoru (ayrıntı "Akış/İş Mantığı"). Dışa açar: `extractUnitMeta`, `pickOccupancyRate`, `calculateTotalPrice`.
- **`backend/services/rentalCleanupService.js`** — `forceDeleteRental({ client, rentalId, issueRefund, ... })`: `rentals` satırını `FOR UPDATE` kilitler, `rental_equipment` join'lerini siler, iade gerekiyorsa cüzdana `rental_refund` (CREDIT) yazar, `manager_commissions`'ı aynı transaction'da iptal eder (FK cascade yok), sonra satırı hard-delete eder. `normalizeRentalRow`/`fetchRentalsByIds` yardımcıları da burada.
- **`backend/services/discountService.js`** — `recomputeDiscountForAccommodationBooking`, `recomputeDiscountForRental`, `applyDiscount` (ortak indirim altyapısı — bkz. [[Lessons_Services_Packages]]).
- **`backend/services/managerCommissionService.js`** — `recordAccommodationCommission`, `recordRentalCommission`, `cancelCommission`, `recomputeManagerCommissionForEntity` (bkz. [[Instructors_Payroll]]).

---

## Frontend

### Konaklama — Yönetici/Müşteri sayfaları
- `src/features/accommodation/pages/AccommodationAdminPage.jsx` — Gantt benzeri **rezervasyon takvimi** (35 günlük pencere, gün sütunları, durum renkli çubuklar `BookingBar`); `accommodationApi` üzerinden confirm/complete/cancel/edit/delete; `QuickAccommodationModal` ile hızlı oluşturma.
- `src/features/accommodation/pages/AccommodationBookingPage.jsx` — Müşterinin **kendi rezervasyonları** (dashboard "Stay" kutucuğundan erişilir); `getMyBookings` + iptal.
- `src/features/services/pages/AccommodationUnitsManager.jsx` — birim listesi/yönetim ekranı (units CRUD'u tetikler).
- `src/features/services/components/AccommodationUnitEditor.jsx` — tam ekran, bölümlü birim editörü (Property / Photos / Amenities / Description / **Pricing** / Availability / Status). Pricing bölümünde occupancy tablosu (`OccupancyRateTable`), **"Charge per person"** anahtarı (varsayılan **OFF**), hafta sonu fiyatı, uzun konaklama indirimleri (`DiscountRow`), tatil tarifeleri (`HolidayRow`) ve check-in/out saatleri yer alır. Tüm pricing meta'sı kaydedilirken `amenities` dizisine `__meta__{...}` JSON girişi olarak gömülür (`buildSavePayload`).

### Konaklama — Outsider modalları (bkz. [[Outsider_Marketing]])
- `src/features/outsider/components/StayAccommodationModal.jsx` — Booking.com tarzı açık temalı önizleme: galeri + "rate ladder" (kişi başı gece tarifeleri, seçili misafir satırı teal vurgulu), 7 gece indirimi varsa emerald "weekly" satırı, check-in/out saatleri, per-person/total kırılımı. `extractUnitMeta`, `pickOccupancyRate`, `isPerPersonPricing` kullanır.
- `src/features/outsider/components/AccommodationBookingModal.jsx` — Koyu temalı asıl rezervasyon modalı: özel takvim (dolu tarihler kırmızı/disabled, `bookedRanges`), kişi sayısı, notlar, ödeme yöntemi (Wallet / Deposit %20 banka havalesi / Pay Later — sadece izinli roller). Fiyatı `computeAccommodationPrice` ile **sunucuyla birebir aynı** hesaplar; banka havalesi depozitosunda fiş yükler; kredi kartında `IyzicoPaymentModal` açar.

### Kiralama
- `src/features/rentals/pages/Rentals.jsx` — sekmeli (recent/active/upcoming/overdue/completed/pending/requests) `UnifiedTable`; `NewRentalDrawer` ile oluşturma/düzenleme; takvim görünümüne `CalendarViewSwitcher`.
- `src/features/rentals/pages/RentalsCalendarView.jsx` — kiralama takvim görünümü.
- `src/features/rentals/components/NewRentalDrawer.jsx` — müşteri + ekipman(lar) + gün + fiyat + ödeme yöntemi + indirim formu.

### Frontend↔Backend AYNA (kritik)
> `src/shared/utils/accommodationPricing.js`, `backend/services/accommodationPricingService.js` ile **birebir ayna** olmak ZORUNDADIR. Rezervasyondan ÖNCE gösterilen fiyat, sunucunun gerçekte tahsil ettiğiyle eşleşsin diye iki dosya senkron tutulmalı. Frontend ek olarak `resolveNightlyRate`, `isPerPersonPricing`, `guestPriceMultiplier`, `computeAccommodationPrice` (breakdown: weekendNights/holidayNights/standardNights) yardımcılarını dışa açar; backend muadili `calculateTotalPrice`'dır. **Birini değiştirirken diğerini de güncelle.**

---

## Veri Modeli

- **`accommodation_units`** — `id (uuid)`, `name`, `type`, `category ('own'|'hotel')` (migration 197), `capacity`, `price_per_night`, `description`, `amenities (jsonb)`, `images (jsonb)` (migration 045), `image_url`, `status ('Available'|'Occupied'|'Maintenance'|'Unavailable')`. **Genişletilmiş fiyat/kural meta'sı ayrı kolon DEĞİL**; `amenities` dizisi içinde `"__meta__{...}"` string girişi olarak saklanır (legacy şema tercihi): `weekend_price`, `occupancy_pricing_enabled`, `occupancy_pricing[]`, `weekend_occupancy_pricing[]`, `pricing_per_person`, `custom_discounts[]`, `holiday_pricing[]`, `check_in_time`, `check_out_time`, `min_nights`, `max_nights`, `max_guests`, ev kuralları.
- **`accommodation_bookings`** — `id`, `unit_id`, `guest_id`, `check_in_date`, `check_out_date`, `guests_count`, `total_price`, `status ('pending'|'confirmed'|'completed'|'cancelled')`, `payment_status ('pending'|'paid'|'pending_payment'|'failed'|'refunded')`, `payment_method`, `wallet_transaction_id`, `payment_amount`, `created_by/updated_by`. Konaklama ödemesi cüzdan kolonları migration 157/160.
- **`rentals`** — `id`, `user_id`, `equipment_ids (jsonb)`, `rental_date`, `start_date`, `end_date`, `status ('pending'|'active'|'upcoming'|'overdue'|'completed'|'cancelled')`, `total_price`, `payment_status ('unpaid'|'paid'|'package'|'pending_payment'|'failed')`, `equipment_details (jsonb)`, `customer_package_id`, `family_member_id`, `participant_type ('self'|'family_member')`, `deposit_returned`, `currency`.
- **`rental_equipment`** — `rentals`↔`services` join: `rental_id`, `equipment_id (→ services.id)`, `daily_rate`. Uyumluluk için `equipment_ids` jsonb ile çift tutulur.
- **`bank_transfer_receipts`** — `accommodation_booking_id` ile bağlanan depozito fişleri (migration 231/236 FK cascade).
- **`discounts`** (entity_type `'accommodation_booking'` / `'rental'`) — ham fiyat kolonları asla değişmez; indirim ayrı satır (bkz. [[Database]]).

---

## Akış/İş Mantığı

### Konaklama gece fiyatı — `calculateTotalPrice(checkIn, checkOut, basePrice, meta, guestsCount)`
1. `nights = ceil((checkOut − checkIn)/gün)`; `nights ≤ 0` ise toplam 0.
2. Her gece için tarife önceliği: **tatil > hafta sonu > standart**.
   - Standart tarife: `occupancy_pricing_enabled` ise `pickOccupancyRate(occupancy_pricing, guests, base)`, değilse `base`.
   - Hafta sonu: gün Cuma(5)/Ctesi(6)/Pazar(0) ise; `weekend_price > 0` (legacy truthiness — 0/''/null hafta sonunu kapatır) veya `weekend_occupancy_pricing` doluysa.
   - Tatil: `holiday_pricing[]` tarih aralığına denk gelirse (`price_per_night > 0` veya occupancy listesi).
3. **`pickOccupancyRate`** çözümü: tam eşleşen guest sayısı → yoksa guest'ten küçük-eşit en yüksek tanımlı occupancy → yoksa en düşük tanımlı → yoksa flat fallback.
4. **Per-person (`pricing_per_person`)**: çözülen gece tarifesi `guestMultiplier = max(1, guests)` ile çarpılır. Occupancy ile **birlikte** çalışır — occupancy satırı "kişi başı" tarife olarak okunur ("2 misafir → €70" = €70/kişi → 2 kişi için €140). **Çift sayım yoktur**: occupancy zaten kişiye göre tarife veriyorsa per-person yine ×guests yapar; tasarım gereği occupancy tarifesi per-person fiyat olarak yorumlanır.
5. Uzun konaklama indirimi: `custom_discounts` içinde `nights ≥ min_nights` olan en yüksek eşiğe sahip kural; `percentage` veya `fixed` (× nights). `Math.max(0, total)`.

### Konaklama rezervasyon oluşturma (`POST /bookings`)
Çakışma kontrolü `(check_in_date, check_out_date) OVERLAPS (...)` ile (iptal/`failed`/terk edilmiş kart `pending_payment` hariç; banka havalesi `pending_payment` slotu BLOKLAR). Ödeme yönlendirmesi:
- **wallet** → `lockFundsForBooking` (staff veya `trusted_customer` ise `allowNegative`), `payment_status=paid`.
- **credit_card** → `pending_payment`, `initiateDeposit` (Iyzico, kullanıcı para birimine çevrilir), `paymentPageUrl` döner.
- **bank_transfer** → depozito; fiş + `bank_account_id` zorunlu, `bank_transfer_receipts` kaydı + socket.
- **pay_later** → `accommodation_charge` debit (cüzdan borcu), sadece izinli roller. Staff (`isStaffNegativeBalanceRole`) başkası adına negatif bakiyeye rezervasyon yapabilir.

### Kiralama iade & silme
- **`PATCH /:id/cancel`**: `payment_status='paid'` ve paket-dışı ise `getEntityNetCharges` ile **orijinal para biriminde, yalnız hâlâ açık olan tutar** iade edilir (`idempotencyKey: rental-refund:<id>:<currency>` → tekrar iptal çift iade yapmaz). Paket ise gün geri yüklenir.
- **`forceDeleteRental` (DELETE /:id)**: iade `rental_refund` CREDIT olarak `allowNegative: true` ile yazılır.

> **Tuzak/incident — rental delete 500 (Yağız Çolak):** İadeyi (CREDIT) negatif-bakiye guard'ı reddediyordu. Cüzdanı zaten negatif olan müşteride (örn. kiralama ücreti bakiyeyi −78.08'e itmiş), +78 iadesi bakiyeyi hâlâ sıfırın altında bıraktığı için "Insufficient wallet balance" fırlatıyor, tüm silme rollback olup HTTP 500 veriyordu. **Çözüm:** `rentalCleanupService.js` içinde iade transaction'ında `allowNegative: true`. İade bir CREDIT olduğu için bakiyeyi yalnız yükseltir; asla "yetersiz bakiye" ile reddedilmemeli. (Detaylı kayıt: bkz. [[Finances_Wallet]].)

---

## Dikkat/Tuzaklar

- **AYNA senkronu:** `src/shared/utils/accommodationPricing.js` ↔ `backend/services/accommodationPricingService.js`. Fiyat mantığında en ufak sapma → müşteriye gösterilen fiyat ≠ tahsil edilen. Mutlaka birlikte güncelle.
- **Meta `amenities` içinde gizli:** Birim ayarları ayrı kolon değil; `extractUnitMeta` `__meta__` girişini parse eder. `amenities` dizisini filtrelerken `__meta_`/`__meta__` ile başlayan girişler UI'da gösterilmemeli (StayAccommodationModal bunu yapıyor).
- **Per-person varsayılan OFF:** `pricing_per_person` editörde varsayılan kapalı. Açıkken occupancy satırları "kişi başı" olarak yorumlanır — çift sayım yok ama anlamı değişir; UI bunu turuncu uyarıyla belirtir.
- **Hafta sonu legacy truthiness:** `weekend_price` yalnız `> 0` ise "set" sayılır; kaydederken pozitif flat hafta sonu yoksa `weekend_occupancy_pricing` boşaltılır (eski dizinin sessizce hafta sonu zammını yeniden açmasını önlemek için).
- **İndirimler ayrı tabloda:** Hem konaklama hem kiralamada `total_price` ham kalır; indirim `discounts` tablosuna işlenir ve `effective_total_price`/`total_after_discount` SELECT'lerde hesaplanır. Ham fiyat kolonlarını mutasyona uğratma (bkz. [[Database]], [[Lessons_Services_Packages]]).
- **Komisyon FK cascade yok:** Kiralama hard-delete edilince `manager_commissions` orphan kalmasın diye aynı transaction'da elle iptal edilir (`forceDeleteRental`). Salt fiyat düzenlemesinde komisyon donmasın diye `recomputeManagerCommissionForEntity` koşulsuz çağrılır.
- **Instructor erişimi:** Kiralama listeleri instructor'a kapalı (UI gizli + server 403, `ALLOW_ROLES_EXCEPT_INSTRUCTOR`). `DELETE /rentals/:id` yalnız `admin`.
- **Idempotent iade:** Kiralama iptal iadesi `idempotencyKey` ile korunur; tekrar iptal çift iade yapmaz. Konaklama iadesi `payment_status` kontrolüyle tek sefer.
- **Public vs auth:** `/api/accommodation` tamamı JWT arkasında; misafir tarama için ayrı `GET /api/accommodation/units/public` (server.js). Kiralamada public uç yok.
