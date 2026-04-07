# Backend Architect — Plannivo Knowledge Base

## System Overview

Plannivo is a business management platform for watersports academies (kite surfing focus). The backend is Node.js/Express (ESM modules) with PostgreSQL database, deployed via Docker.

**Core domains:** Bookings, CRM, Finances, Instructors, Inventory, Rentals, Accommodation, Packages, Wallet, Shop, Vouchers, Commissions, Waivers, Notifications, Chat, Forms, Marketing, Repair Requests

---

## Architecture Patterns

### 3-Layer Service Structure
- **Route Layer** (`backend/routes/*.js`) — HTTP handlers, validation, auth
- **Service Layer** (`backend/services/*.js`) — Business logic, DB queries, integrations
- **Data Layer** (`backend/db.js`) — PostgreSQL connection pool, migrations in `backend/db/migrations/`

All async/await. Decimal.js for all financial calculations (never floating-point).

### Key Principles
- **Wallet as core ledger** — all financial transactions recorded in `wallet_transactions` table
- **Soft deletes** — most entities have `deleted_at`, never hard-delete
- **Audit logging** — `audit_logs` table tracks who changed what (see `auditUtils.js`)
- **Multi-currency** — all prices stored in base currency (EUR), conversion happens at display time
- **Rate limiting** — per-IP, per-user, per-route (see `security.js` middleware)

---

## API Endpoints (60+ routes)

### Core Booking Flow
- `POST /api/bookings` — Create lesson booking
- `GET /api/bookings` — List bookings (paginated, filterable)
- `PUT /api/bookings/:id` — Update booking (cascades to wallet transactions)
- `DELETE /api/bookings/:id` — Soft-delete booking (refund logic)

### Packages & Services
- `GET /api/services` — List available packages (lessons, rentals, accommodation, events)
- `POST /api/services` — Create package (admin only)
- `PUT /api/services/:id` — Update package
- `GET /api/customer-packages` — User's purchased packages with usage tracking

### Accommodation
- `GET /api/accommodation` — List units
- `POST /api/accommodation` — Create unit
- `GET /api/accommodation/:id/availability` — Check dates/prices
- `POST /api/accommodation/book` — Book accommodation (creates wallet transaction)

### Rentals
- `GET /api/rentals` — List rental bookings
- `POST /api/rentals` — Create rental booking
- `PUT /api/rentals/:id` — Update rental (includes wallet reconciliation)

### Financial
- `GET /api/finances` — Dashboard with balance, revenue, expenses
- `GET /api/finances/daily-operations` — Cash/card/wallet breakdown by day
- `POST /api/finances/reconcile` — Manual reconciliation (admin only)
- `GET /api/finances/instructor-earnings` — Instructor commission report

### Wallet & Payments
- `GET /api/wallet` — User's wallet balance (multi-currency)
- `POST /api/wallet/deposit` — Initiate deposit via Iyzico payment gateway
- `POST /api/wallet/withdraw` — Request withdrawal
- `GET /api/wallet/transactions` — Transaction history (ledger-style)

### Vouchers (Recently Fixed)
- `POST /api/vouchers/validate` — Validate promo code for context (lessons/packages/rentals/accommodation/shop/wallet)
- `GET /api/vouchers` — List all vouchers (admin)
- `POST /api/vouchers` — Create voucher (admin)
- `PUT /api/vouchers/:id` — Update voucher
- `POST /api/vouchers/:id/assign` — Assign private voucher to user(s)

### Instructors & Commissions
- `GET /api/instructors` — List instructors
- `GET /api/instructors/:id` — Instructor detail with schedule, rates, commissions
- `POST /api/instructor-commissions` — Set commission structure (admin)
- `GET /api/instructor-commissions` — View commission rates
- `GET /api/manager-commissions` — Manager earnings report

### Users & Auth
- `POST /api/auth/register` — User registration
- `POST /api/auth/login` — JWT-based login
- `POST /api/auth/refresh-token` — Refresh JWT
- `POST /api/auth/2fa/setup` — Enable 2-factor auth
- `PUT /api/users/:id` — Update user profile

### Shop
- `GET /api/shop/products` — List products (with variants, subcategories)
- `POST /api/shop/orders` — Create order (with voucher support)
- `GET /api/shop/orders/:id` — Order detail

### Notifications (Real-time)
- `GET /api/notifications` — List notifications
- `POST /api/notifications/mark-read` — Mark as read
- **WebSocket** — `/socket.io` for real-time updates (user joins room by UUID)

### Admin & System
- `GET /api/admin/audit-logs` — View all system changes
- `GET /api/system/settings` — App config (branding, currency, rates)
- `PUT /api/system/settings` — Update settings (admin only)
- `GET /api/dashboard` — Admin dashboard with key metrics

---

## Database Schema (Key Tables)

### Users & Roles
- `users` — All users (students, instructors, managers, admins)
- `user_roles` — Many-to-many (user can have multiple roles)
- `user_consents` — GDPR consent tracking

### Bookings & Packages
- `bookings` — Individual lesson/service bookings
  - Columns: `customer_user_id`, `instructor_user_id`, `start_time`, `end_time`, `status`, `service_id`, `customer_package_id`
  - **Note:** Uses `customer_user_id` NOT `user_id` (learn from KITE10 bug)
- `customer_packages` — User's purchased packages
  - Columns: `customer_id` (NOT `user_id`), `service_package_id`, `remaining_hours`, `remaining_nights`, `status`
  - Tracks usage via `customer_package_id` foreign key on bookings
