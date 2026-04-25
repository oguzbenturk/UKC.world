# Self-Student → 45% Instructor Commission

## Context

At the academy, some customers are brought in personally by an instructor ("self students"). When that instructor teaches one of *their* self-students, the academy wants to pay them a **percentage commission of the lesson revenue (default 45%)** instead of the regular fixed/default commission.

Today, every booking runs through the same commission lookup hierarchy in [bookingUpdateCascadeService.js:332](backend/services/bookingUpdateCascadeService.js#L332). There is no concept of a customer being personally tied to a particular instructor for payout purposes (the existing `student_preferences.preferred_instructor_id` is a *booking preference*, not a payout linkage — they should NOT be conflated).

We need to:
1. Let admins/managers mark a customer as the "self student of [instructor]" from the customer drawer.
2. Make the per-instructor self-student rate configurable (default 45%).
3. Have the commission engine apply this rate **only** when `booking.instructor_user_id === customer.self_student_of_instructor_id`.

## Database

**New migration:** [backend/db/migrations/240_add_self_student_support.sql](backend/db/migrations/240_add_self_student_support.sql)

```sql
-- Link a customer to the instructor who personally brought them in.
ALTER TABLE users
  ADD COLUMN self_student_of_instructor_id uuid
    REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_users_self_student_of_instructor
  ON users(self_student_of_instructor_id)
  WHERE self_student_of_instructor_id IS NOT NULL;

-- Per-instructor override of the self-student commission %, defaults 45.
ALTER TABLE instructor_default_commissions
  ADD COLUMN self_student_commission_rate numeric(5,2) DEFAULT 45.00;
```

After adding the migration, run `npm run migrate:up` (per CLAUDE.md workflow rules).

## Backend

### 1. Allow the new field through the user update API
[backend/routes/users.js:21](backend/routes/users.js#L21) — add `'self_student_of_instructor_id'` to the `student` array in `roleSpecificFields`. (Leave the existing phantom `'instructor_id'` entry alone — out of scope.)

### 2. Highest-priority commission rule
[backend/services/bookingUpdateCascadeService.js:332](backend/services/bookingUpdateCascadeService.js#L332) — at the very top of `getCommissionRate()`, before the existing 4-step hierarchy, add:

```js
// 0. Self-student override: if the student is personally linked to THIS instructor,
//    use the instructor's configured self-student commission (default 45%).
if (booking.student_user_id && booking.instructor_user_id) {
  const selfStudent = await client.query(
    `SELECT u.self_student_of_instructor_id,
            COALESCE(idc.self_student_commission_rate, 45) AS rate
       FROM users u
       LEFT JOIN instructor_default_commissions idc
              ON idc.instructor_id = $2
      WHERE u.id = $1`,
    [booking.student_user_id, booking.instructor_user_id]
  );
  const row = selfStudent.rows[0];
  if (row && row.self_student_of_instructor_id === booking.instructor_user_id) {
    return {
      commissionType: 'percentage',
      commissionValue: new Decimal(row.rate).toNumber(),
    };
  }
}
```

This sits *above* the existing booking-custom / service / category / default cascade so it always wins when the linkage matches. If the booking instructor is someone else, the existing cascade runs unchanged.

The downstream earnings math at [backend/utils/instructorEarnings.js:115](backend/utils/instructorEarnings.js#L115) already handles `percentage` commission via `(lessonAmount * rate) / 100` — no changes needed there.

### 3. Expose the rate to the commission settings API
[backend/routes/instructorCommissions.js](backend/routes/instructorCommissions.js) — extend the GET/PUT for `instructor_default_commissions` to include `self_student_commission_rate` (read + update). Validate `0 ≤ rate ≤ 100`.

### 4. Include the rate in the instructors list payload
[backend/routes/instructors.js:38](backend/routes/instructors.js#L38) — the `GET /` query already joins `instructor_default_commissions`; add `self_student_commission_rate` to the SELECT so the frontend can display it on the instructor profile.

## Frontend

### Customer drawer (the user's primary ask)
[src/features/customers/components/EnhancedCustomerDetailModal.jsx](src/features/customers/components/EnhancedCustomerDetailModal.jsx)

The drawer already loads the full instructors list at line 211 via `DataService.getInstructors()`, so no new fetch is needed.

In the **Profile** tab, add a small "Self Student" section. UI pattern is the **switch-enables-select** pattern already used in [src/features/settings/components/StudentInstructorPreferences.jsx:143-155](src/features/settings/components/StudentInstructorPreferences.jsx#L143-L155):

```jsx
<Checkbox
  checked={!!customer.self_student_of_instructor_id}
  onChange={(e) => {
    if (!e.target.checked) {
      handleEditProfile({ self_student_of_instructor_id: null });
    }
    // when checked, the Select below becomes enabled; user picks an instructor
  }}
>
  Self student of an instructor
</Checkbox>

<Select
  showSearch
  allowClear
  optionFilterProp="label"
  disabled={!customer.self_student_of_instructor_id /* or local checkbox state */}
  value={customer.self_student_of_instructor_id}
  onChange={(instructorId) =>
    handleEditProfile({ self_student_of_instructor_id: instructorId })
  }
  options={instructors.map(i => ({
    value: i.id,
    label: `${i.first_name ?? ''} ${i.last_name ?? ''}`.trim() || i.name,
  }))}
/>
```

Reuse the existing `handleEditProfile` save flow at [EnhancedCustomerDetailModal.jsx:392-405](src/features/customers/components/EnhancedCustomerDetailModal.jsx#L392-L405). It already calls `DataService.updateUser` and refreshes via `fetchCustomerData()`.

### Instructor commission settings (small companion change)
Wherever the instructor's default commission is edited (the page powered by `instructorCommissions.js`), add a numeric input "Self student commission rate (%)" with 45 as the default. This lets admins tweak the per-instructor rate.

## Critical Files

- **NEW** [backend/db/migrations/240_add_self_student_support.sql](backend/db/migrations/240_add_self_student_support.sql)
- [backend/routes/users.js](backend/routes/users.js) — line 21
- [backend/services/bookingUpdateCascadeService.js](backend/services/bookingUpdateCascadeService.js) — `getCommissionRate()` at line 332
- [backend/routes/instructorCommissions.js](backend/routes/instructorCommissions.js) — extend GET/PUT
- [backend/routes/instructors.js](backend/routes/instructors.js) — add field to GET /
- [src/features/customers/components/EnhancedCustomerDetailModal.jsx](src/features/customers/components/EnhancedCustomerDetailModal.jsx) — Profile tab
- (Existing) [src/features/settings/components/StudentInstructorPreferences.jsx](src/features/settings/components/StudentInstructorPreferences.jsx) — copy the switch+select pattern
- (Existing) [backend/utils/instructorEarnings.js](backend/utils/instructorEarnings.js) — no edits, just relied on for `(amount × rate) / 100`

## Verification

1. `npm run migrate:up` — apply the new column.
2. `npm run db:dev:up && npm run dev`.
3. Open a customer drawer → enable "Self student of an instructor", pick **Alice** → save → reload drawer, confirm value persists.
4. Create a lesson booking: student = that customer, instructor = **Alice**. Check the new `instructor_earnings` row has `commission_type='percentage'` and `commission_value=45`, and `total_earnings = lesson_amount × 0.45`.
5. Create a second lesson with the same customer but instructor = **Bob**. Confirm commission falls back to Bob's normal default (no 45% override).
6. In instructor commission settings, change Alice's self-student rate to 50%. Edit/recalculate the booking from step 4 and confirm the rate updates to 50%.
7. Uncheck the self-student checkbox on the customer → confirm `self_student_of_instructor_id` is cleared and a new booking with Alice goes back to her normal commission.
