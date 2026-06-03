# Bookings System Health Report — 2026-06-02

Read-only audit. **No code was changed.** 12 flow-finders traced the real code; findings were
adversarially verified. 142 agents, ~2.7M tokens.

## Confidence tiers
- **[VERIFIED]** — a second skeptic agent independently confirmed it in code (15 findings).
- **[REPORTED]** — a finder traced it and the flow-summary corroborates it, but its independent
  verifier was cut off when the session limit hit at the very end of the run. High-trust, not double-checked.
- **[FALSE ALARM]** — investigated and refuted.

---

## Overall health

The **money math primitives are sound**. `partialLessonValue`, `computeBookingTotalAmount`,
the wallet ledger (Decimal 4dp, `getEntityNetCharges` net-of-refund, balance reconciliation),
the commission precedence chain, and the **pure-package** (not partial, not group) lifecycle are
correct and consistent between the writer and the read paths.

The bugs cluster in **four seams** where the clean core wasn't fully wired through:
1. **Partial bookings** (1h pack + 1h cash) — broken on almost every mutation *except* create.
2. **Group / multi-participant** — money layer treats a group as "primary × group_size".
3. **Admin cancel paths** (`POST /:id/cancel`, `PATCH /:id/status`) — never migrated to the
   correct refund pattern that the student portal and DELETE already use.
4. **Display/report surfaces** reading `final_amount` or truncated transaction sets.

---

## ✅ What's working correctly (verified)

- **`partialLessonValue` itself** — single-person partial valuation is correct and identical across
  writer + read paths.
- **Package hour consumption at create** — atomic `UPDATE … WHERE remaining_hours >= duration`
  guard prevents over-consumption and the concurrent-double-book race.
- **`'used_up'` enum fix** — the invalid `'completed'` status that caused the PUT 500 loop is gone
  (`consumeHoursFromPackage`, bookings.js:198).
- **Customer-package price-edit cascade** — rebases the discount, recomputes pending manager
  commissions + completed-booking instructor earnings, re-syncs `final_amount`, correctly skips
  paid-out rows. Order is right.
- **Instructor reassignment (normal/unpaid path)** — fixed end-to-end: new `instructor_user_id`
  flows into the cascade, `getCommissionRate` re-resolves, the earnings row is re-pointed via
  `COALESCE`, no duplicate row. (The old "pays old instructor" report is **not** reproducible
  except in the paid-out edge case below.)
- **Commission precedence** — self-student → custom → service → category (with
  semi-private-supervision group mapping) → default → €0. Correct, matches live SQL.
- **No double-subtraction of discounts across the two salary paths** — both flow through
  `computeBookingTotalAmount`.
- **DELETE path** — restores package hours per-participant, refunds via `getEntityNetCharges`
  (currency-correct, idempotent), cancels manager commissions in-tx.

---

## 🔴 Partial lessons (1h from pack + 1h from wallet) — most broken area

The single-person math is right, but **every reversal/edit path mishandles partials** because the
hours-drawn are recorded inconsistently (or not at all).

