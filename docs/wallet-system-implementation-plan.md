# Wallet System Implementation Plan

**Project Scope:** Unified wallet and payment system for all user types (students, instructors, guardians, admins, staff) including deposits (card/bank/crypto), mixed checkout payments, withdrawal approvals, notifications, exports, and compliance.

**Version:** v0.1 (2025-10-15)

---

## 1. Architecture & Foundations

- [ ] Confirm latest `main` branch and create feature branch `feature/wallet-system`
- [ ] Review existing balance logic and identify all touchpoints
- [ ] Define wallet domain model (entities, aggregates, service boundaries)
- [ ] Produce sequence diagrams for key flows (deposit, checkout, withdrawal)
- [ ] Finalize configuration strategy (DB table vs config service)
- [ ] Document data retention and audit requirements
- [ ] Align legal/compliance requirements (KYC, AML, PSD2, data privacy)
- [ ] Document deposit policy (no min/max limits, unlimited daily deposits) and ensure system configuration reflects it

---

## 2. Database Schema & Migrations

> All migrations live under `backend/db/migrations/` with reversible scripts and unit tests.

### 2.1 Core Tables
- [x] `wallet_balances` – per user running balance (withdrawable vs non-withdrawable)
- [x] `wallet_transactions` – immutable ledger (in/out, type, metadata JSON)
- [x] `wallet_withdrawal_requests` – status tracking (pending, approved, processing, completed, rejected)
- [x] `wallet_deposit_requests` – track deposit submissions and processing lifecycle
- [x] `wallet_settings` – tenant/company level configuration (discounts, fees, gateways, auto-approval threshold)
- [x] `wallet_payment_methods` – stored funding sources (masked card, verified IBAN, Binance Pay identifiers)
- [x] `wallet_promotions` – bonus credits (non-withdrawable)
- [x] `wallet_audit_logs` – admin/user actions for compliance

### 2.2 Support Tables
- [ ] `notification_preferences` – channel toggles (email, SMS, in-app, WhatsApp)
- [x] `kyc_documents` – verification artefacts for payout methods
- [ ] `export_jobs` – track PDF/Excel export requests and status

### 2.3 Migration Checklist
- [ ] Write forward/backward migrations with indexes and constraints
- [ ] Add triggers/functions if needed (e.g., prevent negative balances)
- [ ] Populate `wallet_settings` defaults for existing tenants
- [ ] Backfill existing balance data into new tables (script)
- [ ] Add unit/integration tests covering migrations

---

## 3. Backend Services

### 3.1 Wallet Domain Service
- [ ] Implement `walletService` module with methods:
  - [x] `getBalance(userId)`
  - [x] `recordTransaction({...})`
  - [x] `calculateAvailableBalance(userId, options)`
  - [x] `lockFundsForBooking(userId, bookingId)` / `releaseLock`
  - [x] `applyDiscountsAndFees({amount, paymentMix, config})`
  - [x] `requestWithdrawal(userId, amount, payoutMethodId)`
  - [x] `approveWithdrawal(requestId, approverId)` (owner/manager roles only)
  - [ ] `autoApprovePendingWithdrawals()` (uses configurable hours threshold per company)

### 3.2 Payment Gateway Integrations
- [x] Create abstraction `paymentGatewayService`
- [ ] Implement adapters:
  - [x] Stripe (card deposits + pay-as-you-go)
  - [x] iyzico (Turkey card deposits + 3DS)
  - [x] PayTR (Turkey card deposits + 3DS)
  - [x] Binance Pay (crypto deposits)
- [x] Shared validation (3D Secure enforcement, amount checks)
- [x] Honour configuration for unlimited deposits (no min/max caps, only gateway/AML safeguards)
- [x] Webhook handlers for each gateway
- [x] Retry logic and idempotency keys
- [x] Logging and monitoring hooks

### 3.3 Bank Transfer Flow
- [x] Configurable bank accounts per tenant (IBAN, Swift, instructions)
- [x] Deposit request endpoint (amount, reference, proof upload)
- [x] Admin verification UI/API to mark deposit as received
- [ ] Optional webhook integration if bank API available (future flag)

