# Database Optimizer — Plannivo Knowledge Base

## Database Overview

**Database:** PostgreSQL (local Docker in dev, remote in production)
**Migrations:** 220+ applied migrations in `backend/db/migrations/` (authoritative source)
**Schema:** Multi-tenant academy platform with 120+ tables supporting bookings, wallet, commissions, rentals, accommodation, shop, vouchers, notifications, waivers, etc.

---

## Critical Column Name Gotchas

⚠️ **These are NOT just naming conventions—they're actual column names. Get them wrong and queries fail.**

| Table | Column | NOT | Reason |
|-------|--------|-----|--------|
| `bookings` | `customer_user_id` | `user_id` | Students book via customer_user_id; instructors are instructor_user_id |
| `bookings` | `student_user_id` | `customer_user_id` | Different entity for group bookings |
| `bookings` | `instructor_user_id` | `user_id` | Multiple instructor roles possible |
| `customer_packages` | `customer_id` | `user_id` | FK → users, but column is specifically "customer_id" |
| `rentals` | `user_id` | `customer_id` | This one IS `user_id` (consistency exception) |
| `accommodation_units` | `owner_user_id` | `user_id` | Unit owner, not a user |

**Lesson:** Always `\d table_name` to verify column names before writing queries. This has cost us bugs (KITE10 validation failure).

---

## Core Tables & Relationships

### User Management
- `users` — All system users (id, email, role-based permissions)
- `user_roles` — M:M junction (user can have multiple roles: student, instructor, manager, admin)
- `user_consents` — GDPR consent tracking

### Booking & Lessons
- `bookings` — Individual lesson/service bookings
  - `id`, `customer_user_id` (student), `instructor_user_id`, `student_user_id` (for multi-student group bookings), `service_id`, `customer_package_id`, `start_time`, `end_time`, `status`, `deleted_at`
  - Indexed: `customer_user_id`, `instructor_user_id`, `service_id`, `created_at`
- `booking_participants` — For group bookings (tracks multiple students in one booking)
- `service_packages` — Available packages (lessons, rentals, accommodation, events, all-inclusive)
  - `id`, `type` (check constraint: lessons|rentals|accommodation|events|all_inclusive), `name`, `hours`, `nights`, `price_eur`, `is_active`, `deleted_at`

### Package Ownership & Usage
- `customer_packages` — User's purchased package instance
  - `id`, `customer_id` (NOT user_id!), `service_package_id`, `purchase_date`, `remaining_hours`, `remaining_nights`, `status`, `deleted_at`
  - FK: `customer_id` → `users(id)`, `service_package_id` → `service_packages(id)`
  - Indexed: `customer_id`, `status`, `service_package_id`
  - **Note:** This tracks what the user owns; bookings decrement it

### Financial & Wallet
- `wallet_transactions` — **Authoritative ledger** for all money
  - `id`, `user_id`, `amount` (Decimal), `currency` (EUR|USD|GBP|TRY), `type` (booking_charge|instructor_commission|deposit|withdrawal|refund|manager_commission|accommodation_charge|rental_charge), `applied_to_type` (booking|rental|accommodation|package|order|balance_adjustment), `applied_to_id` (UUID of the entity), `status` (pending|applied|reversed|failed), `created_at`
  - **Why:** Single source of truth for all financial operations. Never query balance directly—sum transactions for that user/currency combo.
  - Indexed: `user_id`, `currency`, `type`, `created_at`

- `wallet_accounts` — Multi-wallet support (user can have EUR, USD, etc. wallets)
  - `id`, `user_id`, `currency`, `balance` (Decimal), `available_balance`, `overdraft_enabled`
  - Indexed: `user_id`, `currency` (unique together)

- `instructor_commissions` — Commission structure
  - `id`, `instructor_id`, `service_id`, `commission_type` (percentage|fixed), `commission_value`, `created_by`, `created_at`

