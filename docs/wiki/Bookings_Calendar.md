# Bookings & Calendar

> **Özet:** Ders rezervasyonlarının çekirdek modülü — tekil ve grup/semi-private rezervasyonlar, çoklu takvim görünümleri (günlük/haftalık/aylık), sürükle-bırak yeniden planlama ve `PUT /bookings/:id` üzerinden çalışan atomik finansal cascade. `bookings.amount` bir grup rezervasyonunda katılımcı paylarının TOPLAMIDIR (per-head değil). Grup davetleri takvime ancak yeterli kişi kabul edince düşer (deferral), checkout/süre düzenlemesi fiyatı orantısal olarak yeniden hesaplar.
>
> **Kütüphaneler:** React 18, React Router 7, TanStack React Query, React Context, `@dnd-kit` (sürükle-bırak), `react-big-calendar` + `react-calendar-timeline` (timeline sayfası), `date-fns` + `dayjs`, Express 5 (ESM), PostgreSQL, Decimal.js, Socket.IO (realtime).
>
> **Bağlantılar:** [[Lessons_Services_Packages]], [[Finances_Wallet]], [[Instructors_Payroll]], [[Student_Portal]], [[Notifications_System]], [[Customers_CRM]], [[Memberships]], [[Payments_Currency]], [[Backend_Server]], [[Index]]

---

## Sorumluluk

Bu modül, akademinin operasyonel kalbi olan **ders takvimini** yönetir: rezervasyon oluşturma (tekil + çok katılımcılı grup), düzenleme, iptal, silme/geri-yükleme, check-in / checkout, instruktör atama ve sürükle-bırak yeniden planlama. En kritik sorumluluğu, bir rezervasyonun fiyatı/süresi/instruktörü/durumu değiştiğinde **cüzdan, paket saatleri, instruktör hak edişleri ve yönetici komisyonlarını** tutarlı ve atomik biçimde güncellemektir (finansal cascade).

Önemli kavram: bir grup/semi-private rezervasyonda `bookings.amount` = **tüm katılımcı paylarının toplamı** (per-head fiyat değil). Per-head fiyat `group_bookings.price_per_person` veya `booking_participants.payment_amount` içinde tutulur.

## Backend

**Ana rota dosyası:** `backend/routes/bookings.js` (~7900 satır). Başlıca uç noktalar:

- `POST /bookings/` ve `POST /bookings/calendar` — tekil rezervasyon oluşturma. Instruktör **skill doğrulaması** burada yapılır: servisin `discipline_tag` / `lesson_category_tag` / `level_tag` değerlerine karşı `instructor_skills` tablosu kontrol edilir. **`rescue_boat` istisnası:** rescue boat bir kaptan ataması olduğu için skill kontrolü atlanır (`serviceDisciplineTag !== 'rescue_boat'` koşulu — `bookings.js:2253`). `passengers` alanı yalnızca rescue servislerinde set edilir.
- `POST /bookings/group` — çok katılımcılı grup rezervasyonu (frontend `participants.length > 1` olduğunda buraya yönlenir).
- `PUT /bookings/:id` — **finansal cascade'in merkezi** (aşağıda detay). `authorizeRoles(['admin','manager','instructor','front_desk','receptionist'])` + `rateLimitBookingUpdates`.
- `POST /bookings/:id/switch-funding` — cash ↔ package fonlama değişimi (`switchBookingFunding`, `bookingFundingService.js`). Tek katılımcılı rezervasyonlar booking-level çalışır; çok katılımcılı (semi-private/grup) rezervasyonlarda `participant_id` ZORUNLU — o katılımcının `booking_participants` satırı yeniden fonlanır, ledger satırları participant-scoped yazılır, cash ayarı o kullanıcının cüzdanına gider ve parent booking aggregate'leri (`payment_status`/`amount`/hour toplamları) create-time kuralıyla (`recomputeGroupAggregates`) yeniden türetilir (2026-07-23).
- `PATCH /bookings/:id/status` — durum (approve/decline/cancel) güncelleme + cleanup.
- `POST /bookings/:id/cancel`, `DELETE /:id`, `POST /bulk-delete`, `POST /undo-delete`, `POST /restore-latest`, `POST /:id/restore`, `GET /deleted/list` — iptal/silme/geri-yükleme yaşam döngüsü (orphan earnings & phantom commission temizliği ile).
- `GET /bookings/calendar`, `GET /bookings/available-slots`, `GET /bookings/preferred-instructor` — takvim/slot okuma (cache middleware).
- `GET /bookings/pending-transfers`, `PATCH /pending-transfers/:id/action`, `POST /:id/confirm-partner` / `decline-partner` / `suggest-time` — banka havalesi onayı ve partner daveti akışı.