### 3.4 Verification & KYC
- [x] Bank account verification (micro transfer or document upload)
- [x] Card verification status (post-successful 3DS capture)
- [x] Binance Pay verification requirements (capture payer ID, transaction hashes)
- [x] Store verification status per payment method
- [x] Enforce verification before withdrawal approval

### 3.5 Checkout Integration
- [ ] Update booking/rental creation services to handle mixed payments
- [ ] Apply wallet discounts and card fees based on configuration
- [ ] Block withdrawal if pending booking charges exist
- [ ] Ensure ledger entries created for each payment segment

### 3.6 Refund Handling
- [ ] Auto-refund to wallet for wallet-origin payments
- [ ] Auto-credit to wallet for card payments (configurable future option to refund back to card)
- [ ] Ledger entries for refund operations
- [ ] Notifications to users/admins

---

## 4. API Layer

### 4.1 User-Facing Endpoints (Authentication required)
- [x] `GET /api/wallet/summary`
- [x] `GET /api/wallet/transactions?filter`
- [x] `POST /api/wallet/deposit` (card/bank/crypto)
- [x] `POST /api/wallet/deposit/binance-pay` (initiate Binance Pay)
- [x] `POST /api/wallet/withdrawals` (create request)
- [x] `GET /api/wallet/withdrawals`
- [x] `GET /api/wallet/deposits`
- [ ] `POST /api/wallet/export` (PDF/XLSX requested by user)
- [x] `GET /api/wallet/settings` (readable subset)
- [x] `POST /api/wallet/settings/preferences` (notification channels, default payment method)

### 4.2 Admin/Owner/Manager Endpoints
- [ ] `GET /api/admin/wallet/overview`
- [x] `GET /api/admin/wallet/deposits`
- [x] `GET /api/admin/wallet/withdrawals?status`
- [x] `POST /api/admin/wallet/withdrawals/:id/approve`
- [x] `POST /api/admin/wallet/withdrawals/:id/reject`
- [x] `POST /api/admin/wallet/transactions/manual-adjust`
- [x] `POST /api/admin/wallet/deposits/:id/approve`
- [x] `POST /api/admin/wallet/deposits/:id/reject`
- [x] `GET /api/admin/wallet/settings`
- [x] `PUT /api/admin/wallet/settings` (discounts, fees, auto-approve hours, gateway toggles)
- [ ] `POST /api/admin/wallet/export` (global filters, scheduled exports)
- [ ] `GET /api/admin/wallet/audit-logs`

### 4.3 Webhooks & Callbacks
- [ ] `/api/webhooks/stripe`
- [ ] `/api/webhooks/iyzico`
- [ ] `/api/webhooks/paytr`
- [ ] `/api/webhooks/binance-pay`
- [ ] Signature validation and idempotent processing

---

## 5. Frontend & UX

### 5.1 User Dashboard
- [ ] Wallet summary card (balance, withdrawable vs locked)
- [ ] Deposit actions:
  - [ ] Credit card flow (3DS modal)
  - [ ] Bank transfer instructions & proof upload
  - [ ] Binance Pay QR/URL generation & status polling
- [ ] Withdrawal request form (amount, payout method, expected timeline)
- [ ] Display configurable processing window (1–14 days depending on bank) on withdrawal form and status list
- [ ] Pending withdrawal status list
- [ ] Transaction history table with filters, export buttons
- [ ] Notification channel preferences UI

### 5.2 Checkout Flow
- [ ] Payment method selector (wallet default, card, bank, crypto)
- [ ] Mixed payment slider or toggle
- [ ] Real-time discount/fee breakdown display
- [ ] Save last selection per user
- [ ] 3DS flow handling for card portion
- [ ] Error states & fallback (e.g., wallet insufficient, card failure)

