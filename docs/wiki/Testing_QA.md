# Testing & QA

> **Özet:** Plannivo'nun test piramidi üç çerçeveye bölünmüştür: Vitest (frontend birim + güvenlik + entegrasyon), Jest+supertest (backend birim, `tests/unit/backend`), Playwright (gerçek tarayıcı E2E). Buna ek olarak DB-geneli finansal bütünlük denetleyicisi (`check-integrity.mjs`), prod API smoke ve rol-gate auth smoke gibi node tabanlı QA scriptleri mevcuttur. `tests/scripts/run-all-tests.js` master orkestratör bütünlük → prod API → E2E sırasıyla zinciri çalıştırır.
>
> **Kütüphaneler:** Vitest (jsdom, v8 coverage), @testing-library/react, MSW, Jest 29 (experimental-vm-modules), supertest, Playwright (chromium + Pixel 5), pg, dotenv
>
> **Bağlantılar:** [[Tech_Stack]], [[Operations_Scripts]], [[Finances_Wallet]], [[Deployment_Infrastructure]], [[Backend_Server]], [[Payments_Currency]]

---

## Sorumluluk

Tüm otomatik test paketini ve QA altyapısını barındırır. Kapsamı: frontend bileşen/hook birim testleri, backend servis/route birim testleri, güvenlik testleri (SQLi/XSS/RBAC), WebSocket ve Iyzico entegrasyon testleri, gerçek tarayıcı E2E akışları, ve canlı veritabanına karşı çalışan finansal bütünlük/drift denetimleri. Ana giriş noktası `tests/` dizinidir; ek QA scriptleri `scripts/` ve `backend/scripts/` altındadır.

## Test Piramidi ve Çerçeve → Katman Eşlemesi

| Çerçeve | Ortam | Kapsam | Konfig |
|---|---|---|---|
| **Vitest** | jsdom | Frontend birim (`tests/unit/frontend`) + Güvenlik (`tests/security`) + Entegrasyon (`tests/integration`) | `vitest.config.js` |
| **Jest 29 + supertest** | node | Backend birim/route (`tests/unit/backend`) | `backend/jest.config.js` |
| **Playwright** | gerçek tarayıcı (Chromium + mobil Pixel 5) | E2E (`tests/e2e`) | `playwright.config.mjs` |
| **Node scriptleri** | node + pg | DB bütünlük, prod API smoke, auth rol-gate smoke | — |

Önemli ayrım: Vitest ve Jest **aynı dizini paylaşmaz**. `vitest.config.js` `include` listesi sadece `tests/unit/frontend`, `tests/security`, `tests/integration`'ı alır ve `tests/e2e`'yi açıkça hariç tutar. `backend/jest.config.js` ise `roots: ['../tests/unit/backend']` ile yalnız backend birim testlerini çalıştırır (`testMatch: ['**/*.test.js']`).

## Dizin Haritası (`tests/`)

- **`tests/unit/backend/`** (~132 dosya): Domain bazlı alt-klasörler — `auth/`, `bookings/`, `finances/`, `payments/` (en yoğun: `wallet-wave2..5`, `wallet-integrity-hardening`, `walletService.*`), `packages/`, `notifications/`, `routes/` (accommodation, chat, equipment, events, expenses, feedback, financeDailyOps, groupBookings, notifications, shopOrders, vouchers), `security/` (api-rate-limit, db-guardrails, file-upload-security), `shop/`, `users/`, `warranty/`, `waivers/`, `iyzico/`, `group-bookings/`, `ratings/`, `vouchers/`, `popups/`, `events/`, `core/`.
- **`tests/unit/frontend/`**: jsdom bileşen/hook testleri — `dashboard/`, `finances/` (financialCalculations, netRevenue, expenseCalculations), `instructor/`, `manager/` (variantMatrix, productImagePayload), `wallet/`, `students/`, `outsider/`, `shared/` (pricing, roleUtils, useTheme), `bookings/`, `calendars/`, `chat/`, `customers/`, `equipment/`, `rentals/`, `events/`, `forms/`, `admin/`, `notifications/`.
- **`tests/integration/`**: `websocket.test.js` (Vitest), `iyzico-e2e-payment.test.mjs`.
- **`tests/security/`** (Vitest): `sql-injection.test.js`, `rbac-authorization.test.js`, `xss-prevention.test.js` — saf regex/mantık tabanlı, DB'siz çalışır.
- **`tests/stress/`**: `stress-test-simulation.mjs`.
- **`tests/e2e/`**: Playwright spec'leri:
  - **`flows/`** (38 spec): `smoke`, `api-health`, `financial-accuracy`, `booking-flow`/`booking-crud`/`booking-edit-flow`, `auth-flow`, `wallet-system`, `membership-lifecycle`, `instructor-dashboard`, `rental-system`, `public-academy-flow`/`public-rentals-flow`/`public-packages-flow`/`public-accommodation-flow`, `gdpr-compliance`, `ui-mirrors-api-calculations`, `master-workflow` vb.
  - **`phases/`** (20 spec): `phase1-auth-smoke` … `phase20-finance-edge-cases` — kademeli rol/akış senaryoları.
  - **`qa/`** (8 spec): `qa-audit-section*` — bölüm bazlı QA denetimi (env, guest/outsider, student, modüller, wallet, cancel/package, staff, cross-role UI).
  - **`audits/`**: frontend-audit-* (navigation, admin-components, bug-hunt, crosscutting), meta-qa-verification.
  - **`forms/`**: form-validation-* (auth, booking, shop-wallet, admin-crud, support-profile).
  - **`User_browser_tests/`**: gerçek kullanıcı persona akışları (`student-register-and-iyzico-wallet`, `commission-verify-package-bookings`) + paylaşılan yardımcılar (`userBrowserAuth`, `studentPersona`, `dismissConsentWall`, `commissionVerification`).
  - Çıktılar: `logs/`, `reports/` (validation-audit-results*.json), `screenshots/`, `tests/results/`.
