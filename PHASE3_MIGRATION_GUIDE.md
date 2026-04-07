# Phase 3 Migration Guide - Replace insertNotification with dispatchNotification

This guide provides step-by-step instructions for updating the remaining 14 files to use the unified notification dispatcher.

## Migration Pattern

### Step 1: Update Imports
Replace:
```javascript
import { insertNotification } from '../services/notificationWriter.js';
```

With:
```javascript
import { dispatchNotification, dispatchToStaff } from '../services/notificationDispatcherUnified.js';
```

### Step 2: Replace Single-User Notifications
Replace:
```javascript
await insertNotification({
  userId: '...',
  title: '...',
  message: '...',
  type: 'booking_student',
  data: { /* ... */ },
  idempotencyKey: '...'
});
```

With:
```javascript
await dispatchNotification({
  userId: '...',
  type: 'booking_student',
  title: '...',
  message: '...',
  data: { /* ... */ },
  idempotencyKey: '...',
  checkPreference: true
});
```

### Step 3: Replace Staff Notifications
For notifications to admin/manager/owner staff, replace manual staff queries with:
```javascript
await dispatchToStaff({
  type: 'new_booking_alert',
  title: '...',
  message: '...',
  data: { /* ... */ },
  idempotencyPrefix: 'booking-created:${bookingId}',
  excludeUserIds: [userId],
  roles: ['admin', 'manager', 'owner']
});
```

### Step 4: Remove Manual Preference Checking
Delete code like:
```javascript
const result = await client.query(
  `SELECT COALESCE(ns.new_booking_alerts, true) FROM notification_settings WHERE user_id = $1`,
  [userId]
);
if (result.rows[0]?.new_booking_alerts === false) {
  return; // skip notification
}
```

The dispatcher handles this automatically when `checkPreference: true`.

## Files to Update (Priority Order)

### HIGH PRIORITY (Core Booking System)

#### 1. `backend/services/bookingNotificationService.js` (1278 lines)
**Impact:** Used by bookings.js, affects ~30% of notifications

**Changes Required:**
- Line 3: Remove `import notificationDispatcher from './notificationDispatcher.js'`
- Line 5: Change `insertNotification` to `dispatchNotification, dispatchToStaff`
- Line 622-631: Update student notification to use `dispatchNotification`
- Line 666-674: Update instructor notification to use `dispatchNotification`
- Line 703-717: **DELETE** `_checkUserBookingAlerts` method (dispatcher handles this)
- Line 722-800: Refactor `_notifyStaffAboutNewBooking` to use `dispatchToStaff`
- Lines 775, 836, 981, 1066, 1207, 1244: All insertNotification calls → `dispatchNotification`

**Migration Pattern for _notifyStaffAboutNewBooking:**
```javascript
// Replace the complex query + multiple insertNotification calls with:
await dispatchToStaff({
  type: 'new_booking_alert',
  title: notificationTitle,
  message: staffMessage,
  data: notificationData,
  idempotencyPrefix: `booking-created:${bookingId}`,
  excludeUserIds: [instructorId, createdBy].filter(Boolean),
  roles: ['admin', 'manager', 'owner']
});
```

#### 2. `backend/routes/bookings.js` (6500+ lines)
**Impact:** Primary booking endpoint, affects lesson booking notifications

**Changes Required:**
- Line 18: ✅ Already updated (import dispatchNotification)
- Line 2147-2170: Replace insertNotification (group session invite)
- Line 4054-4062: Replace insertNotification (reschedule notification)
- Line 6075-6090: Replace insertNotification
- Line 6098-6113: Replace insertNotification
- Line 6232-6247: Replace insertNotification
- Line 6321-6336: Replace insertNotification
- Line 6395-6410: Replace insertNotification

**Note:** Lines using bookingNotificationService.sendBookingCreated() are already correct and don't need changes.

### HIGH PRIORITY ROUTES (5 files)

