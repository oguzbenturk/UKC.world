# Plannivo Uygulama Kabiliyetleri

Bu doküman, Plannivo platformunun sunduğu tüm ana özellikleri ve teknik yetenekleri tek bir referansta toplar. Amaç; ürün tanıtımı, ekip onboarding’i, paydaş raporlaması veya regülasyon denetimleri sırasında hiçbir fonksiyonun gözden kaçmamasını sağlamaktır.

## 1. Genel Bakış
- **Platform tipi:** React (Vite) tabanlı SPA + Express/Node.js API + PostgreSQL + Redis.
- **Dağıtım modeli:** Docker Compose tabanlı çoklu servis mimarisi (frontend/nginx, backend, postgres, redis). `push-all.js` otomasyon scripti ile tek komutla build & remote deploy.
- **Alan adı & SSL:** Nginx terminasyonu, sertifikeler repo içindeki `SSL/` klasöründen okunur; `.well-known` klasörü otomatik senkronize edilir.
- **Çekirdek kullanıcı rolleri:** Admin, Manager, Instructor, Student, Customer (self‑service portal). Geliştirici rolleri ve sistem servisleri için ek korumalar mevcut.

## 2. Kimlik Doğrulama & Güvenlik
- JWT tabanlı oturum yönetimi, `AuthContext` ile global state paylaşımı.
- Login sayfası gelişmiş UI, "Remember me" desteği, hatalar için detaylı geribildirim.
- `useAuth` kancasıyla route seviyesinde role-based guard; `AppRoutes` içinde `ProtectedRoute` bileşeni tüm sayfaları yetkilendirir.
- GDPR uyumu: `/privacy/gdpr` ekranı, CLI scriptleri (`scripts/gdpr-admin.mjs`), API uçları (`/api/gdpr/export`, `/api/gdpr/anonymize`).
- Kullanıcı rıza yönetimi (`UserConsentModal`) ve global body scroll lock mantığı.
- Finansal işlem yolları için `triggerFinancialReconciliation`, JWT zorunluluğu, rol kontrolleri.

## 3. Dashboard & Analitik
- **Executive Dashboard:** Çoklu KPI kartları, gelir/rezervasyon grafikleri, instructor performans karşılaştırmaları.
- **Instructor Dashboard:** Revamp ve fallback versiyonlar; günlük dersler, öğrenci listeleri, gelir durumu.
- **Instructor Ratings Analytics:** Esnek filtreler, “top performer” vurguları, CSV/PDF export, cross-metric snapshotlar. Doküman referansları `docs/instructor-ratings-analytics-guide.md`, `docs/admin-analytics-runbook.md`.
- **NetworkStatusBanner** ve web vitals toplama (`collectWebVitals`) ile performans gözlemi.

## 4. Operasyon Modülleri
### 4.1 Rezervasyon & Ders Yönetimi
- `features/bookings` altında modern takvim, step booking modal, rezervasyon düzenleme (`BookingEditPage`), silinen rezervasyonlar ekranı.
- Instructor’lar için "My Students", öğrenci detayları ve ders programı.
- Öğrenci portalında ders programı (`StudentSchedule`), kurslar, ödemeler, destek bileşenleri.

### 4.2 Ekipman ve Kiralama
- `features/equipment` envanter takibi, bakım durumları.
- `features/rentals` kiralama sözleşmeleri, servis tipine göre filtreleme.
- `features/services` altında konaklama, ders, kiralama, satış servisleri ve kategori yönetimi.

### 4.3 Finans & Ödemeler
- Finans modülü (`features/finances/pages/Finance.jsx`) gelir-gider analizi, rapor kartları.
- `FinanceSettingsPage` para birimi, oranlar, muhasebe ayarları.
- Otomatik finansal mutabakat servisi (`middlewares/financialReconciliation.js`, server scheduler logları).
- Wallet sistemi planları (`docs/wallet-system-implementation-plan.md`, `wallet-migration-plan.md`), wallet modal yöneticisi, müşteri paket yöneticileri.

