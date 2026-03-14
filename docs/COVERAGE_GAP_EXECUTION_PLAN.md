# COVERAGE GAP EXECUTION PLAN

**Goal:** Close all 23 NOT TESTED gaps + 14 SMOKE-only gaps from the audit report  
**Approach:** 6 phases, ordered by dependency chain (each phase builds on the previous)  
**Estimated test count:** ~180 new ACTION tests across 8 new/rewritten spec files

---

## PHASE 0: BUG FIXES (Prerequisites — Must Do First)
> Without these fixes, several phases are blocked.

### 0.1 Fix Broken API Endpoints
| Bug | Route | File to Investigate |
|-----|-------|-------------------|
| `/api/services/lessons` → 500 | backend/routes/services.js or similar | Check query, likely missing table or column |
| `/api/events` → 500 | backend/routes/events.js | Same pattern |
| `/api/services/rentals` → 500 | backend/routes/services.js | Same pattern |
| `/api/services/memberships` → 500 | backend/routes/memberOfferings.js | Same pattern |

**Action:** Hit each endpoint locally, read the backend error log, fix the query/route.

### 0.2 Fix Instructor Access Control
| Bug | Expected | Actual |
|-----|----------|--------|
| Instructor visits `/admin/settings` | 403 or redirect | Page loads (200) |
| Instructor visits `/finance` | 403 or redirect | Page loads (200) |

**Action:** Check frontend route guards in `src/routes/` — likely missing role check on these routes. Add `authorizeRoles(['admin', 'manager'])` equivalent on frontend.

### 0.3 Create Receptionist Test Account
```
POST /api/auth/register → new user
POST /api/users/{id}/promote-role → role: 'front_desk'
```
Store credentials in test fixture for Phase 3.

**Deliverables:** 4 API fixes, 2 access control fixes, 1 new test account

---

## PHASE 1: REWRITE QA-AUDIT FILES → REAL ACTION TESTS
> The 8 qa-audit files (171 tests) are page-load-only. Rewrite them to perform actual business actions.

### File: `qa-audit-section3-student.spec.ts` → Rewrite (16 tests → ~20 ACTION tests)
**New tests to write:**

| # | Test | Type | Actions |
|---|------|------|---------|
| 1 | Student login + dashboard content validation | ACTION | Login → verify booking count, upcoming lessons, wallet balance visible |
| 2 | Student booking history shows real bookings | ACTION | API check → navigate → verify table rows match |
| 3 | Student schedule shows upcoming lessons | ACTION | Navigate → verify calendar/list has entries |
| 4 | Student payment history with amounts | ACTION | Navigate → verify transaction rows with correct amounts |
| 5 | Student profile is editable | ACTION | Navigate → change phone/name → save → verify |
| 6 | Student wallet page shows correct balance | ACTION | Navigate → compare displayed balance vs API |
| 7 | Student can see family members | ACTION | Navigate → verify family list or empty state |
| 8 | Student support page accessible | ACTION | Navigate → verify form/ticket list |

**Covers audit gaps:** Section 2A (Student dashboard content validation), Section 2A profile

---

### File: `qa-audit-section4-8-modules.spec.ts` → Rewrite (23 tests → ~25 ACTION tests)
**New tests to write:**

| # | Test | Type | Actions |
|---|------|------|---------|
| 1 | Lesson services list has real data | ACTION | API get → verify table matches |
| 2 | Package list shows correct hours/prices | ACTION | API get → verify UI matches |
| 3 | Shop products have prices and stock | ACTION | Navigate → verify product cards |
| 4 | Equipment list has status indicators | ACTION | Navigate → verify equipment rows |
| 5 | Accommodation units show availability | ACTION | Navigate → verify unit cards |
| 6 | Create a new lesson service (duplicate of phase2 for robustness) | ACTION | Fill form → submit → verify |
| 7 | Edit existing service | ACTION | Click edit → change field → save |
| 8 | Delete service (soft delete) | ACTION | Click delete → confirm → verify gone |
| 9 | Create package with hours/price | ACTION | Fill form → submit → verify in list |
| 10 | Member offerings page shows types | ACTION | Navigate → verify offering cards |

