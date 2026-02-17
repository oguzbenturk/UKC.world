# Gift, Voucher & Promo Code System - Implementation Plan

> **Status**: ✅ Phase 1-3 Complete, Phase 4 In Progress  
> **Created**: January 14, 2026  
> **Last Updated**: January 15, 2026

---

## 📋 Overview

A comprehensive system to create and manage promotional codes, gift vouchers, and wallet credits that can be redeemed by customers for discounts or benefits across the platform.

---

## 🎯 Goals

- Allow admins to create promotional campaigns with discount codes
- Support gift vouchers that can be given to customers
- Enable wallet credit codes for marketing purposes
- Track redemption and measure campaign effectiveness
- Prevent abuse while keeping the system user-friendly

---

## 📦 Voucher Types

### Type 1: Percentage Discount
- [x] Applies X% off to eligible purchases
- [x] Can have maximum discount cap (e.g., 10% off, max €50)
- [x] Example: "SUMMER10" = 10% off any lesson

### Type 2: Fixed Amount Discount
- [x] Applies fixed €/₺/$ amount off purchase
- [x] Must meet minimum purchase requirement
- [x] Example: "SAVE20" = €20 off orders over €100

### Type 3: Wallet Credit
- [x] Adds funds directly to user's wallet upon redemption
- [x] One-time credit, no conditions needed
- [x] Example: "WELCOME50" = €50 free wallet credit

### Type 4: Free Service/Add-on
- [x] Grants a specific free service or product
- [ ] Could be a free lesson hour, free rental day, etc.
- [x] Example: "FREErental" = 1 free day of ski rental

### Type 5: Package Upgrade
- [x] Upgrades a package to a higher tier
- [ ] Or adds extra hours/days to a package
- [x] Example: "UPGRADE2025" = +2 extra lesson hours

---

## 🎯 Application Scope

### Where can codes be applied?

- [x] **All Services** - Universal discount
- [x] **Lessons Only** - Any lesson service
- [ ] **Specific Lesson Type** - Only private lessons, only group, etc.
- [x] **Rentals Only** - Equipment rentals
- [ ] **Specific Equipment** - Only skis, only snowboards, etc.
- [x] **Accommodation Only** - Room bookings
- [ ] **Specific Room Types** - Only suites, only dorms, etc.
- [x] **Packages Only** - Package purchases
- [x] **Specific Packages** - Only selected packages (via applies_to_ids)
- [x] **Wallet Top-ups** - When adding money to wallet

---

## 🔐 Code Generation & Types

### Code Format Options
- [x] Custom codes (admin-defined, e.g., "SUMMER2026")
- [x] Random alphanumeric (e.g., "X7K9-M2PL-Q4RT")
- [ ] Sequential (e.g., "GIFT-0001", "GIFT-0002")
- [x] Bulk generation (generate 100 unique codes at once)

### Usage Type
- [x] **Single-use global** - One person can use it once, then it's dead
- [x] **Single-use per user** - Each user can use once, but code stays active
- [x] **Multi-use limited** - Can be used N times total across all users
- [x] **Multi-use per user** - Each user can use up to N times
- [x] **Unlimited** - No usage restrictions (dangerous, for testing only)

### Visibility
- [x] **Public** - Anyone can use if they know the code
- [x] **Private/Assigned** - Only assigned users can use
- [x] **Role-based** - Only students, only outsiders, only trusted customers

---

## ⚙️ Restrictions & Conditions

### Monetary Limits
- [x] Minimum purchase amount (e.g., min €50 order)
- [x] Maximum discount amount (e.g., cap at €100 off)
- [ ] Minimum cart items (e.g., at least 2 services)

### Time Restrictions
- [x] Valid from date
- [x] Valid until date (expiration)
- [ ] Valid on specific days only (weekends only)
- [ ] Valid during specific hours (happy hour codes)

### User Restrictions
- [x] First-time customers only (never booked before)
- [ ] Returning customers only
- [x] Specific user roles only
- [x] Specific users only (VIP list via user_vouchers)
- [ ] Email domain restriction (e.g., @company.com employees)

### Combination Rules
- [ ] Cannot combine with other vouchers
- [ ] Can stack with other vouchers (limit how many)
- [ ] Cannot apply to already-discounted items
- [ ] Cannot use on sale/promotional packages

### Service Restrictions
- [x] Exclude specific services (via excludes_ids)
- [ ] Exclude specific instructors
- [ ] Exclude specific time slots (peak hours)
- [ ] Exclude specific dates (holidays)

---

## 👨‍💼 Admin Features

### Code Management
- [x] Create single voucher code with all settings
- [x] Bulk generate codes (for gift cards, partnerships)
- [x] Edit existing voucher codes
- [x] Deactivate/Activate codes
- [x] Delete codes (with confirmation)
- [ ] Clone/duplicate codes for similar campaigns
- [ ] Import codes from CSV
- [ ] Export codes to CSV

