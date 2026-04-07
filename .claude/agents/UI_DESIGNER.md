# UI Designer — Plannivo Knowledge Base

## Design System

Plannivo uses a **hybrid design system** combining multiple UI libraries:
- **Ant Design** (antd) — Primary component library (buttons, forms, tables, modals, etc.)
- **TailwindCSS** — Utility-first CSS for custom layouts and spacing
- **Material-UI (MUI)** — Specific components where needed (popovers, select)
- **Headless UI** — Unstyled, accessible components (dropdowns, dialogs)
- **Heroicons** — Icon library (@heroicons/react)

---

## Color Palette & Theming

### Primary Colors
- **Brand teal/cyan:** `#00a8c4` — Primary action, accents
- **Dark background:** `#2e3f44`, `#3a4a4f` — Navigation, containers
- **Slate colors:** `slate-50` to `slate-900` — Neutral text and backgrounds
- **Success (green):** `green-600` — Positive actions, confirmations
- **Warning (amber):** `amber-500` — Caution, pending states
- **Error (red):** `red-600` — Destructive actions, errors
- **Info (blue):** `sky-500` — Informational messages

### Dark Mode
- App supports dark mode (toggle in navbar)
- Use `dark:` TailwindCSS prefix for dark mode styles
- Ant Design components automatically respond to theme

---

## Component Library Usage

### Ant Design Components (Most Common)

```jsx
// Button
<Button type="primary">Save</Button>
<Button danger>Delete</Button>
<Button loading>Loading...</Button>

// Form
<Form layout="vertical">
  <Form.Item label="Email" rules={[{ required: true }]}>
    <Input type="email" />
  </Form.Item>
</Form>

// Modal
<Modal title="Confirm" open={isOpen} onOk={handleOk}>
  Are you sure?
</Modal>

// Table
<Table columns={columns} dataSource={data} pagination={{ pageSize: 10 }} />

// Select / Dropdown
<Select 
  placeholder="Choose..." 
  options={[{ value: 1, label: 'Option 1' }]}
/>

// DatePicker
<DatePicker format="YYYY-MM-DD" />

// Card
<Card title="Card Title">
  <p>Card content</p>
</Card>

// Tabs
<Tabs items={[{ label: 'Tab 1', key: '1', children: <div>Content</div> }]} />
```

### TailwindCSS Utilities (Layout & Spacing)

```jsx
// Flexbox
<div className="flex items-center justify-between gap-4">
  <span>Left</span>
  <span>Right</span>
</div>

// Grid
<div className="grid grid-cols-3 gap-4">
  {items.map(item => <div key={item.id}>{item}</div>)}
</div>

// Spacing
<div className="p-4 m-2 mb-6">Padding 4, margin 2, margin-bottom 6</div>

// Colors
<div className="bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50">
  Light background, dark text (with dark mode support)
</div>

// Border, rounded
<div className="border border-slate-200 rounded-lg shadow-md dark:border-slate-700">
  Card-like container
</div>
```

### Heroicons (Icons)

```jsx
import { UserCircleIcon, ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';

<UserCircleIcon className="h-6 w-6 text-slate-400" />
<CheckIcon className="h-5 w-5 text-green-600" />

// Solid variant (filled)
import { UserCircleIcon } from '@heroicons/react/24/solid';
```

---

## Recent UI Changes & Standards

### Navbar Profile Display (2026-04-07)
- **Changed:** "My Profile" → shows user's actual name (firstName + lastName or email)
- **File:** `src/shared/components/layout/Navbar.jsx:203`
- **Pattern:** Use `getUserDisplayName(user)` helper to extract user's preferred name field

### Accommodation History Table Filtering (2026-04-07)
- **Changed:** Cancelled accommodations hidden from history table
- **File:** `src/features/customers/components/EnhancedCustomerDetailModal.jsx`
- **Pattern:** Filter data BEFORE rendering in table (`.filter(r => r.status !== 'cancelled')`)

### Time Slot Selection (2026-04-07)
- **Changed:** All-inclusive booking now auto-selects closest available time
- **Files:** `src/features/outsider/components/AllInclusiveBookingModal.jsx`
- **Pattern:** When user picks time on Day 1, other days get same time if available, or closest available slot

