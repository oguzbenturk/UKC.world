# Tech Stack

> **Özet:** Plannivo, React 18 + Vite tek-sayfa uygulaması (frontend) ile Node.js + Express 5 ESM API'sinin (backend) PostgreSQL üzerine oturduğu, Docker ile dağıtılan bir iş yönetim platformudur. Tüm parasal hesaplar Decimal.js ile yapılır (kayan nokta yasaktır); durum yönetimi TanStack React Query + React Context ile, UI ise Ant Design + Tailwind + MUI karışımıyla kurulur. Gerçek zamanlı özellikler Socket.io, oturum/önbellek Redis (ioredis), ödeme Iyzico üzerinden işler.
>
> **Kütüphaneler:** React 18, Vite 5, React Router 7, TanStack React Query, Ant Design, TailwindCSS, MUI, Express 5, PostgreSQL (pg), Redis (ioredis), Socket.io, Decimal.js, jsonwebtoken, Iyzico, Docker.
>
> **Bağlantılar:** [[Architecture_Overview]], [[Frontend_Shell]], [[Backend_Server]], [[Database]], [[Deployment_Infrastructure]], [[Payments_Currency]], [[Notifications_System]], [[Testing_QA]], [[Operations_Scripts]], [[Index]]

---

## Sorumluluk

Bu düğüm, projenin kullandığı tüm temel teknolojilerin ve kütüphanelerin **referans haritasıdır**. Hangi katmanın hangi araçla çalıştığını, neden seçildiğini ve hangi wiki düğümünde derinlemesine işlendiğini gösterir. Sürüm bilgisi için tek doğru kaynak kök `package.json` ve `backend/package.json` dosyalarıdır.

---

## Frontend (`package.json`)

| Alan | Teknoloji | Not |
|------|-----------|-----|
| Çekirdek | **React 18.3** + **Vite 5.4** | SPA, `lazyWithRetry` ile kod-bölme — bkz. [[Frontend_Shell]] |
| Routing | **react-router-dom 7.6** | Rol-bazlı `ProtectedRoute` + `resolveLandingRoute` |
| Sunucu durumu | **@tanstack/react-query 5** | Sunucu verisi cache + invalidation |
| İstemci durumu | **React Context** | `AuthContext`, `DataContext`, `CustomerDrawer` |
| UI kütüphaneleri | **antd 5**, **@mui/material 6**, **@headlessui/react**, **TailwindCSS 3.4** | Karışık; Tailwind ana stil sistemi |
| Tablolar | **@tanstack/react-table**, **@tanstack/react-virtual** | Sanallaştırılmış büyük listeler |
| Takvim | **react-big-calendar**, **react-calendar-timeline** | Ders/kiralama takvimleri — bkz. [[Bookings_Calendar]] |
| Formlar | **react-hook-form 7** + **yup** + **@hookform/resolvers** | Doğrulama standardı |
| Sürükle-bırak | **@dnd-kit/core, sortable, utilities** | Takvim + form builder |
| Tarih | **date-fns 4**, **dayjs**, **moment** | (üçü de mevcut — yeni kodda date-fns/dayjs tercih) |
| Para | **decimal.js 10** | Finansal hesap zorunlu |
| Grafik | **recharts** | Dashboard metrikleri |
| Zengin metin | **react-quill**, **@tinymce/tinymce-react**, **tinymce** | Form/teklif içerikleri |
| PDF | **jspdf** + **jspdf-autotable** | Teklif/fatura çıktıları — bkz. [[Proposals_Quotes]] |
| Realtime | **socket.io-client 4** | Sohbet + bildirim — bkz. [[Chat_Community_Events]] |
| i18n | **i18next**, **react-i18next**, **i18next-browser-languagedetector** | Çoklu dil |
| Diğer | **dompurify** (XSS), **qrcode**, **react-signature-canvas** (waiver imza), **libphonenumber-js**, **xlsx**, **framer-motion**, **uuid**, **axios** | — |

---

## Backend (`backend/package.json`)

