# Senior Developer — Plannivo Knowledge Base

## Leadership & Decision Making

You oversee architecture, make technical decisions, and guide the team. Your role: 
1. **Long-term architecture** — Plan major features, refactors, infrastructure changes
2. **Risk assessment** — Identify technical debt, scalability issues, security risks
3. **Team guidance** — Help other agents solve tricky problems, resolve disputes
4. **Standards enforcement** — Ensure code quality, patterns, security practices
5. **Coordination** — Orchestrate cross-team efforts (frontend+backend+DB changes)

---

## Current System Architecture

**Frontend:** React 18 + Vite, feature-based modules, React Query + Context for state
**Backend:** Node.js/Express (ESM), 60+ API endpoints, 80+ service files
**Database:** PostgreSQL with 220+ migrations, multi-tenant academy platform
**Deploy:** Docker containers, git-based CI/CD via `push-all.js` script

**Key strengths:**
- Wallet-as-core-ledger ensures financial accuracy
- Feature-based module structure scales well
- Service layer abstraction separates concerns
- Soft deletes enable safe data retention/recovery

**Known technical debt:**
- Floating-point math in `voucherService.calculateDiscount()` (minor, functional)
- Some API endpoints lack pagination (potential performance issue at scale)
- Column name inconsistencies (`user_id` vs `customer_user_id`) (watch-point)
- No centralized rate limiting per-endpoint (only global limit)

---

## Recent Fixes & Lessons Learned

### KITE10 Promo Code Failure (2026-04-07)
**Root Cause:** Column name mismatch in SQL query (`user_id` vs `customer_user_id`)
**Impact:** Promo code validation threw hidden exception, returned generic error
**Prevention:** Implement column name verification check in code review (or schema validation at runtime)
**Lesson:** Schema drift can hide in exception handlers. Better to fail fast with clear errors.

### PromoCodeInput Component Wiring (2026-04-07)
**Root Cause:** Two components passing wrong prop names to shared component
**Impact:** Code validated but discount never applied to final price
**Prevention:** More rigorous prop validation (could use TypeScript or prop-types)
**Lesson:** Shared components should fail loudly if required props missing

### Time Slot Phantom Selection (2026-04-07)
**Root Cause:** Time slot propagation didn't check availability for each day
**Impact:** Users could submit bookings for unavailable slots
**Prevention:** Fail fast on validation; return errors instead of silently accepting invalid data
**Lesson:** Distribute validation logic closer to the data (check availability before setting time)

---

## Architecture Decisions

### Wallet-as-Ledger Model
**Decision:** All financial operations recorded as `wallet_transactions` (never update balance directly)
**Benefit:** Audit trail, transaction reversibility, ledger accuracy
**Cost:** Requires more DB queries to sum transactions for balance
**Tradeoff:** Worth it for financial integrity

### Soft Deletes Throughout
**Decision:** Use `deleted_at` timestamp instead of hard-delete
**Benefit:** Data recovery, audit trail, referential integrity
**Cost:** Must remember `WHERE deleted_at IS NULL` in every query
**Risk:** Silently including deleted data if WHERE clause forgotten

### Feature-Based Module Structure
**Decision:** Each feature in `src/features/{name}/` is self-contained
**Benefit:** Feature autonomy, clear ownership, easy to add/remove features
**Cost:** Must coordinate shared components carefully
**Watch:** No inter-feature imports (use parent component to compose)

### PostgreSQL Multi-Currency
**Decision:** All amounts stored in EUR (base currency), conversion on display
**Benefit:** Single source of truth, simplified reporting
**Cost:** Must convert before display, rate lookup overhead
**Alternative considered:** Store in original currency (rejected: complexity)

---

## Scaling Considerations

### Current Bottlenecks
1. **Financial queries** — Summing transactions O(n) instead of cached balance
   - **Fix:** Consider materialized view or denormalized balance column with trigger
2. **Equipment inventory** — Stored in JSONB arrays, not normalized
   - **Fix:** If rentals grow, normalize equipment_ids into rental_items table
3. **Notification delivery** — WebSocket-based, relies on server uptime
   - **Fix:** Add message queue (Redis/RabbitMQ) for reliable delivery
4. **API pagination** — Some endpoints missing pagination
   - **Fix:** Implement pagination middleware, set default `limit=50, offset=0`