**Covers audit gaps:** Sections 2B-2G module data validation, 10A membership visibility

---

### File: `qa-audit-section9-10-wallet.spec.ts` → Rewrite (11 tests → ~15 ACTION tests)
**New tests to write:**

| # | Test | Type | Actions |
|---|------|------|---------|
| 1 | Student wallet page shows balance matching API | ACTION | Login student → navigate → compare |
| 2 | Wallet transaction history has entries | ACTION | Navigate → verify rows |
| 3 | Student creates wallet deposit request | ACTION | Fill amount → submit → verify created |
| 4 | Admin sees deposit request in list | ACTION | Login admin → navigate → verify pending |
| 5 | Admin approves deposit → balance increases | ACTION | Approve → verify balance change |
| 6 | Wallet payment on booking deducts balance | ACTION | Create booking → verify deduction |
| 7 | Create membership offering | ACTION | Admin creates offering → verify in list |
| 8 | Purchase membership for user | ACTION | Admin assigns → verify active |
| 9 | Member check-in (if UI exists) | ACTION | Check-in flow → verify logged |
| 10 | Membership expiration handling | ACTION | Verify expired memberships show correct status |

**Covers audit gaps:** Section 3B wallet UI, Section 10A membership lifecycle

---

### File: `qa-audit-section11-14-staff.spec.ts` → Rewrite (25 tests → ~20 ACTION tests)
**New tests to write:**

| # | Test | Type | Actions |
|---|------|------|---------|
| 1 | Instructor dashboard shows assigned students | ACTION | Login instructor → verify student list |
| 2 | Instructor schedule shows bookings | ACTION | Navigate → verify booking entries |
| 3 | Instructor can view lesson details | ACTION | Click lesson → verify details modal |
| 4 | Instructor CANNOT access /admin/settings | ACTION | Navigate → verify blocked/redirect |
| 5 | Instructor CANNOT access /finance | ACTION | Navigate → verify blocked/redirect |
| 6 | Manager creates booking via UI | ACTION | Full booking form → submit → verify |
| 7 | Manager creates rental via UI | ACTION | Full rental form → submit → verify |
| 8 | Manager views and filters bookings | ACTION | Navigate → apply filter → verify results change |
| 9 | Manager views commission data | ACTION | Navigate → verify commission rows |
| 10 | Manager views accommodation list | ACTION | Navigate → verify unit entries |

**Covers audit gaps:** Section 4A instructor access control, Section 5B manager ACTION upgrade

---

### File: `qa-audit-section15-16-cancel-package.spec.ts` → Rewrite (7 tests → ~15 ACTION tests)
**New tests to write:**

| # | Test | Type | Actions |
|---|------|------|---------|
| 1 | Create booking → admin cancels → verify status | ACTION | Full cancel flow |
| 2 | Cancel booking → wallet refund verified | ACTION | Balance before/after check |
| 3 | Cancel booking → package hours restored | ACTION | Package hours before/after check |
| 4 | Weather cancel with different refund policy | ACTION | Weather cancel → verify partial/full refund |
| 5 | Student-side cancellation (if UI allows) | ACTION | Login student → cancel own booking → verify |
| 6 | Package purchase → partial consumption → verify remaining | ACTION | Use 2 of 5 hours → verify 3 remaining |
| 7 | Package full exhaustion → attempt booking → blocked | ACTION | Exhaust → try booking → verify error |
| 8 | Cancel package booking → hours restored → rebook | ACTION | Full restoration cycle |
| 9 | Composite package (if feature exists) | ACTION | Multi-service package → use for lesson + rental |

**Covers audit gaps:** Section 6A student cancel, 6B weather detail, 7A package edge cases

