# Frontend Developer — Plannivo Knowledge Base

## System Overview

Plannivo frontend is React 18 + Vite with TypeScript-friendly JSX, routing via React Router 7, state via TanStack React Query + React Context. UI built with Ant Design, TailwindCSS, MUI, and Headless UI.

**Structure:** Feature-based modules in `src/features/` (35+ domains) + shared components in `src/components/`

---

## Architecture Patterns

### Feature-Based Module Structure
Each feature is self-contained:
```
src/features/{feature-name}/
  components/          # React components
  hooks/              # Feature-specific hooks
  utils/              # Helpers
  services/           # API calls (if complex)
  index.js            # Public exports
```

**35+ features:** bookings, rentals, accommodation, customers, finances, instructors, services, products, students, notifications, dashboard, authentication, equipment, manager, forms, compliance, forecast, etc.

### Key Principles
- **React Query for server state** — all API calls via `useQuery`/`useMutation`
- **React Context for client state** — auth, currency, theme, global selections
- **React Hook Form + Yup** — form validation and submission
- **Decimal.js for display** — never display raw floats (money values)
- **date-fns + dayjs** — date formatting and manipulation
- **TailwindCSS + Ant Design** — primary styling + components

### Path Aliases
- `@/` and `src/` both resolve to `./src/`
- Use these instead of relative imports for cleaner code

---

## Core Entry Points

### All Promo Code Input Locations (10 total, 2 recently fixed)

| # | File | Component | Context | Status |
|---|------|-----------|---------|--------|
| 1 | `outsider/components/QuickBookingModal.jsx` | PromoCodeInput | lessons | ✅ Working |
| 2 | `outsider/components/RentalBookingModal.jsx` | PromoCodeInput | rentals | ✅ Working |
| 3 | `outsider/components/AccommodationBookingModal.jsx` | PromoCodeInput | accommodation | ✅ Working |
| 4 | `outsider/components/AllInclusiveBookingModal.jsx` | PromoCodeInput | packages | ✅ Working |
| 5 | `outsider/pages/OutsiderBookingPage.jsx` | PromoCodeInput | packages | ✅ Working |
| 6 | `students/components/StudentBookingWizard.jsx` | PromoCodeInput | dynamic | ✅ Working |
| 7 | `students/components/CheckoutModal.jsx` | PromoCodeInput | shop | ✅ Working |
| 8 | `students/components/StudentWalletModal.jsx` | PromoCodeInput | wallet | ✅ Working |
| 9 | `outsider/components/DownwinderBookingModal.jsx` | PromoCodeInput | packages | ✅ Fixed 2026-04-07 |
| 10 | `outsider/components/PackagePurchaseModal.jsx` | PromoCodeInput | packages | ✅ Fixed 2026-04-07 |

**All 10 now properly wired** with `context`, `amount`, `currency`, `serviceId`, `onValidCode`, `onClear` props.

### Booking Flow
1. User selects dates → fills in package details
2. `AllInclusiveBookingModal` or specific booking modal opens
3. Wizard steps: Dates → Lessons → Payment
4. At Payment step: `PromoCodeInput` component shown
5. On apply: calls `/api/vouchers/validate` with context (lessons|packages|rentals|accommodation|shop|wallet)
6. Success: discount shown, applied to final price
7. User completes purchase

### Shared Components
- `src/shared/components/PromoCodeInput.jsx` — Unified promo code validator
- `src/shared/components/layout/Navbar.jsx` — Top navigation, profile dropdown, wallet balance
- `src/shared/components/layout/Sidebar.jsx` — Main navigation
- `src/shared/components/realtime/RealTimeStatusIndicator.jsx` — Connection status

### Key Hooks
- `useAuth()` — Current user, logout, role-based access
- `useQuery()` (React Query) — Fetch data with caching
- `useMutation()` (React Query) — Submit data
- `useCart()` — Shopping cart state
- `useCurrency()` — Multi-currency support
- `useWalletSummary()` — Wallet balance (multi-currency)

---

## API Contract (Frontend ↔ Backend)

### Promo Code Validation
```javascript
POST /api/vouchers/validate
{
  "code": "KITE10",
  "context": "packages|lessons|rentals|accommodation|shop|wallet",
  "amount": 1660,
  "currency": "EUR",
  "serviceId": "uuid (optional)"
}

Response (Success):
{
  "valid": true,
  "voucher": {
    "id": "uuid",
    "code": "KITE10",
    "name": "10% Off",
    "type": "percentage"
  },
  "discount": {
    "displayText": "10% off",
    "discountAmount": 166,
    "walletCredit": null
  }
}

Response (Failure):
{
  "error": "WRONG_CONTEXT|INVALID_CODE|EXPIRED|NOT_FIRST_PURCHASE|...",
  "message": "This voucher can only be used for lessons"
}
```

---

## Common Patterns