| # | Sev | Finding |
|---|-----|---------|
| P1 | **[VERIFIED] HIGH** | **Duration edit never reconciles package hours.** `reconcilePackageHoursOnDurationChange` filters `payment_status='package'`; its booking-level fallback also requires `='package'`. A partial is `'partial'`, so editing 2h→3h changes the booking + salary but leaves `used_hours`/`remaining_hours` frozen. Package ledger drifts. (bookings.js:231-268, 4290) |
| P2 | **[VERIFIED] HIGH** | **Wrong hours restored on delete/cancel.** Main DELETE restores **0** (the package hour is permanently lost). Cancel restores the **FULL duration** (phantom hours — the cash hour is credited back as package time). The paths disagree with each other. (bookings.js:5664-5669, 6477) |
| P3 | **[VERIFIED] HIGH** | **Calendar-created partials persist no `booking_participants` row** and no column stores `consumeFromPackage`. The exact hours drawn are unrecorded — this is the *root cause* that makes P1/P2 unfixable without a schema change. Every downstream path guesses `duration`. (bookings.js:3828-3936) |
| P4 | **[VERIFIED] HIGH** | **Group partial undercounts value.** `partialLessonValue` gets *one* person's package value but the *whole group's* cash, and there's no `group_size` multiply for `'partial'`. A 3-person partial group valued at €240 instead of €320 — the package-covered hours get swallowed by the cash floor. Commission + % earnings under-paid. (cascade:182-219) |
| P5 | **[REPORTED] HIGH** | **Cancel refund uses non-existent columns** `booking.package_id` / `booking.payment_method` (real cols are `customer_package_id` / `payment_status`). Guard is always false → partial cash refunded to **legacy `users.balance`** (wrong ledger — calendar charged the wallet), *plus* hours already restored = double compensation. (bookings.js:6530-6539) |
| P6 | **[REPORTED] HIGH** | **`final_amount` holds only the cash portion and is never resynced** (`syncBookingFinalAmountFromPackage` handles only `'package'`). So admin list, detail, customer portal, revenue snapshot, and dashboard all show the **cash-only** number while commissions use the full lesson value. (bookings.js:2186, cascade:572) |
| P7 | **[REPORTED] HIGH** | **Cash leg stale on duration edit** — earnings/commission recompute off the new duration, but `final_amount` (cash) and the package draw don't, so the realized split is internally inconsistent and the customer is over/under-charged. (bookings.js:4290) |
| P8 | **[REPORTED] HIGH** | **Delete of a calendar partial restores 0 hours AND issues no cash refund** — customer loses both the package hour and the cash. (bookings.js:5664-5700) |

> Note: `POST /` (the standard single-booking create) has **no partial branch at all** — its package
> path requires full coverage. Partials only originate from `POST /calendar` and `POST /group`.

---

## 📦 Package price edit — mostly solid, two real gaps

| # | Sev | Finding |
|---|-----|---------|
| K1 | **[VERIFIED] MEDIUM** | **Discounted combo package divergence.** For a combo package (rental/accom) with **no stored `package_hourly_rate`** and an active discount: the **manager** commission recompute subtracts the *full undiscounted* rental/accom cost, while the **instructor** path subtracts a *discount-ratio-scaled* cost. Result: `source_amount=40/h` vs `lesson_amount=48/h` for the same booking. The `ratio` is computed in the manager path but only used in the *other* branch. Instructor value is the correct one. (managerCommissionService.js:507-528 vs cascade:148-155) |
| K2 | **[REPORTED] HIGH** | **Editing the package *template* (`PUT /packages/:id`) fires no cascade.** Changing `package_hourly_rate`/`total_hours`/`price` on a `service_packages` row leaves every existing customer's `instructor_earnings` + `manager_commissions` stale at the old per-hour value until some unrelated edit silently jumps them. (services.js:2018-2197) |
| K3 | **[REPORTED] HIGH** | **Live earnings read ignores the discount ratio** on stored-hourly-rate packages. `instructorFinanceService.mapEarningRow` uses the full pre-discount rate, so the *displayed* instructor earnings exceed both the stored snapshot and the discounted manager-commission base. (instructorFinanceService.js:18-139) |

The customer-package `purchase_price` edit path itself is well-built (see "working correctly").

---

## 🏷️ Discounts — salary side consistent, reporting/creation leaks

| # | Sev | Finding |
|---|-----|---------|
| D1 | **[VERIFIED] MEDIUM** | **`POST /` writes the manual discount to the raw `bookings.discount_amount` column**, never to the `discounts` table. So `getActiveDiscountAmount` returns 0, and the wallet is charged the **gross** while `final_amount` stores net. Violates the "discounts live in a separate table" rule. (bookings.js:2081-2096) |
| D2 | **[REPORTED] HIGH** | **Payment History double-subtracts discounts on paid items.** On a paid booking the discount is both (a) a `discount_adjustment` wallet credit already reducing `total_charges`, and (b) subtracted again via the discounts-table query. Same flaw in the monthly trend. (finances.js:731-871) |
| D3 | **[REPORTED] HIGH** | **`recomputeBookingDiscountsForPriceEdit` posts a phantom credit** on a price edit of an **unpaid** discounted booking — no `isPaid` guard, so the customer gets a refund credit they never earned. (discountService.js) |
| D4 | **[REPORTED] HIGH** | **Display inconsistency:** `GET /:id` `display_amount` and the list view **don't** subtract the discount; `BookingDetailModal.getDisplayPrice()` **does**. Three admin surfaces show three totals for one discounted booking. (bookings.js:560/1445, BookingDetailModal.jsx:727) |
| D5 | **[REPORTED] MED** | Partial-booking discount **base mismatch** — `apply` computes against the cash-only `final_amount`, the rebase against full `computeLessonAmount`, so the same % yields a different amount after a price edit. Plus the student portal doesn't subtract discounts at all, and `recomputeDiscountForBooking` is dead code carrying the same unpaid-credit flaw. |

