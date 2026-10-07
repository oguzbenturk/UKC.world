# Instructor earnings page + payout requests — spec (2026-10-07)

Owner decision: rebuild the instructor view of `/finance` (design: `demo-aydin/design/earnings-mobile.dc.html`, `demo-aydin/design/earnings-desktop.dc.html` in the workspace root, one level above this repo) and add payout requests with in-app + Telegram notifications.

## 1. Data model

New migration `backend/db/migrations/<next>_create_instructor_payout_requests.sql`:

```
instructor_payout_requests
  id                 uuid pk default gen_random_uuid()
  instructor_id      uuid not null references users(id)
  amount             numeric(12,2) not null check (amount > 0)
  currency           varchar(3) not null default 'EUR'
  preferred_method   varchar(32)            -- 'bank_transfer' | 'cash' | 'other' (free, optional)
  note               text                   -- instructor's note (max 500)
  status             varchar(16) not null default 'pending'
                     check (status in ('pending','paid','rejected','cancelled'))
  admin_note         text                   -- reason on reject / reference on pay
  decided_by         uuid references users(id)
  decided_at         timestamptz
  payment_id         uuid                   -- the instructor payment row created on approve (same table/id the existing POST /api/finances/instructor-payments writes)
  created_at         timestamptz not null default now()
  updated_at         timestamptz not null default now()
unique index: one 'pending' request per instructor (partial unique on instructor_id where status='pending')
index (status, created_at desc)
```

## 2. API

All amounts in responses are numbers with 2 decimals (computed with Decimal.js), always with a `currency` field (EUR = business currency today).

### Instructor (role instructor; manager too when the manager has instructor earnings)
- `GET /api/instructors/me/earnings-summary?period=week|month|year|all` → 
  ```
  { period: { key, start, end, label },
    currency: 'EUR',
    earned, previousEarned, changePct,            // NET (lesson earnings − deductions in the period); previous = previous calendar period (null for 'all')
    lessons, hours, avgPerLesson,                  // avgPerLesson = gross lesson earnings / lessons
    byLessonType: [ { key, label, commissionType: 'fixed'|'percentage', rate, hours, lessons, amount } ],  // amount = GROSS per type; key = stable slug (private, semi_private, group, supervision, semi_private_supervision, rescue_boat, other); label English fallback
    deductions,                                    // the period's deductions, POSITIVE number, shown as −
                                                   // invariant: Σ byLessonType.amount − deductions = earned (2-dp Decimal)
    weekly: [ { weekStart, total } ],              // last 12 weeks, always — NET totals
    monthly: [ { month: 'YYYY-MM', total } ],      // last 6 months, always — NET totals
    balances: { totalEarned, paidOutNet, paidOutGross, deductionsTotal, available },  // available = totalEarned − paidOutNet, floored at 0
    threshold: { amount, meets, shortfall },       // INSTRUCTOR_PAYOUT_THRESHOLD (default 200)
    lastPayout: { date, amount, method, reference } | null,
    pendingRequest: { id, amount, createdAt, note } | null,
    updatedAt }
  ```
- `GET /api/instructors/me/earnings-activity?period=…&type=all|lessons|payouts&status=all|pending|paid&search=&limit=50&offset=0` →
  `{ items: [ { kind: 'lesson', id, date, startHour, student, groupSize, lessonType, hours, commissionType, rate, amount, status: 'pending'|'paid' } | { kind: 'payout', id, date, amount, method, reference, status: 'paid' } | { kind: 'deduction', id, date, amount, description } ], total }`
  Lesson `status` is derived FIFO: net payouts cover the oldest earnings first; lessons fully covered are `paid`, the rest `pending`. Document this in code.
  `deduction.amount` is a POSITIVE number (UI renders it as −). `status` filter is applied after the FIFO derivation and before pagination (`total` reflects it); it matches `item.status` (payouts are `paid`, deductions have no status → only with `status=all`).