- **`tests/setup/`**: `vitest.setup.js`, `jest.setup.js`, `test-utils.jsx`, `.env.test.example`, `mocks/` (MSW `handlers.js`, `socket-mock.js`, `fixtures/instructorData.js`).
- **`tests/scripts/`**: `run-all-tests.js` (master orkestratör), `test-production.mjs`, `cleanup.mjs`, `_shared.mjs`, `testflows/`.
- **`tests/helpers/`**: `socket-mock.js`.

## Konfigürasyon Detayları

- **`playwright.config.mjs`**: `testDir: ./tests/e2e`, timeout 30s/expect 5s, `fullyParallel`, `retries: CI?2:0`. Trace/screenshot/video **retain-on-failure**. İki proje: `chromium` (Desktop Chrome) + `mobile-chrome` (Pixel 5). `webServer` yalnız **CI'da** `npm run dev:frontend`'i otomatik başlatır; lokal'de mevcut sunucuyu yeniden kullanır. `baseURL` = `TEST_URL || http://localhost:3000`. `.env.test`'ten dotenv okur.
- **`vitest.config.js`**: `globals: true`, `environment: 'jsdom'`, setup `tests/setup/vitest.setup.js`. v8 coverage (text/json/html). `tests/e2e/**` hariç tutulur (Playwright çakışmasını önler).
- **`backend/jest.config.js`**: `testEnvironment: 'node'`, `transform: {}` (ESM, transpile yok), `setupFiles: ['../tests/setup/jest.setup.js']`, `moduleDirectories`'e backend node_modules eklenir. Backend `npm test` = `node --experimental-vm-modules jest --detectOpenHandles --forceExit`.

## package.json Test Komutları (16 adet)

| Komut | İşlev |
|---|---|
| `test` / `test:run` / `test:watch` | Vitest (watch / tek sefer) |
| `test:ui` | Vitest UI |
| `test:coverage` | Vitest + v8 coverage |
| `test:e2e` | Playwright tümü |
| `test:e2e:smoke` / `:api` / `:financial` / `:booking` | Tek E2E spec (smoke, api-health, financial-accuracy, booking-flow) |
| `test:all` | Master orkestratör (bütünlük + prod API + E2E) |
| `test:quick` | Master, E2E atla |
| `test:api-only` | Master, sadece API |
| `test:integrity` | `scripts/check-integrity.mjs` |
| `test:production` / `test:production:verbose` | `tests/scripts/test-production.mjs` |

Backend birim testleri kök `package.json`'da değil; `backend/package.json` `test`/`test:watch`/`test:coverage` (Jest) altındadır.

## Test Kurulum (Setup) Altyapısı

- **`vitest.setup.js`**: `@testing-library/jest-dom`; `matchMedia`, `IntersectionObserver`, `ResizeObserver`, `localStorage`, `sessionStorage`, `window.location`, `performance` mock'ları; `global.fetch = vi.fn()`; `socket.io-client` modül mock'u; her testten sonra `vi.clearAllMocks()` + storage temizliği.
- **`jest.setup.js`**: `backend/.env.test`'i dotenv ile yükler; `NODE_ENV=test`, `EMAIL_TRANSPORT=stream` (gerçek e-posta gönderimi engellenir), Redis host/port ve `FRONTEND_URL` varsayılanları.
- **`test-utils.jsx`**: `renderWithProviders` / `renderWithAuth` — BrowserRouter + QueryClientProvider (retry kapalı) + antd ConfigProvider + AuthProvider sarmalayıcısı; `mockAuthUser` (admin).
- **MSW** (`tests/setup/mocks/handlers.js`): `http`/`HttpResponse` ile `localhost:4000/api` endpoint mock'ları (auth/login, auth/me, wallet/summary, bookings vb.).

