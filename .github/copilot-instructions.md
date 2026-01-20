# Plannivo – AI Coding Agent Instructions

## Architecture Overview
**Monorepo**: React/Vite frontend (`src/`) + Express/Node.js backend (`backend/`) + PostgreSQL + Redis

### Frontend (`src/features/<feature>/`)
- Feature-based structure: `{components,hooks,services,utils}` – see [src/README.md](../src/README.md)
- UI: **Ant Design** components + **Tailwind CSS** (no Material-UI/MUI in new code)
- State: Local preferred; Context for global (Auth, Currency via `useCurrency()`)
- Imports: Use `@/` alias (e.g., `import { useCurrency } from '@/shared/contexts/CurrencyContext'`)
- API: Use `apiClient` from `src/shared/services/apiClient.js` for authenticated requests
- Vite config: Proxy `/api` and `/uploads` to backend in dev mode

### Backend (`backend/`)
- **ESM Only** (`import`/`export`) – no `require()` or CommonJS
- Layers: Routes → Services → Raw SQL (parameterized queries, no ORM)
- Database: PostgreSQL via `pg` pool in `backend/db.js` (connection pooling with guardrails)
- Auth: `authenticateJWT` + `authorizeRoles(['admin', 'manager', ...])` from `middlewares/authorize.js`
- Logging: Use `logger` from `middlewares/errorHandler.js` (Winston) – **NEVER** `console.log` in production code
- Migrations: SQL files in `backend/db/migrations/` – managed by `backend/migrate.js` (ESM-based runner)

## 🚨 CRITICAL: Production Database Warning
**Local development MAY connect to PRODUCTION DATABASE depending on .env configuration.**

**FORBIDDEN:**
- `npm run db:reset`, DROP/TRUNCATE/WIPE commands without explicit user approval
- DELETE/UPDATE without explicit user confirmation and WHERE clause verification
- Destructive migrations (DROP COLUMN, DROP TABLE) – only additive migrations allowed

**SAFE:**
- `npm run migrate:status` (read-only check)
- SELECT queries with LIMIT for debugging
- Additive-only migrations (ADD COLUMN, CREATE TABLE IF NOT EXISTS, CREATE INDEX)

**Before ANY write operation:** Ask user for confirmation, explain impact, provide rollback plan.

## Developer Commands
```bash
npm run dev              # Start frontend (Vite) + backend (Nodemon) concurrently
npm run dev:frontend     # Vite dev server only (port 3000 default)
npm run dev:backend      # Express server only (port 4000 default)
npm run test             # Vitest (frontend unit tests)
npm run test:e2e         # Playwright E2E tests
npm run migrate:status   # Check migration status (safe read-only)
npm run migrate:up       # Apply pending migrations (use with caution)
node push-all.js --title "Summary" --desc "Details"  # Deploy: env swap → git push → SSH deploy
```

## Key Patterns

### Currency Handling
```jsx
const { formatCurrency, convertCurrency, userCurrency, businessCurrency } = useCurrency();
// Storage: always EUR (base currency) | Display: user preference
// Admin/manager/instructor roles see EUR by default for consistency
```

### Route Security
```javascript
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
router.get('/endpoint', authenticateJWT, authorizeRoles(['admin', 'manager']), handler);
// Roles: admin, manager, instructor, student, trusted_customer, outsider
```

### GDPR Marketing Consent
```javascript
import { canSendCommunication } from './marketingConsentService.js';
// MUST check before marketing emails; transactional emails bypass consent
await canSendCommunication({ userId, channel: 'email', notificationType: 'marketing' });
```

### Financial Operations
- Always use database transactions for wallet/payment operations (BEGIN/COMMIT/ROLLBACK)
- Use `walletService.recordTransaction()` for audit trails
- Database transactions: `const client = await pool.connect(); await client.query('BEGIN');`

### File Uploads
Use existing `backend/routes/upload.js` (Multer):
- `/api/upload/image` → `backend/uploads/images/`
- `/api/upload/service-image` → `backend/uploads/service-images/`
- `/api/users/upload-avatar` → `backend/uploads/avatars/`
- Chat uploads: `/api/upload/chat-image`, `/api/upload/chat-file`, `/api/upload/voice-message`

### Database Transactions Pattern
```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... parameterized queries
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

## Schema Notes
- `users.id`: UUID
- `member_offerings.id`: INTEGER
- `member_purchases.user_id`: UUID
- Always verify FK types before creating tables
- Soft deletes: Use `deleted_at` column (see migrations 019, 102)

## Agent Behavior Policy
1. **Production Safety**: Treat all DB operations as production-critical.
2. **Existing Patterns**: Follow established codebase patterns over generic best practices.
3. **No Destructive Ops**: Never run destructive commands without explicit user confirmation.
4. **ESM Everywhere**: Backend is ESM-only – no `require()`, always use `import`/`export`.
