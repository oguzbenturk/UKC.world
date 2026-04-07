# Reality Checker — Plannivo Knowledge Base

## Testing Philosophy

**Reality Checkers are skeptics.** Default to "NEEDS WORK" unless you have strong evidence that something works. Test thoroughly. Catch bugs before users do.

---

## Test Types & Setup

### Unit Tests (Vitest)
- **Location:** Test files alongside source code (e.g., `Component.test.js`)
- **Run:** `npm run test`
- **What to test:** Business logic (calculations, validations, service functions)
- **Example:**
```javascript
import { calculateCommission } from '../services/commissionService';
import Decimal from 'decimal.js';

describe('calculateCommission', () => {
  it('calculates percentage commission correctly', () => {
    const result = calculateCommission('100', 10, 'percentage');
    expect(result.toString()).toBe('10.00');
  });
  
  it('handles edge case: zero amount', () => {
    const result = calculateCommission('0', 10, 'percentage');
    expect(result.toString()).toBe('0.00');
  });
});
```

### E2E Tests (Playwright)
- **Location:** `tests/e2e/` directory
- **Run:** `npm run test:e2e`
- **What to test:** Full user journeys (booking a lesson, applying promo code, etc.)
- **Example:**
```javascript
import { test, expect } from '@playwright/test';

test('user can book all-inclusive package with promo code', async ({ page }) => {
  // Navigate to booking
  // Select dates & lessons
  // Apply KITE10 promo code
  // Verify discount applied
  // Complete payment
});
```

### Manual Testing (Your Role)
- Reproduce bugs from bug reports
- Test edge cases the automated tests might miss
- Verify UI displays correctly across browsers/devices
- Check performance (slow endpoints, high load)

---

## Scenarios to Test

### Promo Codes (Recent Focus)
- [ ] Valid code applies correctly
- [ ] Invalid code shows clear error
- [ ] Expired code rejected with message
- [ ] Code with no uses remaining rejected
- [ ] Code restricted to user's role shows error
- [ ] First-purchase-only code works for new users, rejected for returning users
- [ ] Code applies to correct context (lessons vs packages vs rentals)
- [ ] Case-insensitive code entry works
- [ ] Discount displayed correctly before and after application
- [ ] Removing code returns original price
- [ ] Multiple users can't use single-use code twice
- [ ] Per-user limit enforced (e.g., 1 use per user)

### Booking Flow
- [ ] Lesson booking creates wallet transaction
- [ ] Booking deducts from customer package hours
- [ ] Cancelling booking refunds wallet
- [ ] Package hours decrement correctly after multiple bookings
- [ ] Time slot selection auto-fills correctly (closest available time)
- [ ] Instructor assignment works
- [ ] Notifications sent on booking confirmation, cancellation
- [ ] Accessibility: can book without mouse (keyboard nav)

### Financial
- [ ] Wallet balance calculated correctly (sum of transactions, not direct query)
- [ ] Commission calculated using Decimal.js (no rounding errors)
- [ ] Currency conversion displays correctly
- [ ] Multi-currency wallets work (EUR, USD, GBP, TRY)
- [ ] Refund reverses original transaction correctly
- [ ] Audit logs record who changed what and when

### Accommodation
- [ ] Unit availability check accurate (no double-booking)
- [ ] Cancelled bookings hidden from history
- [ ] Seasonal pricing applies correctly
- [ ] Check-in/check-out dates validated
- [ ] Payment method selection works (wallet, card, cash)

### UI/UX
- [ ] Forms validate before submission
- [ ] Error messages are clear and actionable
- [ ] Loading states shown during API calls
- [ ] Dark mode toggle works throughout app
- [ ] Mobile layout responsive (test on 375px, 768px, 1024px)
- [ ] Navbar shows user's actual name (not "My Profile")

---

## Red Flags (Always Investigate)

🚩 **Generic error messages** — "Unable to validate..." without details usually means an unhandled exception. Check server logs.

🚩 **Silent failures** — Code appears to work but data isn't saved/updated. Check `handleSuccess` vs `handleError` callbacks.

🚩 **Floating-point money** — €19.98 instead of €20.00. Use Decimal.js inspector.

🚩 **Stale data** — User sees old balance after transaction. Check React Query cache invalidation.

