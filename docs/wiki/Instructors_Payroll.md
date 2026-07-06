# Instructors_Payroll

> **Özet:** Eğitmen ve müdür ödeme/komisyon motoru. Tamamlanmış ders ve kiralamalardan eğitmen komisyonu (%, sabit-saatlik veya ders-başı-sabit) ve müdür komisyonu (varsayılan %10, üyeliklerde sadece "plaj ücreti" kısmı) hesaplanır; ödemeler `wallet_transactions` üzerinden tutulur ama bakiyeyi etkilemez. Beceriler, müsaitlik, kategori bazlı oranlar ve dashboard/payroll yüzeylerini içerir.
>
> **Kütüphaneler:** Node.js + Express (ESM), PostgreSQL (`pg`), Decimal-benzeri JS round (`toNumber`/`toFixed`), React 18 + Ant Design + TanStack Query, react-i18next.
>
> **Bağlantılar:** [[Bookings_Calendar]], [[Finances_Wallet]], [[Lessons_Services_Packages]], [[Memberships]], [[Accommodation_Rentals]], [[Authentication_Authorization]], [[Dashboard_Metrics_Admin]], [[Payments_Currency]]

---

## Sorumluluk

Bu modül "kim ne kazandı ve ne kadar ödendi" sorusunu yanıtlar. İki ayrı maaş kalemini yönetir:

1. **Eğitmen komisyonu** — bir dersin tamamlanmasıyla (`completed`/`done`/`checked_out`) eğitmene düşen pay. Oran modeli esnek: yüzde, sabit-saatlik (`fixed`/`fixed_per_hour`) veya ders-başı-sabit (`fixed_per_lesson`).
2. **Müdür komisyonu** — merkezdeki TÜM ders, kiralama, konaklama, mağaza, üyelik ve paket satışlarından müdüre düşen pay (varsayılan %10).

Tüm para birimi EUR'ya çevrilerek hesaplanır ([[Payments_Currency]]). Komisyonlar oluşturulurken değil, kaynak işlem **tamamlandığında** kaydedilir (cascade içinden, bkz. [[Bookings_Calendar]]).

## Backend

### Servisler
- `backend/services/instructorFinanceService.js` — eğitmen kazanç motorunun kalbi. `getInstructorEarningsData()` (tek eğitmen, ders-ders kırılım), `getLessonFinanceBreakdown()` (`/finance/lessons` sayfası + headline toplamlar, bkz. [[Lessons_Services_Packages]]), `getAllInstructorBalances()` (tüm eğitmen + müdür bakiyeleri tek seferde), `getInstructorPayrollHistory()` / `getInstructorPaymentsSummary()`. Hepsi aynı `mapEarningRow` → `deriveLessonAmount`/`partialLessonValue`/`deriveTotalEarnings` zincirini kullanır ki payroll, dashboard ve finans sayfaları **birebir uzlaşsın**.
- `backend/services/managerCommissionService.js` — müdür komisyonu kayıt/yeniden hesaplama/iptal. `recordBookingCommission`, `recordRentalCommission`, `recordGenericCommission` (konaklama/mağaza/üyelik/paket), `recomputeManagerCommissionsForPackage`, `recomputeManagerCommissionForEntity`, `getManagerCommissionSummary`. Üyelik için `membershipCommissionableBase()` tek doğru kaynaktır.
- `backend/services/instructorService.js` — eğitmen dashboard'u (`getInstructorDashboard`), öğrenci listesi/profili, ilerleme/tavsiye CRUD. Redis cache (`instructor:dashboard:<id>`, TTL ~60sn); `invalidateInstructorDashboardCache()` ödeme/komisyon değişiminde çağrılır.
- `backend/services/instructorNotesService.js` — eğitmen-öğrenci notları (görünürlük + pinleme).
- `backend/services/staffPaymentService.js` — eğitmen VE müdür ödemeleri için ortak CRUD (`createStaffPayment`/`updateStaffPayment`/`deleteStaffPayment`, `STAFF_KIND`). Kind farkları `STAFF_KIND_CONFIG`'te. Düzenleme = iptal + yeniden kayıt; silme = sadece iptal + `resyncWalletAfterCancel` (eski "reversal satırı ekle" yaklaşımı çift-geri-alma yapıyordu, bkz. [[Finances_Wallet]]).

