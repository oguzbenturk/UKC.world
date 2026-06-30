# Dashboard, Metrics & Admin

> **Özet:** Bu modül, rol-farkında gösterge panellerini (admin analitiği vs. ön-büro hızlı aksiyon), Prometheus tabanlı operasyonel metrikleri, birleşik ayarlar merkezini (`/settings` tab'ları) ve uyumluluk için 7 yıl saklanan denetim günlüğünü (audit log) kapsar. `DashboardRouter` giriş yapan personeli rolüne göre doğru panele yönlendirir; tüm KPI'lar `dashboardSummaryService` üzerinden tek bir özet uçtan beslenir.
>
> **Kütüphaneler:** React 18, Recharts, Ant Design, prom-client, Winston, PostgreSQL, Redis (cache).
>
> **Bağlantılar:** [[Frontend_Shell]], [[Backend_Server]], [[Finances_Wallet]], [[Instructors_Payroll]], [[Authentication_Authorization]], [[Customers_CRM]], [[Notifications_System]], [[Misc_Integrations]]

---

## Sorumluluk

"İşletme tek bakışta nasıl gidiyor?" sorusunu ve yönetim ayarlarını yönetir: rol-bazlı dashboard, operasyonel KPI'lar, metrik/observability, ayar merkezi, audit log, destek talepleri, voucher yönetimi ve eğitmen puan analitiği.

---

## Frontend

### Rol-bazlı yönlendirme — `DashboardRouter.jsx`
- `ADMIN_DASHBOARD_ROLES = ['admin','manager','developer','instructor']` → **AdminDashboard** (analitik).
- Diğer/custom roller (örn. `front_desk`, `receptionist`) → **FrontDeskDashboard** (hızlı aksiyon). Bkz. [[Frontend_Shell]] (`resolveLandingRoute`).

### `AdminDashboard` (analitik odaklı)
- Tarih aralığı seçici (today/week/month/year/custom).
- 5 vurgu kartı: tamamlanan booking (tamamlanma oranı, kategori kırılımı), kiralama, konaklama, üye, mağaza müşterisi.
- Operasyonel satır: Gross Lessons, Instructor Payouts, Manager Comm., Net Lesson Revenue (bkz. [[Instructors_Payroll]]).
- Recharts: gelir trend çizgisi + komisyona göre top personel bar grafiği.
- Widget görünürlüğü `localStorage: dashboardWidgetVisibility`.
- API: `GET /api/dashboard/summary?startDate=&endDate=`, `/kpis`, `/trends`, `/instructors`.

### `FrontDeskDashboard` (hızlı aksiyon odaklı)
- İzin-bazlı Quick Actions ızgarası: Booking, Rental, Customer, Accommodation, Shop Sale, Membership — hepsi lazy-load modal (`BookingDrawer`, `QuickRentalModal`, `QuickCustomerModal`, `QuickAccommodationModal`, `QuickShopSaleModal`, `QuickMembershipModal`).
- Yaklaşan rezervasyonlar + son ödemeler akışı; segmented "Analytics Mode" toggle.
- Gerçek zamanlı güncelleme: `useDashboardRealTime()`; ödeme başarı callback'i URL param ile.

### `ManagerHomeDashboard`
- Kişisel kazanç bölümü (bu ay, bekleyen ödeme, YTD, geçen aya % değişim) + "Academy at a Glance" 16 KPI + Inventory Health. API: `GET /api/manager/dashboard` + `/api/dashboard/summary`.

### Admin sayfaları (`src/features/admin/pages/`)
- `SparePartsOrders` — yedek parça siparişleri (bkz. [[Products_Shop_Inventory]]).
- `InstructorRatingsAnalytics` — eğitmen puan liderlik tablosu, dağılım/servis grafikleri, PDF export (bkz. [[Forms_Waivers_Compliance]]).
- `VoucherManagement` — voucher sihirbazı (percentage/fixed_amount/wallet_credit/free_service/package_upgrade), toplu üretim, kullanım geçmişi (bkz. [[Outsider_Marketing]]).
- `SupportTicketsPage` — destek talepleri (inbox/tablo, durum/öncelik/kanal filtreleri).

### `UserSettings` — birleşik ayar merkezi (`/settings?tab=...`)
Rol'e göre sekmeler: **Herkes** (General, Music → bkz. [[Misc_Integrations]]), **Personel** (Telegram), **Öğrenci** (Safety), **Eğitmen** (Availability, Teaching Prefs), **Manager** (Team Notifications, Operational Defaults), **Admin/Manager** (Calendar working hours, Booking defaults), **Sadece Admin** (Forecast, Finance, Currency, Services/Categories, Roles, Waivers, Legal, Refunds, Bank Accounts, KAI Logs, Deleted Bookings).

---

## Backend

### Rotalar
- `backend/routes/dashboard.js` — `GET /summary` (auth: `admin/manager/owner/developer` + `reports:read`; 60s cache); KPI'lar.
- `backend/routes/metrics.js` — `GET /prometheus` (prom-client çıktısı), `/notifications/snapshot`; mount admin-only (`authorizeRoles(['admin','super_admin'])`). Bkz. [[Notifications_System]].
- `backend/routes/admin.js` — legal-documents CRUD, Kai sessions (`/admin/kai/sessions`), genel admin.
- `backend/routes/settings.js` — `GET /settings` (30m cache), `PUT /:key`; `registration-currencies` (1h cache, public).
- `backend/routes/teamSettings.js`, `auditLogs.js`, `adminSupportTickets.js`, `admin-reconciliation.js`, `system.js`.

#### Route uç-detayları

- **`adminSupportTickets.js`** — mount `/api/admin/support-tickets` (server.js); hepsi `authenticateJWT` + `authorizeRoles(['admin','manager'])`. Uçlar:
  - `GET /` — tüm destek talepleri; opsiyonel `status` / `priority` / `studentId` query filtreleri → `getAllSupportTickets(...)`; `{ success, data, count }` döner.
  - `GET /statistics` — özet istatistik (`getTicketStatistics()`); **dikkat:** uç adı `/statistics`, `/stats` DEĞİL.
  - `PATCH /:ticketId/status` — durum güncelle (`status` body zorunlu, yoksa 400) → `updateSupportTicketStatus(ticketId, status)`.
  - `POST /:ticketId/notes` — dahili not ekle (`note` body zorunlu, yoksa 400); not yazarı olarak `req.user.id` geçer → `addTicketNote(...)`.

- **`admin-reconciliation.js`** — mount `/api/admin/financial-reconciliation` (server.js); hepsi `authenticateJWT` + `authorizeRoles(['admin'])` (**sadece admin**). Uçlar:
  - `GET /stats` — `getReconciliationStats` (senkron, `reconciliationService.getStats()`); mutabakat durumu/istatistikleri.
  - `POST /run` — `manualReconciliation`; `req.body.limit` opsiyonel sınır, `triggeredBy = req.user.id`, `source: 'manual'` ile `reconciliationService.runReconciliation(options)` çağırır.
  - `GET /test` — `test-financial-reconciliation.js` script'ini dinamik import edip `FinancialReconciliationTester` ile kapsamlı test koşar.
  - **`triggerFinancialReconciliation` middleware ilişkisi:** bu route, mutabakatın *manuel/tanılama* yüzüdür. *Otomatik* tetikleme ise aynı dosyadaki (`backend/middlewares/financialReconciliation.js`) `triggerFinancialReconciliation` middleware'i ile olur — `/api/finances`, `/api/rentals`, `/api/finances/daily-operations` mount'larına takılıdır (server.js). Middleware `res.end`'i sarmalar; yanıt 2xx ise ve URL transaction-benzeri (`/transaction|/payment|/finance|/booking|/package`) + bir `userId` çözülebiliyorsa, `setImmediate` ile **asenkron** (yanıtı bloklamadan) `reconciliationService.onTransactionChange(userId,...)` çağırır; hata yalnızca `logger.warn` ile loglanır.

- **`auditLogs.js`** — mount `/api/audit-logs` (server.js, `authenticateJWT` ile); tek uç `GET /` → `authorizeRoles(['admin','manager'])` + `validateInput`. `express-validator` ile doğrulanan filtreler: `resourceType` (≤50 char), `eventType` (≤100 char), `actorUserId` / `targetUserId` / `familyMemberId` / `waiverId` (UUID), `startDate` / `endDate` (ISO8601), `limit` (1–500), `offset` (≥0). `queryAuditLogs(...)` → `{ success, data: rows, pagination }`.

- **`teamSettings.js`** — mount `/api/team-settings` (server.js); **dikkat: route-seviyesi public mount** (server.js satırında global `authenticateJWT` ÖNEKİ YOK), fakat her iki uç da kendi içinde `authenticateJWT` + `authorizeRoles(['admin','manager'])` taşır. Diğer admin route'ları gibi `authenticateJWT` ile öneklenmemiş olması bu mount'a özgüdür. Uçlar:
  - `GET /` — `getTeamSettings()`; eğitmen vitrin görünürlük ayarları.
  - `PUT /` — `{ members, global }` body'sini `saveTeamSettings(...)` ile kaydeder (görünürlük toggle'ları dahil), sonra güncel ayarları döner.

