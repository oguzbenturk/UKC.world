# Wallet Migration Strategy

**Objective:** Introduce the unified wallet system without breaking existing functionality by migrating from the legacy balance adjustments to the new ledger-based architecture in a controlled, observable fashion.

**Audience:** Engineering, QA, DevOps, Product, Support, Compliance

**Version:** v0.1 (2025-10-15)

---

## 1. Legacy vs Target System Overview

| Aspect | Legacy Balance System | New Wallet System |
| --- | --- | --- |
| Storage model | Direct balance updates (single value per user) | Immutable ledger + running balance (`wallet_transactions`, `wallet_balances`) |
| Operations | Manual add/remove by admin; ad-hoc adjustments | Structured deposits (card, bank, crypto), mixed checkout, withdrawals, refunds |
| Discount/Fee logic | Applied manually in booking flow | Config-driven discount/fee engine (wallet discount, card fee) |
| Auditability | Limited history (if any) | Full transaction history + audit logs |
| Withdrawals | Not formalized | Owner/Manager approvals + auto-approval window |
| Notifications | Minimal | Email, SMS, in-app, WhatsApp events |
| Exports | Not standardized | PDF/XLSX exports per user and admin |

> **Note:** Obtain definitive documentation of current balance tables/services (e.g., `balanceService`, existing API routes) before coding migration scripts.

---

## 2. Compatibility Goals

- Preserve all existing balances and transaction intent.
- Zero downtime deployment; maintain API backward compatibility until cutover complete.
- Ensure current booking/checkout flows continue to succeed throughout migration.
- Provide reversible steps with clear rollback procedure.
- Keep stakeholders informed (support, finance, instructors, admins).

---

## 3. Migration Phases

### Phase 1 – Discovery & Preparation
- [ ] Catalogue all code paths touching legacy balance (services, controllers, scheduled jobs, tests).
- [ ] Identify existing database tables/columns storing balances.
- [ ] Define mapping from legacy data to new schema (withdrawable vs non-withdrawable, promo vs cash).
- [ ] Create feature flags (e.g., `wallet.dualWrite`, `wallet.readFromLedger`, `wallet.enableWithdrawals`).
- [ ] Provision new wallet tables in staging (no production changes yet).

### Phase 2 – Backfill & Dual-Write (Staging)
- [ ] Run dry-run migration on staging snapshot to validate scripts.
- [ ] Implement `legacyBalanceAdapter` that still writes to old storage but also mirrors events into wallet ledger when `dualWrite` flag enabled.
- [ ] Update balance-related services/tests to use adapter (no behavior change yet).
- [ ] Verify wallet balances match legacy balances within tolerance.
- [ ] Add monitoring/alerts for dual-write discrepancies.

### Phase 3 – Production Backfill (Read-Only)
- [ ] Enable new wallet tables in production (migrations applied, but not used yet).
- [ ] Execute read-only verification script comparing legacy balances vs ledger-calculated balances (no writes).
- [ ] Validate script output with finance/admin stakeholders.

### Phase 4 – Dual-Write in Production
- [ ] Enable `wallet.dualWrite` feature flag in production (writes go to both systems).
- [ ] Instrument logging for mismatched balances, high latency, or failures.
- [ ] Allow period of observation (e.g., 7–14 days) while ensuring no discrepancies remain.

### Phase 5 – Switch Read Path
- [ ] Toggle `wallet.readFromLedger` in staging; run regression tests (checkout, refunds, admin adjustments).
- [ ] Enable `wallet.readFromLedger` in production behind gradual rollout (e.g., by tenant or cohort).
- [ ] Keep legacy balance value in sync temporarily via scheduled reconciliation.
- [ ] Confirm business metrics (deposits, bookings, refunds) remain stable.

### Phase 6 – Enable Wallet-Only Features
- [ ] Gradually enable new deposits, withdrawals, discount/fee logic.
- [ ] Roll out notifications, exports, admin dashboards.
- [ ] Train support team on new tooling and flows.

### Phase 7 – Deprecate Legacy System
- [ ] Freeze legacy balance mutations (feature flag disabled).
- [ ] Archive legacy balance data for auditing (dump to secure storage).
- [ ] Remove or refactor old code paths after sufficient cooling-off period.
- [ ] Update documentation & tests to reference wallet system only.

