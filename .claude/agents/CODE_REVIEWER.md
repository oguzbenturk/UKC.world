# Code Reviewer — Plannivo Knowledge Base

## Review Checklist

### Security (OWASP Top 10)

- [ ] **SQL Injection:** All queries use parameterized statements (`$1`, `$2`, etc.)
- [ ] **XSS:** User input sanitized before rendering; React escapes by default
- [ ] **CSRF:** CSRF middleware applied to state-changing operations
- [ ] **Authentication:** JWT-based auth with `authenticateJWT` middleware
- [ ] **Authorization:** Role-based access via `authorizeRoles()` middleware
- [ ] **Sensitive data:** Passwords hashed with bcrypt, PII not logged, no secrets in code
- [ ] **Rate limiting:** API endpoints have rate limits; financial operations have stricter limits
- [ ] **Input validation:** All inputs validated via express-validator or Yup
- [ ] **Error messages:** Generic messages to users; detailed errors logged server-side only

### Financial Correctness

- [ ] **Decimal.js used** for all money calculations (never `Math.round()` or floats)
- [ ] **Wallet transaction created** for every financial operation (never update balance directly)
- [ ] **Commission calculation** uses Decimal.js: `new Decimal(amount).times(rate).dividedBy(100)`
- [ ] **Currency consistency** — all amounts in base currency (EUR) in DB
- [ ] **Audit logging** — changes to financial data recorded in `audit_logs`
- [ ] **Rounding** — consistent rounding rule applied (typically round-half-up for display)

### Database

- [ ] **Column names verified** — use actual column names (not `user_id` when column is `customer_user_id`)
- [ ] **Soft deletes** — queries include `deleted_at IS NULL` where needed
- [ ] **Foreign keys** — all relationships have proper FK constraints
- [ ] **Indexes** — performance-critical queries use indexed columns
- [ ] **Transactions** — related operations wrapped in transactions
- [ ] **N+1 queries** — data fetched efficiently (not in loops)

### State Management (React)

- [ ] **useQuery/useMutation** — server state via React Query (not useState)
- [ ] **useContext** — client state via React Context (auth, currency, theme)
- [ ] **useCallback** — dependency arrays correct to avoid stale closures
- [ ] **useMemo** — used for expensive computations only
- [ ] **No raw useState for API data** — use React Query instead

### Forms (React Hook Form + Yup)

- [ ] **Validation schema defined** — Yup or zod schema matches form fields
- [ ] **Error messages displayed** — form errors shown to user
- [ ] **Submission handling** — form disabled during submit, loading state shown
- [ ] **Decimal inputs** — use `type="number"` with `step="0.01"` for money, parse as Decimal

### Performance

- [ ] **No infinite loops** — dependency arrays reviewed for `useEffect`, `useCallback`
- [ ] **No unnecessary re-renders** — components memoized if needed
- [ ] **Bundle size** — large dependencies justified
- [ ] **API calls optimized** — pagination, filtering on server-side
- [ ] **Memory leaks** — subscriptions/timers cleaned up in useEffect cleanup

### Code Style & Conventions

- [ ] **ESM modules** — `import`/`export` used (not CommonJS)
- [ ] **Async/await** — used over `.then()` chains
- [ ] **Error handling** — try/catch blocks for async operations
- [ ] **Logging** — uses logger from `errorHandler.js` (not `console.log`)
- [ ] **Path aliases** — uses `@/` instead of relative imports in React
- [ ] **Naming** — functions/variables use camelCase, components PascalCase

### API Design

- [ ] **REST principles** — proper HTTP methods (GET, POST, PUT, DELETE)
- [ ] **Status codes** — 200 success, 400 bad request, 401 unauthorized, 500 error
- [ ] **Response format** — consistent JSON structure
- [ ] **Pagination** — list endpoints support `limit` and `offset` (not unbounded results)
- [ ] **Filtering** — complex queries support `filter`, `sort`, `search` parameters
- [ ] **Documentation** — endpoint purpose clear from route path and code comments

---

## Known Issues & Patterns

### KITE10 Bug (Fixed 2026-04-07)
- **Lesson:** Always verify column names against `\d table_name` before querying
- **Pattern:** `isFirstTimePurchaser()` in voucherService queried wrong columns
- **Fix:** Changed `bookings WHERE user_id` to `bookings WHERE customer_user_id`

### Floating-Point Financial Calculations (Pre-existing)
- **File:** `backend/services/voucherService.js:343`
- **Issue:** `calculateDiscount` uses `Math.round()` instead of Decimal.js
- **Status:** Known debt; functional but violates project conventions
- **Fix:** Convert to Decimal.js in future refactor

### PromoCodeInput Wiring (Fixed 2026-04-07)
- **Pattern:** Components passing wrong prop names to PromoCodeInput
- **Lesson:** Always verify prop names match component signature before wiring
- **Affected:** DownwinderBookingModal, PackagePurchaseModal (both fixed)

---

## Review Priority

**High Priority (block merge):**
- Security vulnerabilities
- Financial calculation errors
- SQL injection risks
- Auth/authorization issues

**Medium Priority (request changes):**
- Performance issues (N+1 queries, unnecessary re-renders)
- Missing error handling
- Incorrect async/await patterns
- Decimal.js not used for money

**Low Priority (nice-to-have):**
- Code style issues
- Missing comments
- Naming improvements
- Test coverage gaps

---

## Code Examples

### ✅ Good: Financial Calculation
```javascript
import Decimal from 'decimal.js';

function calculateCommission(amount, rate) {
  return new Decimal(amount)
    .times(rate)
    .dividedBy(100)
    .toFixed(2);
}
```

### ❌ Bad: Floating-Point Money
```javascript
function calculateCommission(amount, rate) {
  return Math.round((amount * rate / 100) * 100) / 100; // Rounding errors!
}
```

### ✅ Good: React Query
```javascript
const { data: bookings, isLoading } = useQuery({
  queryKey: ['bookings', userId],
  queryFn: async () => {
    const res = await fetch(`/api/bookings?userId=${userId}`);
    return res.json();
  },
});
```

### ❌ Bad: Raw useState for API data
```javascript
const [bookings, setBookings] = useState(null);
useEffect(() => {
  fetch(`/api/bookings?userId=${userId}`)
    .then(r => r.json())
    .then(setBookings);
}, [userId]);
```

### ✅ Good: Soft Deletes
```sql
SELECT * FROM customer_packages WHERE customer_id = $1 AND deleted_at IS NULL;
```

### ❌ Bad: Forgetting soft deletes
```sql
SELECT * FROM customer_packages WHERE customer_id = $1; -- Includes deleted records!
```

---

## Command Reference

```bash
npm run test              # Unit tests (Vitest)
npm run test:e2e          # E2E tests (Playwright)
npm run build             # Production build (catches TS errors)
npm run lint              # Code linting (if configured)
```

---

*Last updated: 2026-04-07 after KITE10 & PromoCodeInput fixes*
