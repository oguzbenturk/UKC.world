# Manager Commission & Revenue System - Implementation Plan

> **Status**: ✅ Core Implementation Complete  
> **Created**: January 14, 2026  
> **Last Updated**: January 14, 2026

---

## 📋 Overview

A comprehensive system for tracking manager commissions from bookings and rentals, providing managers with their own dashboard, revenue visibility, and payment tracking.

---

## 🎯 Goals

- Calculate manager commissions as a percentage of bookings and rentals revenue
- Provide managers with a dedicated dashboard to view their earnings
- Track commission payments and history
- Support flexible commission structures (flat %, tiered, per-service)
- Enable transparent reporting for both managers and admins

---

## 👤 Manager Role Definition

### Current State
- [ ] Manager role exists in system but has no special features
- [ ] No dedicated login screen or dashboard
- [ ] No commission tracking
- [ ] No visibility into their own performance/earnings

### Manager Capabilities (To Implement)
- [ ] View their own dashboard with earnings summary
- [ ] See bookings/rentals they are associated with
- [ ] Track their commission history
- [ ] View payment status (pending, paid)
- [ ] Access reports on their performance
- [ ] Manage their own profile settings

### Manager Limitations
- [ ] Cannot modify commission rates (admin only)
- [ ] Cannot approve their own payouts
- [ ] Cannot access other managers' data
- [ ] Cannot modify financial settings

---

## 💰 Commission Structure Options

### Option A: Flat Percentage
- [ ] Single percentage for all revenue (e.g., 10% of all bookings + rentals)
- [ ] Simplest to implement
- [ ] Example: Manager gets 10% of €1000 booking = €100 commission

### Option B: Per-Category Percentage
- [ ] Different rates for different revenue types:
  - [ ] Lesson bookings: X%
  - [ ] Equipment rentals: Y%
  - [ ] Accommodation bookings: Z%
  - [ ] Package sales: W%
- [ ] More flexible, incentivize specific areas

### Option C: Tiered Commission
- [ ] Rate changes based on volume thresholds:
  - [ ] 0-€5,000/month: 8%
  - [ ] €5,001-€15,000/month: 10%
  - [ ] €15,001+/month: 12%
- [ ] Incentivizes high performance

### Option D: Per-Service/Instructor Commission
- [ ] Different rates for specific services or instructors managed
- [ ] Most complex but most flexible
- [ ] Could be combined with other options

### Recommended Starting Point
- [ ] **Phase 1**: Flat percentage (simplest)
- [ ] **Phase 2**: Per-category percentage
- [ ] **Phase 3**: Tiered/advanced options

---

## 📊 Revenue Attribution

### What Counts Toward Manager Commission?

#### Bookings
- [ ] All lesson bookings in the system
- [ ] Only bookings for instructors they manage
- [ ] Only bookings they personally created
- [ ] Bookings at specific locations they manage

#### Rentals
- [ ] All equipment rentals
- [ ] Rentals at specific locations
- [ ] Rentals processed by manager

#### Other Revenue
- [ ] Package sales
- [ ] Accommodation bookings
- [ ] Shop/merchandise sales
- [ ] Wallet top-ups (typically NO)

### Attribution Questions to Decide
- [ ] Single manager per booking or split commission?
- [ ] What if booking is rescheduled - who gets commission?
- [ ] What about cancelled bookings - reverse commission?
- [ ] Refunds - deduct from commission?

---

## 🗄️ Database Schema

### Table: manager_commission_settings
- [ ] id (UUID)
- [ ] manager_user_id (FK to users) - UNIQUE
- [ ] commission_type (flat, per_category, tiered)
- [ ] default_rate (percentage, e.g., 10.00)
- [ ] booking_rate (for per-category type)
- [ ] rental_rate (for per-category type)
- [ ] accommodation_rate (for per-category type)
- [ ] package_rate (for per-category type)
- [ ] tier_settings (JSONB for tiered structure)
- [ ] is_active (boolean)
- [ ] effective_from (date)
- [ ] effective_until (date, nullable)
- [ ] created_by
- [ ] created_at
- [ ] updated_at