### Monitoring & Analytics
- [x] View all codes with status (active, expired, depleted)
- [x] Search/filter codes by name, type, status
- [x] View redemption history per code
- [x] See who redeemed, when, for what
- [x] Total discount given per code
- [ ] Revenue influenced by code
- [ ] Conversion rate (views vs redemptions)

### Campaign Management
- [x] Group codes into campaigns (Summer Sale 2026)
- [ ] Set campaign-level budgets
- [x] Pause entire campaigns
- [x] Campaign performance dashboard (stats endpoint)

---

## 👤 User Experience (Customer Side)

### Redemption Points
- [x] During booking checkout (before payment)
- [x] During package purchase (before payment)
- [ ] During rental checkout (before payment)
- [ ] During accommodation booking (before payment)
- [x] In wallet section (for credit codes via wallet_credit type)
- [x] In profile/settings (pre-save for later via user_vouchers)

### User Interface
- [x] "Have a promo code?" input field at checkout
- [x] Apply button with instant validation
- [x] Show discount amount immediately
- [x] Show error message if code invalid
- [x] Show reason why code failed (expired, not eligible, etc.)
- [x] Remove applied code option
- [x] Show all active/saved vouchers in profile (GET /vouchers/my endpoint)

### User's Voucher Wallet
- [x] View assigned/gifted vouchers
- [x] See voucher details (value, expiry, conditions)
- [ ] One-click apply at checkout
- [x] Voucher usage history (via redemption records)

---

## 🗄️ Database Schema (Conceptual)

### Table: voucher_codes ✅ IMPLEMENTED
- [x] id (UUID)
- [x] code (unique string, the actual code)
- [x] name (internal name for admin)
- [x] description (for users to see)
- [x] voucher_type (percentage, fixed, wallet_credit, free_service)
- [x] discount_value (amount or percentage)
- [x] max_discount (cap for percentage discounts)
- [x] min_purchase_amount
- [x] currency (if fixed amount)
- [x] applies_to (all, lessons, rentals, accommodation, packages)
- [x] applies_to_ids (specific service/package IDs, JSON array)
- [x] excludes_ids (excluded items, JSON array)
- [x] usage_type (single, multi, unlimited)
- [x] max_total_uses (total redemptions allowed)
- [x] max_uses_per_user
- [x] total_uses (counter)
- [x] valid_from (timestamp)
- [x] valid_until (timestamp)
- [x] is_active (boolean)
- [x] requires_first_purchase (boolean)
- [x] allowed_roles (JSON array or null for all)
- [x] allowed_user_ids (JSON array or null for public)
- [ ] can_combine (boolean)
- [x] campaign_id (optional FK)
- [x] created_by
- [x] created_at
- [x] updated_at

### Table: voucher_redemptions ✅ IMPLEMENTED
- [x] id (UUID)
- [x] voucher_code_id (FK)
- [x] user_id (FK)
- [x] redeemed_at (timestamp)
- [x] applied_to_type (booking, package, rental, accommodation, wallet)
- [x] applied_to_id (the specific entity ID)
- [x] original_amount (before discount)
- [x] discount_amount (how much saved)
- [x] final_amount (after discount)
- [x] currency
- [x] status (applied, refunded, cancelled)
- [x] metadata (JSON for extra info)

### Table: voucher_campaigns ✅ IMPLEMENTED
- [x] id (UUID)
- [x] name
- [x] description
- [ ] budget_limit
- [ ] total_spent
- [x] start_date
- [x] end_date
- [x] is_active
- [x] created_by
- [x] created_at

### Table: user_vouchers ✅ IMPLEMENTED
- [x] id (UUID)
- [x] user_id (FK)
- [x] voucher_code_id (FK)
- [x] assigned_at
- [x] assigned_by (admin who assigned)
- [x] is_used
- [x] used_at
- [x] notes

---

## 🔌 Integration Points

### Booking Flow
- [x] Add promo code input to booking wizard step
- [x] Validate code against booking type
- [x] Apply discount to final price
- [x] Store redemption record
- [x] Show discount in booking confirmation

### Package Purchase
- [x] Add promo code input to package modal
- [x] Validate against package type
- [x] Apply to package price
- [x] Store redemption record

### Rental Checkout
- [ ] Add promo code to rental summary
- [ ] Validate against rental items
- [ ] Apply discount
- [ ] Store redemption record

### Accommodation Booking
- [ ] Add promo code to accommodation booking
- [ ] Validate against room/dates
- [ ] Apply discount
- [ ] Store redemption record

### Wallet Top-up
- [x] Special handling for wallet credit codes
- [x] Add credit directly to wallet
- [x] Record as wallet transaction

### Payment Processing
- [x] Adjust amount charged based on discount
- [ ] Handle refunds (restore voucher usage?)
- [ ] Handle cancellations

---

## 🛡️ Security & Abuse Prevention

### Rate Limiting
- [ ] Limit code validation attempts per user
- [ ] Limit redemptions per IP address
- [ ] Block suspicious patterns