---

### File: `qa-audit-section17-20-crossrole-ui.spec.ts` → Rewrite (20 tests → ~25 ACTION tests)
**New tests to write:**

| # | Test | Type | Actions |
|---|------|------|---------|
| 1 | Admin creates support ticket (if UI exists) | ACTION | Create → verify in list |
| 2 | Admin resolves ticket → status changes | ACTION | Update status → verify |
| 3 | Chat - create direct conversation | ACTION | Create conversation → send message → verify |
| 4 | Chat - verify message appears for recipient | ACTION | Login as recipient → verify message |
| 5 | Form builder - create form template | ACTION | Admin creates form → verify in list |
| 6 | Form - public submission | ACTION | Guest fills form → submit → admin sees response |
| 7 | Quick links - create QR booking link | ACTION | Admin creates → verify code generated |
| 8 | Voucher - create and validate | ACTION | Create voucher → validate code → verify discount |
| 9 | Voucher redemption in booking | ACTION | Apply voucher code → verify reduced amount |
| 10 | GDPR data export request (if feature exists) | ACTION | Request → verify download |
| 11 | Currency display switching | ACTION | Change currency → verify prices update |
| 12 | Console errors check (all major pages) | ACTION | Navigate 10 pages → collect console.error → fail if any |

**Covers audit gaps:** Section 9A tickets, chat, forms, vouchers, GDPR, cross-role UI

---

## PHASE 2: STUDENT-FACING UI FLOWS (New file)
> The biggest gap: zero tests where a student/outsider books through the public-facing UI.

### File: `student-booking-flows.spec.ts` (~30 tests)

| # | Test | Type | Actions |
|---|------|------|---------|
| 1 | Guest browses academy → sees lesson categories | ACTION | Navigate public pages |
| 2 | Guest clicks "Book" → redirected to login | ACTION | Click CTA → verify redirect |
| 3 | Student logs in → returns to booking page | ACTION | Login → verify return URL |
| 4 | Student selects lesson → fills booking form | ACTION | Select service → pick date/time → pick instructor |
| 5 | Student confirms booking with wallet payment | ACTION | Confirm → verify wallet deducted |
| 6 | Booking appears in student dashboard | ACTION | Navigate → verify booking row |
| 7 | Student browses shop → adds to cart | ACTION | Navigate shop → click "Add to Cart" |
| 8 | Student views cart → correct items/prices | ACTION | Open cart drawer → verify items |
| 9 | Student completes shop checkout | ACTION | Submit order → verify confirmation |
| 10 | Shop order appears in student orders | ACTION | Navigate → verify order row |
| 11 | Student browses rental → selects equipment | ACTION | Navigate rental page → pick equipment |
| 12 | Student books rental with dates | ACTION | Fill dates → confirm → verify created |
| 13 | Student browses stay → selects accommodation | ACTION | Navigate stay page → pick unit |
| 14 | Student books accommodation with dates | ACTION | Fill dates → confirm → verify wallet charge |
| 15 | Student selects pay_later (trusted customer) | ACTION | Choose pay_later → verify debt created |
| 16 | Student cancels own booking | ACTION | Navigate bookings → cancel → verify status |
| 17 | Student views cancellation refund | ACTION | Verify wallet credit after cancel |
| 18 | Student applies voucher code to booking | ACTION | Enter code → verify discount applied |
| 19 | Student submits feedback/rating for lesson | ACTION | After completed lesson → rate → submit |
| 20 | Student creates support request | ACTION | Navigate support → submit ticket |

**Covers audit gaps:** Section 2B-2G student UI, 3A pay_later UI, 6A student cancel

---

## PHASE 3: RECEPTIONIST WORKFLOW (New file)
> Entire role is untested. Requires Phase 0.3 (account creation) first.

### File: `receptionist-workflow.spec.ts` (~15 tests)