> **Metrik kayıt dosyası:** Prometheus tarafı `backend/services/metrics/prometheusMetrics.js` içindedir — tek bir `prom-client` `Registry` (`prometheusRegistry`, default label `service`), `collectDefaultMetrics({ prefix: 'plannivo_' })` + tüm bildirim gauge/histogram/counter'ları tanımlanır. `getPrometheusMetrics()` registry çıktısını üretir; `metrics.js` route'u (`GET /api/metrics/prometheus`) bunu yayınlar.

### Servisler
- `dashboardSummaryService.js` — `getDashboardSummary({startDate,endDate})`; `bookings`, `rentals`, `wallet_transactions`, `accommodations_bookings`, `member_purchases`, `equipment`, `shop_orders`, `instructor_commissions` üzerinden KPI türetir (2dk cache).
- `metricsService.js` — hafif in-memory istek toplayıcı (count/status/duration bucket → Winston `logs/metrics.log`).
- `metrics/*` (prom-client) — `notification_queue_depth`, `notification_active_jobs` (gauge), job wait/duration histogramları, `notification_jobs_total`/`_failures_total`/`_dropped_total` sayaçları.
- `auditLogService.js` — `logAuditEvent(...)` → `audit_logs`; waiver/family/role olayları, **7 yıl** `retain_until`.
- `supportTicketService.js` — `student_support_requests` (kanal: email/whatsapp/phone/chat/contact-form; öncelik/durum makinesi).
- `teamSettingsService.js`, `backupService.js`.