- `GET /api/instructors/me/payout-requests` → own requests, newest first (plain array of `{ id, instructorId, amount, currency, preferredMethod, note, status, adminNote, decidedBy, decidedByName, decidedAt, paymentId, paidAmount, createdAt, updatedAt }`).
- `POST /api/instructors/me/payout-requests` body `{ amount, preferredMethod?, note? }`
  - 409 `PENDING_EXISTS` if a pending request exists; 400 `BELOW_THRESHOLD` if available < threshold; 400 `AMOUNT_BELOW_THRESHOLD` if amount < threshold.amount; 400 `AMOUNT_ABOVE_AVAILABLE` if amount > balances.available; 400 `VALIDATION_ERROR` if amount ≤ 0 / malformed. Errors are `{ error, code }`. Success → 201 with the request object.
  - Creates the row, notifies every active admin and manager: in-app notification + Telegram (only users with a linked Telegram chat) — "💸 Payout request: <instructor> requests €X (available €Y)". Link to the admin requests list.
- `DELETE /api/instructors/me/payout-requests/:id` → cancel own pending request (status → cancelled); returns the request. 404 if not own, 409 `NOT_PENDING` if already decided.
- `GET /api/instructors/me/earnings-statement?month=YYYY-MM&format=csv|pdf` → statement for one month. CSV only (UTF-8 BOM, `attachment; filename="earnings-statement-YYYY-MM.csv"`); `format=pdf` → 400 `{ code: 'FORMAT_NOT_SUPPORTED' }` and the UI hides PDF.

### Admin / manager
- `GET /api/finances/payout-requests?status=pending|paid|rejected|cancelled|all` → plain array (pending first, then newest) of request objects + `instructorName, instructorEmail, instructorAvatar, available`.
- `POST /api/finances/payout-requests/:id/pay` body `{ amount?, paymentMethod, referenceNumber?, note? }` → in ONE transaction: record the instructor payment exactly like `POST /api/finances/instructor-payments` does today (reuse that service code, do not duplicate the ledger logic), set request `paid`, `payment_id`, `decided_by/at`. Notify the instructor (in-app + Telegram if linked): "✅ Your payout of €X was paid (<method>)."
- `POST /api/finances/payout-requests/:id/reject` body `{ reason }` (required) → status `rejected`; notify instructor (in-app + Telegram): "Your payout request of €X was declined: <reason>".
- Pending count for a badge: `GET /api/finances/payout-requests/count?status=pending` → `{ count }`.

Notifications must use the existing unified notification dispatcher / Telegram service (see docs/wiki/Notifications_System.md) and respect user notification settings; Telegram only when the user has a linked chat. Socket event `payout_request:updated` with payload `{ id, status, instructorId, amount, action }` to the instructor's `user:<id>` room and to the `role:admin` / `role:manager` rooms so badges refresh. Notification types: `payout_request_created` (staff), `payout_request_paid`, `payout_request_rejected` (instructor), gated by `notification_settings.payment_notifications`; Telegram templates EN/TR in `backend/services/telegramTemplates/payout.js`.

## 3. UI

- Instructor `/finance` → new `InstructorEarningsPage` replacing `InstructorFinanceView` for role instructor (keep the old components untouched; admin screens still use PayrollDashboard / InstructorPayments).
- Request payout: button opens a bottom sheet (mobile) / modal (desktop) with amount (default = available, editable, max = available), preferred method, note → confirm → success state showing amount + "we notified the manager". While a request is pending the button becomes "Payout requested · €X" with a Cancel action.
- Admin/manager: a "Payout requests" list (pending first) reachable from Finance navigation and from the instructor detail; Pay (pre-filled amount, method, reference) and Decline (reason) actions; badge with the pending count on the nav item.
- The instructor dashboard's "Eligible to request payout now" link must open the request flow.
- All strings in i18n (en, tr, de, fr, es, ru); `node scripts/check-i18n-keys.mjs` must stay at 0 missing.

## 4. Data fixes included
- Money math in Decimal.js; currency-aware sums (convert non-EUR rows via currency_settings like the finance routes do).
- "Paid out" is NET (payments − deductions) everywhere on instructor screens, gross shown as secondary.
- Lesson dates handled as plain dates (no UTC shift).