**Grup rotaları:** `backend/routes/groupBookings.js` — `POST /` (oluştur), `POST /:id/invite`, `POST /:id/generate-link`, `GET /invitation/:token`, `POST /invitation/:token/accept|decline`, `POST /:id/accept|decline|suggest-time`, `POST /:id/pay|pay-all`, `POST /:id/confirm`, `POST /:id/add-participant`, `DELETE /:id` ve `DELETE /:id/participants/:participantId`.

**Grup ders talepleri (matchmaking):** `backend/routes/groupLessonRequests.js` — `POST /`, `GET /`, `POST /match`, `POST /mark-matched`.

**Servisler:**
- `backend/services/bookingFundingService.js` — bir rezervasyonu sonradan **cash ↔ package** arasında geçirir. `cash → package`: uyumlu paketlerden çapraz-paket FIFO ile saat çeker, taşma → cash 'partial', tüketim ledger'ına yazar, cash'i iade eder. `package → cash` tersini yapar. Hepsi çağıranın transaction'ında çalışır.
- `backend/services/bookingUpdateCascadeService.js` — `BookingUpdateCascadeService`: fiyat/komisyon değişince instruktör hak edişlerini ve komisyonları yeniden türetir (`deriveLessonAmount`, `partialLessonValue`), `revenueSnapshotService` ile snapshot yazar.
- `backend/services/groupBookingService.js` — grup oluşturma + **`ensureGroupCalendarBooking()`** (calendar deferral, aşağıda) + grup ödeme → `customer_packages` oluşturma.
- `backend/services/bookingService.js`, `bookingNotificationService.js`, `groupLessonRequestService.js` — yardımcı iş mantığı ve bildirimler ([[Notifications_System]]).

### Soft-delete & undo servisleri

- **`backend/services/softDeleteService.js`** — `SoftDeleteService` SINIFI (statik metotlu, default export). Genişletilmiş soft-delete + tam yedek + restore mantığını kapsüller:
  - `softDeleteBooking(bookingId, deletedBy, reason, metadata)` — tek transaction'da (`BEGIN`/`COMMIT`/`ROLLBACK`): rezervasyonun TAM verisini öğrenci/instruktör/servis adlarıyla birlikte okur, `backupRelatedData()` ile ilişkili tabloları (`instructor_earnings`, `booking_equipment`, `booking_custom_commissions`, `payment_intents`, `transactions`) `deleted_booking_relations_backup` tablosuna kopyalar, ana satırı `deleted_bookings_backup` tablosuna JSON olarak yedekler (`scheduled_hard_delete_at = NOW() + INTERVAL '90 days'`), sonra `bookings.deleted_at`/`status='deleted'` yapar ve ilişkili satırları soft-delete eder.
  - `softDeleteRelatedRecords()` — ilişkili tablolara gerekiyorsa `ALTER TABLE ... ADD COLUMN IF NOT EXISTS deleted_at/deleted_by/deletion_reason` ekleyip işaretler.
  - `restoreBooking(bookingId, restoredBy, reason)` — `deleted_bookings_backup` üzerinden (`hard_deleted_at IS NULL`) geri yükler, `bookings.deleted_at=NULL`/`status='confirmed'` yapar, ilişkili kayıtları restore eder, yedek satırına restore metadata ekler.
  - `getDeletedBookings(limit, offset)` — yedek tablosundan silinmiş listeyi döndürür (`canRestore`, `daysUntilHardDelete` hesaplanır).
  - **DİKKAT:** Bu sınıf `backend/routes/bookings.js`'e import edilir (`bookings.js:6387`) ama `restoreBooking`'i kullanan `POST /:id/restore` rotası şu an **YORUM SATIRINA ALINMIŞ** (`bookings.js:7018` — "TEMPORARILY DISABLED - SoftDeleteService import issue"). Canlı `GET /bookings/deleted/list` rotası servisin `deleted_bookings_backup` tabanlı sorgusunu DEĞİL, doğrudan `bookings` tablosunu (`deleted_at IS NOT NULL`) okur. Yani sınıf mevcut ama büyük kısmı şu an pasif; gerçek silme/geri-yükleme akışı `bookings.js` içindeki `deleteOneBookingWithinTx` / `undo-delete` üzerinden yürür.
