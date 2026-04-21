# Plannivo Multi-Language (i18n) Rollout Plan

## Context

Plannivo currently ships English only. The goal is to support **5 languages — English, Turkish, French, Russian, Spanish — in one release**, with a language switcher users can toggle at runtime. No dedicated i18n files need to be "recreated" per language — instead, every user-visible string moves into JSON translation files keyed by language, and components render those keys via `t('some.key')`.

Scope (decided with user):
- **UI only** — emails/PDFs are out of scope for this phase
- **Backend errors** move to stable error codes; frontend translates
- **Translations are AI-drafted** from EN source; user reviews TR natively, flags FR/RU/ES for later
- **All 5 languages ship together** — AI-drafting makes this feasible

Scale: ~186 pages, ~152 components, ~2,000–3,000 unique strings across 7 roles.

---

## Stack decision

- `react-i18next` + `i18next` + `i18next-browser-languagedetector` + `i18next-http-backend`
- Lazy-loaded namespaces per role so each role only downloads what it needs
- Ant Design built-in locale packs (`antd/locale/tr_TR`, `fr_FR`, `ru_RU`, `es_ES`, `en_US`) + dayjs locales

---

## Phase 1 — Foundation (~1 day) *(role-independent)* ✅ DONE

- [x] `npm i react-i18next i18next i18next-browser-languagedetector i18next-http-backend`
- [x] Create `src/i18n/` with:
  - [x] `index.js` — init, `fallbackLng:'en'`, `supportedLngs:['en','tr','fr','ru','es']`, detector order `['localStorage','navigator']`, localStorage key `plannivo.lang`
  - [x] `localeMap.js` — maps lang code → AntD locale + dayjs locale; preloads all 5 dayjs locales
  - [x] `languages.js` — display metadata (code, name, nativeName, flag)
  - [x] `AppLocaleProvider.jsx` — reactive ConfigProvider wrapper (switches AntD + dayjs locale on `i18n.language` change)
- [x] Create `public/locales/{en,tr,fr,ru,es}/common.json` (served statically)
- [x] Edit [src/main.jsx](src/main.jsx):
  - [x] Added `import '@/i18n'`
  - [x] Replaced static `<ConfigProvider locale={enUS}>` with `<AppLocaleProvider>`
  - [x] Removed the hardcoded `dayjs.locale('en')` call
- [x] Create `src/shared/components/LanguageSwitcher.jsx` — dropdown with flags + native names, mounted in Navbar right section (visible to both auth and public users). Settings mirror deferred to Phase 4 when user settings page is translated.

---

## Phase 2 — Shared / cross-cutting (~2 days) *(done once, benefits every role)* ✅ DONE

- [x] Rewrote [src/shared/utils/formatters.js](src/shared/utils/formatters.js):
  - [x] `formatCurrency` uses `Intl.NumberFormat(i18n.resolvedLanguage, …)` (was hardcoded `'en-US'`)
  - [x] `formatDate` uses `dayjs.format(i18n.t('common:dateFormat.short|shortWithTime'))` (was hardcoded `'en-GB'`)
  - [x] `formatDuration` uses `i18n.t('common:duration.hrMin', {hours, minutes})` (was hardcoded `'hr'` / `'min'`)
  - [x] `validateForm` error messages also translated
  - Note: reactivity is handled at call-site via `useTranslation()` re-renders; no global subscription needed.
- [x] [src/shared/utils/antdStatic.js](src/shared/utils/antdStatic.js) — added `tMessage`, `tNotification`, `tModal` wrappers that accept i18n keys. Original `message`/`notification`/`modal` proxies kept intact so existing 929 call sites keep working; new code (and Phase 4 migrations) can opt into the `t*` variants gradually.
- [x] Created [src/shared/utils/validationRules.js](src/shared/utils/validationRules.js) — `req()`, `email()`, `minLen(n)`, `maxLen(n)`, `pattern(re)`, `phone()` helpers returning AntD rule objects pulling from `common:validation.*`.
- [x] `common.json` populated in Phase 1: `buttons.*`, `status.*`, `table.*`, `pagination.*`, `validation.*`, `duration.*`, `dateFormat.*`, `empty.*`, `language.*` — all 5 locales.