### Rotalar
- `backend/routes/instructor.js` → `/api/instructors/me/*` — eğitmenin kendi dashboard'u, öğrencileri, notları, tercihleri, çalışma saatleri.
- `backend/routes/instructors.js` → `/api/instructors` — PUBLIC `GET /` (misafir göz atma, `instructor`+`manager` rolleri, `team_member_settings` görünürlük), `GET /:id`, `/:id/services`, `/:id/lessons` (instructor kendi verisi dışına 403).
- `backend/routes/instructorAvailability.js` → `/api/instructors/me/availability` ve onaylama; `instructorsRouter`'dan ÖNCE mount edilir (route çakışması).
- `backend/routes/instructorCommissions.js` → `/api/instructor-commissions` — varsayılan komisyon, servis-bazlı komisyon ve kategori-bazlı oran (`instructor_category_rates`) CRUD. Yalnızca `admin`/`manager`.
- `backend/routes/instructorSkills.js` → `/api/instructors/:id/skills` + `/api/instructors/qualified` — beceri seti ve servise uygun eğitmen filtreleme.
- `backend/routes/managerCommissions.js` → `/api/manager/commissions` — müdür kendi dashboard'u (`/dashboard`, `/history`, `/summary`, `/membership-breakdown`, `/upcoming`) + admin'in tüm müdür ayarları/ödemeleri.
- `backend/routes/finances.js` → `GET /api/finances/instructor-earnings/:instructorId` (kazanç + payroll geçmişi) ve `PUT .../:bookingId/commission` (tek ders için komisyon override → `booking_custom_commissions` + cascade yeniden çalıştırma).

## Veri Modeli

Komisyon oranı çözümü `COALESCE` önceliğiyle yapılır (en spesifik kazanır):
`self_student override (45%) → booking_custom_commissions → instructor_service_commissions → instructor_category_rates → instructor_default_commissions`.