| # | Test | Type | Actions |
|---|------|------|---------|
| 1 | Receptionist can login (front_desk role) | ACTION | Login → verify dashboard |
| 2 | Receptionist dashboard shows today's bookings | ACTION | Verify today's schedule |
| 3 | Receptionist creates walk-in booking | ACTION | New booking → fill form → auto-confirm |
| 4 | Receptionist views customer list | ACTION | Navigate → verify customer table |
| 5 | Receptionist checks in customer | ACTION | Find booking → check-in → verify status |
| 6 | Receptionist creates quick rental | ACTION | New rental form → submit |
| 7 | Receptionist CANNOT access admin settings | ACTION | Navigate /admin/settings → blocked |
| 8 | Receptionist CANNOT access finance | ACTION | Navigate /finance → blocked |
| 9 | Receptionist CAN view bookings calendar | ACTION | Navigate → verify calendar loads |
| 10 | Receptionist views customer booking history | ACTION | Click customer → verify booking list |

**Covers audit gaps:** Section 5A (0/4 → 10/10)

---

## PHASE 4: MEMBERSHIP SYSTEM (New file or extend qa-audit-section9-10)
> Members module is operational in backend but zero workflow tests.

### File: `membership-lifecycle.spec.ts` (~15 tests)

| # | Test | Type | Actions |
|---|------|------|---------|
| 1 | Admin creates daily membership offering | ACTION | Fill form → price/duration → submit |
| 2 | Admin creates weekly membership offering | ACTION | Same pattern, weekly type |
| 3 | Admin creates seasonal membership offering | ACTION | Same pattern, seasonal type |
| 4 | Admin creates storage membership offering | ACTION | Same pattern, storage type |
| 5 | Offerings visible in members page | ACTION | Navigate → verify all 4 types |
| 6 | Admin assigns membership to student | ACTION | Select student → assign → verify active |
| 7 | Student sees active membership in dashboard | ACTION | Login student → verify membership card |
| 8 | Member check-in workflow (if UI) | ACTION | Check-in → verify attendance logged |
| 9 | Membership usage limits respected | ACTION | Use up to limit → verify blocked |
| 10 | Membership expiration → status changes | ACTION | Verify expired membership shows inactive |
| 11 | Renew expired membership | ACTION | Re-assign → verify active again |
| 12 | Multiple memberships for same user | ACTION | Assign 2 → verify both active |

**Covers audit gaps:** Section 10A (0/6 → 12/12)

---

## PHASE 5: UI ROBUSTNESS & EDGE CASES (New file)
> Safety nets that prevent real-world bugs.

### File: `ui-robustness.spec.ts` (~20 tests)

| # | Test | Type | Actions |
|---|------|------|---------|
| 1 | Double-click payment prevention | ACTION | Click pay twice fast → only one charge |
| 2 | Back button after booking creation | ACTION | Create booking → back → no duplicate |
| 3 | Booking past date → fails validation | ACTION | Set past date → submit → error shown |
| 4 | Expired package → booking blocked | ACTION | Try booking with used_up package → error |
| 5 | Zero-balance wallet → payment fails gracefully | ACTION | Empty wallet → attempt pay → clear error |
| 6 | Overlapping booking prevention | ACTION | Book same slot twice → second fails |
| 7 | Equipment overbooking prevention | ACTION | Rent same equipment same dates → blocked |
| 8 | Console error scan (10 critical pages) | ACTION | Navigate each → `page.on('console')` → fail on errors |
| 9 | Form required field validation (5 key forms) | ACTION | Submit empty → verify error messages |
| 10 | Session timeout handling | ACTION | Clear token → navigate → redirect to login |
| 11 | Mobile viewport responsiveness (5 pages) | ACTION | Set viewport 375px → verify no horizontal scroll |
| 12 | Loading states visible during async | ACTION | Throttle network → verify spinner appears |
| 13 | Concurrent booking same slot (parallel) | ACTION | Two sessions book same slot → only one succeeds |