### 5.3 Admin Panel
- [ ] Withdrawals queue (pending, auto-approval countdown)
- [ ] Detail view with user verification status, history, notes
- [ ] Manual adjustment form (with reason codes)
- [ ] Settings page (discounts, fees, auto-approval hours, enabled gateways, notifications)
- [ ] Reports/exports UI with filters (date range, type, gateway, user)
- [ ] Audit log viewer

### 5.4 Responsive & Accessibility
- [ ] Mobile and tablet layouts for all wallet screens
- [ ] Accessibility labels, keyboard navigation, screen reader support
- [ ] Localization hooks for multi-language support (future Turkish, German, Dutch)

---

## 6. Notifications & Messaging

- [ ] Define events (deposit initiated, deposit confirmed, withdrawal requested, withdrawal approved, withdrawal completed, auto-approval triggered, payout processing, payout completed, payout rejected)
- [ ] Create templates for each channel (email, SMS, in-app, WhatsApp)
- [ ] Integrate with existing notification service (queue-based)
- [ ] Respect user/company preferences from settings
- [ ] Provide admin override for critical alerts (regardless of preferences)
- [ ] Log delivery attempts and statuses

---

## 7. Exports & Reporting

- [ ] Implement export service supporting PDF and XLSX
- [ ] Render summary headers (name, user ID, date range, totals)
- [ ] Include detailed transaction table (type, amount, balance impact, metadata)
- [ ] Add digital signature/footer section for compliance
- [ ] Support scheduling large exports (async job + email link)
- [ ] Provide download links with expiration and auth checks
- [ ] Log exports in `export_jobs`

---

## 8. Compliance, Security & Monitoring

- [ ] Enforce 3D Secure for all card transactions (Stripe SCA, iyzico, PayTR)
- [x] Require verified payout method before withdrawal approval
- [ ] Prevent withdrawals if:
  - [ ] Pending bookings/reservations using wallet funds
  - [ ] Withdrawal amount > withdrawable balance
  - [ ] Contains promo/non-withdrawable credits
- [ ] Honour "no withdrawal limit" policy (subject only to available withdrawable balance and compliance flags)
- [ ] Capture KYC documents for bank accounts and large transactions
- [ ] Implement fraud detection signals (rapid deposits/withdrawals, unusual amounts)
- [ ] Add monitoring dashboards (deposit/withdrawal volume, gateway success/failure rates)
- [ ] Alerting for webhook failures, payout backlog, large auto-approvals
- [ ] Update privacy policy & terms of service with wallet language

---

## 9. Testing Strategy

### 9.1 Automated Tests
- [ ] Unit tests for wallet service calculations
- [ ] Integration tests for each gateway adapter (mocked)
- [ ] API contract tests for user/admin endpoints
- [ ] Migration tests (up/down + data backfill)
- [ ] Cron job tests (auto-approval logic)
- [ ] Security tests (permissions, negative balances, injection attempts)

### 9.2 Manual & QA Tests
- [ ] End-to-end deposit flows (card, bank, Binance Pay) across roles
- [ ] Withdrawal request/approval/auto-approval journey
- [ ] Checkout mixed payment scenarios (wallet only, card only, mixed)
- [ ] Refund scenarios (wallet booking, card booking)
- [ ] Notification delivery (all channels)
- [ ] Export generation and download
- [ ] Localization checks (if translations available)
- [ ] Accessibility testing (screen reader, keyboard nav)
- [ ] Cross-browser/device compatibility

---

## 10. Rollout & Post-Launch

- [ ] Prepare stakeholder briefing & training materials
- [ ] Update documentation (user guides, admin guides, developer docs)
- [ ] Configure environment variables + secrets for gateways (Stripe, iyzico, PayTR, Binance Pay)
- [ ] Create deployment runbook (order of migrations, feature flags)
- [ ] Run migrations in staging, seed settings, QA sign-off
- [ ] Pilot launch with limited users (flag controlled)
- [ ] Monitor logs & metrics post-launch (24h, 72h, 1 week)
- [ ] Collect user feedback and iterate
- [ ] Schedule retrospective to capture lessons learned

