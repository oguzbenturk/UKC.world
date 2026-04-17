# Plan: Rebrand Akyaka deployment to Plannivo + local dev environment

Status: draft — pending user approval to execute.

## Context

`akyaka.plannivo.com` is a separate customer deployment but currently reuses Plannivo's `dist/` — visitors see **UKC./Duotone Pro Center Urla** branding even though this is a different customer. The new customer doesn't have their own brand name yet; they'll operate inside the app as a Plannivo tenant, with `akyaka` as a throwaway subdomain.

Three concrete problems today:

1. Hitting `/` as an unauthenticated user shows a video‑hero marketing page built for UKC (kite school in Urla). This deployment has no public website — it's app‑only.
2. Throughout the app (navbar, login, emails, waivers, og‑tags, JSON‑LD, a teal color palette), UKC and Duotone Pro Center strings/assets appear hard‑coded.
3. **Local dev for Akyaka does not exist yet.** The only dev environment on the user's PC points at Plannivo's local Docker DB (`plannivo_dev`). To iterate on Akyaka rebrand changes safely, we need a parallel, fully isolated local Akyaka dev stack — mirroring what was set up on the VPS.

**Goal:** Turn the Akyaka deployment into a clean "Plannivo"‑branded app with:
- No public landing — `/` goes straight to login.
- Navbar word‑mark: "Plannivo" on a white/black header.
- Palette: black & white heavy with **deep navy `#1E3A8A`** as the single accent (replacing Duotone teal `#00a8c4`).
- Every UKC/Duotone/Urla/Pro Center string replaced with "Plannivo" (or a neutral placeholder for legal copy).
- A working `npm run dev:akyaka` / `npm run db:akyaka:up` / `npm run db:akyaka:sync` workflow so changes can be tested locally against an isolated Akyaka dev DB before deploying via `push-akyaka`.

**Scope lock (decided):**
- **Branch target:** `Akyaka` branch **only**. Plannivo main stays on current UKC branding. Deploy via `npm run push-akyaka`.
- **Accent blue:** `#1E3A8A` (deep navy).
- **Public marketing pages:** `/`, `/shop`, `/stay`, `/experience`, `/kite-lessons`, `/rental`, `/care`, `/academy`, `/contact`, `/guest` all redirect to `/login` for unauthenticated users.
- **Legal content:** neutral placeholder `[Company Name]` — the customer fills in their real entity later.

---

## Phase 0 — Local Akyaka development environment

Mirrors the server-side isolation pattern (`COMPOSE_PROJECT_NAME=akyaka`, separate ports, separate volumes) on the local machine. Runs **in parallel** to the user's existing Plannivo/UKC local dev.

### Hard isolation guarantee

The two dev stacks must have **zero shared state**. Anything that could let Akyaka code write to Plannivo UKC dev data (or vice versa) is a bug.

| Dimension              | Plannivo UKC dev (existing) | Akyaka dev (new)                  | Shared? |
|------------------------|-----------------------------|-----------------------------------|---------|
| Docker project name    | default (`plannivo-akyaka`) | `COMPOSE_PROJECT_NAME=akyaka-dev` | No      |
| Container names        | `plannivo-dev-db`, `plannivo-dev-redis` | `plannivo-akyaka-dev-db`, `plannivo-akyaka-dev-redis` | No |
| Host port — Postgres   | 5432                        | 5434                              | No      |
| Host port — Redis      | 6379                        | 6380                              | No      |
| Host port — backend    | 4000                        | 4001                              | No      |
| Host port — frontend   | 3000                        | 3001                              | No      |
| Docker volume — pg     | `postgres_dev_data`         | `postgres_akyaka_dev_data`        | No      |
| Docker volume — redis  | `redis_dev_data`            | `redis_akyaka_dev_data`           | No      |
| DB name                | `plannivo_dev`              | `akyaka_dev`                      | No      |
| JWT_SECRET             | plannivo dev secret         | *different* akyaka dev secret     | No      |
| Env file               | `backend/.env`              | `backend/.env.akyaka.development` | No      |
| Uploads dir            | `backend/uploads/`          | `backend/uploads-akyaka/`         | No      |
| npm scripts            | `dev`, `db:dev:*`, `db:sync` | `dev:akyaka`, `db:akyaka:*`, `db:akyaka:sync` | No |
| Deploy script          | `push-all`                  | `push-akyaka`                     | No      |
| Prod secrets file      | `.deploy.secrets.json`      | `.deploy.secrets.akyaka.json`     | No      |
| node_modules           | **shared** (same repo/worktree) | **shared** (same repo/worktree) | **Yes** — only code is shared |