### 4.4 Müşteri & Kullanıcı Yönetimi
- Müşteri listeleri, profil sayfaları, paket yönetimi (`CustomerPackageManager`, `MultiCustomerPackageManager`).
- Instructor CRUD, roller/izinler (`RolesAdmin`), waiver yönetimi.
- GDPR veri ihracı, anonimleştirme UI ve admin arayüzleri.

### 4.5 Bildirim, Popup & Yardım
- Notification Center + gerçek zamanlı köprü (`NotificationRealtimeBridge`).
- Popup Manager; kullanıcı rolü ve route bazlı tetikleme, "first login" popupları.
- Help & AI Assistant paneli (`features/help`).
- Sistem genelinde toast/notification contextleri.

## 5. Öğrenci Portalı
- Role `student` için dedike layout (`StudentLayout`) ve dashboard.
- Aile yönetimi (`FamilyManagementPage`), waiver imzalama, ödeme geçmişi, destek istekleri.
- `StudentPortalUnavailable` fallback’i ile feature flag üzerinden aç/kapa.

## 6. Teknik Alt Yapı & Servisler
- **Backend servisleri:** `backend/services` içinde rezervasyon, finans, bildirim, socket, metrics vb.
- **Veritabanı katmanı:** `backend/db` parametreli sorgular, `migrations/` dizinindeki SQL scriptleri.
- **Cache & Queue:** Redis entegre; `DISABLE_REDIS` ile toggled, notification worker register logları.
- **Socket.IO:** `services/socketService.js` gerçek zamanlı güncellemeler için.
- **Metrics & Observability:** Prometheus uyumlu `metricsService`, `/api/health` endpoint, docker healthcheck scriptleri.
- **Backups & Maintenance:** Backup servisi günlük/aylık plan, `backups/signatures`, `scripts/reset-db.sh`, `check-migrations` yardımcıları.

## 7. Deployment & Operasyon Araçları
- `push-all.js` ortam değişimi, git commit/push, remote pull, docker-compose restart, .well-known senkronizasyonu.
- Çoklu compose varyantları (`docker-compose.production.yml`, `docker-compose.override.yml`, `docker-compose.development.yml`).
- SSL yönetimi: `SSL/` klasörü repo içinde, nginx volume mount, ZeroSSL/Comodo DCV dosyaları `public/.well-known/pki-validation/`.
- `productionvars/` altında örnek compose ve değişken setleri.
- `verify-implementation.ps1`, `quick-verify.ps1` gibi denetim scriptleri.

## 8. Dokümantasyon & Çıktılar
- Strateji dokümanları: `DASHBOARD_MODERNIZATION.md`, `EXECUTIVE_DASHBOARD_MODERNIZATION.md`, `BOOKING_WIZARD_IMPROVEMENTS.md`, `WALLET_FIX_SUMMARY.md`.
- Operasyon rehberleri: `docs/monitoring/`, `docs/ops/`, `SUNUCU_KURULUM_REHBERI.md` (TR).
- QA sonuçları: `test-results/`, Playwright raporları.
- PROGRESS_CHECKLIST ve PRODUCTION_FIXES gibi teslimat logları.

## 9. Uygulama İçi UX Detayları
- Tailwind tabanlı tasarım sistemi (`index.css`, custom utilities, gradient arka planlar, animasyonlu bloblar).
- Responsive nav & sidebar; otomatik collapse, safe-area aware padding, mobilde scroll/keyboard düzeltmeleri.
- Formlar `react-hook-form + yup` yaklaşımıyla (mevcut formların büyük kısmı).
- AI yardımları (Help modülü, AIAssistantPanel).
- SEO yönetimi `usePageSEO`, Robots + Sitemap dosyaları.

## 10. Uyumluluk & Regülasyon
- GDPR uyumluluk maddeleri README’de detaylandırılmış durumda (Article 15/17/20/7(3)).
- Log’lar için Winston tabanlı error handler, finansal işlemlerde audit trail.
- Veri saklama politikaları: finans kayıtları 7 yıl saklanıp anonimleştiriliyor.

---
Bu dosya, repoda bulunan tüm modülleri kapsayıcı bir üst bakış sunar. Ek özellikler eklendiğinde lütfen `docs/application-capabilities.md` dosyasını güncelleyerek tek kaynağı güncel tutun.