### Table: manager_commissions
- [ ] id (UUID)
- [ ] manager_user_id (FK to users)
- [ ] source_type (booking, rental, accommodation, package)
- [ ] source_id (FK to the respective table)
- [ ] source_amount (original transaction amount)
- [ ] source_currency
- [ ] commission_rate (% applied)
- [ ] commission_amount (calculated commission)
- [ ] commission_currency
- [ ] period_month (YYYY-MM for grouping)
- [ ] status (pending, approved, paid, cancelled)
- [ ] booking_date (when the revenue was generated)
- [ ] calculated_at (when commission was calculated)
- [ ] approved_at
- [ ] approved_by
- [ ] paid_at
- [ ] payment_reference
- [ ] notes
- [ ] metadata (JSONB)
- [ ] created_at
- [ ] updated_at

### Table: manager_payouts
- [ ] id (UUID)
- [ ] manager_user_id (FK)
- [ ] period_start (date)
- [ ] period_end (date)
- [ ] total_bookings_amount
- [ ] total_rentals_amount
- [ ] total_other_amount
- [ ] gross_commission
- [ ] deductions (for refunds, adjustments)
- [ ] net_commission
- [ ] currency
- [ ] status (draft, pending_approval, approved, paid, rejected)
- [ ] payment_method
- [ ] payment_reference
- [ ] payment_date
- [ ] approved_by
- [ ] approved_at
- [ ] notes
- [ ] created_at
- [ ] updated_at

### Table: manager_payout_items
- [ ] id (UUID)
- [ ] payout_id (FK to manager_payouts)
- [ ] commission_id (FK to manager_commissions)
- [ ] created_at

---

## 🔌 Integration Points

### Booking Creation
- [ ] After booking is created and confirmed
- [ ] Calculate commission based on booking amount
- [ ] Create manager_commissions record
- [ ] Associate with manager (how? location? default manager?)

### Booking Cancellation/Refund
- [ ] Mark commission as cancelled
- [ ] Or create negative commission entry
- [ ] Update payout calculations

### Rental Creation
- [ ] After rental is processed
- [ ] Calculate commission
- [ ] Create manager_commissions record

### Rental Cancellation/Return
- [ ] Handle refunds
- [ ] Adjust commission accordingly

### Package Purchase
- [ ] If managers get commission on packages
- [ ] Calculate and record commission

### Accommodation Booking
- [ ] If managers get commission on accommodation
- [ ] Calculate and record commission

---

## 👨‍💼 Admin Features

### Manager Commission Settings (Admin)
- [ ] View all managers and their commission rates
- [ ] Set/edit commission rate per manager
- [ ] Configure commission type (flat, tiered, per-category)
- [ ] Set effective dates for rate changes
- [ ] View historical rates

### Payout Management (Admin)
- [ ] Generate payout reports for period
- [ ] Review pending commissions
- [ ] Approve/reject payouts
- [ ] Mark payouts as paid
- [ ] Enter payment references
- [ ] View payout history

### Reporting (Admin)
- [ ] Total commissions by manager
- [ ] Commission breakdown by source type
- [ ] Period-over-period comparisons
- [ ] Outstanding (unpaid) commissions
- [ ] Top-earning managers

---

## 📱 Manager Dashboard

### Overview Section
- [ ] Total earnings this month
- [ ] Total earnings YTD
- [ ] Pending commissions (not yet paid)
- [ ] Last payout amount and date

### Earnings Breakdown
- [ ] Chart: Earnings by month
- [ ] Breakdown by source (bookings, rentals, etc.)
- [ ] Comparison to previous period

### Commission History
- [ ] List of all commission records
- [ ] Filter by date, status, source type
- [ ] Search by booking/rental ID
- [ ] Export to CSV