### Form with Validation (React Hook Form + Yup)
```jsx
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

const schema = yup.object({
  email: yup.string().email().required(),
  amount: yup.number().min(0).required(),
});

function MyForm() {
  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
  });

  const onSubmit = (data) => { /* submit */ };

  return <form onSubmit={handleSubmit(onSubmit)}>...</form>;
}
```

### Fetching Data (React Query)
```jsx
import { useQuery } from '@tanstack/react-query';

function MyComponent() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['bookings', userId],
    queryFn: async () => {
      const res = await fetch(`/api/bookings?userId=${userId}`);
      return res.json();
    },
  });

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={error.message} />;
  return <div>{/* render data */}</div>;
}
```

### Financial Display (Decimal.js)
```jsx
import Decimal from 'decimal.js';

function Price({ amount, currency }) {
  const displayAmount = new Decimal(amount).toFixed(2);
  return <span>{currency} {displayAmount}</span>;
}
```

### Date Formatting
```jsx
import { format } from 'date-fns';
import dayjs from 'dayjs';

// date-fns
<span>{format(new Date(bookingDate), 'PPP')}</span>

// dayjs
<span>{dayjs(bookingDate).format('YYYY-MM-DD')}</span>
```

---

## Navigation & Routing

Routes defined in `src/routes/` and mounted in `src/App.jsx`.

### Key Routes
- `/login` — Authentication
- `/guest` — Public page (before login)
- `/student/...` — Student dashboard & features
- `/instructor/...` — Instructor panel
- `/manager/...` — Manager/admin tools
- `/shop/...` — E-commerce
- `/accommodation/...` — Accommodation management
- `/bookings` — Booking list
- `/dashboard` — Main dashboard

---

## Recent Fixes & Issues

### PromoCodeInput Wiring (2026-04-07)
**Issue:** DownwinderBookingModal and PackagePurchaseModal weren't passing correct props to PromoCodeInput
- Missing: `context="packages"`, `amount`, `currency`, `serviceId`, `onValidCode`, `onClear`
- Result: Code validated but discount never applied

**Fix Applied:** Both components now properly wire all required props

**How to spot this pattern:** If promo codes seem to work (no error) but discount isn't applied to final price, check if `onValidCode` and `onClear` callbacks are being passed to PromoCodeInput.

### KITE10 Validation Error (2026-04-07)
**Issue:** "Unable to validate voucher at this time" when applying KITE10
- Root cause: Backend column name mismatch (`user_id` vs `customer_user_id`)
- Frontend impact: Clear error message now shown instead of generic error

### Navbar Profile Display (2026-04-07)
**Issue:** Profile dropdown showed "My Profile" instead of user's actual name
**Fix:** Changed hardcoded "My Profile" text to `{displayName}` from user object

---

## File Organization

```
src/
  main.jsx                      # Entry point
  App.jsx                       # Root component
  routes/                       # Route definitions
  features/                     # 35+ feature modules
    {feature}/
      components/
      hooks/
      utils/
      index.js
  shared/
    components/                 # Shared UI components
      layout/
      ui/
      navigation/
      realtime/
      PromoCodeInput.jsx         # ← All promo code inputs use this
    hooks/                      # Shared hooks (useAuth, useCart, etc.)
    contexts/                   # React Context (AuthContext, CurrencyContext, etc.)
    utils/                      # Global utilities
    styles/                     # Global CSS
  config/                       # App configuration
  assets/                       # Images, icons, etc.
```

---

## Development Workflow

1. **Start dev server:** `npm run dev` (frontend on :3000, backend proxied on :4000)
2. **Feature development:** Create/modify files in `src/features/{feature}/`
3. **API calls:** Use `useQuery` and `useMutation` from React Query
4. **Testing:** `npm run test` (Vitest), `npm run test:e2e` (Playwright)
5. **Build:** `npm run build` (outputs to `dist/`)

---

## Component Library

### Ant Design (Primary)
- `Button`, `Form`, `Input`, `Select`, `DatePicker`, `Modal`, `Table`, `Card`, `Menu`, `Tabs`, `Drawer`
- Imported as `import { Button, ... } from 'antd'`

### Headless UI
- Dropdowns, dialogs, popovers (unstyled, composable with TailwindCSS)

### Icons
- `@heroicons/react` — Hero Icons (fill & outline variants)
- Import: `import { UserCircleIcon, ChevronDownIcon } from '@heroicons/react/24/{solid|outline}'`

### TailwindCSS
- Utility-first CSS framework
- Used alongside Ant Design for custom styling
- `className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg"`

---

## Command Reference

```bash
npm run dev              # Start both frontend (:3000) and backend (:4000)
npm run dev:frontend    # Frontend only
npm run dev:backend     # Backend only
npm run build           # Production build
npm run test            # Unit tests
npm run test:e2e        # Playwright E2E tests
```

---

*Last updated: 2026-04-07 after PromoCodeInput wiring fixes*
