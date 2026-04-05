# CLAUDE.md — Plannivo (UKC.world)

## What is this project?
Plannivo is a business management platform for watersports academies (kite surfing focus). It handles bookings, CRM, finances, instructors, inventory, rentals, and more.

## Critical Warning
**Local dev connects to the PRODUCTION database.** Do NOT run any destructive database operations (DROP, DELETE, TRUNCATE, schema changes, db:reset scripts) without explicit user confirmation. Treat every database write as if it affects real users and real data.

## Tech Stack
- **Frontend:** React 18, Vite, React Router 7
- **Backend:** Node.js, Express (ESM modules)
- **Database:** PostgreSQL (production DB used in dev)
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
- `npm run push-all` — Push to all remotes
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
