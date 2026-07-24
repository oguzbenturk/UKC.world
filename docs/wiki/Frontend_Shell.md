# Frontend Shell (React Uygulama Kabuğu)

> **Özet:** Plannivo'nun React 18 + Vite tabanlı uygulama kabuğu; tüm provider'ları (Auth, Data, Currency, Cart, CustomerDrawer vb.) iç içe sarmalayan kök ağaç, rol-bazlı landing yönlendirmesi ile `lazyWithRetry` ile kod bölünmüş rotalar, ve rol/izin filtreli sidebar navigasyonundan oluşur. Kabuk; kimlik doğrulama durumuna göre layout'u (sidebar+navbar vs. çıplak public form) değiştirir ve oturum yenileme/CSRF/refresh mantığını merkezî `apiClient` üzerinden taşır.
>
> **Kütüphaneler:** React 18, Vite, React Router 7 (`react-router-dom`), TanStack React Query, Ant Design, TailwindCSS, MUI, Headless UI, axios, i18next (`react-i18next` + HttpBackend + LanguageDetector), Heroicons.
>
> **Bağlantılar:** [[Authentication_Authorization]], [[Backend_Server]], [[Dashboard_Metrics_Admin]], [[Bookings_Calendar]], [[Customers_CRM]], [[Student_Portal]], [[Outsider_Marketing]], [[Architecture_Overview]], [[Tech_Stack]], [[Notifications_System]], [[Payments_Currency]], [[Shared_Backend_Utilities]]

---

## Sorumluluk

Frontend Shell, kullanıcı hangi rolde olursa olsun uygulamanın "iskeletini" kurar:

- **Provider ağacının** kurulması ve doğru sıralanması (context bağımlılıkları).
- **Routing**: hangi URL'in hangi (lazy) sayfayı render edeceği, hangi rotanın public/authenticated olduğu, rol/izin guard'ları.
- **Rol-bazlı landing**: giriş yapan kullanıcıyı rolüne göre doğru ana sayfaya yönlendirme.
- **Layout seçimi**: sidebar+navbar'lı uygulama görünümü mü, yoksa çıplak public form görünümü mü.
- **Oturum altyapısı**: token yönetimi, proaktif yenileme, CSRF başlığı, 401/403 reaktif davranışı (bkz. [[Authentication_Authorization]]).
- **Çapraz kesen UI**: global progress bar, FAB, bildirim köprüsü, cüzdan modalı, sohbet widget'ı, consent/cookie banner'ları, küresel müşteri çekmecesi.

## Yapı