- **`backend/services/undoManager.js`** — `UndoManager` (tekil singleton `undoManager` export). Kısa ömürlü UI "geri al" tokenları için **process-local, in-memory** bir `Map` (token → `{ data, expiresAt }`). `createToken(data, ttlMs = 10_000)` rastgele 16-byte hex token üretir (varsayılan 10 sn TTL), `get(token)` süre dolmuşsa `null`, `redeem(token)` tek-kullanımlık tüketir, `cleanup()` 30 sn'de bir süresi dolmuş tokenları temizler (`setInterval(...).unref()`). `bookings.js` içinde `POST /bulk-delete` bir undo token döndürür (silme reconciliation snapshot'ıyla) ve `POST /undo-delete` 10 sn içinde redeem edip silmeyi geri alır.
  - **DİKKAT (multi-instance):** Tokenlar yalnızca ÜRETEN süreçte yaşar — bellekte tutulur, kalıcı değildir. Birden fazla backend instance'ı (load balancer arkasında) veya bir restart durumunda undo isteği başka süreçe düşerse token bulunamaz → `410 "Undo window expired or token invalid"`. Tek-instance dev/prod kurulumunda sorun değil; yatay ölçeklemede güvenilmez (Redis gibi paylaşımlı bir store gerekir).

## Frontend

**Sayfalar (`src/features/bookings/pages/`):**
- `BookingsPage.jsx` → `BookingListView` (liste görünümü) — rota `/bookings`.
- `BookingCalendarPage.jsx` → `CalendarProvider` + `ModernCalendar` — rota `/bookings/calendar`.
- `BookingEditPage.jsx` — rota `/bookings/edit/:id`.
- `BookingTimelinePage.jsx` — `react-calendar-timeline` tabanlı zaman çizelgesi.
- Grup: `GroupBookingCreatePage`, `GroupBookingDetailPage`, `GroupLessonRequestPage`, `StudentGroupBookingsPage` (rotalar `/group-bookings*`), ve public `GroupInvitationPage` (rota `/group-invitation/:token`).
- `GroupLessonMatchingPage`, `LessonMatchUpsTab` — admin eşleştirme sekmeleri.

**Takvim kabuğu (`src/features/calendars/pages/`):** üst düzey sekmeli görünümler — `LessonsCalendar.jsx` (calendar / group-requests / lesson-matchups / pending-transfers / pending-payments sekmeleri, badge sayaçları React Query ile), `RentalsCalendar.jsx` (→ Rentals, bkz. [[Accommodation_Rentals]]), `EventsCalendar.jsx` (özel etkinlikler, bkz. [[Chat_Community_Events]]), `PendingLessonsTab.jsx`.