---

## 👥 Group / multi-participant

| # | Sev | Finding |
|---|-----|---------|
| G1 | **[VERIFIED] HIGH** | **DELETE refunds the entire group's charges to the PRIMARY only.** Each cash participant has their own `-€60` wallet row tagged with the booking id; `getEntityNetCharges` sums them across all users and refunds the lump to the primary. A refunded €180, B & C get €0 (still charged). Same in bulk-delete. (bookings.js:5690-5772, walletService.js:1798) |
| G2 | **[VERIFIED] HIGH** | **`POST /:id/cancel` refunds cash only to the primary** (and uses the master-row amount = group total, so primary is over-credited while B/C get nothing). (bookings.js:6524-6548) |
| G3 | **[VERIFIED] HIGH** | **Full-package group valued at the primary's rate × group_size**, ignoring that each participant drew from their *own* (differently-priced) package. €40/h primary × 3 = €240 instead of (40+60+50)×2h = €300. Hour consumption is correct; only the money valuation is wrong. (cascade:104-225, bookings.js:3130-3138) |
| G4 | **[VERIFIED] MEDIUM** | **Per-head price-edit reconciliation** divides the new total by **all** participants (including package ones, who pay nothing) and **never settles `'partial'` participants' wallets** — it overwrites their `payment_amount` with zero wallet movement (silent money gap). (bookings.js:4329-4390) |
| G5 | **[VERIFIED] MEDIUM** | **Removing a participant** (`DELETE /group-bookings/:id/participants/:id` — which *does* exist) never restores package hours and only refunds `payment_method='wallet'` — cash/external payers are marked refunded but get no money. (groupBookings.js:1180-1253) |

---

## ↩️ Cancel / delete / restore

The DELETE path is the most correct; the two **admin cancel** paths were never migrated.

| # | Sev | Finding |
|---|-----|---------|
| C1 | **[REPORTED] CRITICAL** | **`POST /:id/cancel` package guard checks non-existent columns** (`package_id`/`payment_method`) → false → a fully package-paid lesson gets its **hours restored AND a full cash refund** posted to both `users.balance` and the wallet. Double-compensation + phantom money. (bookings.js:6530-6573) |
| C2 | **[REPORTED] HIGH** | **Admin cancel double-credits** — raw `UPDATE users SET balance = balance + refund` **and** a wallet credit (two stores diverge). Both `POST /:id/cancel` and `PATCH /:id/status`. This is the exact raw-write that was deliberately removed from the student portal. (bookings.js:6539/6573, 6817/6823) |
| C3 | **[REPORTED] HIGH** | **Admin cancel refunds full `final_amount`, not the net wallet charge** — a cash/gateway booking that never hit the wallet still gets a wallet credit; partials refund full value; no idempotency. (vs. the correct `getEntityNetCharges` pattern) |
| C4 | **[REPORTED] HIGH** | **`instructor_earnings` orphaned on cancel/delete** — never removed/zeroed. `finances.js` commission-expense aggregate and `cashModeAggregator` read it unfiltered, so cancelled lessons still count as instructor cost. (cashModeAggregator.js:14) |
| C5 | **[REPORTED] MED** | **Restore never re-activates `manager_commissions`** (delete sets them `'cancelled'`, no restore path un-cancels) → manager silently loses commission on every restored booking. `undo-delete` also re-deducts the wrong package/hours. |

---

