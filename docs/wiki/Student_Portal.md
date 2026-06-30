# Student Portal

> **Özet:** Müşteri/öğrenci self-service portalı — `/student/*` altında dashboard, takvim, ödemeler, profil, destek, aile yönetimi ve arkadaşlar. Tek bir `featureFlags.studentPortal` bayrağı tüm portalı açar/kapar; portal cüzdanı **filtreli** okur (`booking_charge_adjustment`'ı ana `booking_charge`'a katlar, legacy/açılış bakiyesini gizler) ve grup rezervasyonu katılımcılarını kapsar. Erişen roller: `student`, `trusted_customer`, `outsider`.
>
> **Kütüphaneler:** React 18, React Router 7 (nested `Outlet`), TanStack React Query (`useStudentDashboard`), Ant Design + Tailwind + Headless UI + Heroicons, Express 5 (ESM), PostgreSQL, cache middleware (per-student TTL).
>
> **Bağlantılar:** [[Authentication_Authorization]], [[Bookings_Calendar]], [[Finances_Wallet]], [[Memberships]], [[Customers_CRM]], [[Products_Shop_Inventory]], [[Accommodation_Rentals]], [[Notifications_System]], [[Frontend_Shell]], [[Backend_Server]], [[Index]]

---

## Sorumluluk

Bu modül, müşterinin **kendi** verisini gördüğü self-service yüzeyidir: yaklaşan/geçmiş dersler, paket saatleri, cüzdan/ödeme geçmişi, profil + güvenlik bilgileri, destek talepleri, aile (grup co-booker) yönetimi ve sosyal arkadaş bağlantıları. Personelin yönettiği müşteri yönü ise [[Customers_CRM]]'dir.

Kritik tasarım kararı: portal, admin'in gördüğü ham cüzdandan **farklı**, müşteriye-temiz bir görünüm sunar — iade-edilmiş-pakete dersler net 0 gösterilir (çift satır değil), legacy/imported borç ve açılış bakiyesi müşterinin gözünden gizlenir. Erişim üç role açıktır: `student`, `trusted_customer` (grup rezervasyonu co-booker'ları) ve `outsider` (public/guest).

## Backend

**Mount (`backend/server.js`):**
- `app.use('/api/student', authenticateJWT, studentPortalRouter)` — portal (satır 490).
- `app.use('/api/students', authenticateJWT, familyRouter)` — aile yönetimi, **studentsRouter'dan ÖNCE** (satır 486; bkz. [[Customers_CRM]]).
- `studentsRouter` (`backend/routes/students.js`) artık `/api/users/students`'a yönlendirilmiş **deprecated** admin/manager listesi.

**Rota guard'ı:** `requireStudent = authorizeRoles(['student','trusted_customer','outsider'])` (bkz. [[Authentication_Authorization]]).