#### 3. `backend/routes/groupBookings.js`
**insertNotification calls:** Multiple
**Notification types:** group_booking_*
**Pattern:** Group creation, member acceptance, payment notifications

#### 4. `backend/routes/rentals.js`
**insertNotification calls:** Multiple
**Notification types:** rental_customer, new_rental_alert
**Pattern:** Rental requests, approvals, declines

#### 5. `backend/routes/wallet.js`
**insertNotification calls:** Multiple  
**Notification types:** payment, bank_transfer_deposit
**Pattern:** Wallet deposits, payment confirmations

#### 6. `backend/routes/shopOrders.js`
**insertNotification calls:** Multiple
**Notification types:** shop_order
**Pattern:** Order confirmations, status updates

#### 7. `backend/routes/instructorAvailability.js`
**insertNotification calls:** Single or multiple
**Notification types:** instructor_time_off_request
**Pattern:** Availability change notifications

### MEDIUM PRIORITY SERVICES (7 files)

#### 8. `backend/services/quickLinksService.js`
**Notification type:** quick_link_registration

#### 9. `backend/services/ratingService.js`
**Notification types:** rating_request, lesson_rating_instructor

#### 10. `backend/services/repairRequestService.js`
**Notification types:** repair_update, repair_comment

#### 11. `backend/services/userRelationshipsService.js`
**Notification types:** friend_request, friend_request_accepted

#### 12. `backend/services/waiverNotificationService.js`
**Notification type:** waiver

#### 13. `backend/services/weatherMonitoringService.js`
**Notification type:** weather

#### 14. `backend/routes/memberOfferings.js` (Lines 1160, 1178)
**Pattern:** Raw SQL bypasses that create notifications
**Action:** Move notification creation out of SQL, use dispatcher

### LOWER PRIORITY

#### 15. `backend/routes/notifications.js`
- Notification management endpoints
- Usually doesn't create notifications, just manages existing ones

## Testing Checklist After Each File Update

- [ ] Code compiles without errors
- [ ] Type validation passes (notification type in NOTIFICATION_TYPES registry)
- [ ] Idempotency keys are unique per user/entity combination
- [ ] User preference checking is enabled (`checkPreference: true`)
- [ ] For staff notifications, correct roles are targeted
- [ ] No manual preference queries remain (dispatcher handles it)
- [ ] Error handling is in place (notifications shouldn't fail the main operation)

## Implementation Commands

### Quick Status Check
```bash
# Count remaining insertNotification uses
grep -r "insertNotification" backend/ --include="*.js" | grep -v notificationWriter | grep -v notificationDispatcherUnified | wc -l

# Find all files still using old import
grep -r "from.*notificationWriter" backend/routes backend/services --include="*.js"
```

### After Each File Update
```bash
npm run dev:backend    # Test compilation
npm run test           # Run unit tests if available
```

## Key Success Metrics

- ✅ All insertNotification calls replaced with dispatchNotification/dispatchToStaff
- ✅ No manual preference checking code remains
- ✅ All notification types exist in NOTIFICATION_TYPES registry
- ✅ Idempotency keys follow pattern: `<event>-<entityId>:<recipient-role>:<userId>`
- ✅ Tests pass for updated endpoints
- ✅ No increase in error logs for notification failures

## Notes

1. **Error Handling:** Notifications should never fail the main operation. Wrap in try/catch and log warnings, not errors.

2. **Idempotency Keys:** Follow format: `event:entityId:role:userId`
   - Example: `booking-created:${bookingId}:student:${studentId}`

3. **Staff Notifications:** Always use `dispatchToStaff` with appropriate `excludeUserIds` to avoid notifying the person who triggered the action

4. **Transactional:** For notifications that must be sent (critical transactions), use `checkPreference: false`
   - Example: Payment confirmations, cancellation confirmations

5. **Data Structure:** Keep `data` object consistent for each notification type across all callers - this improves frontend consistency