### Fraud Detection
- [ ] Flag unusual redemption patterns
- [x] Detect code sharing/leaking (via max_uses_per_user)
- [ ] Monitor for bot attacks

### Audit Trail
- [x] Log all code creations/edits
- [x] Log all redemption attempts (success and failure)
- [x] Log admin actions

### Code Security
- [x] Case-insensitive matching
- [x] Trim whitespace
- [x] Prevent SQL injection (parameterized queries)
- [ ] Prevent code enumeration attacks

---

## 📱 Notifications

### User Notifications
- [ ] Email when voucher is assigned to user
- [ ] Email reminder before voucher expires
- [ ] Push notification for new vouchers (if enabled)
- [ ] In-app notification badge

### Admin Notifications
- [ ] Alert when code reaches usage limit
- [ ] Alert when campaign budget depleted
- [ ] Daily/weekly redemption summary email

---

## 🚀 Implementation Phases

### Phase 1: Foundation ✅ COMPLETE
- [x] Design and create database tables
- [x] Create migration files
- [x] Basic CRUD API for voucher codes
- [x] Admin UI for creating/listing codes

### Phase 2: Core Redemption ✅ COMPLETE
- [x] Code validation endpoint
- [x] Apply percentage discount to bookings
- [x] Apply fixed discount to bookings
- [x] Store redemption records
- [x] Add promo code input to booking wizard

### Phase 3: Extended Redemption ✅ COMPLETE
- [x] Apply to package purchases
- [ ] Apply to rental checkouts
- [ ] Apply to accommodation bookings
- [x] Wallet credit code redemption

### Phase 4: Advanced Features 🔄 IN PROGRESS
- [x] Bulk code generation
- [x] User voucher assignment
- [x] Campaign management
- [x] Analytics dashboard (basic stats)

### Phase 5: Polish & Security
- [ ] Abuse prevention measures
- [ ] Notification system
- [ ] Refund handling
- [ ] Performance optimization

---

## ❓ Open Questions

1. **Should vouchers affect instructor earnings?**
   - If 10% discount applied, does instructor get paid on full or discounted amount?
   - Recommendation: Instructor gets full commission, company absorbs discount

2. **How to handle partial refunds?**
   - If booking cancelled, should voucher be restored?
   - Single-use: Restore? Multi-use: Decrease counter?

3. **Currency handling for fixed discounts?**
   - €20 code used by TRY customer - convert or reject?
   - Recommendation: Convert at current rate

4. **Voucher stacking?**
   - Allow multiple codes on one purchase?
   - Recommendation: Start with no stacking, add later if needed

5. **Gift cards vs Promo codes?**
   - Are they different systems or same with different config?
   - Recommendation: Same system, gift cards are wallet_credit type

6. **Integration with existing loyalty/points system?**
   - Is there one? Should this replace it?

---

## 📊 Success Metrics

- [ ] Number of codes created
- [ ] Number of redemptions
- [ ] Total discount value given
- [ ] Revenue influenced by vouchers
- [ ] New customer acquisition via codes
- [ ] Repeat usage by voucher recipients
- [ ] Campaign ROI

---

## 📝 Notes

_Add implementation notes, decisions, and updates here as the project progresses._

### Implementation Notes (January 15, 2026)

**Files Created:**
- `backend/migrations/102_create_voucher_system.sql` - Database migration with all 4 tables
- `backend/services/voucherService.js` - Core business logic (~550 lines)
- `backend/routes/vouchers.js` - REST API endpoints (~420 lines)
- `src/features/admin/pages/VoucherManagement.jsx` - Admin UI (~750 lines)
- `src/shared/components/PromoCodeInput.jsx` - Reusable promo input (~200 lines)

**Files Modified:**
- `backend/server.js` - Added vouchers route registration
- `backend/routes/services.js` - Added voucherId to package purchase
- `backend/routes/bookings.js` - Added voucherId to booking creation
- `src/routes/AppRoutes.jsx` - Added VoucherManagement route
- `src/shared/utils/navConfig.js` - Added Vouchers to admin sidebar
- `src/features/students/components/StudentBookingWizard.jsx` - Promo code integration
- `src/features/outsider/pages/OutsiderBookingPage.jsx` - Promo code integration

**API Endpoints:**
- `POST /api/vouchers` - Create voucher (admin)
- `GET /api/vouchers` - List vouchers (admin)
- `PUT /api/vouchers/:id` - Update voucher (admin)
- `DELETE /api/vouchers/:id` - Delete voucher (admin)
- `POST /api/vouchers/bulk` - Bulk generate (admin)
- `POST /api/vouchers/:id/assign` - Assign to user (admin)
- `GET /api/vouchers/:id/redemptions` - View redemptions (admin)
- `POST /api/vouchers/validate` - Validate code (user)
- `GET /api/vouchers/my` - Get user's vouchers (user)
- `POST /api/vouchers/campaigns` - Create campaign (admin)
- `GET /api/vouchers/campaigns` - List campaigns (admin)

---