**Uç noktalar — `backend/routes/studentPortal.js`** (per-student cache `api:student:{userId}:*`; bakiye taze kalsın diye dashboard/invoices TTL'i kısa 10–15s):

| Method | Path | İşlev |
|---|---|---|
| GET | `/dashboard` | `getStudentOverview()` — hepsi-bir-arada anlık görüntü (10s TTL) |
| GET | `/schedule` | `getStudentSchedule()` — tarih filtreli rezervasyonlar (60s) |
| PATCH | `/bookings/:bookingId` | `updateStudentBooking()` — iptal / yeniden planla |
| GET | `/courses`, `/resources/:courseId` | kayıtlı servisler + ilerleme; ders kaynakları (entitlement kontrollü) |
| GET | `/invoices` | `getStudentInvoices()` — sayfalı payment_intents (15s) |
| POST | `/support/request` | `createStudentSupportRequest()` |
| GET/PUT | `/profile` | profil oku/güncelle |
| GET/PUT | `/preferences` | bildirim + dil/para tercihleri |
| GET/PUT | `/booking-preferences`, `/safety` | rezervasyon tercihleri / acil-durum + tıbbi güvenlik bilgisi |
| GET | `/recommendations` | 3 katmanlı öneri (instructor → curated → computed) |

**Servis — `backend/services/studentPortalService.js`** (~2600 satır):

- **`getStudentOverview(studentId, options)`** — portalın kalbi. UUID doğrular, bulunamazsa/DB düşerse hazır **fallback** yapı döner, ~16 tabloyu paralel sorgular ve tablo varlığını (feature-gate) kontrol eder.
  - **Cüzdan bakiyesi (otoriter):** Önce `wallet_balances` tablosu; çoklu satır/uyumsuzlukta transaction-türetilmiş bakiyeye düşer.
  - **Booking charge adjustment "fold" (kritik):** Her `booking_charge_adjustment` satırı kendi ana `booking_charge` satırına katlanır — iade-edilmiş-pakete ders hem charge hem refund olarak ayrı görünmez, net 0 olur. Orphan adjustment yalnızca ana charge varsa düşürülür.
  - **Filtreleme:** `cancelled` statüsü ve "ghost" pending kayıtlar (`available_delta=0` + `credit_card` pre-auth) hariç tutulur; ID'ye göre dedupe edilir. Görüntü için 50 satır, ama başlık rakamları (`totalPaid/totalCharges/totalRefunds`) tüm ledger üzerinden hesaplanır.
- **`getStudentSchedule(studentId, {startDate,endDate,limit})`** — instruktör/servis/hava ile rezervasyonlar; `booking_participants` varsa grup üyeleri de dahil (her katılımcının `payment_status`/`payment_amount`/`customer_package_id`'i ile).
- **`updateStudentBooking(...)`** — `action:'cancel'`: terminal/geçmiş ders değilse paket saatlerini **katılımcı-farkında** iade eder (`booking_participants.payment_status='package'`), cüzdana `booking_cancelled_refund` yazar, `instructor_earnings` + `manager_commissions` temizler (bkz. [[Instructors_Payroll]]). `action:'reschedule'`: slot çakışması kontrolü + bildirim ([[Notifications_System]]). Tümü ACID, hata → ROLLBACK + cache invalidasyonu.
- **`getStudentRecommendations(...)`** — 3 katman: (1) instructor-curated `student_recommendations` (pending→viewed işaretler), (2) curated `recommended_products`, (3) computed (öğrenci seviyesini servislere eşler).

## Frontend

**Rota tanımı (`src/routes/AppRoutes.jsx`, ~satır 489):** `ProtectedRoute allowedRoles={[STUDENT, TRUSTED_CUSTOMER, OUTSIDER]}` içinde, `featureFlags.studentPortal` doğruysa `/student` → `StudentLayout` (nested `Outlet`):

| URL | Bileşen |
|---|---|
| `/student` | → `/student/dashboard`'a `Navigate` |
| `/student/dashboard` | `StudentDashboard` |
| `/student/schedule` | `StudentSchedule` |
| `/student/payments` | `StudentPayments` |
| `/student/support` | `StudentSupport` |
| `/student/profile` | `StudentProfile` |
| `/student/family` | `FamilyManagementPage` |
| `/student/friends` | `StudentFriendsPage` |
| `/student/group-bookings[...]` | grup rezervasyon sayfaları (bkz. [[Bookings_Calendar]]) |
| `/academy/book-service`, `/shop/my-orders` | `StudentBookServicePage`, `MyOrdersPage` (layout dışı) |

Bayrak kapalıysa `/student/*` → `StudentPortalUnavailable`. Bayrak `src/shared/config/featureFlags.js`'te `coerceBoolean(import.meta.env.VITE_STUDENT_PORTAL, true)` ile tanımlı.

**Sayfalar/bileşenler (`src/features/students/`):**
- **`components/StudentLayout.jsx`** — `/student/*` sarmalayıcısı; `useStudentDashboard` ile veri çeker, `Outlet` context'i ile overview + `walletSummary` + hero-nav bayrağını alt sayfalara geçirir; yalnızca `/student/dashboard`'da welcome hero gösterir; `StudentBookingWizard` modalını route state/global event ile açar.
- **`pages/StudentDashboard.jsx`** — hero (sonraki ders, `NextLessonHero`), `StatsStrip`, `PackageCards` (kullanım % + son kullanma uyarısı), `RatingPrompt` (+`RateInstructorModal`), instructor önerileri ve `dashboard/QuickLinks`.
- **`pages/StudentSchedule.jsx`** — yaklaşan/geçmiş dersler; tarih filtresi, yeniden-planla (slot doğrulamalı) + iptal; grup rezervasyon sekmesi.
- **`pages/StudentPayments.jsx`** — ödeme geçmişi + cüzdan bakiyesi + depozito widget'ı. Toplamlar **tip-farkında**: yalnızca `completed/succeeded/paid` sayılır; `adjustment`/`reversal`/`legacy_opening_balance` hariç; iadeler ödemelerden netlenir (0'ın altına inmez). Bkz. [[Finances_Wallet]].
- **`pages/StudentProfile.jsx`** — profil + acil durum + iletişim tercihleri; dersler/rezervasyonlar/kiralamalar/işlemler sekmeleri. (Görüntü bakiyesini cüzdan toplamıyla override eder → müşteri €0 görür, legacy borç gizli.)
- **`pages/StudentSupport.jsx`** — destek talebi oluştur + geçmiş (`SupportChannelPicker`, `TicketHistoryList`, `TicketDetailDrawer`).
- **`pages/FamilyManagementPage.jsx`** — aile/grup co-booker yönetimi (`trusted_customer` rolü, `booking_participants`; bkz. [[Customers_CRM]]).
- **`pages/StudentFriendsPage.jsx`** — diğer öğrencilerle arkadaş bağlantısı (`/api/relationships`, bkz. [[Customers_CRM]]).
- **`pages/MyOrdersPage.jsx`** (`/shop/my-orders`) — shop sipariş geçmişi + durum zaman çizelgesi + müşteri↔personel mesajlaşma (bkz. [[Products_Shop_Inventory]]).
- **`pages/StudentBookServicePage.jsx` / `StudentBookEquipmentPage.jsx`** — ders/ekipman rezervasyonuna giriş (`/academy`, `/rental`'a köprü).

**API istemcisi — `src/features/students/services/studentPortalApi.js`** (`BASE_PATH='/student'`): `fetchDashboard`, `fetchSchedule(params)`, `updateBooking(id,payload)`, `fetchCourses`, `fetchCourseResources(courseId)`, `fetchInvoices(params)`, `submitSupportRequest(payload)`, `fetchProfile`, `updateProfile`, `fetchPreferences`, `updatePreferences`, `fetchRecommendations`. Hata `mapError` ile `response.data.error|message`'a indirgenir.

**Yardımcılar (`src/features/students/utils/`):**
- **`getWalletBalance.js`** — yanıt nesnesinden (4 derinliğe kadar) bakiyeyi özyinelemeli çıkarır; öncelikli anahtarlar `wallet_balance/walletBalance/balance/available...`, iç kaplar `wallet/account/student/profile/finance...`; bulamazsa `null`.
- **`getPreferredCurrency.js`** — para kodu+sembolünü çıkarır; sembol haritası (TRY ₺, EUR €, USD $, GBP £...); varsayılan TRY (₺); ISO 3-harf kodu veya bilinen sembolü doğrular.
- **`components/dashboard/QuickLinks.jsx`** — 5 hızlı-link kartı: `/academy`, `/rental`, `/shop` (yalnızca `featureFlags.publicShopEnabled` ise filtre geçer), `/student/schedule`, `/rescue`.

## Veri Modeli

Portal **kendi tablosuna sahip değildir** — domain tablolarını okur ve birkaç tercih/güvenlik tablosuna yazar:
- **Okuma:** `users`, `bookings` + `booking_participants`, `services`, `customer_packages`, `wallet_transactions` + `wallet_balances`, `payment_intents`, `student_progress`, `course_resources`, `rentals`, `accommodation_bookings`, `shop_orders`, `instructor_ratings`, `instructor_student_notes`, `student_recommendations` / `recommended_products`.
- **Yazma/upsert:** `student_support_requests`, `student_preferences` (rezervasyon tercihleri), `student_safety_info` (acil durum + tıbbi + yüzme), `notification_settings` (veya `users.communication_preferences` JSON), `users` (profil alanları).
- **İptalde temizlik:** `instructor_earnings` (payroll yoksa sil), `manager_commissions` (`status='cancelled'`).

## Akış / İş Mantığı

1. **Dashboard yükleme:** `StudentLayout` → `useStudentDashboard` → `GET /student/dashboard` → `getStudentOverview` 16 tabloyu paralel toplar → fold'lanmış cüzdan + metrikler + paketler + son işlemler döner.
2. **Ders iptali:** Müşteri `PATCH /student/bookings/:id` `{action:'cancel'}` → servis paket saatini katılımcı-farkında iade eder, cüzdana refund yazar, payroll/komisyon temizler, not ekler.
3. **Cüzdan görünümü:** Frontend `getWalletBalance` ile bakiyeyi çıkarır; `StudentPayments` toplamları tip-farkında hesaplar; adjustment/legacy satırlar hariç.
4. **Bayrak kapalı:** Tüm `/student/*` → `StudentPortalUnavailable`; staff yüzeyleri etkilenmez.

## Dikkat / Tuzaklar

- **Cüzdan fold zorunlu:** Portal `booking_charge_adjustment`'ı ana `booking_charge`'a katlamazsa, iade-edilmiş-pakete ders çift görünür (− charge + iade) ve müşteri yanlış borç sanır. Admin `walletService.fetchTransactions` zaten fold yapar; portalın kendi fold'u senkron kalmalı.
- **Legacy/açılış gizleme müşteriye-özel:** `legacy_opening_balance` ve imported borç müşteri görünümünde gizlenir ama **istatistik dışıdır**; staff drawer'ı (`GET /finances/accounts/:id`) bunu yüzeye çıkarır — iki yüzey kasıtlı olarak farklı (bkz. [[Customers_CRM]], [[Finances_Wallet]]).
- **`requireStudent` üç rol:** `trusted_customer` ve `outsider` da portala girer; yalnızca `student` varsaymak co-booker'ları ve guest'leri kilitler.
- **Tablo feature-gate:** `getStudentOverview` sorgulamadan önce tablo varlığını kontrol eder — eksik bir tabloda (örn. eski DB) çökmek yerine zarifçe atlar; yeni bir tabloya bağımlılık eklerken bu kontrolü de eklemek gerekir.
- **Cache TTL kısa:** Dashboard/invoices 10–15s TTL — staff bir mutasyon yaptığında müşteri bakiyesi en fazla bu kadar bayat kalır; mutasyon uç noktaları `api:student:{userId}:*`'i busts etmeli.
- **Bayrak ortam değişkeni:** `VITE_STUDENT_PORTAL` build-time'dır (Vite `import.meta.env`); değişiklik yeni build gerektirir, runtime toggle değildir.
- **Mount sırası:** `familyRouter` `/api/students`'ta studentsRouter'dan önce gelmeli yoksa aile rotaları gölgelenir.