---

## Appendix A: Configuration Defaults
## Completion Roadmap

### Phase 0: Foundations (Section 1)
- **Branch hygiene**: run `git fetch origin main`, inspect `git status`, then create `feature/wallet-system` off `origin/main`; document the baseline commit hash in the project log.
- **Balance touchpoint review**: catalogue every service, cron, and UI surface that reads or mutates balances; place findings in `docs/wallet-domain.md` with owners per area.
- **Domain model deliverable**: draft an entity-relation diagram covering wallets, payment methods, promotions, deposits, withdrawals, audits, and locks; review with backend leads for sign-off.
- **Sequence diagrams**: produce diagrams for deposit, checkout, withdrawal, refund, and auto-approval flows using Mermaid in `docs/diagrams/`; highlight idempotency and concurrency boundaries.
- **Configuration decision**: compare DB-backed settings vs centralized config service; record decision, migration plan, and fallback strategy.
- **Retention & audit policy**: work with compliance to define retention windows, purge strategy, and immutable audit scope; add requirements to `docs/compliance/wallet.md`.
- **Legal alignment**: confirm KYC/AML/PSD2 requirements with counsel; document necessary user consent wording and data handling notes.
- **Deposit policy communication**: update tenant configuration defaults and onboarding docs so unlimited deposit policy is explicit and enforced.

### Phase 1: Database Enhancements (Section 2)
- **`notification_preferences` schema**: design columns for channel toggles, per-user overrides, and soft deletes; include unique `(user_id, channel)` constraint and `updated_at` audit fields.
- **`export_jobs` schema**: capture requester, filters, format, status timeline, file references, and error payload; add index on `(tenant_id, status)` for queue scans.
- **Migration scripts**: produce reversible SQL files with constraints, foreign keys, and data validation; include seed migration to populate default wallet settings and legacy balances.
- **Integrity protections**: implement database trigger or application-level constraint to forbid negative withdrawable balances; document rationale in migration notes.
- **Migration test suite**: add Jest migration tests covering up/down cycles and legacy data backfill.

### Phase 2: Backend Services (Section 3)
- **Auto-approval job**: implement `autoApprovePendingWithdrawals()` as a scheduled job using existing cron infrastructure; respect per-tenant hour thresholds and log every transition.
- **Bank webhook placeholder**: design optional webhook handler contract; include feature flag and documentation for future bank API integrations.
- **Mixed payment workflows**: update booking and rental services to calculate wallet + external payments, ensuring locks, ledger entries, and rollback semantics stay consistent.
- **Refund orchestration**: add service logic that routes refunds to wallet balances, records ledger entries, emits notifications, and schedules card refunds where configured.

### Phase 3: API & Webhooks (Section 4)
- **Export endpoints**: add user and admin export routes that enqueue jobs in `export_jobs`, enforce rate limits, and stream signed download URLs on completion.
- **Admin overview & audit APIs**: deliver `/api/admin/wallet/overview` aggregations and `/api/admin/wallet/audit-logs` paginated history with role checks and filtering.
- **Webhook suites**: stand up Stripe, iyzico, PayTR, and Binance Pay webhook endpoints with HMAC validation, idempotent processing keys, and structured logging.

### Phase 4: Frontend Delivery (Section 5)
- **Wallet dashboard**: create summary card, withdrawal form, deposit flows (card with 3DS modal, bank upload, Binance Pay QR/status), and notification preference UI.
- **Checkout integration**: build payment selector with wallet-first defaults, slider for mixed payments, live discount/fee breakdown, and 3DS state handling; persist last selection per user.
- **Admin console**: implement withdrawal queue with countdown indicators, detail drawer, manual adjustment form, settings editor, export/report surfaces, and audit log viewer.
- **Responsive & accessibility pass**: ensure layouts adjust for mobile/tablet, add ARIA labels, and verify keyboard traversal for all critical actions.