- `manager_commissions` — Manager earnings ledger
  - Tracks commissions earned by managers on bookings they manage

- `service_revenue_ledger` — Denormalized revenue by service (for fast reporting)

### Rentals & Equipment
- `equipment` — Inventory (surfboards, wetsuits, etc.)
  - `id`, `name`, `category` (surfboard|wetsuit|etc.), `quantity`, `condition` (good|fair|damaged|retired), `purchase_date`, `price_eur`, `deleted_at`
  - Indexed: `category`, `condition`

- `rentals` — Rental bookings
  - `id`, `user_id` (renter), `equipment_ids` (JSONB array of equipment UUIDs), `start_date`, `end_date`, `status`, `total_price`, `customer_package_id`, `deleted_at`
  - Indexed: `user_id`, `status`, `start_date`, `customer_package_id`

### Accommodation
- `accommodation_units` — Physical units/rooms
  - `id`, `name`, `capacity`, `owner_user_id`, `price_per_night_eur`, `amenities` (JSONB), `images` (JSONB array), `is_active`, `deleted_at`

- `accommodation_bookings` — Reservations
  - `id`, `unit_id`, `customer_user_id`, `check_in`, `check_out`, `status`, `total_price`, `payment_method` (wallet|card|cash), `customer_package_id`, `deleted_at`
  - Indexed: `unit_id`, `customer_user_id`, `check_in`, `check_out`

### Vouchers & Promotions
- `voucher_codes` — Promo code definitions
  - `id`, `code` (UPPER unique), `name`, `voucher_type` (percentage|fixed_amount|wallet_credit), `discount_value`, `applies_to` (check: lessons|rentals|accommodation|packages|wallet|shop|all), `max_total_uses`, `max_uses_per_user`, `total_uses` (denormalized counter), `requires_first_purchase`, `valid_from`, `valid_until`, `is_active`, `visibility` (public|private|role_based), `created_by`, `created_at`, `deleted_at`
  - Indexed: `UPPER(code)`, `is_active`, `valid_from`, `valid_until`

- `voucher_redemptions` — Every use
  - `id`, `voucher_code_id`, `user_id`, `applied_to_type` (booking|rental|accommodation|package|order|balance), `applied_to_id`, `status` (pending|applied|reversed), `created_at`
  - FK: `voucher_code_id` → `voucher_codes(id)` CASCADE DELETE, `user_id` → `users(id)`
  - Indexed: `voucher_code_id`, `user_id`, `created_at`

- `user_vouchers` — Private voucher assignments (many-to-many)
  - `id`, `voucher_code_id`, `user_id`, `created_by`, `created_at`

### Shop & Products
- `products` — Shop items
  - `id`, `name`, `sku`, `category`, `subcategory`, `price_eur`, `variants` (JSONB: colors, sizes, gender), `images` (JSONB), `stock`, `is_active`, `deleted_at`

- `shop_orders` — Orders with voucher support
  - `id`, `customer_user_id`, `total_price_eur`, `voucher_id` (nullable), `voucher_code` (denormalized), `status`, `payment_gateway_response` (JSONB), `created_at`, `deleted_at`
  - FK: `customer_user_id` → `users(id)`, `voucher_id` → `voucher_codes(id)` SET NULL

### Notifications & Audit
- `notifications` — In-app notifications
  - `id`, `user_id`, `type` (booking_confirmation|lesson_reminder|refund|etc.), `message`, `read_at`, `created_at`

- `audit_logs` — System change tracking
  - `id`, `table_name`, `record_id`, `action` (INSERT|UPDATE|DELETE|SOFT_DELETE), `changed_by` (user_id or system), `before_data` (JSONB), `after_data` (JSONB), `created_at`
  - **Used for:** Financial reconciliation, debugging, compliance

### Waivers & Compliance
- `liability_waivers` — Waiver definitions
  - `id`, `name`, `content`, `is_active`, `deleted_at`