---

## 4. Data Migration Workflow

1. **Snapshot legacy balances**: Export user IDs, balance amounts, metadata.
2. **Transform**: Map to withdrawable/non-withdrawable fields, infer transaction history if possible (may require synthetic entries).
3. **Load**: Insert into `wallet_transactions` (initial seed transaction) + `wallet_balances`.
4. **Verify**:
   - Random sampling against legacy values.
   - Totals per role/tenant match.
   - Booking history cross-check (ensure wallet covers previously deducted amounts).
5. **Audit Trail**: Record migration job details in `wallet_audit_logs` with version/tag.

> If legacy history is insufficient, seed with a single “opening balance” transaction referencing migration job ID.

---

## 5. Application Guardrails

- Feature flags controlling write/read behavior; must default to legacy until explicitly toggled.
- Idempotent migration scripts; rerunning should not corrupt data.
- Monitoring dashboards tracking:
  - Dual-write success rate.
  - Balance discrepancies.
  - Gateway success/failure rates post cutover.
- Logging correlation IDs to trace transactions from legacy to ledger.
- Access controls updated so only Owner/Manager roles can approve withdrawals once enabled.

---

## 6. Testing & Validation Matrix

| Area | Legacy On | Dual-Write | Ledger Read | Wallet-Only |
| --- | --- | --- | --- | --- |
| Booking (self/family) | Baseline regression | Compare balances | Ensure discount applied | Mixed payments working |
| Refunds | Baseline | Validate ledger entries | Auto wallet credit | Card portion crediting |
| Admin adjustments | Working | Dual writes succeed | Ledger reflects change | Legacy disabled |
| Notifications | Minimal | Event hooks triggered | Delivery verified | All channels active |
| Exports | N/A | Data available | User export matches ledger | Admin export shows new fields |

QA should run through the above grid for staging and production canary accounts.

---

## 7. Rollback Plan

- Keep legacy balance write path functional until final cleanup; toggling feature flags reverts reads to legacy immediately.
- Maintain recent database backups and migration scripts capable of rolling back inserted ledger data if needed.
- For discrepancies after cutover, provide manual reconciliation script to reapply legacy balance as "correction" transactions.
- Document "stop the line" process—who to page, how to disable wallet features quickly (feature flag or config toggle).

---

## 8. Communication & Change Management

- **Stakeholders**: Owners, Managers, Admins, Finance, Support, Legal, QA.
- **Training**: Provide wallet user guides, admin dashboards walkthrough, FAQ for support.
- **Announcements**:
  - Internal: timeline, testing responsibilities, go/no-go criteria.
  - External (users): highlight new wallet benefits, deposit/withdrawal policies, contact for assistance.
- **Support Playbook**: Escalation matrix, troubleshooting steps (e.g., dual-write mismatch, withdrawal delays).

---

## 9. Timeline (Indicative)

| Week | Activities |
| --- | --- |
| 1 | Discovery, schema finalization, feature flag wiring |
| 2 | Staging migrations, dual-write adapter, dry-run backfill |
| 3 | Production migrations (read-only), dual-write enablement |
| 4 | Observation window, fix discrepancies |
| 5 | Ledger read switch for pilot cohort, new features behind flags |
| 6 | Gradual rollout to all tenants, enable withdrawals/notifications |
| 7 | Legacy deprecation prep, support handover |
| 8 | Legacy cleanup, post-mortem, documentation updates |

Adjust timeline according to testing outcomes and stakeholder availability.

---

## 10. Open Questions & Risks

- Confirm precise legacy storage (table names, data granularity).
- Determine approach for reconstructing historical transactions if only current balance is stored.
- Validate Binance Pay integration timelines and regulatory requirements.
- Ensure compliance with jurisdiction-specific financial regulations (licensing, reporting).
- Define threshold for auto-approval risk checks (e.g., AML triggers despite "no limits").
- Establish SLA for withdrawals (1–14 days) and how to communicate status updates.

---

## Next Actions

1. Assign owners for each migration phase.
2. Gather definitive legacy system documentation.
3. Prepare staging environment for dual-write testing.
4. Schedule stakeholder walkthrough of migration plan.
