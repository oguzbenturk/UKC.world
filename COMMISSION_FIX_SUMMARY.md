# Commission Calculation Fix Summary

## Problem Statement

When checking instructor commissions, there was a major discrepancy:
- **Instructor History Page**: Showed 1500€ total/unpaid commissions for 2026
- **Finance Lessons Page**: Showed only 450€ instructor commissions for 2026
- **Discrepancy**: 1050€ difference (70% underreported)

## Root Cause Analysis

### Investigation Steps

1. **Identified Data Sources**
   - Instructor history calls `/finances/instructor-earnings/:instructorId` endpoint
   - Uses `getInstructorEarningsData()` from `instructorFinanceService.js`
   - Finance page uses commission calculation query in `finances.js` lines 2031-2070

2. **Comparison Test** (`compare-commission-calculations.mjs`)
   - Method 1 (instructorFinanceService): **1500 EUR** ✅
   - Method 2 (finance page query): **650 EUR** ❌
   - Discrepancy: **850 EUR**

3. **Package Booking Investigation** (`debug-package-booking.mjs`)
   - Found 10 package bookings out of 13 total
   - Package bookings have `final_amount = 0` in bookings table
   - Reason: Customer already paid when purchasing the package
   - Old query: `NULLIF(b.final_amount, 0)` → returns NULL → falls back to 0

### The Critical Bug

**Old logic (BROKEN):**
```sql
COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * commission_rate / 100
```

For package bookings where `final_amount = 0`:
- Result: `0 * 50% = 0 EUR` (WRONG!)

**Package bookings were completely excluded from commission calculations.**

## Solution

### Updated Commission Query Logic

The fix handles **three scenarios**:

#### 1. Package Bookings with Fixed Hourly Rate
```sql
WHEN b.customer_package_id IS NOT NULL AND commission_type = 'fixed' THEN
  commission_value * b.duration
```
Example: €50/hour × 2 hours = **€100**

#### 2. Package Bookings with Percentage Commission
```sql
WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 THEN
  ((cp.purchase_price / cp.total_hours) * b.duration) * commission_rate / 100
```
Example: (€400 package / 10 hours × 3 hours) × 50% = **€60**

#### 3. Standalone Bookings
```sql
WHEN commission_type = 'fixed' THEN commission_value * b.duration
WHEN commission_type = 'percentage' THEN final_amount * commission_rate / 100
```

### Key Changes in `backend/routes/finances.js`

**Added JOINs:**
```sql
LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
```

**New CASE Statement** (lines 2038-2064):
1. Check if package booking → use package price calculation
2. Check commission type (fixed vs percentage)
3. Calculate appropriately for each scenario
4. Fallback to standalone booking logic

## Test Results

### Before Fix
```
Finance Page Commission: 650 EUR
Instructor History: 1500 EUR
Discrepancy: 850 EUR (56.7% underreported)
```

### After Fix
```
Finance Page Commission: 1500 EUR
Instructor History: 1500 EUR
✅ MATCH: 0 EUR difference
```

### Breakdown by Booking Type
- **Package Bookings**: 10 (with fixed hourly rates: €40-50/h)
- **Standalone Bookings**: 3 (with percentage commissions: 50%)
- **Total Commission**: 1500 EUR

## Files Modified

1. **backend/routes/finances.js** (lines 2031-2070)
   - Updated instructor commission calculation query
   - Added package booking support
   - Fixed commission type handling

## Verification Scripts

Created test scripts to verify the fix:

1. **compare-commission-calculations.mjs**
   - Compares both calculation methods
   - Identifies discrepancies
   - Shows sample booking breakdowns

2. **test-commission-fix.mjs**
   - Tests the updated SQL query
   - Confirms 1500 EUR match
   - Shows booking type distribution

3. **debug-package-booking.mjs**
   - Inspects package booking data
   - Calculates expected commission values
   - Verifies commission types (fixed vs percentage)

4. **check-shop-orders.mjs**
   - Utility script for investigating shop orders
   - Verified instructor commission history structure

## Technical Details

### Commission Types

**Percentage Commission:**
- Stored as: `50` (meaning 50%)
- Calculation: `lesson_amount * 50 / 100`
- Used for: Revenue-sharing arrangements

**Fixed Commission:**
- Stored as: `50` (meaning €50/hour)
- Calculation: `50 * lesson_duration`
- Used for: Hourly rate instructors

### Package Booking Flow

1. Customer purchases package (e.g., "Starter Pack Private" - €400 for 10 hours)
2. Package record created in `customer_packages` table
3. Bookings linked to package via `customer_package_id`
4. Booking has `final_amount = 0` (already paid)
5. Commission calculated from: `(package_price / total_hours) * lesson_duration`

### Database Schema

**Key Tables:**
- `bookings` - Main booking records
- `customer_packages` - Package purchases
- `service_packages` - Package definitions
- `booking_custom_commissions` - Per-booking commission overrides
- `instructor_service_commissions` - Service-specific rates
- `instructor_default_commissions` - Instructor default rates

## Impact

### Before
- Finance reports underreported instructor costs by ~56%
- Package lesson commissions were invisible
- Incorrect profit margins calculated
- Payroll reconciliation issues

### After
- ✅ Accurate commission tracking
- ✅ Package bookings properly included
- ✅ Matches instructor payroll records
- ✅ Correct financial reporting

## Lessons Learned

1. **Package bookings require special handling** - Zero final_amount doesn't mean zero commission
2. **Commission types matter** - Fixed hourly rates vs percentage-based calculations
3. **Test with real data** - Edge cases (packages) only visible with production data
4. **Cross-reference calculations** - Instructor history revealed the discrepancy
5. **Database transactions** - Package purchase and booking creation are separate events

## Next Steps

1. ✅ Fix applied and tested
2. ⏳ Add tooltip to finance page explaining commission calculation
3. ⏳ Add debug logging for commission calculations
4. ⏳ Test in browser with production data
5. ⏳ Monitor for any remaining edge cases

## Related Issues

- Date picker fixes (moment → dayjs conversion)
- Quick range buttons (Today, This Week, This Month, etc.)
- Shop finance connection to shop_orders table
- Expenses page creation (manual staff entries)

## Author Notes

**Investigation Date**: January 19, 2026
**Fix Applied**: backend/routes/finances.js
**Test Result**: ✅ 100% match (1500 EUR)
**Production Impact**: HIGH - Financial reporting accuracy critical
**Rollback Plan**: Revert to previous query if issues arise (query backed up in git)

---

**Status**: ✅ RESOLVED
**Verified By**: Automated test scripts + manual calculation verification
**Ready for**: Browser testing and production deployment