### Future Considerations
- **Microservices:** Consider splitting into: auth, booking, wallet, notifications
- **Caching:** Redis for frequently accessed data (user preferences, currency rates)
- **Search:** ElasticSearch for complex queries (customer search, booking filters)
- **Real-time:** WebSocket stability; consider message broker for scalability

---

## Code Quality Standards

### Must-Have (Non-Negotiable)
- ✅ Decimal.js for all financial calculations
- ✅ Wallet transaction for all money movement
- ✅ Audit logging for important operations
- ✅ SQL injection protection (parameterized queries)
- ✅ CSRF/XSS prevention (security headers, React escaping)
- ✅ JWT-based authentication
- ✅ Error handling (try/catch, global error handler)

### Should-Have (Code Review)
- ✅ Soft deletes where appropriate
- ✅ React Query for server state
- ✅ React Context for client state
- ✅ Yup/Zod for form validation
- ✅ Unit tests for business logic
- ✅ E2E tests for user flows
- ✅ Type hints / JSDoc comments

### Nice-to-Have
- ✅ Comprehensive logging
- ✅ Performance monitoring
- ✅ Error tracking (Sentry)
- ✅ Feature flags

---

## Technical Decisions Framework

When faced with a choice:

1. **Financial correctness** > everything
   - Use Decimal.js, record transactions, log changes
2. **Security** > convenience
   - Parameterized queries, rate limiting, auth checks
3. **Scalability** > local optimization
   - Plan for 10x users before optimizing premature
4. **Maintainability** > clever code
   - Clear is better than concise

---

## Team Coordination

### When to Involve Each Agent
- **Backend-arch:** API design, database changes, large service refactors
- **DB-optimizer:** Schema design, migration strategy, query optimization
- **Frontend-dev:** UI components, state management, form handling
- **UI-designer:** Visual consistency, accessibility, design patterns
- **Code-reviewer:** Pre-merge reviews, security audit, standards check
- **Reality-checker:** Testing strategy, edge cases, QA verification

### Conflict Resolution
- **Frontend vs Backend**: Prefer backend constraints (source of truth)
- **Performance vs Clarity**: Prefer clarity until profiling shows bottleneck
- **New Feature vs Tech Debt**: Prioritize tech debt if it blocks growth
- **Security vs Usability**: Always choose security; find UX workaround

---

## Incident Response

### Critical Issues (P1 — Fix Immediately)
- Data loss or corruption
- Security vulnerability (SQL injection, XSS, auth bypass)
- Service unavailable (API down, deployment failed)
- Financial data inconsistency (wallet mismatch, double-charging)

### High Priority (P2 — Fix This Sprint)
- Feature broken (promo code validation fails, booking can't complete)
- Major bug (UI corrupted, data displays wrong)
- Performance degradation (API endpoint 10x slower)

### Normal Priority (P3 — Fix When Convenient)
- UI polish (spacing, colors, alignment)
- Minor bugs (edge cases, rare scenarios)
- Code quality (refactor, remove dead code)

---

## Architecture Review Checklist

Before approving major changes:

- [ ] **Does it solve the right problem?** (not just symptoms)
- [ ] **Does it scale with user/data growth?** (10x, 100x future users)
- [ ] **Does it maintain financial integrity?** (no money lost/created)
- [ ] **Does it follow existing patterns?** (consistency matters)
- [ ] **Does it introduce new dependencies?** (weigh cost/benefit)
- [ ] **Can we rollback if needed?** (migrations reversible? feature flag?)
- [ ] **Is the team capable?** (maintainability, skills match)
- [ ] **What's the cost?** (dev time, infrastructure, support burden)
- [ ] **What's the alternative?** (always consider options)

---

## Future Roadmap Themes

### Q2 2026
- Commission system for multi-instructor packages ← **Your question: bundled pricing!**
- Enhanced reporting (revenue by instructor, by service)
- Internationalization (i18n) support

### Q3 2026
- API pagination rollout (prevent N+1)
- Redis caching layer
- Improved admin dashboard

### Q4 2026
- Microservice split (if growth warrants)
- Advanced search (Elasticsearch)
- Marketplace features (third-party booking)

---

## Command Reference

```bash
npm run dev              # Full stack (frontend + backend)
npm run build           # Production build
npm run test            # All tests
git log --oneline       # See recent changes
# Then use your team to investigate/fix
```

---

*Last updated: 2026-04-07 after KITE10 incident analysis*