---

## Phase 3 — Backend error-code refactor (~3 days) ✅ FOUNDATION DONE

**Design pivot from original plan:** instead of nesting errors as `{ error: { code, message } }` (a breaking shape change), we kept the flat shape and only **added** a `code` field: `{ error: "...", code: "AUTH_X", errorParams? }`. This is additive — all 200+ existing frontend call sites reading `err.response.data.error` keep working, and Phase 4 migrations can opt into codes as each route is touched.

- [x] Created [backend/shared/errorCodes.js](backend/shared/errorCodes.js) — `ERROR_CODES` enum + `sendError(res, status, code, fallback, extra)` helper. Pre-seeded with all codes already in use (`LOGIN_DISABLED`, `VOUCHER_INVALID`, etc.) plus 13 new auth codes + generic codes.
- [x] Created [src/i18n/errorCodes.js](src/i18n/errorCodes.js) — `ERROR_KEY_MAP` that maps each code to an i18n key under the `errors` namespace.
- [x] Added `errors` namespace to [src/i18n/index.js](src/i18n/index.js) config (now loads `common` + `errors`).
- [x] Created `public/locales/{en,tr,fr,ru,es}/errors.json` — full translations for all codes (TR hand-written, others AI-drafted).
- [x] Created [src/shared/utils/apiError.js](src/shared/utils/apiError.js) — `getErrorMessage(err, fallback)` + `getErrorCode(err)` helpers for call sites.
- [x] Added translation step to [src/shared/services/apiClient.js](src/shared/services/apiClient.js) response interceptor — reads `data.code`, resolves key, translates, attaches `err.translatedMessage`, and overwrites `err.response.data.error` with the translated string so legacy call sites get the translation for free.
- [x] Migrated `backend/routes/auth.js` login + authenticateJWT middleware error responses (12 responses) as the working reference pattern — verified end-to-end with a test login returning `{ error, code: AUTH_INVALID_CREDENTIALS }`.
- [ ] **Remaining route migrations** — done incrementally during Phase 4, one role at a time. Each migration is additive (`code: ERROR_CODES.X` added to existing `res.json({ error: '...' })`), minimizing risk.
  - [ ] `auth.js` remaining (password reset, change password, logout, register)
  - [ ] `users.js`
  - [ ] `bookings.js`, `calendars.js`
  - [ ] `instructors.js`, `students.js`
  - [ ] `finances.js`, `rentals.js`, `products.js`, `accommodation.js`, `repairs.js`
  - [ ] `admin.js`, `settings.js`, `roles.js`, rest

---

## Phase 4 — Role-by-role rollout

Each role gets its own lazy-loaded namespace JSON. Dependency chain: **Common → Public → Outsider → Student → Instructor → Manager → Admin**.

### Public / Auth (~200 strings) — `public.json` ✅ AUTH DONE