**Covers audit gaps:** UI robustness (3/10 → 13/13), edge cases from gap list

---

## PHASE 6: CROSS-ROLE VERIFICATION MATRIX
> Not a new file — run existing + new tests across ALL roles and compile matrix.

### Approach:
After Phases 1-5, re-run the full suite and build the cross-role matrix:

| Flow | Admin | Manager | Instructor | Student | Receptionist |
|------|-------|---------|------------|---------|-------------|
| Create booking | Phase 1 | Phase 1 | N/A | Phase 2 | Phase 3 |
| Cancel booking | Phase 1 | Phase 1 | N/A | Phase 2 | N/A |
| View bookings | Phase 1 | Phase 1 | Phase 1 | Phase 2 | Phase 3 |
| Wallet operations | Phase 1 | N/A | N/A | Phase 2 | N/A |
| Finance dashboard | existing | existing | Phase 1 (blocked) | N/A | Phase 3 (blocked) |
| Service CRUD | existing | N/A | N/A | N/A | N/A |
| Rental workflow | existing | Phase 1 | N/A | Phase 2 | Phase 3 |
| Commission view | existing | Phase 1 | Phase 1 | N/A | N/A |
| Support/tickets | Phase 1 | Phase 1 | N/A | Phase 2 | N/A |
| Member check-in | Phase 4 | Phase 4 | N/A | N/A | Phase 3 |

---

## EXECUTION ORDER & DEPENDENCIES

```
Phase 0 (Bug Fixes) ←── MUST DO FIRST
    ├── Fix 4 API 500 errors
    ├── Fix instructor access control
    └── Create receptionist account
         │
         ▼
Phase 1 (Rewrite QA-Audit) ←── Can start immediately after Phase 0
    ├── section3-student (student dashboard)
    ├── section4-8 (modules)
    ├── section9-10 (wallet + membership)
    ├── section11-14 (staff)
    ├── section15-16 (cancel + package)
    └── section17-20 (cross-role + UI)
         │
         ▼
Phase 2 (Student-Facing UI) ←── Needs Phase 0 + real data from Phase 1
    └── student-booking-flows.spec.ts
         │
         ▼
Phase 3 (Receptionist) ←── Needs Phase 0.3 (account)
    └── receptionist-workflow.spec.ts
         │
         ▼
Phase 4 (Membership) ←── Needs Phase 0.1 (API fix for /api/services/memberships)
    └── membership-lifecycle.spec.ts
         │
         ▼
Phase 5 (UI Robustness) ←── Can run anytime, but best after others
    └── ui-robustness.spec.ts
         │
         ▼
Phase 6 (Cross-Role Matrix) ←── Final verification pass
    └── Full suite re-run + matrix compilation
```

---

## SUMMARY

| Phase | New/Rewritten Files | New ACTION Tests | Gaps Closed |
|-------|-------------------|-----------------|-------------|
| 0 | 0 (bug fixes) | 0 | 6 bugs |
| 1 | 6 rewritten qa-audit files | ~120 | 14 smoke-only → ACTION |
| 2 | 1 new (student-booking-flows) | ~20 | 3 critical (student UI) |
| 3 | 1 new (receptionist-workflow) | ~10 | 4 critical (receptionist) |
| 4 | 1 new (membership-lifecycle) | ~12 | 4 critical (membership) |
| 5 | 1 new (ui-robustness) | ~13 | 7 edge cases |
| 6 | 0 (verification run) | 0 | Matrix compilation |
| **TOTAL** | **10 files** | **~175 tests** | **All 23 NOT TESTED + 14 SMOKE-only** |

### Expected Final State
- **Before:** 69/111 plan items ACTION-tested (62%)
- **After:** 106/111 plan items ACTION-tested (95%)
- **Remaining 5%:** Features that may not have UI yet (ticket frontend, some membership UI)