### Phase 5: Notifications (Section 6)
- **Event contract**: enumerate notification events, payload schema, and triggering services; align with queue naming conventions.
- **Template buildout**: author email, SMS, in-app, and WhatsApp templates; include translation keys and fallback messaging.
- **Preference enforcement**: respect user/company opt-ins from `notification_preferences`; provide admin override path for critical alerts and log delivery attempts.

### Phase 6: Exports & Reporting (Section 7)
- **Export service**: implement PDF/XLSX generation with header metadata, transaction tables, totals, and compliance signature block; route large jobs asynchronously.
- **Delivery pipeline**: create signed download URLs with expiry, expose progress via polling endpoint, and ensure every export is recorded in `export_jobs` with audit metadata.

### Phase 7: Compliance & Monitoring (Section 8)
- **Withdrawal safeguards**: enforce pending booking locks, withdrawable balance caps, and promo exclusions before approvals.
- **Security hardening**: require 3DS on all card flows, expand KYC capture for high-value actions, and design fraud anomaly checks with threshold tuning.
- **Observability**: build dashboards for deposit/withdrawal funnel, gateway success rates, webhook failures, and auto-approval backlog; configure alerting thresholds.
- **Policy updates**: collaborate with legal to refresh privacy policy and terms with wallet language and consent flows.

### Phase 8: Testing (Section 9)
- **Automated coverage**: add unit, integration, contract, migration, cron, and security regression tests; integrate into CI with clear fixtures and mocking of gateways.
- **Manual QA**: script end-to-end scenarios spanning deposits, withdrawals, mixed checkout, refunds, notifications, exports, localization, accessibility, and cross-browser checks.

### Phase 9: Rollout (Section 10)
- **Enablement materials**: build training decks, user/admin guides, and developer runbooks; schedule knowledge transfer sessions.
- **Deployment readiness**: configure secrets, finalize deployment runbook, execute staging migrations with seed data, and obtain QA sign-off.
- **Launch sequence**: pilot with feature flag, monitor logs/metrics at 24h, 72h, 1 week, gather user feedback, and plan retrospective.


| Setting | Default | Notes |
| --- | --- | --- |
| `walletDiscountPercent` | 10 | Applied to wallet portion; configurable per company |
| `cardFeePercent` | 10 | Applied to card portion; configurable, can be zeroed |
| `withdrawalAutoApproveAfterHours` | 12 | Auto approval window; configurable 0-48 hrs |
| `withdrawalProcessingTimeDays` | 1-14 | Display range to users |
| `allowMixedPayments` | true | Enable wallet + card split |
| `autoUseWalletFirst` | true | Remember user preference |
| `requireKycForWithdrawals` | true | Block until verified |
| `enabledGateways` | Stripe, iyzico, PayTR, BinancePay | Toggle per tenant |
| `maxExportItems` | 10,000 | Async job above threshold |

---

## Appendix B: Role Matrix

| Action | Student | Instructor | Guardian | Admin | Owner | Manager |
| --- | --- | --- | --- | --- | --- | --- |
| View wallet | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deposit (card/bank/crypto) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Request withdrawal | ✅ | ✅ | ✅ | ⚠️ (if allowed) | ✅ | ✅ |
| Approve withdrawal | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manual adjustments | ❌ | ❌ | ❌ | ⚠️ (read-only unless delegated) | ✅ | ✅ |
| Configure settings | ❌ | ❌ | ❌ | ⚠️ (view-only) | ✅ | ✅ |
| Export own data | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export all data | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |

---

⚠️ **Note:** Admins retain visibility but not approval/adjustment powers unless an explicit delegation feature is introduced. Only Owners and Managers can approve withdrawals or make balance/configuration changes.

---

### Next Steps

1. Complete Phase 0 foundation tasks and capture outputs in shared docs for stakeholder review.
2. Schedule Phase 1 and Phase 2 working sessions to lock schema changes and backend services before frontend work begins.
3. Produce an execution timeline mapping Phases 3–9 to sprints with owners and milestone checkpoints.