**Çekirdek bileşenler (`src/features/bookings/components/`):**
- `contexts/CalendarContext.jsx` — takvim state'inin tek kaynağı (`useCalendar()` hook). Bookings/instructors/services/users için TTL'li in-memory cache; optimistic create/update/delete; `eventBus` (`bookings:changed`) + `realTimeService` socket (`booking:created|updated|deleted`) abonelikleri; `filterActiveBookings` (cancelled / pending_payment / rental hariç tutar); `standardizeBookingData` (snake/camel alan normalizasyonu, `start_hour` decimal → `HH:MM`).
- `components/BookingDrawer.jsx` — çok-dersli rezervasyon oluşturma sürücüsü; rescue boat'ta `passengers` alanını gösterir (`disciplineTag === 'rescue_boat'`). **`rescueOnly` prop'u (2026-07-06):** GlobalFAB "Assign Rescue" butonu bu modda açar — servis listesi yalnız rescue disiplinine filtrelenir (kapasite filtresi ATLANIR: rescue'da `max_participants` = yolcu sayısı ve `service_type` ondan türetildiği için normal filtre gerçek rescue servislerini gizlerdi), TEK müşteri zorlanır (2+ katılımcı `/bookings/group`'a yönlenir ve o rotada rescue fiyatlaması YOKTUR), süre 1 saate (1 sefer) sabitlenir (per-trip fiyat süreyle çarpıldığından 2h slot 2× ücretlendirirdi), çoklu-ders gizlenir.
- `components/BookingDetailModal.jsx` — rezervasyon detayı + **"Assign to Package" / "Switch to Cash"** fonlama aksiyonu (`POST /:id/switch-funding`). Tek katılımcıda booking-level buton; semi-private/grup rezervasyonlarda People kartındaki HER katılımcı satırında kendi **To Package / To Cash** düğmesi var (`BookingFundingModal`'a `participant` prop'u geçilir; API `participant_id` gönderir).
- `components/ModernCalendar.jsx` + `components/views/{DailyView,WeekView,MonthView}.jsx` — özel takvim görünümleri.
- `components/dnd/` (`CalendarDndProvider`, `DraggableBooking`, `SlotDropZone`, `DayDropZone`) — `@dnd-kit` tabanlı sürükle-bırak; `CalendarContext.swapBookings` ile atomik takas (`DataService.swapBookingsAuto`).

### Takvim sabitleri — `src/config/calendarConfig.js`

Kitesurf ders takviminin statik konfigürasyonu (default export `calendarConfig`):
- `standardSlots` — saatlik slot etiketleri `'09:00'`…`'18:00'`.
- `preScheduledSlots` — önceden planlanmış 2 saatlik ders blokları (örn. `09:00–11:00`, `11:30–13:30`, `14:00–16:00`, `16:30–18:30`).
- `operatingHours` — açılış/kapanış `"HH:MM"` string (varsayılan `08:00`–`21:00`); çalışma zamanında `applyWorkingHours(start, end)` named export'u ile override edilir (mutasyon — nesneyi yerinde günceller).
- `lessonDuration` — dakika cinsinden varsayılan ders süresi (`60`).
- `ui` — `defaultView: 'week'`, `availableViews: ['day','week','month']`, `firstDayOfWeek: 1` (Pazartesi).

### Silinmiş rezervasyon kurtarma admin sayfası — `src/components/admin/DeletedBookingsPage.jsx`

