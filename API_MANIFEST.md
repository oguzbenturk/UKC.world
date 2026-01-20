# 🗺️ PLANNIVO API MANIFEST
## The Source of Truth for Developers & AI Agents

**Last Updated:** January 12, 2026  
**API Version:** 1.0.0  
**Base URL:** `http://localhost:3001/api` (Development) | `https://api.plannivo.com/api` (Production)

---

## 📋 Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Route Map](#route-map)
3. [User Management](#user-management)
4. [Wallet & Payments](#wallet--payments)
5. [Bookings](#bookings)
6. [Rentals](#rentals)
7. [Services & Packages](#services--packages)
8. [Hidden Rules & Business Logic](#hidden-rules--business-logic)
9. [Static IDs & Constants](#static-ids--constants)
10. [Quick-Start Snippets](#quick-start-snippets)
11. [Error Codes](#error-codes)
12. [Frontend UX Audit Notes](#frontend-ux-audit-notes)

---

## 🔐 Authentication & Authorization

### JWT Token Structure

```javascript
// Token payload structure
{
  "id": "uuid",           // User ID
  "email": "string",      // User email
  "role": "string",       // Role name (admin, manager, instructor, student, outsider)
  "twoFactorVerified": boolean,
  "iat": number,          // Issued at timestamp
  "exp": number           // Expiration timestamp
}
```

### Token Lifecycle

| Parameter | Value | Description |
|-----------|-------|-------------|
| `TOKEN_EXPIRY` | `24h` | Default JWT expiration |
| `MAX_FAILED_LOGINS` | `5` | Failed attempts before account lock |
| `ACCOUNT_LOCK_DURATION` | `1800` | Lock duration in seconds (30 min) |

### Required Headers

```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Role Hierarchy

| Role | Level | Permissions |
|------|-------|-------------|
| `super_admin` | 0 | Full system access |
| `admin` | 1 | All management functions |
| `manager` | 2 | User/booking/finance management |
| `owner` | 2 | Business owner access |
| `instructor` | 3 | Own schedule, student management |
| `student` | 4 | Own bookings, packages, wallet |
| `outsider` | 5 | Public registration, limited access |
| `freelancer` | 4 | Contractor access |

---

## 🗺️ Route Map

### Authentication Routes (`/api/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/login` | ❌ | User login |
| `POST` | `/register` | ❌ | Public registration (creates outsider) |
| `GET` | `/me` | ✅ | Get current user |
| `POST` | `/refresh-token` | ✅ | Refresh JWT token |
| `POST` | `/logout` | ✅ | Logout (logging only) |
| `POST` | `/forgot-password` | ❌ | Request password reset |
| `POST` | `/reset-password` | ❌ | Reset password with token |

### User Routes (`/api/users`)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/` | ✅ | admin, manager | List all users |
| `POST` | `/` | ✅ | admin, manager | Create user |
| `GET` | `/students` | ❌ | - | List students (public) |
| `GET` | `/for-booking` | ❌ | - | Users for booking dropdown |
| `GET` | `/customers/list` | ❌ | - | Paginated customer list |
| `GET` | `/preferences` | ✅ | any | Get user preferences |
| `PUT` | `/preferences` | ✅ | any | Update preferences |
| `GET` | `/:id` | ✅ | self, admin, manager | Get user by ID |
| `PUT` | `/:id` | ✅ | self, admin, manager | Update user |
| `DELETE` | `/:id` | ✅ | admin | Delete user (soft) |

### Wallet Routes (`/api/wallet`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/summary` | ✅ | Wallet balance summary |
| `GET` | `/transactions` | ✅ | Transaction history |
| `GET` | `/settings` | ✅ | Wallet settings |
| `POST` | `/settings/preferences` | ✅ | Update wallet preferences |
| `GET` | `/payment-methods` | ✅ | List payment methods |
| `POST` | `/deposit` | ✅ | Create deposit request |
| `POST` | `/deposit/binance-pay` | ✅ | Binance Pay deposit |
| `GET` | `/deposits` | ✅ | List user deposits |
| `GET` | `/bank-accounts` | ✅ | List bank accounts |
| `GET` | `/admin/deposits` | ✅ | Admin: All deposits |
| `POST` | `/admin/deposits/:id/approve` | ✅ | Admin: Approve deposit |
| `POST` | `/admin/deposits/:id/reject` | ✅ | Admin: Reject deposit |
| `POST` | `/admin/deposit/:userId` | ✅ | Admin: Direct deposit |

### Booking Routes (`/api/bookings`)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/` | ✅ | any | List bookings (filtered by role) |
| `GET` | `/available-slots` | ✅ | any | Get available time slots |
| `GET` | `/calendar` | ✅ | any | Calendar view data |
| `GET` | `/:id` | ❌ | - | Get booking by ID |
| `POST` | `/` | ✅ | admin, manager, instructor, student, outsider | Create booking |
| `POST` | `/group` | ✅ | admin, manager, instructor, student | Create group booking |
| `POST` | `/calendar` | ❌ | - | Calendar booking (legacy) |
| `PUT` | `/:id` | ✅ | admin, manager, instructor | Update booking |
| `DELETE` | `/:id` | ✅ | admin, manager | Delete booking (soft) |
| `POST` | `/bulk-delete` | ✅ | admin, manager | Bulk delete |
| `POST` | `/undo-delete` | ✅ | admin, manager | Undo delete |
| `POST` | `/:id/restore` | ✅ | admin, manager | Restore deleted |
| `POST` | `/:id/cancel` | ✅ | admin, manager | Cancel booking |
| `PATCH` | `/:id/status` | ✅ | admin, manager, instructor, owner | Update status |
| `GET` | `/deleted/list` | ✅ | admin | List deleted bookings |

### Rental Routes (`/api/rentals`)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/` | ✅ | admin, manager | List all rentals |
| `GET` | `/recent` | ✅ | admin, manager | Recent rentals |
| `GET` | `/active` | ✅ | admin, manager | Active rentals |
| `GET` | `/upcoming` | ✅ | admin, manager | Upcoming rentals |
| `GET` | `/overdue` | ✅ | admin, manager | Overdue rentals |
| `GET` | `/completed` | ✅ | admin, manager | Completed rentals |
| `GET` | `/:id` | ✅ | admin, manager | Get rental by ID |
| `POST` | `/` | ✅ | admin, manager | Create rental |
| `PUT` | `/:id` | ✅ | admin, manager | Update rental |
| `DELETE` | `/:id` | ✅ | admin | Delete rental |
| `PATCH` | `/:id/activate` | ✅ | admin, manager | Activate rental |
| `PATCH` | `/:id/complete` | ✅ | admin, manager | Complete rental |
| `PATCH` | `/:id/cancel` | ✅ | admin, manager | Cancel rental |
| `GET` | `/user/:userId` | ✅ | any | User's rentals |

### Service Routes (`/api/services`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/` | ❌ | List all services |
| `GET` | `/:id` | ❌ | Get service by ID |
| `POST` | `/` | ✅ | Create service |
| `PUT` | `/:id` | ✅ | Update service |
| `DELETE` | `/:id` | ✅ | Delete service |
| `GET` | `/packages` | ❌ | List lesson packages |
| `POST` | `/packages/purchase` | ✅ | Purchase package |
| `GET` | `/customer-packages/:userId` | ✅ | User's packages |
| `DELETE` | `/customer-packages/:id` | ✅ | Delete package |

---

## 👤 User Management

### Create User (Admin)

```http
POST /api/users
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@example.com",
  "phone": "+1234567890",
  "password": "SecurePass123!",
  "role_id": "uuid-of-student-role",
  "age": 25,
  "weight": 75,
  "preferred_currency": "EUR"
}
```

### Public Registration

```http
POST /api/auth/register
Content-Type: application/json

{
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane.smith@example.com",
  "phone": "+1234567890",
  "password": "SecurePass123!",
  "age": 30,
  "weight": 65,
  "preferred_currency": "EUR"
}
```

**Response:**
```json
{
  "id": "uuid",
  "email": "jane.smith@example.com",
  "name": "Jane Smith",
  "first_name": "Jane",
  "last_name": "Smith",
  "preferred_currency": "EUR"
}
```

---

## 💰 Wallet & Payments

### Get Wallet Summary

```http
GET /api/wallet/summary?currency=EUR
Authorization: Bearer <token>
```

**Response:**
```json
{
  "userId": "uuid",
  "currency": "EUR",
  "available": 1500.00,
  "pending": 0.00,
  "nonWithdrawable": 0.00,
  "updatedAt": "2026-01-12T10:00:00.000Z"
}
```

### Create Deposit

```http
POST /api/wallet/deposit
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 500.00,
  "currency": "EUR",
  "method": "bank_transfer",
  "bankAccountId": "uuid",
  "referenceCode": "DEP123456",
  "notes": "Monthly top-up"
}
```

### Admin Direct Deposit

```http
POST /api/wallet/admin/deposit/<userId>
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "amount": 1000.00,
  "currency": "EUR",
  "method": "cash",
  "autoComplete": true,
  "notes": "Cash payment received"
}
```

---

## 📅 Bookings

### Get Available Slots

```http
GET /api/bookings/available-slots?startDate=2026-01-15&endDate=2026-01-15&instructorIds[]=uuid1&instructorIds[]=uuid2
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "date": "2026-01-15",
    "slots": [
      {
        "time": "09:00",
        "status": "available",
        "instructorId": "uuid",
        "instructorName": "John Instructor",
        "date": "2026-01-15"
      },
      {
        "time": "09:30",
        "status": "booked",
        "instructorId": "uuid",
        "instructorName": "John Instructor",
        "date": "2026-01-15"
      }
    ]
  }
]
```

### Create Single Booking

```http
POST /api/bookings
Authorization: Bearer <token>
Content-Type: application/json

{
  "date": "2026-01-15",
  "start_hour": 10,
  "duration": 1.5,
  "student_user_id": "uuid",
  "instructor_user_id": "uuid",
  "service_id": "uuid",
  "status": "confirmed",
  "use_package": false,
  "amount": 120.00,
  "wallet_currency": "EUR",
  "notes": "First lesson",
  "location": "Beach"
}
```

**Key Parameters:**
- `use_package: true` - Deduct hours from customer's package
- `use_package: false` - Charge individual lesson price to wallet

**Response:**
```json
{
  "id": "uuid",
  "date": "2026-01-15",
  "start_hour": 10,
  "duration": 1.5,
  "payment_status": "paid",
  "final_amount": 120.00,
  "customer_package_id": null,
  "status": "confirmed"
}
```

### Create Group Booking

```http
POST /api/bookings/group
Authorization: Bearer <token>
Content-Type: application/json

{
  "date": "2026-01-15",
  "start_hour": 14,
  "duration": 2,
  "instructor_user_id": "uuid",
  "service_id": "uuid",
  "status": "confirmed",
  "participants": [
    {
      "userId": "uuid-1",
      "isPrimary": true,
      "paymentStatus": "paid",
      "usePackage": true
    },
    {
      "userId": "uuid-2",
      "isPrimary": false,
      "paymentStatus": "paid",
      "usePackage": false,
      "paymentAmount": 80.00
    }
  ],
  "notes": "Group lesson"
}
```

---

## 🏄 Rentals

### Create Rental

```http
POST /api/rentals
Authorization: Bearer <token>
Content-Type: application/json

{
  "user_id": "uuid",
  "equipment_ids": ["uuid-1", "uuid-2"],
  "start_date": "2026-01-15T09:00:00Z",
  "end_date": "2026-01-15T17:00:00Z",
  "rental_date": "2026-01-15",
  "status": "active",
  "payment_status": "paid",
  "total_price": 150.00,
  "currency": "EUR",
  "notes": "Rental notes"
}
```

---

## 📦 Services & Packages

### Purchase Package

```http
POST /api/services/packages/purchase
Authorization: Bearer <token>
Content-Type: application/json

{
  "user_id": "uuid",
  "package_id": "uuid",
  "payment_method": "wallet",
  "currency": "EUR"
}
```

**Response:**
```json
{
  "id": "uuid",
  "customerPackageId": "uuid",
  "package_name": "10-Hour Private Lessons",
  "total_hours": 10,
  "remaining_hours": 10,
  "status": "active",
  "purchase_date": "2026-01-12",
  "purchase_price": 680.00
}
```

---

## ⚙️ Hidden Rules & Business Logic

### Time Slot Increments

| Rule | Value | Description |
|------|-------|-------------|
| Slot Interval | **30 minutes** | All time slots are in 0.5-hour increments |
| Valid Durations | `0.5, 1, 1.5, 2, 2.5, 3` | Hours - must be multiples of 0.5 |
| Business Hours | `08:00 - 21:30` | Standard operating hours |

### Date & Time Formats

| Field | Format | Example |
|-------|--------|---------|
| `date` | `YYYY-MM-DD` | `2026-01-15` |
| `start_hour` | Decimal number | `10.5` (10:30 AM) |
| `duration` | Decimal hours | `1.5` (1 hour 30 min) |
| ISO Timestamps | `ISO 8601` | `2026-01-15T10:30:00.000Z` |

### Payment Status Values

| Status | Description |
|--------|-------------|
| `paid` | Payment completed (default for pay-and-go) |
| `package` | Deducted from customer package |
| `partial` | Split between package + cash |
| `pending` | Awaiting payment |
| `refunded` | Payment reversed |
| `overdue` | Past due (negative balance) |

### Pricing Rules

| Parameter | Value |
|-----------|-------|
| `HOURLY_RATE` | €80/hour (lesson) |
| `PACKAGE_DISCOUNT` | 15% off hourly rate |
| `RENTAL_HOURLY_RATE` | €25/hour (equipment) |
| `DEFAULT_CURRENCY` | EUR |

### Package Hour Deduction

```javascript
// When use_package: true
// 1. Find active package matching service type
// 2. Check remaining_hours >= booking duration
// 3. Deduct hours atomically:
new_used_hours = current_used + duration
new_remaining_hours = current_remaining - duration
// 4. Set payment_status = 'package'
// 5. Link customer_package_id to booking
```

### Role Upgrade Logic

```javascript
// Outsiders automatically upgrade to Student after:
// 1. First successful booking OR
// 2. First package purchase
// Triggered by: checkAndUpgradeAfterBooking(userId)
```

---

## 🔑 Static IDs & Constants

### Default Role IDs (UUIDs)

> ⚠️ These may vary by installation. Query `/api/roles` to get actual IDs.

```javascript
const ROLE_NAMES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  INSTRUCTOR: 'instructor',
  STUDENT: 'student',
  OUTSIDER: 'outsider',
  FREELANCER: 'freelancer',
  CUSTOMER: 'customer'
};
```

### Currency Codes

```javascript
const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'TRY', 'CAD', 'AUD'];
const DEFAULT_CURRENCY = 'EUR';
```

### Booking Status Values

```javascript
const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'done',
  'checked_out',
  'cancelled',
  'no_show'
];

const COMPLETED_STATUSES = ['completed', 'done', 'checked_out'];
```

### Rental Status Values

```javascript
const RENTAL_STATUSES = [
  'upcoming',
  'active',
  'completed',
  'overdue',
  'cancelled'
];
```

---

## 🚀 Quick-Start Snippets

### JavaScript: New User Onboarding

```javascript
const API_BASE = 'http://localhost:3001/api';

async function onboardNewUser({ firstName, lastName, email, password }) {
  // 1. Register user
  const registerRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      email,
      password,
      preferred_currency: 'EUR'
    })
  });
  
  if (!registerRes.ok) {
    const error = await registerRes.json();
    throw new Error(error.error || 'Registration failed');
  }
  
  const user = await registerRes.json();
  
  // 2. Login to get token
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const { token } = await loginRes.json();
  
  return { user, token };
}

// Usage
const { user, token } = await onboardNewUser({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  password: 'SecurePass123!'
});

console.log('New user created:', user.id);
```

### JavaScript: Execute a Rental

```javascript
async function createRental(token, { userId, equipmentIds, startDate, endDate, totalPrice }) {
  const response = await fetch(`${API_BASE}/rentals`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_id: userId,
      equipment_ids: equipmentIds,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      rental_date: startDate.toISOString().split('T')[0],
      status: 'active',
      payment_status: 'paid',
      total_price: totalPrice,
      currency: 'EUR'
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Rental creation failed');
  }
  
  return response.json();
}

// Usage
const rental = await createRental(adminToken, {
  userId: 'customer-uuid',
  equipmentIds: ['equipment-uuid-1', 'equipment-uuid-2'],
  startDate: new Date('2026-01-15T09:00:00'),
  endDate: new Date('2026-01-15T17:00:00'),
  totalPrice: 150.00
});

console.log('Rental created:', rental.id);
```

### JavaScript: Book a Lesson with Package

```javascript
async function bookLessonWithPackage(token, {
  date, startHour, duration, studentId, instructorId, serviceId
}) {
  const response = await fetch(`${API_BASE}/bookings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      date,                    // Format: 'YYYY-MM-DD'
      start_hour: startHour,   // Decimal: 10.5 = 10:30
      duration,                // Decimal hours: 1.5 = 1h30m
      student_user_id: studentId,
      instructor_user_id: instructorId,
      service_id: serviceId,
      status: 'confirmed',
      use_package: true,       // Use customer's package hours
      amount: 0,               // No charge when using package
      wallet_currency: 'EUR'
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    
    if (error.error === 'Insufficient or mismatched package') {
      throw new Error('No package hours available. Purchase a package or pay individually.');
    }
    
    throw new Error(error.message || error.error || 'Booking failed');
  }
  
  return response.json();
}
```

---

## ❌ Error Codes

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `204` | No Content |
| `400` | Bad Request - Invalid input |
| `401` | Unauthorized - Invalid/expired token |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found |
| `409` | Conflict - Resource already exists |
| `423` | Locked - Account locked |
| `429` | Too Many Requests - Rate limited |
| `500` | Server Error |

### Application Error Codes

| Error | Description |
|-------|-------------|
| `insufficient_wallet_balance` | Wallet balance too low for operation |
| `Insufficient or mismatched package` | No package hours available for service type |
| `Package update failed` | Concurrent modification prevented update |
| `Email already exists` | Duplicate email registration |
| `Invalid role_id` | Role doesn't exist |
| `Token has expired` | JWT needs refresh |
| `Account is temporarily locked` | Too many failed login attempts |

---

## 🎨 Frontend UX Audit Notes

### ✅ Loading States & Double-Click Prevention

| Component | Loading State | Disabled During Submit |
|-----------|---------------|----------------------|
| `StepBookingModal` | ✅ `isSubmitting` state | ✅ Buttons disabled |
| `StudentBookingWizard` | ✅ `mutation.isLoading` | ✅ All actions disabled |
| `BookingModal` | ✅ `isSubmitting` state | ✅ Submit button disabled |
| `ServiceForm` | ✅ `loading` prop | ✅ Button shows spinner |
| `UserSettings` | ✅ `saving` state | ✅ `loading={saving}` |
| Package Purchase | ✅ `purchasingPackageId` | ✅ Prevents double-buy |

**Code Pattern Used:**
```jsx
<Button
  type="primary"
  onClick={handleSubmit}
  loading={mutation.isLoading}
  disabled={!isStepValid() || mutation.isLoading}
>
  Confirm Booking
</Button>
```

### ✅ Error Message Display

| Error Type | Display Method |
|------------|----------------|
| Insufficient Balance | `notification.error()` with amount details |
| Validation Errors | `message.error()` inline |
| API Errors | Toast/notification with error message |
| Form Validation | Field-level error messages |

**Example - Insufficient Funds:**
```jsx
notification.error({
  message: 'Insufficient Balance',
  description: `You need ${formatCurrency(required)} but only have ${formatCurrency(available)} available.`,
  duration: 6,
});
```

### ⚠️ Mobile / Z-Index Notes

| Component | Z-Index | Notes |
|-----------|---------|-------|
| Sidebar | `60` | Higher than navbar (50) |
| Modals | `50` | Standard modal layer |
| Popups | `9999` | Highest priority |
| Calendar slots | `0-2` | Low, within grid |
| Booking list | `1-2` | Contained |

**Mobile Breakpoints:**
- `480px` - Extra small devices
- `640px` - Small devices  
- `768px` - Tablets
- `1024px` - Desktop

**Mobile Slot Styling:**
```css
@media (max-width: 480px) {
  .daily-grid-header,
  .time-slot-row {
    grid-template-columns: 80px repeat(var(--instructor-count, 2), 1fr);
  }
  
  .daily-view .time-slot {
    min-height: 50px;
    padding: var(--spacing-1);
    font-size: var(--text-sm);
  }
}
```

---

## 📁 File Structure Reference

```
backend/
├── routes/
│   ├── auth.js          # Authentication (login, register, JWT)
│   ├── users.js         # User CRUD operations
│   ├── wallet.js        # Wallet & payment operations
│   ├── bookings.js      # Lesson bookings (4468 lines)
│   ├── rentals.js       # Equipment rentals
│   ├── services.js      # Services & packages
│   ├── roles.js         # Role management
│   └── ...
├── services/
│   ├── walletService.js # Wallet business logic
│   ├── bookingService.js
│   └── ...
└── middlewares/
    ├── authorize.js     # RBAC middleware
    ├── security.js      # Rate limiting, headers
    └── errorHandler.js  # Global error handling

src/
├── features/
│   ├── bookings/
│   │   └── components/
│   │       ├── StepBookingModal.jsx
│   │       ├── BookingModal.jsx
│   │       └── styles/
│   ├── students/
│   │   └── components/
│   │       └── StudentBookingWizard.jsx
│   └── ...
└── shared/
    ├── contexts/
    └── components/
```

---

## 🔄 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial manifest creation |

---

*This manifest is the authoritative source for Plannivo API integration. Keep it updated as the system evolves.*