### Payout History
- [ ] List of all payouts
- [ ] Status (pending, approved, paid)
- [ ] Payment references
- [ ] Download payout statements

### Performance Metrics
- [ ] Number of bookings
- [ ] Total revenue generated
- [ ] Average commission per booking
- [ ] Trend indicators

---

## 🔐 Manager Login & Access

### Option A: Shared Login (Current)
- [ ] Same login page for all roles
- [ ] Role-based redirect after login
- [ ] Manager sees manager-specific menu

### Option B: Separate Login URL
- [ ] /manager/login - dedicated manager login
- [ ] Different branding/styling
- [ ] Separate from admin/student logins

### Option C: Subdomain
- [ ] manager.plannivo.com
- [ ] Complete separation
- [ ] Most complex to implement

### Recommended: Option A (Shared Login)
- [ ] Use existing auth system
- [ ] Add role-based routing
- [ ] Create manager-specific navigation

### Navigation for Managers
- [ ] Dashboard (earnings overview)
- [ ] Commissions (detailed list)
- [ ] Payouts (history)
- [ ] Settings (profile, preferences)
- [ ] Support/Help

---

## 🛡️ Security & Permissions

### Manager Permissions
- [ ] Can view own commissions only
- [ ] Can view bookings in their scope
- [ ] Can view rentals in their scope
- [ ] Cannot modify commission rates
- [ ] Cannot approve own payouts
- [ ] Cannot access other managers' data

### Admin Permissions
- [ ] Can view all managers' commissions
- [ ] Can set/modify commission rates
- [ ] Can approve/reject payouts
- [ ] Can generate reports across all managers
- [ ] Can override commission calculations

### Audit Trail
- [ ] Log all commission calculations
- [ ] Log rate changes
- [ ] Log payout approvals/rejections
- [ ] Log payment confirmations

---

## 📊 Reports

### Manager Reports
- [ ] My Earnings Statement (monthly)
- [ ] My Commission Details
- [ ] My Payout History

### Admin Reports
- [ ] All Managers Commission Summary
- [ ] Outstanding Commissions
- [ ] Payout Schedule
- [ ] Commission by Source Type
- [ ] Manager Performance Ranking

---

## 🚀 Implementation Phases

### Phase 1: Foundation ✅ COMPLETED
- [x] Design database schema
- [x] Create migration files (103_create_manager_commission_system.sql)
- [x] Implement manager_commission_settings table
- [x] Implement manager_commissions table
- [x] Implement manager_payouts & manager_payout_items tables
- [x] Admin UI to set commission rate (ManagerCommissionSettings.jsx)

### Phase 2: Commission Tracking ✅ COMPLETED
- [x] Hook into booking completion to calculate commission
- [x] Hook into rental completion to calculate commission
- [x] Handle cancellations/refunds (commission cancellation)
- [x] Commission calculation service (managerCommissionService.js)
- [x] API endpoints for commission data (managerCommissions.js routes)

### Phase 3: Manager Dashboard ✅ COMPLETED
- [x] Create manager dashboard layout (ManagerDashboard.jsx)
- [x] Earnings overview component (monthly, YTD, pending)
- [x] Commission history list with filters
- [x] Breakdown charts (bookings vs rentals)

### Phase 4: Payouts
- [x] Implement manager_payouts table (in migration)
- [ ] Payout generation workflow
- [ ] Admin approval interface
- [ ] Mark as paid functionality

### Phase 5: Advanced Features
- [x] Per-category commission rates (supported in schema/service)
- [ ] Tiered commission structure (schema ready, logic TODO)
- [ ] Advanced reporting
- [ ] Export/download features

### Phase 6: Polish
- [ ] Manager onboarding flow
- [ ] Email notifications (new commission, payout approved)
- [ ] Mobile-responsive design
- [ ] Performance optimization

---

## ❓ Open Questions