---

## Veri Modeli

- **`audit_logs`** (migration 022) — UUID PK; `event_type`, `action`, `resource_type/id`, `actor_user_id`, `target_user_id`, `metadata` JSONB, `ip_address` INET, `retain_until` (NOW()+7yıl). Bol indeksli.
- **`team_member_settings`** / **`team_global_settings`** (migration 234) — eğitmen vitrin görünürlüğü (bkz. [[Chat_Community_Events]] team page).
- **`student_support_requests`** — destek talepleri; `metadata.notes[]` JSONB (reply/internal).
- **`settings`** — key-value store: `allowed_registration_currencies`, `calendar_working_hours`, `instructor_form_visibility`, `booking_defaults`, `preferred_currency`.

---

## Akış / İş Mantığı

- **Tek özet ucu:** Hem admin hem ön-büro hem manager panelleri `GET /api/dashboard/summary`'den beslenir → tutarlı KPI, az sorgu. Cache 60s/2dk.
- **Metrics:** İstek metrikleri Winston'a; bildirim kuyruğu metrikleri Prometheus'a (`/api/metrics/prometheus`, scrape-ready).
- **Audit:** Hassas olaylar (`waiver.*`, `family_member.*`, `user.role_change`) `auditLogService` ile yazılır; 6 saatte bir `retain_until` geçmişi budanır.
- **Ayarlar:** Granüler ve cache'li; `PUT /:key` ilgili cache'i invalide eder.

---

## Dikkat / Tuzaklar

- **`/dashboard` `staffOnly` ile gate'lenir, sabit rol listesiyle DEĞİL.** Tüm custom rollerin landing'i `/dashboard` olduğundan, rol-listesi guard'ı ön-büro/custom rolleri `/dashboard → /login → /dashboard` sonsuz döngüsüne sokar (bkz. [[Frontend_Shell]], [[Authentication_Authorization]]).
- **`reports:read` izni** dashboard summary için gereklidir; custom rollerde bu izin yoksa KPI gelmez.
- **Audit log silinmez, budanır** — 7 yıllık yasal saklama; sorgular `retain_until`'a göre indekslidir.
- **KAI Logs sekmesi** Kai AI asistanının konuşma denetim izidir (bkz. [[Misc_Integrations]]).