🚩 **Missing soft-delete check** — Deleted records appearing in lists. Verify `deleted_at IS NULL` in queries.

🚩 **Wrong column names** — Query returns 0 rows silently. Verify column names match schema.

🚩 **Infinite loops** — Browser freezes, network waterfall shows repeated requests. Check `useEffect` dependencies.

🚩 **N+1 queries** — Backend fetches related data in a loop. Check for missing JOINs.

---

## Test Data Scenarios

### User Types to Test
- **New user** (no bookings, packages, or rentals) — for first-purchase-only codes
- **Returning user** (has prior bookings) — for code restrictions
- **Manager/Admin** (elevated permissions) — verify role-based access
- **Instructor** (special commission structure) — verify commission calculation

### Edge Cases
- **Zero amount bookings** — technically possible for free trials
- **Multiple currencies** — same user with EUR and USD wallets
- **Maximum package hours** — user with huge package, many bookings
- **Expired dates** — old accommodations, old bookings still visible?
- **Cancelled/refunded transactions** — double-check ledger accuracy
- **Rate limiting** — rapid-fire requests should be throttled

---

## Debugging Workflow

1. **Reproduce the bug** — Exact steps, with screenshots/video
2. **Check server logs** — Look for exceptions, error details
3. **Check browser dev tools** — Network tab (API responses), Console (JS errors)
4. **Check database** — Query the affected data directly (`psql`)
5. **Check React Dev Tools** — Component state, context values, hooks
6. **Check browser storage** — LocalStorage, Cookies (JWT, preferences)
7. **Isolate the issue** — Minimal steps to reproduce

---

## Checklist for Release

Before marking a feature ready to ship:

- [ ] **Functionality:** Core feature works as designed
- [ ] **Edge cases:** Tested boundary conditions (0, negative, max values)
- [ ] **Error handling:** All error paths work (network down, permissions denied, etc.)
- [ ] **Financial:** Money calculated correctly (Decimal.js, audit logged)
- [ ] **Mobile:** Works on small screens (375px+)
- [ ] **Accessibility:** Keyboard navigation works, ARIA labels present
- [ ] **Performance:** No obvious slowness, Network tab clean
- [ ] **Security:** No XSS, CSRF, injection vulnerabilities obvious
- [ ] **Documentation:** Code comments explain non-obvious logic
- [ ] **Tests:** Unit tests pass, E2E tests pass, no regressions

---

## Recent Bug Fixes to Verify

### KITE10 Promo Code (2026-04-07)
- **Status:** Fixed — column name mismatch resolved
- **Test:** Apply KITE10 to lessons booking — should give 10% off
- **Verify:** Server logs show no "column user_id does not exist" error

### PromoCodeInput Wiring (2026-04-07)
- **Status:** Fixed — DownwinderBookingModal, PackagePurchaseModal now pass correct props
- **Test:** Book downwind package with promo code — discount should apply
- **Verify:** Discount reflected in final price, not just validated

### Time Slot Auto-Selection (2026-04-07)
- **Status:** Fixed — now picks closest available time instead of blindly copying
- **Test:** Book all-inclusive with 09:00-11:00 on Day 1; 09:00-11:00 is booked on Day 2
- **Verify:** Day 2 auto-selects next closest available time (e.g., 11:00-13:00), not phantom 09:00

### Navbar Profile Name (2026-04-07)
- **Status:** Fixed — shows user's actual name instead of "My Profile"
- **Test:** Log in as any user, open profile menu
- **Verify:** Menu shows username (e.g., "John Smith" or "john.doe@example.com"), not "My Profile"

### Accommodation History Filtering (2026-04-07)
- **Status:** Fixed — cancelled accommodations hidden from history
- **Test:** Customer has 3 accommodation bookings (2 active, 1 cancelled)
- **Verify:** History table shows 2 rows, not 3

---

## Command Reference

```bash
npm run test              # Unit tests (Vitest)
npm run test:e2e          # E2E tests (Playwright)
npm run dev              # Dev environment (local DB)
npm run dev:backend      # Backend only (for focused testing)
# Then in browser dev tools:
# Network tab — check API calls and responses
# Console — check for JS errors
# React Dev Tools — inspect component state
```

---

*Last updated: 2026-04-07 after KITE10, PromoCodeInput, time slot, navbar, and accommodation fixes*
