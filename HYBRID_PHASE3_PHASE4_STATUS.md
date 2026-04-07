# Plannivo Notification Overhaul - Hybrid Phase 3/4 Approach

**Date:** 2026-04-07
**Strategy:** Option 3 - Commit current work, start Phase 4 testing, delegate Phase 3 remainder to agents in parallel

---

## Current Status: Phase 3 (40%) + Phase 4 (Tests Created)

### ✅ Phase 1-2: Complete (100%)
- All 4 database migrations created and applied
- Unified dispatcher service created and ready
- 2 critical bugs fixed (package purchase, accommodation booking)

### 🔄 Phase 3: In Progress (40% → Expanding)
- ✅ **DONE (2 critical bugs):**
  - Package purchase notifications (services.js)
  - Accommodation booking notifications (accommodation.js)
  - PHASE3_MIGRATION_GUIDE.md created

- 🚀 **NOW STARTING (14 files via Backend-Architect):**
  - Critical: `bookingNotificationService.js` (30% of notifications)
  - High: 5 route files (bookings, groupBookings, rentals, wallet, shopOrders)
  - Medium: 8 service files
  - Work happening in parallel with Phase 4 testing

### 🧪 Phase 4: Tests Created (Ready)
- ✅ Unit tests: `notificationDispatcherUnified.test.js` (30+ cases)
- ✅ Integration tests: `notificationIntegration.test.js` (25+ cases)
- ✅ Reality-Checker monitoring tests as Phase 3 files complete

---

## Task Delegation: Who Does What

### Backend-Architect
**Responsibility:** Update 14 notification caller files
**Timeline:** Parallel with Phase 4 testing
**Priority Order:**
1. `bookingNotificationService.js` (CRITICAL - 30% of notifications)
2. `bookings.js` (HIGH - primary lesson booking)
3. `groupBookings.js`, `rentals.js`, `wallet.js` (HIGH - major flows)
4. 8 medium-priority service files

**Deliverable Format:**
```
Each updated file should:
- Replace insertNotification with dispatchNotification/dispatchToStaff
- Use PHASE3_MIGRATION_GUIDE.md for exact line numbers
- Include try/catch around notification calls
- Not break main operation if notification fails
```

### Code-Reviewer
**Responsibility:** Review each completed file update
**Checklist:**
- [ ] Import validation (dispatchNotification not insertNotification)
- [ ] API consistency (dispatchNotification vs dispatchToStaff)
- [ ] Preference checking enabled (checkPreference: true)
- [ ] Idempotency keys unique
- [ ] Data payloads include CTAs
- [ ] Error handling graceful
- [ ] No manual preference queries

**Status Options:** APPROVED | NEEDS CHANGES | BLOCKED

### Reality-Checker
**Responsibility:** Run tests as Phase 3 files complete
**Tests to Run:**
```bash
npm run test -- notificationDispatcher        # Unit tests
npm run test -- notificationIntegration       # Integration tests
```

**Report:** After each file:
- "Tests PASS for [filename]"
- "Tests FAIL: [specific error]"

### Senior-Dev
**Responsibility:** Architecture review & feedback
**Input:**
- Feedback on PREFERENCE_MAP usage
- Guidance on error handling patterns
- Sign-off on major refactors

---

## File-by-File Migration Plan

### CRITICAL (START FIRST)
```
📁 backend/services/bookingNotificationService.js (1278 lines)
├─ 622-631: Student notification → dispatchNotification()
├─ 666-674: Instructor notification → dispatchNotification()
├─ 703-717: DELETE _checkUserBookingAlerts() method
├─ 722-800: REFACTOR _notifyStaffAboutNewBooking() → dispatchToStaff()
└─ Lines 775,836,981,1066,1207,1244: All insertNotification → dispatchNotification()
```

### HIGH PRIORITY
```
📁 backend/routes/bookings.js (6500+ lines)
├─ Line 18: ✅ Already uses dispatchNotification
└─ Lines 2147,4054,6075,6098,6232,6321,6395: insertNotification → dispatchNotification()

📁 backend/routes/groupBookings.js
├─ 6 insertNotification calls to replace
└─ Pattern: dispatchNotification() for single user, dispatchToStaff() for staff

📁 backend/routes/rentals.js
├─ 2 insertNotification calls
└─ Types: rental_customer, new_rental_alert, rental_approved, rental_declined

📁 backend/routes/wallet.js
├─ 1 insertNotification call
└─ Type: bank_transfer_deposit, payment, shop_order

📁 backend/routes/shopOrders.js
├─ 1 insertNotification call
└─ Type: shop_order

📁 backend/routes/instructorAvailability.js
├─ 1 insertNotification call
└─ Type: instructor_time_off_request
```

### MEDIUM PRIORITY
```
📁 backend/services/ (7 files)
├─ quickLinksService.js (Type: quick_link_registration)
├─ ratingService.js (Types: rating_request, lesson_rating_instructor)
├─ repairRequestService.js (Types: repair_update, repair_comment)
├─ userRelationshipsService.js (Types: friend_request, friend_request_accepted)
├─ waiverNotificationService.js (Type: waiver)
├─ weatherMonitoringService.js (Type: weather)
└─ memberOfferings.js (Raw SQL INSERT → dispatchNotification)
```

### REFERENCE
- **PHASE3_MIGRATION_GUIDE.md** — Step-by-step instructions for each file
- **notificationDispatcherUnified.js** — API documentation and examples
- **NOTIFICATION_TYPES** — Registry of 30+ valid types

