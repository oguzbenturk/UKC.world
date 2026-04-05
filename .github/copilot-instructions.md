# Plannivo - AI Coding Agent Instructions

## Architecture Overview

**Stack:** React 18 + Vite (frontend) | Express 5 + PostgreSQL + Redis (backend) | Socket.IO (real-time)

```
src/                    # Frontend (React)
├── features/           # Feature modules (bookings, finances, events, chat, etc.)
│   └── {feature}/
│       ├── components/
│       ├── hooks/
│       ├── pages/
│       └── services/
├── shared/             # Cross-cutting concerns
│   ├── contexts/       # AuthContext, CurrencyContext, DataContext, etc.
│   ├── hooks/          # useAuth, useRealTime, useTheme, etc.
│   └── services/       # apiClient.js, realTimeService.js

backend/
├── routes/             # Express API endpoints (one file per domain)
├── services/           # Business logic (walletService, bookingService, etc.)
├── middlewares/        # authorize.js, security.js, errorHandler.js
├── db/migrations/      # SQL migrations (numbered sequentially)
└── db.js               # PostgreSQL pool with query instrumentation
```

## Critical Conventions

### Frontend Patterns
- **API calls:** Use `apiClient` from `src/shared/services/apiClient.js` - handles auth headers and base URL resolution
- **Auth:** Access via `useAuth()` hook from `src/shared/hooks/useAuth.js`
- **Real-time:** Use `useRealTime()`, `useRealTimeEvents()`, or `useRealTimeSync()` from `src/shared/hooks/useRealTime.js`
- **Path aliases:** `@/` → `src/`, `@/Images` → `Images/`
- **Feature exports:** Each feature has an `index.js` barrel file for public exports

### Backend Patterns
- **Database:** Always use `pool.query()` from `backend/db.js` with parameterized queries (`$1`, `$2`, etc.)
- **Auth middleware:** `authenticateJWT` from `routes/auth.js`, role checks via `authorizeRoles(['admin', 'manager'])`
- **Soft deletes:** Check `deleted_at IS NULL` in queries; use `softDeleteService.js` for cascading deletes
- **Services:** Business logic in `backend/services/`, routes should be thin

### Role Hierarchy
Roles (high to low): `super_admin` → `admin` → `manager`/`owner` → `instructor` → `student` → `outsider`

`authorizeRoles()` auto-grants `owner` access to any route allowing elevated roles.

## Commands

```bash
# Development
npm run dev               # Start both frontend (3000) and backend (4000)
npm run dev:frontend      # Frontend only
npm run dev:backend       # Backend only

# Database
npm run migrate:up        # Apply pending migrations
npm run migrate:status    # Check migration state

# Testing
npm test                  # Vitest unit tests
npm run test:e2e          # Playwright E2E (tests/e2e/)
npm run test:quick        # Fast subset for iteration

# Docker
docker-compose up --build # Full stack with PostgreSQL + Redis
```

## Database Migrations

Migrations live in `backend/db/migrations/` as numbered `.sql` files (e.g., `132_add_rental_package_support.sql`).

- Run with `npm run migrate:up` or automatically on backend startup
- Check status: `npm run migrate:status`
- Schema tracked in `schema_migrations` table

## Key Files Reference

| Purpose | File |
|---------|------|
| DB pool/queries | `backend/db.js` |
| Auth flow | `backend/routes/auth.js` |
| Role authorization | `backend/middlewares/authorize.js` |
| Frontend API client | `src/shared/services/apiClient.js` |
| Auth context | `src/shared/contexts/AuthContext.jsx` |
| Real-time service | `src/shared/services/realTimeService.js` |
| Booking routes | `backend/routes/bookings.js` |
| Cache service | `backend/services/cacheService.js` |

## Environment Variables

**Frontend** (`.env`): `VITE_API_URL`, `VITE_BACKEND_URL`  
**Backend** (`backend/.env`): `DATABASE_URL`, `JWT_SECRET`, `REDIS_HOST`, `DEFAULT_WALLET_CURRENCY`

### Remote Database with Local Dev

To run local dev environment against production database, use `backend/.env.production` or set:
```bash
DATABASE_URL=postgresql://user:pass@production-host:5432/plannivo
```
This is useful for debugging production issues locally without affecting live data flows.

## Debugging Tips

- Backend logs: `backend/logs/` + Winston logger via `middlewares/errorHandler.js`
- Redis optional: Set `DISABLE_REDIS=true` to disable caching
- Slow query threshold: `DB_SLOW_QUERY_THRESHOLD_MS` (default 1500ms)
- Check pool health via `/api/metrics` endpoint

## Common Gotchas

1. **CORS in dev:** Frontend on `:3000`, backend on `:4000` - Vite proxy handles `/api` and `/uploads`
2. **Soft deletes:** Always filter `WHERE deleted_at IS NULL` unless explicitly querying deleted records
3. **UUID vs ID:** User IDs are UUIDs; use `uuid` package for generation
4. **Currency handling:** Default is EUR; use `multiCurrencyPriceService.js` for conversions
5. **WebSocket auth:** Call `realTimeService.authenticate(user)` after login