- `user_waivers` — User signatures (one record per signed version)
  - `id`, `user_id`, `waiver_id`, `signed_at`, `ip_address`, `user_agent`

---

## Recent Fixes

### Index Bug (Migration 167)
**Issue:** Index created on non-existent `customer_packages(user_id)` column
**Fix:** Changed to `customer_packages(customer_id)` with partial filter WHERE status='active'
**Applied:** 2026-04-07

---

## Query Performance Tips

### Multi-Currency Wallets
```sql
-- Get user's total balance across all currencies (in EUR)
SELECT 
  wa.currency,
  wa.balance,
  CASE 
    WHEN wa.currency = 'EUR' THEN wa.balance
    ELSE wa.balance * (SELECT rate FROM currency_settings WHERE base='EUR' AND target=wa.currency)
  END as balance_in_eur
FROM wallet_accounts wa
WHERE wa.user_id = $1;
```

### Package Usage Tracking
```sql
-- How many hours/nights has user consumed from their package?
SELECT 
  cp.id,
  cp.remaining_hours,
  (SELECT COUNT(*) FROM bookings WHERE customer_package_id = cp.id AND status != 'cancelled') as lessons_used,
  (SELECT COUNT(*) FROM accommodation_bookings WHERE customer_package_id = cp.id) as nights_used
FROM customer_packages cp
WHERE cp.customer_id = $1;
```

### Voucher Validation (Complex)
```sql
-- Check if user can use voucher
SELECT 
  vc.id,
  vc.code,
  vc.applies_to,
  vc.max_uses_per_user,
  (SELECT COUNT(*) FROM voucher_redemptions vr 
   WHERE vr.voucher_code_id = vc.id AND vr.user_id = $1 AND vr.status='applied') as user_used_count,
  (SELECT COUNT(*) FROM voucher_redemptions vr 
   WHERE vr.voucher_code_id = vc.id AND vr.status='applied') as total_used_count,
  vc.max_total_uses,
  vc.valid_from,
  vc.valid_until,
  vc.is_active,
  CASE WHEN vc.requires_first_purchase THEN (
    -- User is first-time if no prior bookings, packages, or rentals
    (SELECT COUNT(*) FROM bookings WHERE customer_user_id = $1 AND status != 'cancelled') = 0 AND
    (SELECT COUNT(*) FROM customer_packages WHERE customer_id = $1 AND status != 'deleted') = 0 AND
    (SELECT COUNT(*) FROM rentals WHERE user_id = $1 AND status != 'cancelled') = 0
  ) ELSE true END as is_first_timer
FROM voucher_codes vc
WHERE UPPER(vc.code) = UPPER($2);
```

---

## Migration Workflow

1. **Create migration:** `backend/db/migrations/{NNN}_description.sql`
2. **Test locally:** Run `npm run migrate:up` to apply
3. **Verify schema:** Use `\d table_name` to inspect
4. **Rollback if needed:** Manually drop tables/columns (no automatic rollback mechanism)
5. **Before deploying:** Ensure migration is tested on local DB that matches production schema

---

## Common Pitfalls

1. **Forgetting `deleted_at` check** — Data marked soft-deleted still exists in DB
2. **Not using Decimal for financial columns** — Floating-point rounding errors
3. **Querying balance directly** — Should sum transactions instead
4. **Not checking currency compatibility** — Users can have multiple wallets (EUR, USD, etc.)
5. **Assuming `user_id` exists on all tables** — See column name gotchas above

---

## Command Reference

```bash
npm run db:dev:up                # Start local PostgreSQL Docker container
npm run db:sync                  # Copy production DB to local (SSH required)
npm run migrate:up               # Apply all pending migrations
psql plannivo_dev -c "\d table_name"  # Inspect table schema locally
psql plannivo_dev -c "\dx"       # List all indexes
```

---

*Last updated: 2026-04-07 after KITE10 column name bug & index fix*