## QA Scriptleri (Operasyonel)

- **`scripts/check-integrity.mjs`** (`npm run test:integrity`): `DATABASE_URL`'e (`backend/.env` → lokal dev) bağlanıp **16 DB-geneli bütünlük sorgusu** çalıştırır. Finansal (kritik): *Wallet Balance vs Transactions*, *User Balance vs Wallet Balance*, *Completed Bookings Without Payment*, *Refunds Without Original Transaction*. Operasyonel: orphaned/invalid bookings, double-booked instructors, negatif stok/paket saatleri, shop order toplam uyuşmazlığı, accommodation çift rezervasyon, geçersiz roller, mükerrer e-posta. Renkli severity raporu; finansal driftleri (bkz. [[Finances_Wallet]], [[Payments_Currency]]) tespit eden temel araç.
- **`scripts/smoke-test-frontdesk.mjs`**: 2026-05-30 frontdesk revizyonu için rol-gate auth smoke. `BASE=localhost:4000`'e admin + receptionist login eder, `front_desk`/`receptionist` rol eşitliğini ve gate'li endpoint erişimini doğrular (pass/fail sayacı). Lokal `npm run dev` ayakta olmalı.
- **`tests/scripts/test-production.mjs`** (`npm run test:production`): admin login + fazlı API smoke (`--phase=N`, `--verbose`); pass/fail/skip/warn sayacı.
- **`backend/scripts/test-financial-reconciliation.js`**: tüm kullanıcılar için saklı vs hesaplanan bakiye karşılaştırması; `getStudentOverview` ile portal görünümü mutabakatı; cent-seviyesi (`TOLERANCE=0.01`) tolerans.

## Co-located Test İstisnaları

Genel kural testlerin `tests/` altında toplanmasıdır, ancak iki istisna kaynak ağacında yaşar (her ikisi de backend Jest tarafından **otomatik koşulmaz**, jest.config `roots` dışındadır):
- `backend/services/emailTemplates/__tests__/waiverConfirmation.test.js`
- `backend/services/metrics/notificationMetrics.spec.js`

## Master Orkestratör Akışı (`run-all-tests.js`)

`--quick` (E2E atla) ve `--api` (sadece API) bayrakları. Sıra: **1)** `check-integrity.mjs` → **2)** `test-production.mjs` (API) → **3)** `npx playwright test --reporter=list`. Her adım `spawn` ile cwd=repo kökü, `stdio: inherit`. Sonunda renkli özet; herhangi bir adım başarısızsa `process.exit(1)`.

## Dikkat / Tuzaklar

- **E2E çift sahiplik yok:** Playwright spec'leri Vitest tarafından koşulursa çöker; `vitest.config.js` `exclude` listesindeki `tests/e2e/**` bu ayrımı korur. Yeni E2E dosyaları daima `tests/e2e/` altında olmalı.
- **Backend ESM/Jest:** `transform: {}` ve `--experimental-vm-modules` zorunlu; aksi halde ESM import'lar Jest'te patlar. `--forceExit`/`--detectOpenHandles` açık handle (pg/redis) sızıntılarını maskeleyebilir.
- **Bütünlük denetimi prod'a bakabilir:** `check-integrity.mjs` `backend/.env`'deki `DATABASE_URL`'i okur. `push-all` env'i geçici prod'a çevirdiğinden, yanlış zamanda çalıştırmak **prod'a karşı** denetim yapar — bkz. [[Deployment_Infrastructure]] env swap notu.
- **Sabit dev kimlik bilgileri:** smoke/prod scriptlerinde `admin@plannivo.com / asdasd35` gömülü; bunlar lokal dev kimlikleridir (bkz. [[Authentication_Authorization]]), prod'a karşı kullanılmamalıdır.
- **MSW kapsam:** Yeni bir frontend testinin çağırdığı endpoint `handlers.js`'te yoksa istek başarısız olur; handler eklenmeli. `EMAIL_TRANSPORT=stream` sayesinde backend testleri gerçek e-posta göndermez.
- **CI vs lokal webServer:** Playwright lokal'de sunucuyu başlatmaz; `npm run dev` önceden ayakta olmalıdır, yoksa tüm E2E zaman aşımına uğrar.