---

## Layout Patterns

### Modal Forms
- Title bar (centered or left-aligned)
- Content area with form fields
- Footer with action buttons (Cancel, Submit)
- Use `<Modal>` component from Ant Design

### Data Tables
- Header with filters/search
- Sortable columns
- Pagination (10 items per page default)
- Row actions (Edit, Delete) in last column
- Use `<Table>` component from Ant Design

### Cards/Containers
- Rounded corners (`rounded-lg`)
- Subtle shadow (`shadow-sm`)
- Light background (`bg-slate-50`)
- Border (`border border-slate-200`)
- Dark mode support (`dark:bg-slate-900 dark:border-slate-700`)

### Navigation
- Sticky navbar at top (z-index 70)
- Logo on left
- User profile menu on right
- Responsive (hamburger menu on mobile)

### Form Layouts
- Vertical layout (`layout="vertical"`) for most forms
- Label above input field
- Validation messages below field
- Submit button centered or right-aligned in footer

---

## Component Conventions

### Shared Components (`src/shared/components/`)
- `PromoCodeInput.jsx` — Reusable promo code input with validation display
- `Navbar.jsx` — Top navigation bar
- `Sidebar.jsx` — Left navigation
- Feature-agnostic, used across multiple features

### Feature Components (`src/features/{feature}/components/`)
- Self-contained to feature
- Internal logic specific to feature
- Don't import from other features (use props passing)

### Naming
- Component files: PascalCase (`UserProfile.jsx`)
- Component functions: PascalCase (`function UserProfile() {}`)
- Styling: TailwindCSS classNames (no CSS-in-JS)
- Utility hooks: camelCase (`useFormValidation()`)

---

## Accessibility Standards

- [ ] All images have `alt` text
- [ ] Buttons have clear labels (not just icons)
- [ ] Form inputs have associated labels (`<label htmlFor="...">`)
- [ ] Links are distinguishable (not just color)
- [ ] Color contrast passes WCAG AA (4.5:1 for text)
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] ARIA attributes where needed (role, aria-label, aria-expanded)

---

## Icons Guide

### When to Use Heroicons
- Primary navigation icons (Menu, User, Settings)
- Action icons (Edit, Delete, Download, Share)
- Status indicators (Check, X, Clock, Alert)
- 24px (h-6 w-6) for standard, 20px (h-5 w-5) for compact

### Common Icon Usage
```jsx
// Navigation
<Bars3Icon /> — Hamburger menu
<UserCircleIcon /> — User profile
<Cog6ToothIcon /> — Settings
<QuestionMarkCircleIcon /> — Help

// Actions
<PencilIcon /> — Edit
<TrashIcon /> — Delete
<PlusIcon /> — Add
<CheckIcon /> — Confirm/Success
<XMarkIcon /> — Close/Cancel
<ArrowDownTrayIcon /> — Download
<ShareIcon /> — Share

// Status
<CheckCircleIcon /> — Success (green)
<ExclamationCircleIcon /> — Warning (yellow)
<XCircleIcon /> — Error (red)
<InformationCircleIcon /> — Info (blue)
<ClockIcon /> — Pending/Loading
```

---

## Responsive Design

- **Breakpoints (TailwindCSS):**
  - `sm:` 640px
  - `md:` 768px
  - `lg:` 1024px
  - `xl:` 1280px

- **Pattern:** Mobile-first (base styles for mobile, use breakpoints to adjust for larger screens)

```jsx
<div className="flex flex-col sm:flex-row gap-2">
  {/* Stack vertically on mobile, row on sm and up */}
</div>

<span className="hidden md:block">Desktop only</span>
<span className="md:hidden">Mobile only</span>
```

---

## Dark Mode Implementation

All components should support dark mode using `dark:` prefix.

```jsx
<div className="bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50">
  Supports both light and dark themes
</div>

<Button className="dark:bg-slate-800 dark:text-white">
  Button with dark mode support
</Button>
```

---

## Command Reference

```bash
npm run dev              # Start app (frontend :3000, backend :4000)
npm run build           # Production build (check for errors)
npm run test:e2e        # Visual regression tests (Playwright)
```

---

*Last updated: 2026-04-07 after navbar and accommodation table UI updates*