## 🔄 Status transitions & earnings creation

| # | Sev | Finding |
|---|-----|---------|
| S1 | **[VERIFIED] MEDIUM** | **`POST /` single booking never creates `instructor_earnings`** (no cascade call, unlike `/group` and `/calendar`). The row only appears later on edit or completion — so until then the instructor shows €0, and a charged-but-never-completed booking has no snapshot. (bookings.js:2115-2255) |
| S2 | **[REPORTED] HIGH** | **`PATCH /:id/status` accepts `'completed'`/`'no_show'` but never runs the cascade** → completing via that endpoint creates no earnings and no commission. Latent today (UI only sends confirmed/cancelled) but it's a public whitelisted API. (bookings.js:6723-6861) |
| S3 | **[REPORTED] HIGH** | **`done`/`checked_out` pays the instructor but not the manager** — earnings fire on `{completed,done,checked_out}`, but `recordBookingCommission` only on `{completed}`, and the cascade can only *update* an existing commission, never create one. |
| S4 | **[REPORTED] HIGH** | **No inverse** — completed→cancelled/no_show never removes/zeros `instructor_earnings`. And a status→cancelled PUT *combined with* a duration/amount edit actively **re-creates** a non-zero earnings row for the now-cancelled booking (value math never checks status). |

---

## 💰 Wallet & 📊 reports/display

- **[VERIFIED] MEDIUM** — Hybrid payment (`wallet_hybrid`) reads availability against the user's
  `preferred_currency` wallet but **debits EUR**; for a non-EUR-preferred user the wallet read
  returns 0 and the whole amount is wrongly routed to card. (bookings.js:1568-2002)
- **[REPORTED] MED** — Cascade `updateCustomerBalance` dual-writes legacy `users.balance` + a wallet
  `BOOKING_CHARGE_ADJUSTMENT` for the same delta on price edits. (cascade:750-808)
- **[REPORTED] HIGH** — Student **"Total Paid"/balance computed from a truncated set** (10-row page,
  or 50-row overview cap) → page-dependent, understated lifetime totals that disagree with admin.
  (StudentPayments.jsx:112-190, studentPortalService.js:857) — *this is the "1599 vs 0" class of bug.*
- **[REPORTED] MED** — Dashboard `total_revenue` ignores cancelled status, group_size, package-rate
  derivation, and partial-vs-cash, so headline revenue is inconsistent with its own commission base.
- **[REPORTED] HIGH** — `getAllInstructorBalances` over-values combo/hourly-rate package lessons
  (no lesson-only derivation, no discount ratio); `deriveTotalEarnings` silently treats
  `fixed_per_hour`/`fixed_per_lesson` as percentage; untyped custom commission resolves to `'fixed'`.

---

## ✅ False alarms (checked, NOT bugs)

- Manager-commission EUR conversion vs instructor raw-currency — *by-design currency tracking*, not a wrong number.
- "Manual discount over-charges wallet" (as a standalone) — folds into D1; the isolated framing was inaccurate.
- "% discount on full-package group regressed €36→€12 on edit" — the original discount was never €36; can't occur.
- `decline-partner` restoring full duration for a cash payer — not reachable.
- Single-DELETE "over-restores full duration to a partial participant" — partials are *filtered out*,
  so they're under-restored (covered by P2), not over-credited. Real but narrower: it passes
  `duration` instead of `package_hours_used` for genuine *package* participants.

---

## Suggested fix order (when you're ready — not done here)

1. **C1** (phantom refund on package cancel) — money created, customer-facing. Quickest high-impact win.
2. **P3 → P1/P2/P5/P6/P7/P8** — record hours-drawn on partials (schema/column), then the partial
   reversal/edit/ display paths can be made correct. This is the biggest structural fix.
3. **G1/G2** (group refunds to primary only) — real customer money lost.
4. **C2/C3/C4** — migrate admin cancel to the `getEntityNetCharges` pattern already used by DELETE/portal; zero orphaned earnings.
5. **K2/K3, D2/D4, S2/S3/S4** — snapshot/display/commission consistency.
6. **K1, D1, S1, G3/G4/G5, wallet/report items** — narrower or conditional.