1. **Manager Assignment**: How do we determine which manager gets commission for a booking?
   - he get from every lesson and rentals that is happening in the center 

2. **Commission Timing**: When is commission calculated?
   - At lesson completion and rental completion

3. **Multi-Manager Scenarios**: What if multiple managers are involved?
   not yet.

4. **Instructor Commissions**: Do instructors also get commissions?
   - Separate from manager commission?
   - Same system, different rates?

   -Manager is getting comission from raw price so for example 1h lesson is 100€ %35 is going for instructor and %10 going for manager to in total %45 raw expense for school 

5. **Currency Handling**: How to handle multi-currency?
   - Convert all to EUR for commission

6. **Payment Methods**: How are managers paid?
   - Bank transfer +
   - Through wallet system +
   - External payment +

7. **Tax Implications**: Should the system track tax info?
   - VAT on commissions? NO
   - Tax withholding? NO
   - Invoice generation no 

---

## 📝 Notes

### Implementation Progress (January 14, 2026)

**Backend Completed:**
1. **Database Migration** - `backend/db/migrations/103_create_manager_commission_system.sql`
   - Created 4 tables: manager_commission_settings, manager_commissions, manager_payouts, manager_payout_items
   - Includes indexes, triggers, constraints

2. **Service Layer** - `backend/services/managerCommissionService.js`
   - `recordBookingCommission()` - Records commission when booking is completed
   - `recordRentalCommission()` - Records commission when rental is completed
   - `cancelCommission()` - Cancels commission when booking/rental is cancelled
   - `getManagerCommissionSummary()` - Dashboard summary data
   - `getManagerCommissions()` - Paginated commission history
   - `upsertManagerCommissionSettings()` - Admin sets commission rates
   - `getAllManagersWithCommissionSettings()` - Admin view of all managers

3. **API Routes** - `backend/routes/managerCommissions.js`
   - `GET /api/manager/commissions/dashboard` - Manager's own dashboard
   - `GET /api/manager/commissions/history` - Manager's commission history
   - `GET /api/manager/commissions/summary` - Manager's summary for period
   - `GET /api/manager/commissions/admin/managers` - Admin: all managers list
   - `GET /api/manager/commissions/admin/managers/:id/settings` - Admin: get manager settings
   - `PUT /api/manager/commissions/admin/managers/:id/settings` - Admin: update settings
   - `GET /api/manager/commissions/admin/managers/:id/commissions` - Admin: manager history
   - `GET /api/manager/commissions/admin/managers/:id/summary` - Admin: manager summary

4. **Integration Hooks** (Fire-and-forget, non-blocking)
   - `backend/routes/bookings.js` - Added commission recording on booking completion
   - `backend/routes/bookings.js` - Added commission cancellation on booking cancel
   - `backend/routes/rentals.js` - Added commission recording on rental completion
   - `backend/routes/rentals.js` - Added commission cancellation on rental cancel

**Frontend Completed:**
- `src/features/manager/pages/ManagerDashboard.jsx` - Manager's commission dashboard with:
  - Current month earnings, pending commissions, YTD totals
  - Comparison vs previous month
  - Breakdown by source (bookings vs rentals)
  - Commission history table with filters (source, status, date range)
- `src/features/manager/pages/ManagerCommissionSettings.jsx` - Admin settings page with:
  - List of all managers with commission settings
  - Edit modal for commission rates per manager
  - Support for flat and per-category commission types
- `src/features/manager/services/managerCommissionApi.js` - API client for all commission endpoints
- `src/routes/AppRoutes.jsx` - Added routes `/manager/commissions` and `/admin/manager-commissions`
- `src/shared/utils/navConfig.js` - Added navigation items for managers and admins

---

## 🔗 Related Documents

- [Wallet System Implementation](wallet-system-implementation-plan.md)
- [Voucher & Gift System](VOUCHER_GIFT_SYSTEM_PLAN.md)

---