- `service_packages` — Available packages to purchase
  - Columns: `name`, `type` (lessons|rentals|accommodation|events|all-inclusive), `price_eur`, `hours`, `nights`

### Wallet & Transactions
- `wallet_transactions` — Complete ledger of all money movement
  - Columns: `user_id`, `amount`, `currency`, `type` (booking_charge, instructor_commission, deposit, withdrawal, refund), `applied_to_type`, `applied_to_id`, `status` (pending|applied|reversed)
  - **Authoritative source for all financial data**
- `wallet_accounts` — Multi-wallet support (EUR, USD, etc.)
- `wallet_deposit_requests` — Pending deposits (awaiting Iyzico confirmation)

### Financial
- `instructor_commissions` — Commission rates per instructor per service
  - Columns: `instructor_id`, `service_id`, `commission_type` (percentage|fixed), `commission_value`
- `manager_commissions` — Manager earnings from bookings they manage
- `service_revenue_ledger` — Revenue tracking per service (denormalized for reporting)

### Vouchers & Promotions
- `voucher_codes` — Promo code definitions
  - Columns: `code`, `applies_to` (lessons|rentals|accommodation|packages|wallet|shop|all), `discount_value`, `max_uses`, `max_uses_per_user`, `requires_first_purchase`, `valid_from`, `valid_until`, `is_active`
- `voucher_redemptions` — Every code usage
- `user_vouchers` — Private voucher assignments

### Accommodation
- `accommodation_units` — Physical rooms/units
- `accommodation_bookings` — Reservations
- `accommodation_prices` — Seasonal pricing per unit

### Rentals
- `equipment` — Rental inventory
- `rentals` — Equipment rental bookings
  - Columns: `user_id`, `equipment_ids` (JSONB array), `start_date`, `end_date`, `status`

### Shop
- `products` — Shop items (equipment, apparel, accessories)
  - Columns: `name`, `category`, `subcategory`, `variants` (JSONB), `price_eur`
- `shop_orders` — Purchase orders with `voucher_id` support

### Notifications & Communication
- `notifications` — In-app notifications (booking confirmations, reminders, etc.)
- `chat_messages` — Chat messages between users
- `audit_logs` — All system changes (created_by, table, action, before/after data)

---

## Common SQL Issues (Watch Out!)

1. **Column Name Confusion:**
   - `bookings` table has `customer_user_id`, `student_user_id`, `instructor_user_id` — NOT `user_id`
   - `customer_packages` has `customer_id` — NOT `user_id`
   - `rentals` has `user_id` ✓ (this one is correct)

2. **Soft Deletes:**
   - Always check `deleted_at IS NULL` in WHERE clause
   - Use `softDeleteService` for safe deletion

3. **Currency Handling:**
   - All stored in EUR (base currency)
   - `wallet_transactions` table has `currency` column
   - Convert on display via `currencyService.convertCurrency()`

4. **Wallet Transactions:**
   - NEVER manually update wallet balance — always create a transaction
   - Transaction type determines the operation (booking_charge, refund, deposit, etc.)
   - `applied_to_type` + `applied_to_id` creates polymorphic relationship

---

## Known Quirks & Fixes

### KITE10 Bug (Recently Fixed)
- **Issue:** Promo code KITE10 couldn't be validated — threw "Unable to validate voucher at this time"
- **Root Cause:** `isFirstTimePurchaser()` queried `bookings WHERE user_id` (wrong column name)
- **Fix:** Changed to `bookings WHERE customer_user_id`
- **Lesson:** Always verify column names against `\d table_name` before querying

### Commission Calculation
- Percentage commissions use Decimal.js: `new Decimal(amount).times(rate).dividedBy(100)`
- Fixed commissions use Decimal.js: `new Decimal(amount).plus(fixed_rate)`
- Financial calculations NEVER use `Math.round()` or floating-point

### Payment Gateway Integration
- Iyzico integration in `backend/services/paymentGateways/iyzicoGateway.js`
- Webhook callbacks at `POST /api/payment-webhooks/iyzico`
- Deferred redemption: vouchers applied AFTER payment confirmed (see `customer_packages.pending_voucher_id`)

---

## File Organization

```
backend/
  routes/          # HTTP handlers (60+ files)
  services/        # Business logic (80+ files)
  db/
    migrations/    # Migration SQL files (220+ applied)
  middlewares/     # Auth, rate limiting, error handling
  utils/           # Helpers (auditUtils, loginLock, etc.)
  server.js        # Express app setup, all routes mounted
  db.js            # PostgreSQL pool + connection management
```

---

## Development Workflow

1. **Before touching DB:** Always run `npm run migrate:up` to ensure local schema is current
2. **After creating/modifying migrations:** Run `npm run migrate:up` immediately
3. **Making API changes:** Update service layer first, then route layer
4. **Testing:** Use `npm run dev:backend` for development, `npm run test` for unit tests
5. **Financial changes:** ALWAYS use Decimal.js, ALWAYS log to audit_logs, ALWAYS create wallet transactions

---

## Command Reference

```bash
npm run dev:backend              # Start backend server on :4000 (Nodemon)
npm run test                     # Unit tests (Vitest)
npm run migrate:up               # Apply all pending migrations
npm run db:dev:up                # Start local PostgreSQL docker container
npm run db:sync                  # Copy production DB to local dev (requires SSH)
```

---

*Last updated: 2026-04-07 after KITE10 promo code fix*