**Only the source code itself is shared.** That's the point of the fork — same codebase, different brand customizations on different branches.

### Runtime safety rails

Beyond naming/ports, each Akyaka-scoped script must programmatically refuse to run against Plannivo UKC resources:

- `scripts/dev-akyaka.js` — on startup, parses `DATABASE_URL` and aborts if:
  - port is `5432` (Plannivo UKC dev), OR
  - DB name is `plannivo_dev` or `plannivo`, OR
  - container resolves to `plannivo-dev-db`.
- `scripts/db-sync-akyaka-from-prod.js` — aborts if:
  - local target container is `plannivo-dev-db`, OR
  - remote host matches `.deploy.secrets.json` host *and* remote container name isn't `akyaka-*`.
- `push-akyaka.js` (already has these per memory: refuses if `DATABASE_URL`/`JWT_SECRET` match Plannivo's, refuses if `remotePath` is `/root/plannivo`) — keep unchanged.
- `docker-compose.akyaka-development.yml` — all ports bound to `127.0.0.1:<port>` only (never `0.0.0.0`), same as existing dev compose.

### Stronger option: separate repo checkout per brand (recommended)

The cleanest "completely isolated" setup is two physical directories:

- `D:\Plannivo\`  — checkout on `main` branch, existing UKC dev stack.
- `D:\Plannivo-Akyaka\` — checkout on `Akyaka` branch, new Akyaka dev stack. **(This path is where the current worktree lives, so it's already partially set up.)**

Each has its own `node_modules`, its own `.env` files, its own Docker stack, its own editor state. Switching brands is a directory switch. Cross-contamination is impossible because the scripts in `D:\Plannivo\` literally cannot see the files in `D:\Plannivo-Akyaka\`.

If the user prefers the single-repo dual-stack approach, the in-script safety rails above still prevent data cross-writes — but the separate-checkout path is structurally safer.

**Port allocation** (Plannivo UKC dev keeps its current ports; Akyaka dev takes the next free slots):

| Role                | Plannivo UKC (existing) | Akyaka (new)              |
|---------------------|-------------------------|---------------------------|
| Frontend (Vite)     | 3000                    | **3001**                  |
| Backend (Express)   | 4000                    | **4001**                  |
| Postgres            | 5432                    | **5434**                  |
| Redis               | 6379                    | **6380**                  |
| Container prefix    | `plannivo-dev-*`        | `plannivo-akyaka-dev-*`   |
| Volumes             | `postgres_dev_data` etc.| `postgres_akyaka_dev_data` etc. |
| DB name             | `plannivo_dev`          | `akyaka_dev`              |

### Files to create

1. **`docker-compose.akyaka-development.yml`** — clone of `docker-compose.development.yml` with all names, ports, volumes, and DB name swapped to the Akyaka values above. Same Postgres 15 + Redis 7 images as UKC dev so versions match production.

2. **`backend/.env.akyaka.development.example`** — committed template. Concrete values (secrets) go into the gitignored `backend/.env.akyaka.development`. Keys:
   ```
   PORT=4001
   DATABASE_URL=postgres://plannivo:password@localhost:5434/akyaka_dev
   REDIS_URL=redis://localhost:6380
   JWT_SECRET=akyaka_dev_jwt_change_me    # MUST differ from plannivo dev
   NODE_ENV=development
   # + any other keys copied from backend/.env.example with dev-safe defaults
   ```
   Add `backend/.env.akyaka.development` to `.gitignore`.

3. **`scripts/db-sync-akyaka-from-prod.js`** — adapt `scripts/db-sync-from-prod.js`. Differences:
   - Reads `.deploy.secrets.akyaka.json` (already exists per project memory).
   - On the remote: `docker exec akyaka-db-1 pg_dump -U plannivo --clean --if-exists akyaka` (confirm container name on the server; may be `akyaka_db_1`).
   - Restores into local container `plannivo-akyaka-dev-db` on port 5434, DB `akyaka_dev`.
   - Safety rail: refuse to run if it resolves to host `localhost` with port 5432 (would clobber Plannivo dev). Same pattern as `push-akyaka.js` safety rails described in memory.

4. **`scripts/dev-akyaka.js`** — thin launcher that:
   - Verifies `plannivo-akyaka-dev-db` is up (else exits with instructions to run `npm run db:akyaka:up`).
   - Spawns the backend in a child process with env `DOTENV_CONFIG_PATH=backend/.env.akyaka.development` (or loads that file and exports the vars) and `PORT=4001`.
   - Spawns Vite with `VITE_DEV_PORT=3001 BACKEND_API_URL=http://localhost:4001 npm run dev:frontend`.
   - Uses `concurrently` just like the existing `npm run dev`.

   *Alternative lighter approach:* skip the launcher and just add a `dev:akyaka` npm script that chains the env-prefixed commands directly. Implementation will pick whichever is cleanest on Windows (cross-env may be needed since the user is on Windows per env info).

### Backend env loading — minor refactor

The backend currently loads `backend/.env` via `dotenv.config()`. Audit [backend/server.js](backend/server.js) and any `dotenv.config` calls:
- Accept a `DOTENV_CONFIG_PATH` env var so the launcher can point it at `.env.akyaka.development`.
- Fall back to the current behavior (`backend/.env`) when unset, so UKC dev is untouched.

If `dotenv.config` is called in multiple places, centralize through a single `backend/config/loadEnv.js` helper.

### package.json scripts (root)

Add:
```
"db:akyaka:up":    "docker compose -f docker-compose.akyaka-development.yml up -d",
"db:akyaka:down":  "docker compose -f docker-compose.akyaka-development.yml down",
"db:akyaka:reset": "docker compose -f docker-compose.akyaka-development.yml down -v && docker compose -f docker-compose.akyaka-development.yml up -d",
"db:akyaka:sync":  "node scripts/db-sync-akyaka-from-prod.js",
"dev:akyaka":      "node scripts/dev-akyaka.js",
"dev:akyaka:frontend": "cross-env VITE_DEV_PORT=3001 BACKEND_API_URL=http://localhost:4001 vite",
"dev:akyaka:backend":  "cross-env DOTENV_CONFIG_PATH=../backend/.env.akyaka.development npm run dev --prefix backend"
```
May need to add `cross-env` as a devDependency (check if already present).

### Bootstrap the local Akyaka DB

First-time flow (document in the plan's "How to use" section below):
```
npm run db:akyaka:up       # start isolated containers
npm run db:akyaka:sync     # pull Akyaka prod schema + data into local
npm run dev:akyaka         # launch backend:4001 + frontend:3001
```
Subsequent days just need `db:akyaka:up` (if Docker was stopped) and `dev:akyaka`.

### Safety invariants (document in each script header)

- `dev:akyaka` refuses to start if `DATABASE_URL` ends in `plannivo_dev` or uses port 5432 — prevents Akyaka backend from writing to Plannivo dev DB.
- `db:akyaka:sync` refuses if `.deploy.secrets.akyaka.json`'s host equals `.deploy.secrets.json`'s host AND the container name is Plannivo's — cheap sanity check.
- Both Docker containers bind to `127.0.0.1:<port>` only, not `0.0.0.0` — same pattern as existing dev compose.

Phase 0 is **independent** of all rebrand work — it must be merged and tested before Phase A starts so that Phase A changes can actually be exercised locally.

---

## Phase A — Routing: remove the public marketing surface

**Files**

- [src/routes/AppRoutes.jsx:322](src/routes/AppRoutes.jsx) — change the `/` route so unauthenticated users land on `/login` instead of `<PublicHome />`.
- [src/routes/AppRoutes.jsx:346‑358](src/routes/AppRoutes.jsx) and the rest of that file — audit every public `<Route>` (`/shop*`, `/stay`, `/experience`, `/kite-lessons`, `/rental`, `/care`, `/academy`, `/contact`, `/guest`, etc.) and gate each behind auth: unauthenticated → `Navigate to="/login"`, authenticated staff → role-appropriate dashboard.
- Remove the `featureFlags.publicShopEnabled` guard branch for Akyaka (hard‑code the "no public browse" path). Check [src/shared/config/featureFlags.js].
- **Delete** [src/features/public/PublicHome.jsx].
- **Delete** the landing video asset [DuotoneFonts/backgroundvideo.mp4] (large, no longer referenced).

Routes that must **stay** public (they're transactional links sent to real users): `/login`, `/register`, `/reset-password`, `/payment/callback`, `/group-invitation/:token`, `/quick/:linkCode`, `/f/:linkCode`, `/f/success/:linkCode`, `/forms/preview/:id`.

**Components becoming unused** (delete after route removal is verified):
[ShopLandingPage.jsx], [StayLandingPage.jsx], [ExperienceLandingPage.jsx], [KiteLessonsPage.jsx], [RentalLandingPage.jsx], [CareLandingPage.jsx], [AcademyLandingPage.jsx], [ContactPage.jsx], [GuestLandingPage.jsx] under `src/features/outsider/pages/`, plus any shared outsider components no remaining page imports.

---

## Phase B — Identity: swap UKC word‑mark for Plannivo

**Refactor the brand primitive**

- [src/shared/components/ui/UkcBrandDot.jsx] → rename file to `BrandWordmark.jsx`; export `BrandWordmark` (renders "Plannivo" in `font-gotham-bold`) and `BrandDot` (optional accent). Keep the same prop API so callers don't break.
- Update all 13 import sites: [src/App.jsx:228], [Navbar.jsx:20], [AuthModal.jsx], [Login.jsx], [FormSuccessPage.jsx], [MemberOfferings.jsx], [AcademyBrandLockup.jsx], plus the outsider landing pages (which are being deleted).
- [src/App.jsx:227‑231] limited-access header: "UKC World" → "Plannivo".
- Add `BRAND_NAME = 'Plannivo'` to [src/shared/constants/version.js] so future rebrands touch one file.

**HTML & SEO**

- [index.html] — rewrite `<title>`, `meta[name=description]`, all `og:*` and `twitter:*` tags, `og:image` URL, canonical URL, and both JSON-LD blocks (`Organization.name`, `WebSite.name`). Target copy: `<title>Plannivo</title>`, description: `"Plannivo — watersports academy management"`.
- [index.html:19] `theme-color` → `#0A0A0A` or `#FFFFFF`.
- [public/logo.svg] + [public/logo.png] — replace with neutral black-on-transparent "Plannivo" mark. Ship a text-based SVG placeholder until final asset exists.
- [public/og-image.svg] + [public/og-image.png] — replace with a 1200×630 Plannivo card (black bg, white wordmark).
- [public/llms.txt] — rewrite; drop all UKC/Duotone/Urla references.
- If `public/manifest.json`/`site.webmanifest` exists: update `name`, `short_name`, `theme_color`, `background_color`, icons.

**Page SEO strings**

- [src/features/authentication/pages/Login.jsx:54‑55] — "Login | UKC•" → "Login | Plannivo".
- [src/features/help/pages/HelpSupport.jsx:54‑55] — "Help & Support | UKC. …" → "Help & Support | Plannivo".
- [src/shared/components/layout/Navbar.jsx:621] — "Sign In to UKC•" → "Sign In".

---

## Phase C — Palette: black/white + deep navy accent

**Theme tokens**

- [tailwind.config.js:18‑21] — replace `duotone-blue: '#00a8c4'` with:
  ```
  'brand-ink':       '#0A0A0A',
  'brand-paper':     '#FFFFFF',
  'brand-navy':      '#1E3A8A',
  'brand-navy-soft': '#3B5BCD',
  ```
  Keep `duotone-blue` as an alias pointing to `#1E3A8A` for one commit so the 318 existing references don't break the build mid-migration; remove the alias in a follow-up commit after grep confirms zero usages.
- [src/main.jsx:70‑83] Ant Design `ConfigProvider`:
  - `colorPrimary`, `colorInfo` → `#1E3A8A`
  - `Button.colorPrimaryHover` → `#1E3A8A`
  - `Button.colorPrimaryActive` → `#152A5F`
  - Keep `colorSuccess` / `colorWarning` unchanged.

**Navbar & sidebar re-skin**

- [src/shared/components/layout/Navbar.jsx] — replace the dark gradient header with a plain white bar (`bg-white border-b border-neutral-200`) and black text. Active NavLink underline uses `brand-navy`. Focus rings: `focus:ring-[#1E3A8A]`. Remove inline `rgba(0,168,196,…)` at [Navbar.jsx:631].
- [src/styles/sidebar.css] — replace dark gradient with white (`background: #FFFFFF`), borders `#E5E5E5`, active item fill `#1E3A8A` with white text.
- Update `BrandWordmark` default text color from `text-white` → `text-neutral-900` now that header is white.

**Global grep-and-replace (57 files, 318 occurrences)**

After the Tailwind alias is live:
- `duotone-blue` → `brand-navy`
- `#00a8c4` → `#1E3A8A`
- `rgba(0, 168, 196,` → `rgba(30, 58, 138,`

Areas to spot-check: auth pages, community pages (TeamPage, InstructorDetailDrawer gradients), shop/dashboard cards, Kai chat, WhatsApp modal, sticky nav, member banners, booking drawers, progress bars. Community cyan gradients should become `from-neutral-900 to-brand-navy`. Eyeball each section to keep the black/white/navy feel coherent.

**Remove the emerald dot** from `BrandDot` ([UkcBrandDot.jsx:9](src/shared/components/ui/UkcBrandDot.jsx) `bg-emerald-400`). Plannivo lockup is a clean wordmark; no punctuation dot.

---

## Phase D — Downstream surfaces

**Emails**

- [backend/services/formEmailNotificationService.js:553,588] — "Welcome to UKC.world!" → "Welcome to Plannivo" (HTML + plaintext).
- [backend/routes/bookings.js:4252,4273] — reschedule email subject & footer → "Plannivo".
- Grep `backend/services/` and `backend/routes/` for `UKC`, `ukc.world`, `Duotone`, `Pro Center` — fix every hit.

**Legal / waiver / forms**

- [backend/config/waiverContent.js] — "DUOTONE PRO CENTER" → `[Company Name]`.
- [backend/db/form-templates/dpc-instructor-registration.json] — title, "Powered by UKC.world", `https://ukc.world` → "Powered by Plannivo" / `https://plannivo.com`. Rename file to `instructor-registration.json`; update seed scripts that reference the old filename.
- **New migration** (do NOT edit the already-applied [backend/db/migrations/131_populate_legal_documents.sql]): create `backend/db/migrations/24X_plannivo_rebrand_legal_docs.sql` with `UPDATE` statements that swap "Duotone Pro Center" → `[Company Name]`, "Urla" → `[City]`, "Turkey" → `[Country]`, `ukc.world` → `plannivo.com` in `legal_documents` rows. Run `npm run migrate:up` locally per CLAUDE.md workflow rules (against the **Akyaka** local DB from Phase 0). Migration applies to Akyaka prod on next `push-akyaka`.

**Constants / configs**

- [backend/constants/vendorCatalogs.js] — "Duotone" here is the **equipment brand** (the shop sells Duotone kites), not the Pro Center. **Keep as-is**; add a comment clarifying the distinction.
- [src/shared/constants/duotoneImages.js] — rename to `equipmentImages.js`; update 1–2 import sites.

**Fonts**

Keep `DuotoneFonts/QualityFonts/` and the Tailwind `duotone-*` font keys. Users never see these strings — internal-only. Optional future cleanup: rename keys to `brand-*`.

**Docs**

- [CLAUDE.md:1] — remove "(UKC.world)".
- [DESIGN.md:1] — same.

---

## Phase E — Asset cleanup

Once Phase A deletions are verified with `npm run dev:akyaka` (no import errors):

- Delete [DuotoneFonts/DPSLOGOS/] (DPC logos, `D.svg`, `duotone-kiteboarding-d_lab-logo-new-2026.png`, `sls.png`). Verify no remaining imports first.
- Delete [DuotoneFonts/backgroundvideo.mp4].
- Keep [DuotoneFonts/QualityFonts/] (typefaces).

---

## Verification

Run with `npm run dev:akyaka` (frontend :3001, backend :4001, local Akyaka DB).

**Unauthenticated flows:**
1. `http://localhost:3001/` → lands on `/login`, shows "Plannivo" wordmark, no video, no UKC/Duotone text.
2. `http://localhost:3001/shop`, `/stay`, `/experience`, `/kite-lessons`, `/rental`, `/care`, `/academy`, `/contact`, `/guest` → each redirects to `/login`.
3. Page source of `/login` → no "UKC", "Duotone", "Urla", "Pro Center".
4. Tab title reads "Plannivo" ("Login | Plannivo" on /login).
5. Favicon swapped to Plannivo placeholder.

**Authenticated flows** (log in as admin):
6. Navbar: white background, black "Plannivo" wordmark, no teal anywhere.
7. Open booking/customer/student pages → accents are navy `#1E3A8A`, never teal.
8. Ant Design modal primary button → navy.
9. Student dashboard progress bars → navy.
10. Help & Support tab title → "Help & Support | Plannivo".

**Text audit (mechanical):**
11. `grep -riE 'ukc|duotone pro|pro center|urla' src/ backend/ index.html public/` — remaining hits should only be (a) font filenames, (b) the `vendorCatalogs.js` comment, or (c) already-applied migration SQL files.
12. `grep -r 'duotone-blue' src/` → zero after alias removal.

**Email audit:**
13. Trigger welcome + reschedule emails in the local Akyaka dev flow; inspect rendered HTML — no UKC.world strings, signed "Plannivo".

**Isolation audit (Phase 0):**
14. Start `npm run dev:akyaka` and `npm run dev` in separate terminals — both run simultaneously. Confirm Plannivo UKC dev (:3000) still shows UKC branding and hits `plannivo_dev` DB, Akyaka (:3001) shows Plannivo branding and hits `akyaka_dev` DB. No cross-talk.
15. `docker ps` shows both sets of containers running; volumes remain separate across a `db:akyaka:reset`.

**Deployment:**
16. Merge worktree branch into `Akyaka`, run `npm run push-akyaka`. Confirm `push-akyaka` safety rails still pass.
17. Open `https://akyaka.plannivo.com/` incognito, repeat steps 1–5 in production.

---

## Critical files to modify / create (summary)

| Purpose | File |
|---|---|
| **Phase 0 dev env** | |
| Docker compose for Akyaka local | `docker-compose.akyaka-development.yml` (new) |
| Backend env template | `backend/.env.akyaka.development.example` (new) |
| DB sync from Akyaka prod | `scripts/db-sync-akyaka-from-prod.js` (new) |
| Dev launcher | `scripts/dev-akyaka.js` (new) |
| Backend env loader | `backend/server.js` (or a new `backend/config/loadEnv.js`) |
| Root scripts | `package.json` (new `db:akyaka:*`, `dev:akyaka*`) |
| gitignore | `.gitignore` (add `backend/.env.akyaka.development`) |
| **Rebrand** | |
| Route gating | [src/routes/AppRoutes.jsx] |
| Landing removal | [src/features/public/PublicHome.jsx] (delete) |
| Brand word-mark | [src/shared/components/ui/UkcBrandDot.jsx] (rewrite + rename) |
| Limited-access header | [src/App.jsx:222‑248](src/App.jsx) |
| HTML metadata | [index.html] |
| Tailwind palette | [tailwind.config.js] |
| Ant Design theme | [src/main.jsx:68‑83](src/main.jsx) |
| Navbar skin | [src/shared/components/layout/Navbar.jsx] |
| Sidebar skin | [src/styles/sidebar.css] |
| Welcome email | [backend/services/formEmailNotificationService.js] |
| Booking emails | [backend/routes/bookings.js] |
| Waiver copy | [backend/config/waiverContent.js] |
| Legal docs migration | `backend/db/migrations/24X_plannivo_rebrand_legal_docs.sql` (new) |
| Form template | [backend/db/form-templates/dpc-instructor-registration.json] |
| Equipment images constant | [src/shared/constants/duotoneImages.js] (rename) |
| Public assets | [public/logo.svg], [public/og-image.png], [public/llms.txt] |
| Docs | [CLAUDE.md], [DESIGN.md] |

Plus the 57 files / 318 references mechanically swapped by the `duotone-blue` → `brand-navy` grep.

---

## Suggested commit sequence

1. `feat(akyaka): local dev env — isolated docker compose, env template, npm scripts` — Phase 0. Merged first so subsequent phases can be tested locally.
2. `feat(akyaka): db-sync-akyaka-from-prod script + push-akyaka safety tie-ins` — Phase 0 cont.
3. `feat(akyaka): gate public routes, remove PublicHome landing` — Phase A.
4. `feat(akyaka): introduce Plannivo brand word-mark, update HTML metadata` — Phase B.
5. `feat(akyaka): repaint navbar/sidebar white + navy accent, swap palette tokens` — Phase C (alias in place).
6. `chore(akyaka): migrate duotone-blue usages to brand-navy, drop alias` — mechanical grep-replace, then remove alias.
7. `feat(akyaka): rebrand emails, waiver, form templates, legal documents` — Phase D incl. new migration.
8. `chore(akyaka): remove UKC/Duotone landing assets` — Phase E.
9. `npm run push-akyaka` → verify in production.

Each commit is independently buildable and reviewable.

---

## Open questions to flag before execution

- **Branch switch:** this worktree is on `claude/flamboyant-euler-782a81` (off main). The `Akyaka` branch has `scripts/push-akyaka.js` already; main does not. Before Phase 0 lands, confirm whether changes should be made on a branch off `Akyaka` (so `push-akyaka.js` already exists) or on a branch off `main` and then merged to `Akyaka` afterward. The second path means we briefly duplicate `push-akyaka.js` work.
- **Final domain:** `index.html` `og:url` / `canonical` currently points at `https://plannivo.com/`. Should it be `https://akyaka.plannivo.com/` (current state) or a future customer domain? Keep `akyaka.plannivo.com` for now and change later.
- **Plannivo favicon/logo file:** do you have a finished Plannivo wordmark SVG, or should I ship a text-based placeholder (`<svg><text>Plannivo</text></svg>` in Gotham Bold) and swap later?
- **JWT secret in `backend/.env.akyaka.development`:** will be a random string generated at setup time — not committed.