Ant Design tabanlı admin/manager paneli; `deleted_bookings_backup` mantığının yerine **canlı** `GET /bookings/deleted/list` (sayfalama + `q`/`dateFrom`/`dateTo` filtreleri) üzerinden silinmiş rezervasyonları tablo olarak listeler. Her satırda öğrenci/instruktör/servis/tarih-saat, silme tarihi/silen kullanıcı/sebep ve iki aksiyon vardır: "View Details" (silme metadata'sını JSON olarak gösteren modal) ve "Restore Booking" (onay modalı → `POST /bookings/:id/restore`). `formatTime` decimal `start_hour` → `HH:MM` dönüşümü yapar.
- **Erişim:** Bu sayfa kendi rotasında değil; `src/features/settings/pages/UserSettings.jsx`'te `deleted-bookings` sekmesi olarak lazy-load edilir ve yalnızca `isAdmin || isManager` ise render edilir (`UserSettings.jsx:840`).
- **DİKKAT:** "Restore Booking" düğmesi `POST /bookings/:id/restore`'a çağrı yapar, ancak bu backend rotası şu an YORUM SATIRINDA ("TEMPORARILY DISABLED", `bookings.js:7018`) — dolayısıyla UI'daki restore canlıda başarısız olabilir; çalışan geri-alma yolu 10 sn'lik bulk `POST /undo-delete` token akışıdır (bkz. yukarıdaki [[#Soft-delete & undo servisleri]] notu).

## Veri Modeli

- **`bookings`** — ana rezervasyon satırı. Anahtar kolonlar: `date`, `start_hour` (decimal saat, örn. 9.5), `duration` (saat), `student_user_id`, `instructor_user_id`, `service_id`, `status`, `payment_status` (`paid`/`package`/`partial`/`unpaid`/`cancelled`/`pending_payment`), `amount` (grupta = toplam), `final_amount`, `discount_amount`, `group_size`, `max_participants`, `passengers` (rescue boat), `customer_package_id`, `checkin_*`, `checkout_*`, `deleted_at`, `canceled_at`, `created_by`/`updated_by`.
- **`booking_participants`** — çok katılımcılı rezervasyonda kişi başı satır: `user_id`, `is_primary`, `payment_status` (`paid`/`partial`/`package`/`unpaid`/`refunded`), `payment_amount` (kişi payı), `customer_package_id`, `package_hours_used`.
- **`group_bookings`** + **`group_booking_participants`** — grup "master" modeli (organizatör + davetliler). `price_per_person`, `total_amount`, `min_participants`, `max_participants`, `scheduled_date`, `start_time`, `duration_hours`, `booking_id` (deferral ile bağlanır), `package_id`. Katılımcı: `status` (`pending_acceptance`/`accepted`/`paid`/`invited`/`declined`), `amount_due`, `amount_paid`, `is_organizer`, `customer_package_id`.
- **`booking_charge_adjustment`** — cüzdan ayarlama tipi (transaction_type); fiyat/süre düzenlemelerinde net farkı tek satırda cüzdana yazar (bkz. [[Finances_Wallet]]).
- **`booking_package_consumption`** — çapraz-paket saat tüketim ledger'ı (FIFO spillover; bkz. [[Lessons_Services_Packages]]).
- Yan tablolar: `booking_custom_commissions` (özel komisyon), `bank_transfer_receipts` (havale makbuzu), `manager_commissions`, `instructor_earnings`.

## Akış / İş Mantığı

**1. Finansal cascade — `PUT /bookings/:id` (atomik + senkron):**
- `BEGIN` → `SELECT * FROM bookings WHERE id=$1 AND deleted_at IS NULL FOR UPDATE` — `FOR UPDATE` aynı rezervasyonun eşzamanlı iki düzenlemesini serileştirir (son-yazan-kazanır yarış durumunu önler). `deleted_at` guard'ı soft-deleted rezervasyonun cascade ile yeniden hak ediş üretmesini engeller.
- `final_amount` her zaman `amount` ile senkron tutulur (display katmanı önce `final_amount` okur).
- **Süre değişimi (duration reprice):** Süre değişince:
  - `package`/`partial`/spillover rezervasyonlarda `reconcilePackageHoursOnDurationChange` → `customer_packages.used_hours` düzeltilir (PAKET ÖNCE, SONRA CASH politikası), cash leg farkı `booking_charge_adjustment` ile cüzdana yazılır (partial cash-leg settle).
  - Saf **cash** rezervasyonda fiyat servis saatlik ücretinden orantısal yeniden hesaplanır (2h ders 1.5h'e düşünce €60 → €45) — yalnızca çağıran açık fiyat göndermediyse (checkout yalnızca süre gönderir; manuel fiyat düzenlemesi kazanır).
  - **GROUP / SEMI-PRIVATE** rezervasyonlar headcount-bazlı fiyatlandığı için yukarıdaki cash bloğu onları atlar; ayrı blok `ratio = newDuration/oldDuration` ile booking toplamını VE her katılımcı payını orantısal ölçekler, her cash-ödeyen katılımcının cüzdanını farkla `recordWalletTransaction` üzerinden uzlaştırır (Model A: `booking_participants`; Model B: `group_bookings` + `group_booking_participants`).
- **Checkout reprice:** checkout yalnızca gerçek süreyi gönderdiğinde yukarıdaki süre-reprice mantığı devreye girer ("Checkout duration reprice/refund").
- **Fiyat düzenlemesi (`amount` gönderildiğinde):** grup/semi-private'ta yeni toplam yalnızca CASH-ödeyen katılımcılara bölünür (paket katılımcılar €0, payı sulandırmaz), fark her birinin cüzdanına yazılır.
- **İptal (`status='cancelled'`):** `restoreBookingPackageHours` + `refundBookingNetChargesPerUser` + `clearInstructorEarningsForBooking` + `manager_commissions` → 'cancelled'.
- Bekleyen `bank_transfer_receipts` (status='pending') gerçek old→new delta oranında yeniden ölçeklenir.

**2. Grup davet takvim deferral'ı — `ensureGroupCalendarBooking()` (`groupBookings.js:78`):** Grup `bookings` satırı, **link üretiminde değil**, yeterli kişi gerçekten kabul edince (status `accepted`/`paid` ve `>= min_participants`, veya `force`) oluşturulur ve takvime "pending" durumunda düşer. Aksi halde organizatör tek başına davet beklerken takvimde görünmemesi gerekir. `force = true` (örn. organizatör herkes için ödediğinde) min'i atlar. Grup satırı `FOR UPDATE` ile kilitlenir → iki eşzamanlı kabul tek booking üretir (idempotent). Daha sonra biri kabul ederse yalnızca yeni `booking_participants` senkronlanır ve `amount/final_amount/group_size` güncellenir.

**3. Fonlama değişimi (cash ↔ package):** Tek katılımcı için; ledger yazımı + cüzdan uzlaşması + earnings/commission cascade aynı transaction'da commit olur → "package-funded AND cash-refunded" gibi tutarsız durum oluşmaz. UI sonrasında `eventBus.emit('bookings:changed', { reason: 'funding-switch' })` ile takvimi sessizce yeniler.

**4. Realtime/optimistic akış:** Oluşturma/güncelleme backend'in `booking:created|updated|deleted` socket olaylarını tetikler; `CalendarContext` optimistic ekler, sonra ~1.5s gecikmeli "silent full sync" ile sunucu-hesaplı alanları uzlaştırır. `recentBookingsRef` yeni satırların sunucu `LIMIT` nedeniyle full-sync'te düşmesini önler (30s).

## Dikkat / Tuzaklar

- **`bookings.amount` = grup TOPLAMI**, per-head değil. Per-head için `group_bookings.price_per_person` ya da `booking_participants.payment_amount` kullan. Bu karıştırılırsa fiyat/komisyon yanlış hesaplanır.
- **İki grup modeli birlikte yaşar:** Model A (`booking_participants` üzerinde tek `bookings` satırı) ve Model B (`group_bookings` + `group_booking_participants` master). Cascade her ikisini ayrı bloklarla ele alır — birini güncellerken diğerini unutma.
- **`customer_packages.status`** enum'unda `'completed'` GEÇERSİZ; `'used_up'` kullan (aksi halde `PUT /bookings/:id` 500 döngüsü).
- **Süre reprice yalnızca açık fiyat yokken** çalışır; aynı istekte hem `duration` hem `amount` gelirse manuel fiyat kazanır (bilinen kenar durum: partial'da kombine düzenleme yazılan fiyatı ezebilir).
- **rescue_boat skill bypass:** rescue boat servislerinde instruktör skill doğrulaması atlanır (`bookings.js:2253`); ayrıca `passengers` alanı yalnızca bu servislerde set edilir. Normal derslerde skill kontrolü zorunludur.
- **Cüzdan negatif bakiye:** reprice/refund postingleri `allowNegative: true` ile yapılır; aksi halde negatif-bakiye guard'ı iade kredisini bloklar (silme 500'lerinin geçmiş kök nedeni — bkz. [[Finances_Wallet]]).
- **`filterActiveBookings`** rental rezervasyonlarını ders takviminden hariç tutar (kategori/tür/ad "rental"/"equipment" içerirse) — rental'lar [[Accommodation_Rentals]] takviminde.
- **CalendarContext cache** çok katmanlı (in-memory TTL + localStorage timestamp + `recentBookingsRef`); değişiklikten sonra `eventBus.emit('bookings:changed')` çağırmak çoğu UI yüzeyinin senkron kalması için gerekir.
- Sürükle-bırak takas başarısızsa retry mantığı 429/5xx için var; başka hatalar kullanıcıya gösterilir ve `refreshCounter` ile tam yenileme zorlanır.
