# Duplicate Key Investigation - WeekView.jsx

## Issue Summary
**Date**: January 17, 2026  
**Severity**: Critical  
**Component**: `WeekView.jsx`  
**Error**: `Warning: Encountered two children with the same key, ba8113eb-bb47-4fa6-a244-b7a5b6fa41e4`

## Root Cause Analysis

### The Problem
The WeekView component was using `booking.id` as the React key for `DraggableBooking` components:

```jsx
// BEFORE (Line 289) - INCORRECT
<DraggableBooking booking={booking} key={booking.id} className="w-full">
```

### Why This Caused Duplicate Keys

In the WeekView, bookings are rendered in a **nested loop structure**:
1. **Outer loop**: Iterate through days of the week (7 days)
2. **Inner loop**: Iterate through bookings for each day

```jsx
{weekDays.map((day) => {
  const dayBookings = getBookingsForDay(day.dateStr);
  return (
    <div key={day.dateStr}>
      {dayBookings.map((booking) => (
        <DraggableBooking key={booking.id} /> // ❌ PROBLEM HERE
      ))}
    </div>
  );
})}
```

**React's key requirement**: Keys must be unique among **siblings in the same parent**, not just globally unique.

### When Duplicate Keys Occur

This bug manifests in several scenarios:

#### Scenario 1: Same Booking Appears on Multiple Days (Most Common)
- A booking scheduled for multiple consecutive days
- The same `booking.id` renders under different day containers
- React sees the same key appearing multiple times in the overall render tree

**Example**:
- Booking `ba8113eb-bb47-4fa6-a244-b7a5b6fa41e4` scheduled for Monday + Tuesday
- Monday container: `<DraggableBooking key="ba8113eb-bb47-4fa6-a244-b7a5b6fa41e4" />`
- Tuesday container: `<DraggableBooking key="ba8113eb-bb47-4fa6-a244-b7a5b6fa41e4" />`
- Result: **Duplicate keys at the grid level**

#### Scenario 2: Data Duplication Bug
- Backend returns the same booking multiple times for the same day
- `getBookingsForDay()` contains duplicate entries

#### Scenario 3: Group Bookings with Multiple Participants
- If the same booking renders multiple times for different participants
- Though less likely in current implementation

### Why List View Didn't Show This Issue

The **BookingListView** uses a different structure:
```jsx
// List view - flat iteration
{bookings.map((booking) => (
  <BookingRow key={booking.id} /> // ✅ Works because flat list
))}
```

Since it's a **flat list** without nested day containers, each `booking.id` appears only once in the render tree.

## The Fix

Changed the key to combine `day.dateStr` with `booking.id`:

```jsx
// AFTER (Line 289) - CORRECT
<DraggableBooking booking={booking} key={`${day.dateStr}-${booking.id}`} className="w-full">
```

This ensures:
- ✅ Keys are unique even if the same booking appears on multiple days
- ✅ Each booking maintains its identity within its day container
- ✅ React can properly track and update components

## Testing Scenarios

To verify this fix works, test:

### Test 1: Multi-Day Booking
1. Create a booking that spans 2-3 consecutive days
2. View in WeekView calendar
3. Verify no duplicate key warnings
4. Verify booking appears correctly on all days

### Test 2: Same Time Slot, Different Days
1. Create multiple bookings at same time (e.g., 10:00 AM)
2. Schedule them on different days of the week
3. View in WeekView
4. Verify each displays independently without warnings

### Test 3: Group Booking with Multiple Participants
1. Create a group booking with 3+ participants
2. Schedule across multiple days
3. View in WeekView
4. Verify participant names display correctly without duplicates

### Test 4: Drag and Drop
1. Drag a booking from one day to another
2. Verify the booking updates correctly
3. Verify no console warnings during drag operation

## Prevention Measures

### Code Review Checklist
- [ ] When using `Array.map()` in nested loops, ensure keys are scoped to parent context
- [ ] Combine parent identifier with item identifier for uniqueness
- [ ] Never use array index as key for dynamic lists

### Pattern to Follow

```jsx
// ✅ CORRECT - Nested loops
{outerItems.map((outer) => (
  <div key={outer.id}>
    {innerItems.map((inner) => (
      <Component key={`${outer.id}-${inner.id}`} />
    ))}
  </div>
))}

// ❌ INCORRECT - Will cause duplicates if same inner item appears in multiple outer items
{outerItems.map((outer) => (
  <div key={outer.id}>
    {innerItems.map((inner) => (
      <Component key={inner.id} /> 
    ))}
  </div>
))}
```

### Similar Components to Audit

Check these components for similar issues:
- [ ] `MonthView.jsx` - Uses day grid with nested bookings
- [ ] `DailyView.jsx` - Time slots with bookings
- [ ] `CalendarGrid.jsx` - Any grid-based calendar layouts
- [ ] Any component with **nested mapping** of bookings

## Additional Fixes Applied

Also removed debug console.log from `BookingDetailModal.jsx` (line 131) that was logging booking data.

## Impact Assessment

**User Impact**:
- Visual glitches in calendar rendering
- Potential data display issues (bookings not updating correctly)
- React performance degradation due to reconciliation issues