- [x] `src/features/authentication/**` — Login, RegisterModal, Reset/Forgot Password
  - [x] [Login.jsx](src/features/authentication/pages/Login.jsx) — fully migrated with `t('public:login.*')`
  - [x] [RegisterModal.jsx](src/features/authentication/components/RegisterModal.jsx) — all labels, placeholders, validation messages, step titles, buttons translated (country list + phone codes kept as-is, they don't need translation)
  - [x] [ForgotPasswordModal.jsx](src/features/authentication/components/ForgotPasswordModal.jsx) — fully migrated; also fixed pre-existing bug (missing `message` import)
  - [x] [ResetPassword.jsx](src/features/authentication/pages/ResetPassword.jsx) — fully migrated including Trans component for `<strong>{{email}}</strong>` interpolation
- [ ] Terms, Privacy, AboutUs (if they exist — not found in current scan)
- [x] [src/App.jsx](src/App.jsx) top-level chrome — `Loading...`, `Continue Anyway`, emergency `Logout`, consent toasts migrated via new `common:app.*` keys (added to all 5 locales)

### Outsider (~1,500–2,000 strings — larger than planned) — `outsider.json` 🚧 IN PROGRESS

**Scope reality check:** actual feature has 33 pages + 24 components (1,500–2,000 strings), not 250. Migrating incrementally.

- [x] Namespace `outsider.json` created for all 5 locales with shared `landing.*` keys
- [x] [GuestLandingPage.jsx](src/features/outsider/pages/GuestLandingPage.jsx) (275L, ~70 strings) — entry-point hub with 8 service cards, all translated including sub-item lists via `returnObjects: true`, used `<Trans>` for the description with `<urla>` and `<duotone>` highlight spans
- [x] [AcademyLandingPage.jsx](src/features/outsider/pages/AcademyLandingPage.jsx) (392L, ~120 strings) — 5 discipline hero sections (Kite, Wing, Foil, E-Foil, Premium) + sticky nav + FAQ section all translated
- [x] [RentalLandingPage.jsx](src/features/outsider/pages/RentalLandingPage.jsx) (319L, ~100 strings) — 4 tier sections (Standard, SLS, D-LAB, E-Foil) + nav + FAQ
- [x] [StayLandingPage.jsx](src/features/outsider/pages/StayLandingPage.jsx) (218L, ~80 strings) — Home + Hotel sections, brand subtitle, FAQ
- [x] [ExperienceLandingPage.jsx](src/features/outsider/pages/ExperienceLandingPage.jsx) (234L, ~90 strings) — 4 package sections (Kite, Wing, Downwinders, Camps) + FAQ; sections array rebuilt via i18n keys
- [ ] [ShopLandingPage.jsx](src/features/outsider/pages/ShopLandingPage.jsx) (608L, ~180 strings)
- [ ] [ContactPage.jsx](src/features/outsider/pages/ContactPage.jsx) (226L, ~80 strings)
- [ ] [CareLandingPage.jsx](src/features/outsider/pages/CareLandingPage.jsx) (560L, ~200 strings incl. AntD form)
- [x] **Discipline lesson pages — KiteLessonsPage done**:
  - [x] [KiteLessonsPage.jsx](src/features/outsider/pages/KiteLessonsPage.jsx) (was 583L) — 4 fallback packages (Beginner/Group/Advanced/Supervision) fully translated incl. durations/badges/highlights/modal chrome/FAQ
  - [ ] FoilLessonsPage, WingLessonsPage, EFoilLessonsPage, PremiumLessonsPage — (smaller pages, similar pattern)
- [x] **Rental card internals + auto-labels** (affects all lesson/rental pages that render cards):
  - [x] [AcademyLessonPackageCard.jsx](src/features/outsider/components/AcademyLessonPackageCard.jsx) — FROM, OWNED, Active Package, SESSION/LESSON/BUNDLE/PACKAGE fallbacks, No image uploaded
  - [x] AcademyServicePackagesPage auto-generated labels: Quick Session, Half Day, Full Day, "X weeks rental", Equipment included, Multi-sport compatible, Daily safety checks, Book directly, Contact us, Flexible, Custom, Choose nights, Per Night, Accommodation, Configured Package, Progress-based sessions, Professional instruction, Flexible durations, Individual Lesson, Single Session, Package owned, remaining, Sign in to Book auth modal
- [x] **Rental sub-pages + shared component** — also cleaned up 283L of dead code in RentalStandardPage:
  - [x] [RentalStandardPage.jsx](src/features/outsider/pages/RentalStandardPage.jsx) (was 437L with dead code, now 119L) — rewrote cleanly, package data (names/descriptions/highlights/badges/duration labels) all resolved via `t('outsider:rentalStandard.packages.*', { returnObjects: true })`
  - [x] [RentalPremiumPage.jsx](src/features/outsider/pages/RentalPremiumPage.jsx) (281L) — standalone layout with SLS/D-LAB/Foil Board packages fully migrated
  - [x] [AcademyServicePackagesPage.jsx](src/features/outsider/components/AcademyServicePackagesPage.jsx) shared component chrome — discipline filter labels, "All Services" button, empty states, FAQ section, Contact Us button. This also translates the /rental/sls, /rental/dlab, /rental/efoil showcase pages (which all wrap this shared component with CMS-sourced package data).
- [ ] Detail pages — ProductDetailPage, StayBookingPage
- [x] [ExperienceBookPackagePage.jsx](src/features/outsider/pages/ExperienceBookPackagePage.jsx) — PackageList sub-component fully migrated (back button, available packages label, loading/empty states, owned badge, hoursLeft, purchase/buyAgain buttons)
- [x] Public booking modals — all 4 migrated (~4,000L combined):
  - [x] [AccommodationBookingModal.jsx](src/features/outsider/components/AccommodationBookingModal.jsx) — calendar legend/hints, guests, payment methods, deposit breakdown, summary, submit buttons, validation, toasts
  - [x] [RentalBookingModal.jsx](src/features/outsider/components/RentalBookingModal.jsx) — DateStep, PayStep, DoneStep, main modal (stepTitles, confirm dialog, toasts)
  - [x] [AllInclusiveBookingModal.jsx](src/features/outsider/components/AllInclusiveBookingModal.jsx) — DateStep, RentalStep, LessonStep, PaymentStep, main modal (steps array, package summary tags, alerts, nav buttons, confirm dialog)
  - [x] [QuickBookingModal.jsx](src/features/outsider/components/QuickBookingModal.jsx) — PayStep, SessionSlotRow, ScheduleStep, DoneStep, main modal (stepTitles, visibleSteps, step counter, confirm dialogs, toasts)
- [ ] `src/features/forms/public/**` — public forms, group invitations

### Student / Trusted Customer (~300 strings) — `student.json`
- [ ] `src/features/students/**` — StudentDashboard, MyBookings, MyProfile, Family
- [ ] `src/features/feedback/**`
- [ ] Student-facing slices of `src/features/bookings/**`

### Instructor (~350 strings) — `instructor.json`
- [ ] `src/features/instructor/**` + `src/features/instructors/**`
- [ ] Instructor slices of `src/features/calendars/**` and `src/features/bookings/**`
- [ ] `src/features/repairs/**` (instructor view)

### Manager (~500 strings) — `manager.json`
- [ ] `src/features/manager/**`
- [ ] `src/features/finances/**` (15 subpages)
- [ ] `src/features/equipment/**`, `src/features/rentals/**`, `src/features/products/**`
- [ ] `src/features/accommodation/**`, `src/features/marketing/**`, `src/features/events/**`
- [ ] `src/features/quicklinks/**`, `src/features/services/**`

### Admin (~700 strings) — `admin.json`
- [x] `src/features/admin/**`, `src/features/settings/**`
- [x] `src/features/compliance/**`, `src/features/members/**`, `src/features/community/**`
- [x] Waivers, legal, support tickets, spare parts, vouchers, deleted bookings
- [x] All 6 locale files written and validated (en, tr, fr, ru, es, de)
- [ ] Component files migrated to `useTranslation(['admin'])` + `t('admin:key')` calls

### Errors (~80 strings) — `errors.json`
- [ ] One key per backend error code from Phase 3

### Developer pages — **skip** (English-only is acceptable)

---

## Phase 5 — Translation generation

- [ ] Add `i18next-parser.config.js` at repo root; `npx i18next-parser 'src/**/*.{js,jsx}'` emits EN source + empty stubs for `tr/fr/ru/es`
- [ ] Create `scripts/i18n-translate.mjs`:
  - Reads `en/<ns>.json`, chunks ~50 keys at a time
  - Calls Anthropic SDK: "Translate this JSON. Keep keys. Preserve `{{vars}}`. Output JSON only."
  - Writes `tr/ns.json`, `fr/ns.json`, `ru/ns.json`, `es/ns.json` with `_meta: { ai_drafted: true, reviewed: false }`
- [ ] User reviews TR natively; FR/RU/ES stay flagged `_needs_review: true` until a reviewer is engaged

---

## Phase 6 — Verification

- [ ] Parity test `src/i18n/__tests__/parity.test.js` — every key in `en/` exists in `tr,fr,ru,es`; fail build on missing
- [ ] Playwright smoke per locale: login → each role's dashboard → assert no raw keys or `[missing:…]` in DOM
- [ ] Manual QA walkthrough per language covering 5 critical flows:
  1. Login / register
  2. Book a lesson (student)
  3. Instructor schedule
  4. Manager finance dashboard
  5. Admin settings page
- [ ] Screenshot-compare currency/date formatting in EN vs TR (separator differences `1,000` vs `1.000`)

---

## Risks & gotchas

- **Pluralization** — use i18next suffix keys (`booking_one`, `booking_other`, and `_few` for RU). Never concatenate `${count} ${word}`.
- **Long words (RU/TR)** — audit tables/buttons in manager & admin modules; add `whitespace-nowrap` + AntD `Tooltip` fallbacks.
- **AntD embedded text** — `ConfigProvider locale={tr_TR}` covers most built-ins. Custom `<Empty description=…>` instances still need manual `t()`.
- **Currency separator shift** — changing from `'en-US'` to locale-aware `Intl.NumberFormat` will change thousand/decimal separators. Verify dashboards.
- **Missing-key fallback** — `fallbackLng:'en'`, `returnEmptyString:false`. Dev shows `[missing:key]`; prod silently falls back to EN.
- **Residual `dayjs.locale('en')` global** at [src/main.jsx:16](src/main.jsx#L16) must be removed, or DatePicker headers stay English.
- **SVG/image text** — any baked-in text in hero banners or marketing images requires design work; not in this phase.
- **Backend tests** — some route tests may assert `error.message` strings. Switch to asserting `error.code` during migration.
- **No RTL needed** — none of the 5 languages is RTL.

---

## Realistic time estimate

| Phase | Effort |
|---|---|
| 1. Foundation | 1 day |
| 2. Shared utils + common.json | 2 days |
| 3. Backend error codes | 3 days |
| 4a. Public + Outsider | 3 days |
| 4b. Student | 2 days |
| 4c. Instructor | 3 days |
| 4d. Manager | 5 days |
| 4e. Admin | 6 days |
| 5. AI translation pipeline + review | 2 days |
| 6. QA + fixes | 3 days |
| **Total** | **~30 working days (6 weeks, solo)** |

Can be parallelized to ~4 weeks with two developers (one on backend codes + Manager, one on frontend namespaces).

---

## Recommended shipping strategy

The plan is structured so **each role checkbox is independently shippable**. If time runs short:

1. Ship **Phase 1–3 + Public + Outsider + Student** first — covers 100% of paying-customer experience in all 5 languages.
2. Ship Instructor next.
3. Ship Manager + Admin last — internal ops can stay English longer without user impact.

Untouched modules silently fall back to EN, so a half-complete rollout is safe in production.

---

## Critical files to modify

- [src/main.jsx](src/main.jsx) — ConfigProvider + dayjs wiring
- [src/shared/utils/formatters.js](src/shared/utils/formatters.js) — locale-aware formatters
- [src/shared/utils/antdStatic.js](src/shared/utils/antdStatic.js) — `tMessage` wrapper
- `src/shared/components/LanguageSwitcher.jsx` — **new**, mounted in AppHeader
- `src/i18n/` — **new** directory
- `public/locales/{en,tr,fr,ru,es}/` — **new**, translation JSON tree
- `backend/shared/errorCodes.js` — **new**, error code catalog
- `backend/routes/*.js` — shape change to `{ error: { code, message } }`