---

## Testing Strategy (Phase 4)

### Unit Tests (30+ cases)
```
✅ NOTIFICATION_TYPES registry
✅ PREFERENCE_MAP coverage
✅ dispatchNotification() validation
✅ dispatchToStaff() functionality
✅ Cache behavior
✅ Error handling
```

### Integration Tests (25+ cases)
```
✅ Package purchase flow (Bug #1)
  └─ Staff notification + Customer confirmation
✅ Accommodation booking flow (Bug #4)
  └─ Staff notification + Guest confirmation
✅ Preference respect (both flows)
✅ Idempotency (no duplicates)
✅ Cross-notification consistency
✅ Error resilience
```

### Real-World E2E (Optional)
```
[ ] Purchase a package:
    └─ Admin/manager receives notification
    └─ Customer receives confirmation
    └─ Both respect notification_settings
[ ] Book accommodation:
    └─ Staff receives notification
    └─ Guest receives confirmation
    └─ Both respect notification_settings
```

---

## Success Criteria

### Phase 3 Completion (14 files)
- [ ] All 14 files migrated to dispatchNotification
- [ ] Code compiles without errors
- [ ] Code-Reviewer approves all files
- [ ] No manual preference checking code remains
- [ ] All insertNotification calls replaced

### Phase 4 Completion (Testing)
- [ ] All unit tests PASS
- [ ] All integration tests PASS
- [ ] 100% of Phase 3 migrations covered by tests
- [ ] No regressions in existing notification flows
- [ ] Reality-Checker sign-off

### Overall Project Completion (All Phases)
- [ ] Phases 1-4 all 100% complete
- [ ] All 2 critical bugs fixed
- [ ] Full architecture migration complete
- [ ] Comprehensive test coverage
- [ ] Ready for production deployment

---

## Risks & Mitigation

### Risk: Scope Creep (Phase 3)
**Mitigation:** Fixed scope of 14 files + clear priority ordering

### Risk: Preference Checking Bugs
**Mitigation:** Dispatcher handles all preference logic (single source of truth)

### Risk: Duplicate Notifications
**Mitigation:** Idempotency keys with unique format (event:id:role:userId)

### Risk: Test Failures on Later Files
**Mitigation:** Reality-Checker monitors tests as each file completes

### Risk: Missing Notification Type
**Mitigation:** NOTIFICATION_TYPES registry with validation in dispatcher

---

## Timeline & Milestones

| Phase | Status | Deadline | Owner |
|-------|--------|----------|-------|
| **Phase 1** | ✅ Complete | 2026-04-07 | DB-Optimizer |
| **Phase 2** | ✅ Complete | 2026-04-07 | Backend-Architect |
| **Phase 3** | 🔄 In Progress | TBD (3-4 hrs) | Backend-Architect + Code-Reviewer |
| **Phase 4** | 🧪 Testing | TBD (2-3 hrs) | Reality-Checker |
| **Overall** | 🚀 On Track | TBD (6-8 hrs) | All |

---

## How to Monitor Progress

### Check Backend-Architect Status:
```bash
git log --oneline | head -10  # See commits
grep -c "dispatchNotification" backend/**/*.js  # Count migrations
```

### Run Phase 4 Tests:
```bash
npm run test -- notificationDispatcher  # Unit tests
npm run test -- notificationIntegration # Integration tests
```

### Check Code Review Status:
- Reality-Checker reports "PASS" or "FAIL" for each file reviewed

---

## How to Support During Phase 3/4

### If Backend-Architect Gets Stuck:
1. Check PHASE3_MIGRATION_GUIDE.md for exact patterns
2. Compare against successfully migrated files (services.js, accommodation.js)
3. Run `npm run dev:backend` to test compilation
4. Ask Senior-Dev for architecture guidance

### If Tests Fail:
1. Check the specific test case that failed
2. Run tests with verbose output: `npm run test -- --reporter=verbose`
3. Compare actual behavior against expected in test comments
4. May indicate type validation, preference map, or idempotency issue

### If Code-Reviewer Rejects:
1. Read the specific feedback
2. Use PHASE3_MIGRATION_GUIDE.md code review checklist
3. Make the required changes
4. Re-submit for review

---

## Deliverables Summary

### Completed (4 Commits)
✅ `06606be` - Phase 1-2 foundation (migrations + dispatcher)
✅ `75d070b` - Phase 3 bug fixes (package purchase + accommodation)
✅ `172cd81` - Phase 3 migration guide
✅ `9d698fe` - Phase 4 tests (unit + integration)

### In Progress (Phase 3 migrations by Backend-Architect)
🔄 TBD - `bookingNotificationService.js`
🔄 TBD - `bookings.js` + 12 other files

### Pending (Phase 4 sign-off by Reality-Checker)
⏳ TBD - Final test report and sign-off

---

## Next Steps

1. **Immediately:**
   - Backend-Architect: Start Phase 3 migration (bookingNotificationService.js first)
   - Code-Reviewer: Wait for first file update, then begin review
   - Reality-Checker: Run tests after first file completes

2. **As work progresses:**
   - Each file → Code Review → Tests → Commit
   - Parallel workflow = faster completion

3. **After Phase 3 completes:**
   - Final Phase 4 validation
   - Production readiness assessment
   - Deployment planning

---

**Status: Ready for parallel execution. Agents are briefed and standing by.** 🚀
