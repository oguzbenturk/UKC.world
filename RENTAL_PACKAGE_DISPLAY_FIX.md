# Rental Package Display Fix

## Problem
Customer profiles were not showing rental packages or the rental portion of combo packages. Only lesson hours were displayed.

## Root Cause
The `customer_packages` table only had columns for lesson hours:
- `total_hours`
- `used_hours`
- `remaining_hours`

But no columns for rental days or accommodation nights.

## Solution

### 1. Database Migration (132)
Created migration `132_add_rental_package_support.sql` to add the following columns to `customer_packages`:

**Package Type Classification:**
- `package_type` - VARCHAR(50): 'lesson', 'rental', 'combo', 'accommodation'
- `includes_lessons` - BOOLEAN: Whether package includes lesson hours
- `includes_rental` - BOOLEAN: Whether package includes rental days
- `includes_accommodation` - BOOLEAN: Whether package includes accommodation

**Rental Package Fields:**
- `rental_days_total` - NUMERIC(5,2): Total rental days in package
- `rental_days_used` - NUMERIC(5,2): Rental days used
- `rental_days_remaining` - NUMERIC(5,2): Rental days remaining
- `rental_service_id` - UUID: Reference to rental equipment service
- `rental_service_name` - VARCHAR(255): Name of rental equipment

**Accommodation Package Fields:**
- `accommodation_nights_total` - INTEGER: Total accommodation nights
- `accommodation_nights_used` - INTEGER: Accommodation nights used
- `accommodation_nights_remaining` - INTEGER: Accommodation nights remaining
- `accommodation_unit_id` - UUID: Reference to accommodation unit
- `accommodation_unit_name` - VARCHAR(255): Name of accommodation unit

**Constraints and Indexes:**
- Added check constraints for rental days and accommodation nights
- Added indexes for performance on `package_type`, `includes_rental`, `rental_service_id`

### 2. Backend Changes

**File:** `backend/services/studentPortalService.js`

Updated the packages query to include all new rental and accommodation fields:
```javascript
SELECT cp.id,
       cp.package_name,
       cp.total_hours,
       cp.used_hours,
       cp.remaining_hours,
       // ... existing fields ...
       cp.package_type,
       cp.includes_lessons,
       cp.includes_rental,
       cp.includes_accommodation,
       cp.rental_days_total,
       cp.rental_days_used,
       cp.rental_days_remaining,
       cp.accommodation_nights_total,
       cp.accommodation_nights_used,
       cp.accommodation_nights_remaining,
       cp.rental_service_id,
       cp.rental_service_name,
       cp.accommodation_unit_id,
       cp.accommodation_unit_name
  FROM customer_packages cp
 WHERE cp.customer_id = $1
```

Updated the package mapping to return all rental fields in the API response:
```javascript
{
  id, name, lessonType, packageType,
  totalHours, usedHours, remainingHours, utilisation,
  includesLessons, includesRental, includesAccommodation,
  rentalDaysTotal, rentalDaysUsed, rentalDaysRemaining,
  rentalServiceId, rentalServiceName,
  accommodationNightsTotal, accommodationNightsUsed, accommodationNightsRemaining,
  accommodationUnitId, accommodationUnitName,
  // ... other fields
}
```

### 3. Frontend Changes

**File:** `src/features/students/pages/StudentProfile.jsx`

Updated the `PackagesCard` component to display rental and accommodation information:

- Shows "🎓 Lesson Hours" section when `includesLessons` is true
- Shows "🏄 Rental Days" section when `includesRental` is true  
- Shows "🏨 Accommodation Nights" section when `includesAccommodation` is true
- Each section displays: Total, Used, Remaining counts
- Rental section shows equipment type
- Accommodation section shows unit name
- Package subtitle now shows "+ Rental" and "+ Accommodation" badges

### 4. How It Works Now

**Lesson-Only Package:**
```
Package Name: "Beginner Kitesurfing Course"
Type: Beginner Lessons
Status: ACTIVE | Expires Mar 15, 2026

🎓 Total Hours: 10.0 | Used: 3.5 | Remaining: 6.5 | Utilisation: 35%
```

**Rental-Only Package:**
```
Package Name: "Weekly Kite Rental"
Type: Equipment Rental
Status: ACTIVE | Expires Jan 31, 2026

🏄 Total Days: 7 | Used: 2 | Remaining: 5 | Equipment: Full Kite Set
```

**Combo Package (Lesson + Rental):**
```
Package Name: "Complete Beginner Package"
Type: Beginner Lessons + Rental
Status: ACTIVE | Expires Jun 30, 2026

🎓 Total Hours: 10.0 | Used: 3.0 | Remaining: 7.0 | Utilisation: 30%
────────────────────────────────────────────────────────────────
🏄 Total Days: 5 | Used: 2 | Remaining: 3 | Equipment: Beginner Kite
```

## Deployment Steps

### Step 1: Run Migration
```bash
cd backend
node run-migration-132.mjs
```

This will:
- Add new columns to `customer_packages` table
- Add check constraints
- Create indexes
- Update existing packages with default values

### Step 2: Verify Migration
Check that new columns exist:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'customer_packages' 
AND column_name LIKE '%rental%'
ORDER BY ordinal_position;
```

### Step 3: Test Package Display
1. Log in as a customer who has packages
2. Navigate to Profile page
3. Check "Package Summary" card
4. Verify rental packages now display correctly
5. Verify combo packages show both lesson and rental sections

### Step 4: Update Existing Data (If Needed)
If you have existing rental packages that need their data populated:
```sql
-- Example: Update a specific package to be a rental package
UPDATE customer_packages
SET includes_rental = TRUE,
    rental_days_total = 7,
    rental_days_used = 0,
    rental_days_remaining = 7,
    rental_service_name = 'Full Kite Set',
    package_type = 'rental'
WHERE id = 'your-package-uuid';

-- Example: Update a combo package
UPDATE customer_packages
SET includes_rental = TRUE,
    rental_days_total = 5,
    rental_days_used = 2,
    rental_days_remaining = 3,
    rental_service_name = 'Beginner Kite',
    package_type = 'combo'
WHERE id = 'your-combo-package-uuid';
```

## Files Changed

1. **backend/migrations/132_add_rental_package_support.sql** - NEW
   - Database migration to add rental/accommodation support

2. **backend/run-migration-132.mjs** - NEW
   - Script to run migration 132

3. **backend/services/studentPortalService.js** - UPDATED
   - Updated packages query to include rental fields
   - Updated package mapping to return rental data

4. **src/features/students/pages/StudentProfile.jsx** - UPDATED
   - Updated `PackagesCard` component to display rental and accommodation info
   - Shows sections conditionally based on package type

## Benefits

✅ Customers can now see rental package usage in their profile
✅ Combo packages (lesson + rental) display both components
✅ Accommodation packages supported for future use
✅ Clear visual separation between lesson hours and rental days
✅ Equipment and unit names displayed where applicable
✅ Backward compatible - existing lesson-only packages work fine

## Notes

- The `StudentCourses.jsx` page already had support for rendering rental packages, it just wasn't receiving the data from the backend
- All existing packages will default to `package_type = 'lesson'` and `includes_lessons = TRUE`
- New rental packages should be created with the appropriate flags set
- The migration is safe to run - it only adds new columns with defaults
