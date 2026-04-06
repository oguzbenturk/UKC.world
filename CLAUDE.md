# CLAUDE.md — Plannivo (UKC.world)

## What is this project?
Plannivo is a business management platform for watersports academies (kite surfing focus). It handles bookings, CRM, finances, instructors, inventory, rentals, and more.

## Database Setup

**Local dev uses a local Docker PostgreSQL database — NOT production.**

- Start local DB: `npm run db:dev:up`
- Sync production data locally: `npm run db:sync` (reads SSH creds from `.deploy.secrets.json`)
- Active dev env: `backend/.env` → always points to `localhost:5432/plannivo_dev`
- Production env: `backend/.env.production` (gitignored, only used during `push-all`)

`push-all.js` temporarily swaps `backend/.env` to production credentials during the git commit/push window, then restores `backend/.env.development` immediately after. After every `push-all`, local dev is always back on the local DB.

**Safe daily workflow:**
```
npm run db:dev:up    # once per machine restart
npm run db:sync      # refresh local data from production (optional)
npm run dev          # develop against local DB — writes never touch production
npm run push-all     # deploy to production when ready
```

## Tech Stack
- **Frontend:** React 18, Vite, React Router 7
- **Backend:** Node.js, Express (ESM modules)
- **Database:** PostgreSQL (local Docker in dev, production on remote server)
- **UI:** Ant Design + TailwindCSS + MUI + Headless UI
- **State:** TanStack React Query, React Context
- **Testing:** Vitest (unit), Playwright (E2E), Jest (backend)
- **Deploy:** Docker, docker-compose

## Project Structure
```
src/                    Frontend (React)
  main.jsx              Entry point
  App.jsx               Root component
  features/             35+ domain modules (bookings, customers, finances, etc.)
  components/           Shared UI components
  shared/               Shared hooks, utils, contexts
  routes/               Route definitions
  config/               App config
  styles/               Global styles

backend/                Backend (Express)
  server.js             Entry point
  routes/               API routes
  services/             Business logic
  middlewares/           Auth, validation
  db/
    migrations/         DB migrations (authoritative — do not use backend/migrations/)
  db.js                 DB connection
```

## Commands
- `npm run dev` — Start both frontend (Vite :3000) and backend (Nodemon :4000)
- `npm run dev:frontend` — Frontend only
- `npm run dev:backend` — Backend only
- `npm run build` — Production build
- `npm run test` — Unit tests (Vitest)
- `npm run test:e2e` — E2E tests (Playwright)
- `npm run push-all` — Deploy to production (swaps env, bumps version, commits, pushes, SSH rebuilds server)
- `npm run db:dev:up` — Start local PostgreSQL + Redis Docker containers
- `npm run db:sync` — Copy production DB into local dev container
- `npm run migrate:up` — Run DB migrations

## Path Aliases
- `@/` and `src/` both resolve to `./src/`

## Architecture Notes
- Feature-based module structure: each feature in `src/features/` is self-contained
- Backend API is proxied via Vite dev server (`/api` → `localhost:4000`)
- ESM modules throughout (both frontend and backend)
- Uploads served from `/uploads` (also proxied)

## Workflow Rules
- **Always run `npm run migrate:up`** after creating or modifying migration files. Do not wait for the user to run it manually.

## Code Style
- React functional components with hooks
- React Hook Form + Yup for form validation
- Decimal.js for financial calculations (never use floating point for money)
- date-fns and dayjs for date handling
