# Tests

All project tests organized in one place.

## Structure

```
tests/
├── unit/                  # Unit tests
│   ├── backend/           # Backend unit tests (Jest)
│   │   ├── auth/          # Authorization & role middleware
│   │   ├── bookings/      # Booking CRUD, cancel/reschedule, groups
│   │   ├── finances/      # Commissions, balances, transactions
│   │   ├── payments/      # Wallet, deposits, gateways, webhooks
│   │   ├── notifications/ # Alert service, dispatcher, workers
│   │   ├── security/      # Rate limiting, file upload, DB guardrails
│   │   ├── users/         # Waivers, avatars, instructor/student endpoints
│   │   ├── shop/          # Shop checkout
│   │   ├── ratings/       # Rating service & endpoints
│   │   ├── packages/      # Package entitlement logic
│   │   ├── popups/        # Popup service
│   │   ├── core/          # Core business logic, currency system
│   │   └── iyzico/        # Iyzico payment gateway tests
│   └── frontend/          # Frontend unit tests (Vitest)
│       ├── admin/         # Admin pages (ratings analytics)
│       ├── dashboard/     # Dashboard components, hooks, pages
│       ├── manager/       # Manager payroll & commission settings
│       └── shared/        # Shared utils (roles, pricing, hooks)
│
├── integration/           # Integration tests (Vitest + standalone)
│   ├── websocket.test.js  # Socket.IO integration
│   └── iyzico-e2e-payment.test.mjs  # Iyzico sandbox payment flow
│
├── security/              # Security tests (Vitest)
│   ├── xss-prevention.test.js
│   ├── sql-injection.test.js
│   └── rbac-authorization.test.js
│
├── e2e/                   # E2E browser tests (Playwright)
│   ├── phases/            # Ordered test phases (1-20)
│   ├── flows/             # Domain-specific flows (auth, booking, wallet, etc.)
│   ├── forms/             # Form validation specs
│   ├── audits/            # Frontend audit & bug hunt specs
│   ├── qa/                # QA audit sections
│   ├── reports/           # Test reports & audit data
│   ├── logs/              # E2E run logs
│   └── helpers.ts         # Shared Playwright helpers
│
├── stress/                # Stress & load tests
│   └── stress-test-simulation.mjs
│
├── scripts/               # Test utility scripts
│   ├── booking-flow.mjs   # E2E booking flow script
│   ├── cleanup.mjs        # Delete test customers
│   ├── clean-orphaned-data.mjs  # Clean orphaned DB records
│   ├── create-test-user.mjs     # Create test user with wallet
│   ├── run-all-tests.js   # Master test runner
│   ├── test-production.mjs # Production API test suite
│   ├── run-and-log.mjs    # E2E runner with structured logging
│   └── _shared.mjs        # Shared constants & test profiles
│
├── setup/                 # Test infrastructure
│   ├── vitest.setup.js    # Vitest global setup (jsdom mocks)
│   ├── jest.setup.js      # Jest global setup (env vars)
│   ├── test-utils.jsx     # React render wrapper (providers)
│   └── mocks/
│       ├── handlers.js    # MSW API mock handlers
│       ├── socket-mock.js # Socket.IO mock
│       └── fixtures/
│           └── instructorData.js  # Test data fixtures
│
└── results/               # Test output (gitignored)
```

## Running Tests

```bash
# Frontend unit tests (Vitest)
npm test                      # Interactive mode
npm run test:run              # Single run

# Backend unit tests (Jest)
cd backend && npm test

# E2E tests (Playwright)
npm run test:e2e              # All E2E tests
npm run test:e2e:smoke        # Quick smoke test
npm run test:e2e:booking      # Booking flow only

# All tests
npm run test:all              # Full suite (DB + API + E2E)
npm run test:quick            # Skip E2E

# Security tests
npx vitest run tests/security

# Test scripts
node tests/scripts/booking-flow.mjs        # Run booking flow test
node tests/scripts/cleanup.mjs             # Clean test data
node tests/scripts/clean-orphaned-data.mjs # Audit orphaned records
node tests/scripts/test-production.mjs     # Production API suite
```