**Business Impact**:
- Confusion when viewing multi-day bookings
- Potential for booking management errors
- Loss of user trust in calendar accuracy

## Related Documentation

- React Keys Documentation: https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key
- Previous fix: Changed participant name keys in WeekView from `n-${n}` to `${booking.id}-name-${idx}`

## Status

✅ **FIXED** - WeekView.jsx line 289 updated with composite key  
✅ **FIXED** - DailyView.jsx line 1267 updated with composite key  
✅ **FIXED** - Console.log removed from BookingDetailModal.jsx  
✅ **FIXED** - Added duplicate booking deduplication in WeekView.getBookingsForDay()  
✅ **FIXED** - Added duplicate booking deduplication in DailyView.getBookingsForInstructor()  
✅ **FIXED** - Added duplicate booking deduplication in MonthView.getBookingsForDay()  
⏳ **PENDING** - Testing in production environment  
⏳ **PENDING** - Investigate backend query to prevent duplicates at source

---

## CRITICAL UPDATE: Data Duplication Issue

### Secondary Bug Discovered (January 17, 2026)

After fixing the React key issues, **duplicate bookings were still appearing** in calendar views. The same booking ID (`ba8113eb-bb47-4fa6-a244-b7a5b6fa41e4`) was rendering multiple times on the same day.

### Root Cause: Booking Array Contains Duplicates

The `bookings` array from CalendarContext contains **duplicate booking objects**. This suggests one of:

1. **Backend SQL Query Issue**: The `LEFT JOIN booking_participants` in `/backend/routes/bookings.js` may be creating duplicate rows despite the `GROUP BY` clause
2. **Data Processing Bug**: Frontend data normalization might be creating duplicates
3. **State Update Race Condition**: Multiple state updates might be adding the same booking multiple times

### Evidence

User reported:
- Calendar shows 3 identical bookings at same time (screenshot provided)
- Database shows different times (data is correct in DB)
- Issue appears in **all calendar views EXCEPT list view**
- ListByView doesn't have this issue (uses different data path)

Error message:
```
Warning: Encountered two children with the same key, `2026-01-17-ba8113eb-bb47-4fa6-a244-b7a5b6fa41e4`
```

The key includes date (2026-01-17) + booking ID, proving the **same booking appears multiple times in the filtered array for that day**.

### Immediate Fix Applied

Added **deduplication** to all calendar view filtering functions:

**WeekView.jsx** (getBookingsForDay):
```javascript
const getBookingsForDay = (dayStr) => {
  const dayBookings = filteredBookings.filter(booking => booking.date === dayStr);
  
  // Remove duplicates by booking ID (critical bug fix)
  const uniqueBookings = Array.from(
    new Map(dayBookings.map(b => [b.id, b])).values()
  );
  
  return uniqueBookings;
};
```

**DailyView.jsx** (getBookingsForInstructor):
```javascript
const getBookingsForInstructor = useCallback((instructorId) => {
  const instructorBookings = dailyBookings.filter(booking => String(booking.instructorId) === String(instructorId));
  
  // Remove duplicates by booking ID (critical bug fix)
  const uniqueBookings = Array.from(
    new Map(instructorBookings.map(b => [b.id, b])).values()
  );
  
  return uniqueBookings;
}, [dailyBookings]);
```

**MonthView.jsx** (getBookingsForDay):
```javascript
// After the matchingBookings filter
// Remove duplicates by booking ID (critical bug fix)
const uniqueBookings = Array.from(
  new Map(matchingBookings.map(b => [b.id, b])).values()
);

return uniqueBookings;
```

### Why This Works

Using `Map` with booking ID as key ensures:
- Each booking ID appears only once
- Most recent version of the booking is kept (later entries overwrite earlier)
- O(n) time complexity (efficient)
- Maintains booking order

### Next Steps - Backend Investigation Required

**Must investigate and fix the root cause**:

1. **Check Backend Query** (`/backend/routes/bookings.js` lines 360-550):
   - Verify `GROUP BY b.id` is working correctly
   - Check if `LEFT JOIN booking_participants` creates duplicate rows
   - Test query directly in PostgreSQL with `DISTINCT ON` or proper aggregation

2. **Check Frontend Data Flow**:
   - Verify `standardizeBookingData()` in CalendarContext doesn't create duplicates
   - Check if event listeners are adding bookings multiple times
   - Review `updateCalendarData()` state update logic

3. **Database Integrity**:
   - Check for duplicate rows in `bookings` table: `SELECT id, COUNT(*) FROM bookings GROUP BY id HAVING COUNT(*) > 1`
   - Check for duplicate rows in `booking_participants` table

### Testing Requirements

After applying fixes, test:

1. ✅ Single booking with multiple participants - should show once
2. ✅ Same booking on same day - should show once
3. ✅ Same instructor teaching multiple bookings - each should show once
4. ✅ Group bookings with 3+ participants - should show once with all participant names
5. ⏳ Monitor console for any remaining duplicate key warnings
6. ⏳ Verify database query returns correct unique bookings