### Giriş noktası — `src/main.jsx`
- `ReactDOM.createRoot` ile `#root`'a mount eder. `StrictMode` **kapalı** (refresh sorunlarını ayıklamak için).
- Provider sırası (dıştan içe): `ErrorBoundary` → `AppLocaleProvider` (Antd theme token'ları, brand mavisi `#3B82F6`) → `AntdApp` → `QueryClientProvider` → `Suspense (BootSplash)` → `App`.
- **React Query** `queryClient` burada kurulur: `refetchOnWindowFocus:false`, `retry:1`, `staleTime:5dk`, `gcTime:30dk`.
- Mount **i18n hazır olana kadar bekler** (`i18nReady`), ama 5 sn'lik `I18N_FALLBACK_TIMEOUT_MS` ile sınırlıdır — çeviri yüklenmese bile uygulama açılır.
- Dev'de service worker kaydını engeller; `errorRecoveryManager` ve `mobileKeyboardScroll` global yardımcılarını import eder.

### Kök bileşen — `src/App.jsx`
`App()` tüm context provider'larını iç içe sarar (sıra önemli, alttakiler üsttekilere bağımlı):

```
ErrorBoundary > AntdApp > Router >
  AuthProvider > AuthModalProvider > CurrencyProvider > CartProvider >
  ShopFiltersProvider > DataProvider > ToastProvider > ForecastProvider >
  CustomerDrawerProvider > AppLayoutWithAuth
```

- `CustomerDrawerProvider`, Auth/Currency/Data'nın **içinde** olmak zorunda (küresel müşteri çekmecesi bu context'leri okur).
- `AppLayoutWithAuth` (`useAuth` kullanabilmek için `App`'ten ayrılmış) gerçek layout kararını verir:
  - **Public form rotaları** (`/f/`, `/quick/`, `/group-invitation/`, `/`) → sidebar/navbar **olmadan** çıplak `<main>`.
  - **Authenticated + geçerli rol** → `Navbar` + `Sidebar` + `<main>` (key=`location.pathname` ile sayfa geçiş animasyonu).
  - **Authenticated ama geçersiz rol** → sınırlı görünüm (sadece logout butonu).
  - `loading` sırasında spinner; 15 sn'lik `forceShowApp` emniyet zaman aşımı sonsuz yüklemeyi engeller.
  - Authenticated + `requiresConsent` → sadece `UserConsentModal` (KVKK/şartlar onayı, bkz. [[Forms_Waivers_Compliance]]).
- Uygulama görünümünde ek küresel parçalar: `GlobalProgressBar`, `NotificationRealtimeBridge` ([[Notifications_System]]), `WalletModalManager` ([[Finances_Wallet]]), `GlobalFAB`, `StudentQuickActions`, `FloatingChatWidget`/`WhatsAppChatModal` ([[Chat_Community_Events]]), `GlobalPackageDetailsModal`.
- `realTimeService` (socket.io) yalnızca `isAuthenticated && user` iken bağlanır; rol/kullanıcı değişiminde yeniden authenticate eder.

### Routing — `src/routes/AppRoutes.jsx`
- **Code-splitting**: kritik auth sayfaları (Login, Register, ResetPassword, VerifyEmail) **eager**; geri kalan ~120 sayfa `lazyWithRetry()` ile lazy.
- `lazyWithRetry(factory)`: chunk yüklemesi başarısız olursa (deploy sonrası hash değişimi) **1.5 sn sonra bir kez retry** eder, yine olmazsa "Reload" butonlu fallback gösterir. Bu, eski "asılı kalma" sorununun çözümüdür.
- **`ProtectedRoute`** (modül seviyesinde stabil bileşen — `AppRoutes` içine taşınırsa her sidebar toggle'ında remount olup dashboard'u yeniden yüklerdi):
  - Props: `allowedRoles`, `staffOnly`, `requiredPermissions`.
  - Built-in roller `hasPermission` ile; **custom roller** ise JSONB `user.permissions` haritasındaki flag'lerle (`system:admin`, `finances:read`, `bookings:read` vb.) değerlendirilir.
  - Erişim yoksa `<Navigate to="/login" replace />`.
- **`resolveLandingRoute()`** rol-bazlı ana sayfa:
  - `outsider` → `/guest`
  - `student` / `trusted_customer` → `/student/dashboard` (flag açıksa) yoksa `/student`
  - `instructor` → `/instructor/dashboard`
  - `manager` → `/manager/dashboard`
  - `admin` / `developer` / **tüm custom roller** → `/dashboard` (bkz. [[Dashboard_Metrics_Admin]])
- **`/dashboard` özellikle `staffOnly` ile korunur** (sabit rol listesiyle değil): her custom rolün landing'i `/dashboard` olduğundan, rol-listesi guard'ı receptionist/front_desk/izinleri henüz yüklenmemiş kullanıcıları `/dashboard → /login → /dashboard` sonsuz döngüsüne (`history.replaceState > 100x/10sn`) sokuyordu.
- Catch-all `*` → authenticated ise landing'e, değilse `/`'a yönlendirir.

## Routing (rota grupları)

| Grup | Guard | Örnek rotalar |
|------|-------|---------------|
| Public auth | yok | `/login`, `/register`, `/reset-password`, `/verify-email` |
| Public callback | yok | `/payment/callback` ([[Payments_Currency]]), `/spotify/callback` |
| Public landing/marketing | yok | `/`, `/guest`, `/academy/*`, `/rental/*`, `/stay/*`, `/experience/*`, `/care`, `/shop` (flag), `/wind-report` ([[Outsider_Marketing]], [[Weather_WindReport]]) |
| Public form/legal | yok | `/f/:linkCode`, `/quick/:linkCode`, `/teklif/:code` ([[Proposals_Quotes]]), `/kvkk`, `/gizlilik`, `/terms` |
| Authenticated (rolsüz) | `allowedRoles=[]` | `/chat`, `/notifications`, `/accommodation`, `/repairs`, `/settings`, `/profile` |
| Staff dashboard | `staffOnly` | `/dashboard` → `DashboardRouter` |
| Student portal | `[student, trusted_customer, outsider]` | `/student/*` ([[Student_Portal]]) |
| Müşteri yönetimi | `[instructor, manager, admin]` + perms | `/customers/*` ([[Customers_CRM]]) |
| Operasyon | `[instructor, manager, admin]` + perms | `/bookings/*`, `/calendars/*`, `/rentals`, `/equipment`, `/inventory`, `/services/*` ([[Bookings_Calendar]], [[Lessons_Services_Packages]]) |
| Finans | `[instructor, manager, admin]` + `finances:read` | `/finance/*` ([[Finances_Wallet]], [[Instructors_Payroll]]) |
| Manager/Admin | rol listesi | `/manager/finance/*`, `/admin/warranty` ([[Warranty_Repairs]]), `/marketing`, `/forms`, `/proposals` |

- `shop` browsing rotaları `featureFlags.publicShopEnabled || isShopStaff(role)` ile gate'lenir; doğrudan ürün sayfası `/shop/product/:id` her zaman açık (öneri linkleri için).
- Pek çok eski rota `<Navigate ... replace />` ile yeni hedefe yönlendirilir (ör. `/admin/settings` → `/settings?tab=calendar`).

## Paylaşılan Servisler/Context'ler

### `apiClient` — `src/shared/services/apiClient.js`
- Tek bir axios instance (`/api` baseURL, `withCredentials:true`, 30 sn timeout). Prod'da relative URL (nginx proxy), dev'de `localhost:4000`'e normalize.
- **Request interceptor**: `Authorization: Bearer <token>` ekler; GET/HEAD/OPTIONS dışındaki isteklere cookie'den okunan `X-CSRF-Token` başlığını ekler.
- **Response interceptor**:
  - Backend `code` döndüyse i18n ile çeviri (`errors:` namespace) yapıp `error.response.data.error`'a yazar.
  - **401**: tek seferlik **single-flight** `refreshSession()` (cookie tabanlı `/auth/refresh-session`, `navigator.locks` ile sekmeler arası serileştirilmiş) dener; başarısızsa storage temizler + `sessionExpired` event'i + `/login`'e yönlendirir.
  - **403 CSRF** ve **503 LOGIN_DISABLED** → oturumu temizleyip login'e atar.
  - `skipRedirectPaths` (`/auth/me`, `/settings`, `/currencies/active` vb.) 401'de sessizce geçer.
- `onTokenChange`/`notifyTokenChange` ile AuthContext'in yenileme zamanlayıcısı senkron tutulur.

### `AuthProvider` — `src/shared/contexts/AuthContext.jsx`
- `user`, `isAuthenticated`, `isGuest`, `loading`, `consent`, `familyGroup` ve `login/logout/refreshUser/refreshToken/updateConsent` sağlar.
- Açılışta `getCurrentUser()` ile token doğrular; ağ hatasında localStorage'dan offline hidrasyon, sunucu reddinde tam temizlik.
- **Proaktif sessiz yenileme**: JWT `exp/iat`'a göre ömrün ~%60'ında yenileme zamanlar (generation guard ile yenileme fırtınasını engeller), focus/visibility/online olaylarında uyanışta yeniler.
- **`preservePermissions`**: refresh yanıtı `permissions` haritası taşımazsa eldekini korur (custom rollerin izinlerinin silinip gated sayfalardan atılmasını önler). Ayrıntı: [[Authentication_Authorization]].

### `SafeDataProvider` (`DataProvider`) — `src/shared/contexts/DataContext.jsx`
- Çekirdek veriyi (users, instructors, equipment, bookings, services, rentals, payments, dashboardSummary) **rol-bazlı** olarak paralel yükler (`apiCallManager` ile).
- **`canLoad*` flag'leri**: `canLoadFinanceData`, `canLoadRentalsData`, `canLoadAdminData` rol-adı bazlı (`hasPermission`); bu yüzden **custom rollere kördürler**. `canLoadEquipmentData` ise "müşteri olmayan herhangi bir staff" mantığıyla genişletilmiştir (Inventory sayfası custom roller için boş kalmasın diye).
- `actorDirectory` + `resolveActorLabel`: tx/log satırlarındaki actor ID'lerini isme çevirir.

### Diğer paylaşılan context/servisler
- **`CustomerDrawerProvider`** (`useCustomerDrawer()`): app-genelinde **tek** bir `EnhancedCustomerDetailModal` (lazy) render eder; `openCustomer(idOrObject)` ile finans tabloları dahil her ekran tam müşteri profilini açabilir ([[Customers_CRM]]).
- `CurrencyProvider`, `CartProvider`, `ShopFiltersProvider`, `ForecastProvider`, `AIChatProvider`, `ChatWidgetProvider`, `ToastProvider`, `AuthModalProvider`.
- `realTimeService` (socket.io-client) — gerçek zamanlı bildirim/sohbet köprüsü.

### Navigasyon — `src/shared/utils/navConfig.js`
- `getNavItemsForRole(role, userPermissions)` rol başına ayrı sidebar ağacı döndürür: **outsider/guest**, **student/trusted_customer**, **instructor**, **manager**, **admin/developer** ve **custom roller**.
- Custom roller için `allStaffNavItems`, `NAV_PERMISSIONS` haritası + `filterNavByPermissions` ile kullanıcının JSONB izinlerine göre filtrelenir (ör. `finance` öğesi `finances:read` ister).
- Her öğe `customStyle` (renkli dot + metin rengi), `subItems`, `isShopLink`/`isDirectLink` taşır. Sidebar (`src/shared/components/layout/Sidebar.jsx`) ve Navbar (`Navbar.jsx`) bunu tüketir; Sidebar `/shop` rotasında otomatik "shop mode"a geçer.

### i18n — `src/i18n/index.js`
- `i18next` + `react-i18next` + `LanguageDetector` + `HttpBackend`. Diller: `en, tr, fr, ru, es, de` (varsayılan `en`). Namespace'ler: `common, errors, public, outsider, student, instructor, manager, admin, proposal`. Çeviriler `/locales/{{lng}}/{{ns}}.json`'dan yüklenir, `localStorage` (`plannivo.lang`) ile cache'lenir. `useSuspense:true`.

### `vite.config.js`
- Alias: `@/` ve `src/` → `./src/`.
- Dev proxy: `/api` ve `/uploads` → `http://localhost:4000` (bkz. [[Backend_Server]]).
- `optimizeDeps.include` ağır bağımlılıkları ön-paketler (504 "Outdated Optimize Dep" hatalarını önlemek için; `force:true` **kullanılmaz**). Prod build: terser, `drop_console`, `cssCodeSplit`, `target:es2015`.
- `featureFlags` (`src/shared/config/featureFlags.js`): `studentPortal` (varsayılan açık), `publicShopEnabled` (varsayılan kapalı) — `VITE_*` env'lerinden okunur.

### Paylaşılan responsive tablo primitifleri — `src/components/ui/`
App-genelinde finans/liste tablolarının masaüstü-tablo ↔ mobil-kart geçişini yapan paylaşılan UI bileşenleri (Ant Design `Table` + `Card` üzerine):

- **`ResponsiveTable.jsx`** (V1): `columns`/`dataSource`/`mobileCardRenderer` alır; pencere genişliği `breakpoint`'ten (varsayılan 768px) küçükse veya kullanıcı manuel "Cards" seçtiyse kartlara, aksi halde Antd `Table`'a düşer. View-mode toggle'ı (`auto`/`table`/`cards`) üç ikon-butonla sağlar. `mobileCardRenderer` verilmezse ilk 4 sütunu key/value satırı olarak gösteren `defaultMobileCardRenderer` devreye girer.
- **`ResponsiveTableV2.jsx`**: V1'in yenisi. Seçilen view-mode'u `localStorage` (`storageKey`, varsayılan `responsiveTable.viewMode`) ile **oturumlar arası kalıcı** tutar; `DefaultMobileCard` kart bileşeni dokunmatik **swipe vs. tap ayrımı** yapar (10px `threshold` ile kaydırma sırasında yanlışlıkla satır açmayı engeller); masaüstü tabloda **varsayılan satır-tık kapalıdır** (detay açmak için açık aksiyon butonu beklenir). Ayrıca `@/shared/components/tables/UnifiedTable` ile sarmalayıp view-toggle'ı tablo başlığına taşıyan `UnifiedResponsiveTable` wrapper'ını ve serbest kullanılabilen `ViewModeToggle`'ı export eder.
- **`MobileCardRenderers.jsx`**: Domaine özgü hazır mobil-kart bileşenleri — `TransactionMobileCard`, `BookingMobileCard`, `RentalMobileCard`, `ActivityMobileCard`. Hepsi `useCurrency()` ile tutarı doğru para biriminde biçimler, durum/tip için renkli `Tag` kullanır ve aynı swipe-vs-tap koruma mantığını taşır. `onRowClick(record)` ile satır detayını açarlar.
- **`ResponsiveTable.css`**: ortak stiller.
- **Tüketiciler (~18 sayfa)**: `EnhancedCustomerDetailModal`, `TransactionHistory`, `CustomerShopHistory`, `OrderManagement`, `StudentProfile`, `CustomerProfilePage`, `RepairsPage`, `SparePartsOrders`, `PaymentHistoryCharts`, `DailyOperationsPage`, `Instructors`, `InstructorRatingsAnalytics`, `RolesAdmin`, `SupportTicketsPage`, `VoucherManagement`, `WaiverManagement`, `RentalServices`, `Products` — yani finans, müşteri, repairs ([[Warranty_Repairs]]) ve admin liste ekranlarının çoğu.

### Paylaşılan tarih seçiciler — `src/shared/components/ui/`
- **`EasyDatePicker.jsx`**: Rehberli **Yıl → Ay → Gün** seçici (antd `Popover` + Tailwind; klavye açılmaz, dokunmatik-öncelikli). Doğum tarihi alanlarının **app-genelindeki standardıdır** — tüketiciler: `CustomerSelfRegisterForm` (/join), `RegisterModal` (public kayıt sihirbazı), `UserForm`, `AddInstructorModal`, `InstructorFormPage`, `InstructorMyProfile(+Drawer)`, `AccountSettings`, `FamilyMemberModal`, `PartnerStep`. API: `value`/`onChange` (dayjs, antd `Form.Item` uyumlu), `minDate`/`maxDate` (yıl listesini de kırpar), `defaultPickerYear` (boşken yıl listesinin ortalandığı yıl, DOB için 1995), `disabledDate`, `format`, `size`, `variant` (`'dark'` = public sayfaların `.dark-form` görünümü — antrasit panel + `#00a8c4` cyan; /join `publicMode`'da açık). Geçici test sayfası: `/dev/date-picker-test`.
- **`FlexibleDatePicker.jsx`**: antd `DatePicker`'ı ~20 yazım formatını parse eden `format` dizisiyle saran eski drop-in. DOB alanlarından çıkarıldı; yeni kullanımlarda `EasyDatePicker` tercih edilir.

### Client-side domain model sınıfları — `src/shared/models/`
Backend JSON yanıtlarını sarmalayan, doğrulama (`validate()`) ve yardımcı metotlar sağlayan hafif ES sınıfları. İki kalıp var: (a) **veri-taşıyıcı** sınıflar (constructor + `validate()` + `toJSON()`/getter'lar) ve (b) **statik API-istemci** sınıfları (CRUD'u `authService.apiClient`/`apiClient` üzerinden yapar):

- **`FinancialTracking.js`**: `Transaction` ve `UserBalance` sınıflarını export eder. `Transaction` kredi/borç ayrımı (`isCredit`/`isDebit`), işaretli/biçimli tutar (`getFormattedAmount`) ve **discount alanlarını** (`discountAmount`/`discountPercent`, backend'in `discounts` tablosundan topladığı) taşır (bkz. [[Finances_Wallet]]). `UserBalance` hesap durumu (`getAccountStatus`: credit/due/overdue) ve `CR/DR` etiketli bakiye biçimi sağlar.
- **`Customer.js`**: veri-taşıyıcı + statik CRUD/arama/istatistik (`/api/customers/*`); e-posta/telefon/skill-level doğrulaması ([[Customers_CRM]]).
- **`Equipment.js`**: ekipman alanları + pricing/specifications doğrulaması; statik CRUD/availability/maintenance/rental (`/api/equipment/*`) ([[Products_Shop_Inventory]]).
- **`Rental.js`**: salt-statik istemci; `findActive/findOverdue/findUpcoming/findCompleted/markReturned/markDepositReturned/…` (`/rentals/*`), audit alanlarını `normalizeAuditPayload`/`withAuditFields` ile zenginleştirir ([[Accommodation_Rentals]]).
- **`InstructorEarning.js`**: komisyon-bazlı kazanç hesabı (`calculateTotalEarnings`, `getAverageEarningPerHour`, `markAsPaid`) ([[Instructors_Payroll]]). NOT: bir `fromFirebase`/`toFirebase` çifti içerir — eski Firebase modelinden kalmış ölü/uyumluluk kodudur (proje PostgreSQL kullanır).
- **`Season.js`, `ServiceType.js`, `ServicePackage.js`, `ServicePricing.js`**: hizmet/sezon/paket/fiyatlandırma için salt-statik API istemcileri (`/seasons`, `/service-types`, `/service-packages`, `/service-pricing`) ([[Lessons_Services_Packages]]).
- **`UserSettings.js`**: kullanıcı tercihleri veri-taşıyıcısı (tema, dil, bildirimler, takvim/kiralama/ders varsayılanları, 2FA, gizlilik) + `validate()`/`getDisplayName()`/`toJSON()`.

> NOT: Bu sınıflar uygulamanın **eski bir katmanıdır** ve çoğu ekran artık doğrudan `apiClient` + React Query / context kullanır; modeller belirli legacy akışlarda hâlâ tüketilir.

### Hata-kodu çevirisi (frontend tarafı) — `src/i18n/errorCodes.js`
Backend'in standart hata yanıtı (`{ error, code, errorParams? }`, bkz. `backend/shared/errorCodes.js` ve [[Shared_Backend_Utilities]]) frontend'de **kullanıcının diline çevrilir**:

- `ERROR_KEY_MAP`: backend makine-okunur `code`'larını (`AUTH_INVALID_CREDENTIALS`, `UNIT_UNAVAILABLE`, `VALIDATION_FAILED`, `RATE_LIMIT_EXCEEDED` …) `errors` i18n namespace'indeki camelCase anahtarlara eşler. Backend kataloğunun bire-bir frontend aynasıdır — **yeni bir backend hata-kodu eklendiğinde bu harita da güncellenmelidir**, yoksa çeviri düşmez.
- `resolveErrorKey(code)`: koda karşılık gelen i18n anahtarını (yoksa `null`) döndürür.
- **Tüketici**: `apiClient` response interceptor'ı (`src/shared/services/apiClient.js`) — yanıtta `code` varsa `resolveErrorKey` ile anahtarı bulur, `i18n.t('errors:'+key, { ...errorParams, defaultValue: <EN fallback> })` ile çevirir, sonucu hem `error.translatedMessage`'a hem de **`error.response.data.error`'a** yazar (eski `err.response.data.error` okuyan çağrı yerleri otomatik çeviri görür). Bkz. [[Authentication_Authorization]] (401/refresh akışı).

## Akış

1. **Boot**: `main.jsx` i18n'i bekler → `App` mount olur → provider ağacı kurulur.
2. **Auth check**: `AuthProvider` token varsa `GET /auth/me` ile kullanıcıyı doğrular; yoksa guest. `loading` boyunca spinner.
3. **Veri ön-yükleme**: `isAuthenticated` olunca `DataProvider.fetchData()` rol-bazlı paralel çekim yapar.
4. **Layout kararı**: `AppLayoutWithAuth` route tipine + rol geçerliliğine + consent durumuna göre uygun kabuğu render eder.
5. **Navigasyon**: `AppRoutes` Suspense+lazy ile sayfayı yükler; `ProtectedRoute` rol/izin guard'ını uygular; uygun değilse `/login` veya landing'e yönlendirir.
6. **Oturum sürdürme**: `apiClient` 401'leri sessiz refresh ile telafi eder; `AuthProvider` proaktif yeniler; başarısızlıkta `sessionExpired` → temiz logout.

## Dikkat/Tuzaklar

- **Provider sırası kritik**: `CustomerDrawerProvider` Auth/Currency/Data'nın içinde olmalı; aksi halde küresel çekmece context okuyamaz. `DataProvider` `AuthContext`'i `useContext` ile **try/catch içinde** okur (context yoksa default'lara düşer).
- **`ProtectedRoute` modül seviyesinde tanımlı** olmalı — `AppRoutes` içine taşınırsa her parent re-render'da yeni bileşen tipi üretip iç rotaları remount eder (dashboard yeniden yüklenir).
- **`/dashboard` asla sabit rol listesiyle gate'lenmemeli** — `staffOnly` kullanılır; aksi halde custom roller sonsuz `/dashboard ↔ /login` döngüsüne girer.
- **`canLoad*` flag'leri rol-adı bazlıdır, JSONB custom rollere kördür** — yeni custom-rol veri erişimi eklerken bu flag'lerin genişletilmesi gerekir (bkz. equipment örneği).
- **Refresh `permissions`'ı düşürmemeli** — `preservePermissions` olmadan custom roller her token yenilemesinde gated sayfalardan atılır.
- **StrictMode kapalı** ve **silenceConsole devre dışı** (debug için); ilgili importlar yorum satırı halinde bırakılmış.
- `lazyWithRetry` deploy sonrası chunk hash değişimini tek retry ile tolere eder; yine de stale `index.html` cache'i sorun çıkarırsa "Reload" fallback'i devreye girer.
- `optimizeDeps`'e ağır bir bağımlılık eklemeyi unutmak, Vite'in onu oturum ortasında keşfedip yeniden optimize etmesine ve tarayıcıda 504 hatasına yol açar.

---

## İlgili Düğümler
- [[Authentication_Authorization]] — JWT, refresh, CSRF, izinler, rol guard'ları
- [[Backend_Server]] — `/api` proxy hedefi, Express rotaları
- [[Dashboard_Metrics_Admin]] — `/dashboard` `DashboardRouter` ve rol-bazlı dashboard'lar
- [[Bookings_Calendar]] · [[Lessons_Services_Packages]] · [[Finances_Wallet]] — korumalı operasyon/finans rotaları
- [[Customers_CRM]] — küresel müşteri çekmecesi
- [[Student_Portal]] · [[Outsider_Marketing]] — student/guest landing ve public rotalar
- [[Architecture_Overview]] · [[Tech_Stack]] — genel mimari ve teknoloji yığını
- [[Shared_Backend_Utilities]] — `backend/shared/errorCodes.js` katalog/`sendError` (frontend `errorCodes.js`'in karşılığı)