| Alan | Teknoloji | Not |
|------|-----------|-----|
| Çalışma zamanı | **Node.js (ESM)** + **Express 5.1** | `type: module`; ~70 router — bkz. [[Backend_Server]] |
| Veritabanı | **pg 8** (node-postgres) | Pool; raw SQL (ORM yok) — bkz. [[Database]] |
| Önbellek/Oturum | **ioredis 5** + **redis 4** | `session_revoked_after`, rate-limit, cache — bkz. [[Authentication_Authorization]] |
| Realtime | **socket.io 4** | `socketService.js` |
| Kimlik | **jsonwebtoken 9**, **bcryptjs**, **speakeasy** (TOTP 2FA) | — |
| Güvenlik | **helmet 8**, **express-rate-limit 7**, **express-validator**, **xss** | `middlewares/security.js` |
| Para | **decimal.js 10** | Frontend ile aynı kural |
| Ödeme | **iyzipay 2** | Iyzico gateway — bkz. [[Payments_Currency]] |
| E-posta | **nodemailer 6** (+ Resend HTTP) | Teslimat takibi — bkz. [[Notifications_System]] |
| Telegram | **grammy 1.42** | Bot handler'ları |
| Dosya | **multer** (upload), **sharp** (görsel resize → WebP), **archiver** (ZIP export) | `media.js`, warranty ZIP |
| Zamanlanmış işler | **node-cron 4** | `backend/jobs/*` |
| Gözlem | **prom-client** (metrics), **winston** (log), **morgan** | `/api/metrics` admin-only |
| Diğer | **@slack/webhook**, **xml2js**, **node-fetch**, **uuid** | — |

---

## Veritabanı & Migration

- **PostgreSQL** — local geliştirmede Docker (`localhost:5432/plannivo_dev`), production'da uzak sunucu.
- Migration'lar SQL dosyaları olarak `backend/db/migrations/` altında (**authoritative** — `backend/migrations/` DEĞİL); ~283 numaralı sıraya kadar. Çalıştırma: `npm run migrate:up`.
- ORM **yoktur**; tüm sorgular elle yazılmış parametreli SQL'dir. Detay: [[Database]].

---

## Test & Kalite

- **Vitest 3** — frontend unit test (`npm run test`).
- **Jest 29** (+ babel, supertest) — backend test (`backend/`).
- **Playwright 1.58** — E2E akışlar (`tests/e2e/`): smoke, api-health, financial-accuracy, booking-flow.
- **ESLint 9** (frontend) / ESLint 8 (backend) — lint.
- Tam test paketi, katman haritası, master koşucu ve finansal bütünlük denetleyici için: [[Testing_QA]]. Bağımsız bakım/operasyon scriptleri için: [[Operations_Scripts]].

---

## Dağıtım & Altyapı

- **Docker / docker-compose** — 5 servisli yığın (frontend, backend, postgres, redis, nginx); detay: [[Deployment_Infrastructure]].
- **Vite proxy** — dev'de `/api` ve `/uploads` → `localhost:4000`.
- **node-ssh** + `scripts/push-all.js` — production'a env-swap → version bump → commit/push → SSH ile sunucu rebuild.

---

## Dikkat / Tuzaklar

- **Para = Decimal.js, her zaman.** Hem frontend hem backend; float ile para hesabı kesinlikle yasak. Bkz. [[Finances_Wallet]].
- **Çift tarih kütüphanesi mirası:** `moment` hâlâ bağımlılıkta; yeni kodda `date-fns`/`dayjs` kullanılmalı.
- **Karışık UI kütüphaneleri:** antd + MUI + Headless UI + Tailwind aynı anda. Yeni bileşenlerde mevcut sayfanın izlediği kütüphaneyi takip et.
- **ESM her yerde:** hem frontend hem backend `type: module`; `require` yerine `import`.
- **Frontend ↔ Backend ayna mantığı:** bazı hesaplamalar iki tarafta da var (örn. `src/shared/utils/accommodationPricing.js` ↔ `backend/services/accommodationPricingService.js`) ve **senkron tutulmalıdır** — bkz. [[Accommodation_Rentals]].