- `instructor_default_commissions` — eğitmen başına varsayılan: `commission_type` (`fixed`/`percentage`/...), `commission_value`, `self_student_commission_rate` (varsayılan 45).
- `instructor_service_commissions` — (eğitmen × servis) özel oranı.
- `instructor_category_rates` — (eğitmen × ders kategorisi) oranı; kategoriler `private`/`semi-private`/`group`/`supervision`/`semi-private-supervision`.
- `booking_custom_commissions` — tek bir booking için override (manager UI'dan).
- `instructor_skills` — `discipline_tag` (`kite`/`wing`/`kite_foil`/`efoil`/`premium`), `lesson_categories[]`, `max_level` (`beginner`/`intermediate`/`advanced`). `/qualified` bu tabloyu servisin tag'leriyle eşler.
- `instructor_availability` / `instructor_working_hours` / `instructor_preferences` — müsaitlik talepleri (onaylı/red), haftalık çalışma saatleri, tercihler.
- `manager_commissions` — `source_type` (`booking`/`rental`/`accommodation`/`shop`/`membership`/`package`), `source_id`, `source_amount`, `commission_rate`, `commission_amount`, `period_month`, `status` (`pending`/`paid`/`cancelled`), `payout_id`, `source_date`. `MANAGER_COMMISSION_LIVE_GUARD_SQL` ile soft-deleted/cancelled kaynaklar dashboard toplamlarından dışlanır.
- `manager_commission_settings` — `commission_type` (`flat`/`per_category`/`tiered`), kategori bazlı oranlar, `salary_type` (`commission`/`fixed_per_lesson`/`monthly_salary`).
- `staff_payments` mantığı `wallet_transactions` üzerinde yaşar: `entity_type IN ('instructor_payment','manager_payment')`, `transaction_type IN ('payment','deduction')`. **Önemli:** `available_delta = 0` — maaş ödemesi personelin cüzdan bakiyesini değiştirmez ([[Finances_Wallet]]).
- **Migration 280** (`280_add_beach_fee_to_member_offerings.sql`) — `member_offerings.beach_fee_amount` + `member_purchases.beach_fee_amount` (snapshot). Müdür üyelik komisyonu yalnızca bu plaj porsiyonu üzerinden ([[Memberships]]).

## Akış / İş Mantığı

### Ders değeri türetme (`backend/utils/instructorEarnings.js`)
- `deriveLessonAmount()` — paket dersleri için fiyatı paket-saat-başı orana göre böler; düz/nakit dersler için `base_amount` (indirim sonrası).
- `partialLessonValue()` — KISMİ booking (bir kısmı paketten, kalanı nakit). Eski hata nakdi tam-süre paket değerinin ÜSTÜNE ekleyip saati çift sayıyordu; düzeltme nakdi paket-saat-başı oranla fiyatlar, sadece paketten çekilen saatleri + nakdi sayar.
- `deriveTotalEarnings()` — `fixed`/`fixed_per_hour` → `oran × süre`; `fixed_per_lesson` → düz tutar; yüzde → `tutar × oran / 100`. Oran ≤ 0 ise kazanç 0.
- **`done`/`checked_out` dahil** (`COMPLETED_BOOKING_STATUSES`): sadece `completed` sayılırsa dashboard/payroll bu durumları sessizce düşürürdü.

### Müdür komisyon kuralları
- Kayıt anı: ders/kiralama tamamlanınca. `getDefaultManager()` ile ilk aktif müdür kullanılır (tek-müdür varsayımı).
- Üyelik komisyonu: `membershipCommissionableBase({offeringPrice, beachFeeAmount, discount})` — plaj porsiyonu üzerinden, indirim plaj dilimine PRO-RATE edilir. `beachFeeAmount == null` ⇒ legacy ⇒ tam fiyat. Saf depo (storage) satışında plaj bazı 0 → komisyon satırı yok.
- Kiralama: önce `total_price`, paket kiralamada `derivePackageRentalAmount()`; aktif manuel indirim her zaman düşülür.
- İndirim/fiyat değişimi sonrası `recomputeManagerCommissionForEntity` / `recomputeManagerCommissionsForPackage` `payout_id IS NULL` satırları yeniden hesaplar (ödenmiş = değiştirilemez tarih). Tarih değişiminde `updateManagerCommissionSourceDate` `period_month`/`source_date`'i taşır.

### Frontend
- `src/features/instructor/pages/InstructorDashboard.jsx` (+ `MyStudents`, `StudentDetail`) — eğitmenin kendi görünümü; `useInstructorDashboard` hook'u `/me/dashboard`'ı çeker. Kazanç trendi, özet metrikler, yaklaşan dersler, öğrenci check-in.
- `src/features/instructors/pages/` — `Instructors.jsx` (admin liste), `InstructorFormPage.jsx` (komisyon/beceri/oran düzenleme), `BulkCommissions.jsx`.
- `src/features/manager/pages/finance/` — `ManagerEarnings.jsx` (komisyon dashboard + geçmiş + üyelik kırılımı), `ManagerUpcomingIncome.jsx`, `ManagerPayouts.jsx`, `ManagerFinanceOverview.jsx`, `ManagerCommissionSettings.jsx`; ayrıca `ManagerPayroll.jsx`, `ManagerHomeDashboard.jsx`. API katmanı `services/managerCommissionApi`.

## Dikkat / Tuzaklar

- **CRITICAL (kısmen açık) — eğitmen yeniden atama:** Salary-audit'te "booking başka eğitmene atanınca eski eğitmene ödüyor" bulgusu vardı. `bookingUpdateCascadeService.js` (C1) artık reassignment'ta ledger'ı yeni eğitmene yeniden yönlendiriyor; ancak audit notu hâlâ açık sayar — geçmiş veride doğrulama gerekir. Bkz. MEMORY `project_salary_audit_open_findings`.
- **IDOR düzeltildi:** `GET /finances/instructor-earnings/:id` rotası `instructor` rolüne izin verdiğinden, düz eğitmen URL'deki id'yi değiştirip başkasının kazançlarını okuyabiliyordu. Düzeltme: `isPrivileged` değilse `instructorId = req.user.id` zorlanır.
- **Maaş ödemesi ≠ cüzdan:** `available_delta = 0` zorunlu; aksi halde personel cüzdanı yanlış şişer. Silme/düzenleme **iptal + resync** ile yapılır, reversal satırıyla DEĞİL (çift-geri-alma → Dinçer/Siyabend/Erkan negatif bakiye olayları, [[Finances_Wallet]]).
- **`fixed_per_lesson` vs `fixed` karışıklığı:** `fixed`/`fixed_per_hour` saatlik; `fixed_per_lesson` ders-başı düz. UI'da "sabit oran %olarak gösterme" bug'ı vardı (gross-vs-net Paid Out, dashboard cache busting). Bkz. `project_instructor_finance_audit_fixes`.
- **`payment_date` ≠ `created_at`:** payroll geçmişi `metadata.paymentDate`'i gösterir (`COALESCE` ile `created_at`'e düşer); aksi halde düzenleme her seferinde satırı bugüne re-date ederdi.
- **Rescue boat:** `rescue_boat` 4. ders kategorisi; kaptan-oranı yoksa komisyon 0 (varsayılana DÜŞMEZ). BookingDrawer'da skill-bypass + yolcu sayısı alanı (`discipline_tag === 'rescue_boat'`). Bkz. `project_rescue_boat_service` (in progress). **Guard kapsamı (2026-07-06):** NULL-guard artık 5 SQL sitesinde — bookingUpdateCascadeService.getCommissionRate (yazma), instructorFinanceService `getInstructorEarningsData` + `getLessonFinanceBreakdown` + `getAllInstructorBalances` (payout ekranı — önceden guardsızdı, kaptan bakiyesini varsayılan komisyonla şişirirdi), dashboardSummaryService. HÂLÂ GUARDSIZ (görüntü/analitik, payroll'u etkilemez): bookings.js liste/detay `instructor_commission` alanı; finances.js `instructorMetricsQuery`; cashModeAggregator; serviceRevenueLedger. Self-student override (%45) guard'dan ÖNCE değerlendirilir (rescue'da da geçerli olur — edge).
- **Tek-müdür varsayımı:** `getDefaultManager()` ilk aktif müdürü alır; çoklu müdür senaryosu desteklenmez.
- **`MANAGER_COMMISSION_LIVE_GUARD_SQL`:** dashboard/bakiye toplamlarında soft-deleted booking ve cancelled rental'ların pending komisyonlarını dışlamak için ZORUNLU; inline kopya rental liveness'ı kaçırıyordu.
- **Kesinti (deduction) matematiği TEK kural (2026-07-03):** `manager_payment` kesinti satırları NEGATİF tutarla saklanır. Her yüzeyde: `paid` = yalnızca pozitif payment satırları; `pending = max(earned − paid − deducted, 0)`. Eski hatalar: `getAllManagersWithCommissionSettings` `SUM(ABS(...))` ile kesintiyi paid'e katıyordu (liste sayfası profilden fazla "paid" gösterdi); `getAllInstructorBalances` müdür tarafında sadece `payment` sayıp kesintiyi tamamen yok sayıyordu (Instructors sayfası borcu şişirdi); `getManagerPayrollEarnings` da kesintisizdi. Liste artık `totalEarnedCommission`/`deductedCommission`, balances `manager.totalDeducted` alanlarını da döner; balances'ta müdür bakiyesi 0'a clamp'lenir (fazla ödeme eğitmen payroll'una yedirilmez).
- **Mirror riski:** eğitmen kazancı (`getInstructorEarningsData`) ile müdür source_amount (cascade) aynı indirim/paket/grup matematiğini paylaşmalı; ayrıştıklarında aynı booking iki sayfada farklı görünür (K1/L5/H5/H6 düzeltmeleri bunu hizalar).
