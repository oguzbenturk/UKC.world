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
- `backend/services/instructorPayoutService.js` — **eğitmen kazanç sayfası + ödeme talepleri** (2026-10-07, spec `docs/specs/instructor-earnings-payouts.md`). `loadInstructorLedger()` = `getInstructorEarningsData` (dersler) + `instructor_payment` payment/deduction satırları (TRY vb. `currency_settings` ile EUR'ya çevrilir), hepsi Decimal.js. `getEarningsSummary` (dönem `week|month|year|all`, NET `earned`, `byLessonType`, 12 hafta/6 ay serisi, `balances`, eşik, son ödeme, bekleyen talep), `getEarningsActivity` (FIFO paid/pending + `type`/`status`/`search`/sayfalama), `getEarningsStatementCsv`, talep CRUD'u (`createPayoutRequest`/`cancelPayoutRequest`/`listPayoutRequests`/`countPayoutRequests`/`payPayoutRequest`/`rejectPayoutRequest`) + bildirim/socket yayını.
- `backend/services/staffPaymentService.js` — eğitmen VE müdür ödemeleri için ortak CRUD (`createStaffPayment`/`updateStaffPayment`/`deleteStaffPayment`, `STAFF_KIND`). **`recordInstructorPayment()`** (2026-10-07) eğitmen ödemesi kaydetmenin TEK yolu: hem `POST /finances/instructor-payments` hem talep "Öde" aksiyonu bunu çağırır; opsiyonel `client` (dış transaction) ve `extraMetadata` (`payoutRequestId`, `externalReference`) alır — verilmezse satır birebir eskisi gibi. Kind farkları `STAFF_KIND_CONFIG`'te. Düzenleme = iptal + yeniden kayıt; silme = sadece iptal + `resyncWalletAfterCancel` (eski "reversal satırı ekle" yaklaşımı çift-geri-alma yapıyordu, bkz. [[Finances_Wallet]]).

### Rotalar
- `backend/routes/instructor.js` → `/api/instructors/me/*` — eğitmenin kendi dashboard'u, öğrencileri, notları, tercihleri, çalışma saatleri.
- `backend/routes/instructors.js` → `/api/instructors` — PUBLIC `GET /` (misafir göz atma, `instructor`+`manager` rolleri, `team_member_settings` görünürlük), `GET /:id`, `/:id/services`, `/:id/lessons` (instructor kendi verisi dışına 403).
- `backend/routes/instructorAvailability.js` → `/api/instructors/me/availability` ve onaylama; `instructorsRouter`'dan ÖNCE mount edilir (route çakışması).
- `backend/routes/instructorCommissions.js` → `/api/instructor-commissions` — varsayılan komisyon, servis-bazlı komisyon ve kategori-bazlı oran (`instructor_category_rates`) CRUD. Yalnızca `admin`/`manager`.
- `backend/routes/instructorSkills.js` → `/api/instructors/:id/skills` + `/api/instructors/qualified` — beceri seti ve servise uygun eğitmen filtreleme.
- `backend/routes/managerCommissions.js` → `/api/manager/commissions` — müdür kendi dashboard'u (`/dashboard`, `/history`, `/summary`, `/membership-breakdown`, `/upcoming`) + admin'in tüm müdür ayarları/ödemeleri.
- `backend/routes/instructorEarnings.js` → `/api/instructors/me/` altına (`instructor.js` içinden `router.use('/me', …)`): `GET earnings-summary`, `GET earnings-activity`, `GET earnings-statement` (yalnız CSV; `format=pdf` → 400 `FORMAT_NOT_SUPPORTED`), `GET|POST payout-requests`, `DELETE payout-requests/:id`. Rol `instructor`/`manager`, her şey `req.user.id`'ye kilitli; POST/DELETE kullanıcı-başı rate limit (20/15 dk).
- `backend/routes/payoutRequests.js` → `/api/finances/payout-requests` (server.js'te `financesRouter`'dan ÖNCE mount): `GET /` (bekleyen önce), `GET /count`, `POST /:id/pay`, `POST /:id/reject` — yalnız `admin`/`manager`, express-validator.
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
- `instructor_payout_requests` (**migration 292**) — `instructor_id`, `amount` (>0), `currency` (EUR), `preferred_method`, `note`, `status` (`pending`/`paid`/`rejected`/`cancelled`), `admin_note` (red gerekçesi / ödeme referansı), `decided_by`/`decided_at`, `payment_id` (→ ödemede yaratılan `wallet_transactions` satırı). Kısmi UNIQUE index: eğitmen başına tek `pending`. Aynı migration `notification_type_enum`'a `payout_request_created/paid/rejected` ekler.
- **Migration 280** (`280_add_beach_fee_to_member_offerings.sql`) — `member_offerings.beach_fee_amount` + `member_purchases.beach_fee_amount` (snapshot). Müdür üyelik komisyonu yalnızca bu plaj porsiyonu üzerinden ([[Memberships]]).

## Akış / İş Mantığı

### Ders değeri türetme (`backend/utils/instructorEarnings.js`)
- `deriveLessonAmount()` — paket dersleri için fiyatı paket-saat-başı orana göre böler; düz/nakit dersler için `base_amount` (indirim sonrası).
- `partialLessonValue()` — KISMİ booking (bir kısmı paketten, kalanı nakit). Eski hata nakdi tam-süre paket değerinin ÜSTÜNE ekleyip saati çift sayıyordu; düzeltme nakdi paket-saat-başı oranla fiyatlar, sadece paketten çekilen saatleri + nakdi sayar.
- `deriveTotalEarnings()` — `fixed`/`fixed_per_hour` → `oran × süre`; `fixed_per_lesson` → düz tutar; yüzde → `tutar × oran / 100`. Oran ≤ 0 ise kazanç 0.
- **`done`/`checked_out` dahil** (`COMPLETED_BOOKING_STATUSES`): sadece `completed` sayılırsa dashboard/payroll bu durumları sessizce düşürürdü.

### Kazanç sayfası + ödeme talepleri (2026-10-07)
- **Bakiye:** `paidOutGross` = pozitif payment satırları, `deductionsTotal` = |negatif deduction satırları|, `paidOutNet = gross − deductions`, `available = max(totalEarned − paidOutNet, 0)` — dashboard'un `pending`'i ile birebir aynı sayı.
- **Dönem rakamları NET:** `earned`/`previousEarned`/haftalık-aylık seriler = ders kazancı − o tarihlerdeki kesintiler; `byLessonType[].amount` BRÜT, `deductions` pozitif; değişmez kural `Σ byLessonType.amount − deductions = earned` (yuvarlanmış parçalardan hesaplanır). `byLessonType.key` = `lesson_category` slug'ı (`-` → `_`: `semi_private` …).
- **FIFO paid/pending:** net ödemeler en ESKİ dersleri önce kapatır; tamamen kapanan ders `paid`, ilk tam kapanmayan ve sonrası `pending` (`deriveFifoStatuses`).
- **Talep kuralları:** tek bekleyen (409 `PENDING_EXISTS`), `available < eşik` → 400 `BELOW_THRESHOLD`, `amount < eşik` → `AMOUNT_BELOW_THRESHOLD`, `amount > available` → `AMOUNT_ABOVE_AVAILABLE`. Eşik `INSTRUCTOR_PAYOUT_THRESHOLD` (vars. 200, çağrı anında okunur).
- **Öde:** TEK transaction'da `recordInstructorPayment({ client })` + talep `paid`/`payment_id`; sonra dashboard cache düşürülür, eğitmene bildirim. **Reddet:** gerekçe zorunlu. Tüm geçişler `payout_request:updated` socket olayını `user:<id>` + `role:admin` + `role:manager` odalarına yayar. Bildirimler: [[Notifications_System]].

### Müdür komisyon kuralları
- Kayıt anı: ders/kiralama tamamlanınca. `getDefaultManager()` ile ilk aktif müdür kullanılır (tek-müdür varsayımı).
- Üyelik komisyonu: `membershipCommissionableBase({offeringPrice, beachFeeAmount, discount})` — plaj porsiyonu üzerinden, indirim plaj dilimine PRO-RATE edilir. `beachFeeAmount == null` ⇒ legacy ⇒ tam fiyat. Saf depo (storage) satışında plaj bazı 0 → komisyon satırı yok.
- Kiralama: önce `total_price`, paket kiralamada `derivePackageRentalAmount()`; aktif manuel indirim her zaman düşülür.
- İndirim/fiyat değişimi sonrası `recomputeManagerCommissionForEntity` / `recomputeManagerCommissionsForPackage` `payout_id IS NULL` satırları yeniden hesaplar (ödenmiş = değiştirilemez tarih). Tarih değişiminde `updateManagerCommissionSourceDate` `period_month`/`source_date`'i taşır.

### Frontend
- `src/features/instructor/pages/InstructorDashboard.jsx` (+ `MyStudents`, `StudentDetail`) — eğitmenin kendi görünümü; `useInstructorDashboard` hook'u `/me/dashboard`'ı çeker. Kazanç trendi, özet metrikler, yaklaşan dersler, öğrenci check-in.
- `src/features/instructors/pages/` — `Instructors.jsx` (admin liste), `InstructorFormPage.jsx` (komisyon/beceri/oran düzenleme), `BulkCommissions.jsx`.
- **Ödeme talepleri (admin/müdür):** `src/features/finances/pages/PayoutRequestsAdmin.jsx` (`/finance/payout-requests`; bekleyenler önce, sonra geçmiş + filtre), `components/payoutRequests/{PayoutRequestsTable,PayoutActionModals,InstructorPayoutRequestsPanel}.jsx` (Öde modalı: dolu tutar/yöntem/referans/not; Reddet modalı: gerekçe zorunlu), `hooks/usePayoutRequests.js` (React Query + socket invalidation). Nav: admin "Finance" ve müdür "My Finances" altında, `badgeKey: 'payoutRequests'` → Sidebar'da bekleyen sayısı rozeti. `EnhancedInstructorDetailModal` "Payments" sekmesi üstünde eğitmenin bekleyen talebi. Eğitmen tarafı sayfası (`src/features/instructor/earnings/`) ayrı ajan tarafından yazıldı.
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
- **Kesinti (deduction) matematiği TEK kural (2026-07-03):** `manager_payment` kesinti satırları NEGATİF tutarla saklanır. Her yüzeyde: `paid` = yalnızca pozitif payment satırları; `pending = max(earned − paid − deducted, 0)`. Eski hatalar: `getAllManagersWithCommissionSettings` `SUM(ABS(...))` ile kesintiyi paid'e katıyordu (liste sayfası profilden fazla "paid" gösterdi); `getAllInstructorBalances` müdür tarafında sadece `payment` sayıp kesintiyi tamamen yok sayıyordu (Instructors sayfası borcu şişirdi); `getManagerPayrollEarnings` da kesintisizdi. Liste artık `totalEarnedCommission`/`deductedCommission`, balances `manager.totalDeducted` alanlarını da döner. **2026-07-22 güncellemesi:** balances'taki müdür-bakiyesi 0-clamp'i artık YALNIZCA tooltip'teki bucket-bazlı "owed" rakamı için geçerli; headline bakiye aşağıdaki tek-defter kuralına göre CLAMPSIZ birleşik hesaplanır.
- **TEK DEFTER kuralı — manager+instructor personel (2026-07-22, owner kararı):** müdür rolündeki personel TEK alacaklıdır. `/instructors` listesi (`getAllInstructorBalances`) headline bakiyesi = `(eğitmen kazancı + müdür komisyonu) − (HER İKİ kanaldaki tüm payment/deduction satırları)`, clampsiz — profil panelindeki `ManagerPayments` "Balance Owed" ile birebir aynı sayı (Oğuzhan vakası: liste +719 vs profil −200 sapması buradan çıktı). Liste Pay butonu müdür-rolü personel için `createManagerPayment` (manager kanalı, admin-only) çağırır; saf eğitmenlerde `/finances/instructor-payments` değişmedi. `ManagerPayments` artık `payrollHistory`'deki legacy instructor-kanal satırlarını da (channel tag'i ile) listeler/toplar ve edit/delete'i kanala göre yönlendirir — hiçbir kayıtlı ödeme görünmez kalamaz. Bakiye kolonu işaret kuralı profille eşitlendi: pozitif = borçluyuz (amber), negatif = fazla ödenmiş (eksiyle, slate). Kanal-mükerrer iki satır (465+737) `repair-staff-payout-wallet-leak.mjs` ile iptal edildi ([[Finances_Wallet]]'taki availableDelta sızıntı onarımıyla aynı script).
- **Ödeme talebi kanalı:** talep "Öde"si her zaman eğitmen kanalına (`instructor_payment`) yazar; müdür-rolü personelin talebi de buraya düşer (TEK DEFTER kuralındaki gibi manager kanalına yönlendirme YOK) — müdür-eğitmen için dikkat.
- **Para birimi:** talep ekranları TRY/USD payout satırlarını `currency_settings` ile EUR'ya çevirir; eski dashboard/`getAllInstructorBalances` ham tutarı toplar (bugün tüm satırlar EUR olduğu için fark yok).
- **Mirror riski:** eğitmen kazancı (`getInstructorEarningsData`) ile müdür source_amount (cascade) aynı indirim/paket/grup matematiğini paylaşmalı; ayrıştıklarında aynı booking iki sayfada farklı görünür (K1/L5/H5/H6 düzeltmeleri bunu hizalar).
