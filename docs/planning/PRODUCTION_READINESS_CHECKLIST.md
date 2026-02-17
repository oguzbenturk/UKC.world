# 🚀 Production Readiness Checklist

> **Goal:** Verify that every system in the app works correctly before going live or after major changes.

---

## 📋 HOW TO USE THIS CHECKLIST

1. **Run automated checks first** (saves time)
2. **Then do manual verification** (catches UI/UX issues)
3. **Mark each item** with `[x]` when verified
4. **Note any issues** in the "Notes" sections

---

## 🤖 PHASE 1: Automated Checks (Run These First)

### 1.1 Database Integrity
```bash
npm run test:integrity
```
- [ ] All checks pass (no critical issues)
- [ ] Review any warnings

### 1.2 API Health Check
```bash
# Start your backend first, then:
curl http://localhost:4000/api/health
```
- [ ] API responds with 200 OK
- [ ] Database connection is healthy
- [ ] Redis connection is healthy (if used)

### 1.3 Build Check
```bash
npm run build
```
- [ ] Frontend builds without errors
- [ ] No TypeScript/ESLint critical errors

---

## 💰 PHASE 2: Financial System (CRITICAL)

> **Why:** Money bugs destroy trust. Test these thoroughly.

### 2.1 Wallet Operations
- [ ] **Add Credit:** Admin adds €100 to a test user's wallet → Balance shows €100
- [ ] **Deduct Credit:** Book a €30 lesson → Balance shows €70
- [ ] **Refund:** Cancel the lesson → Balance returns to €100
- [ ] **History:** Transaction history shows all 3 operations correctly

### 2.2 Package Hours
- [ ] **Purchase Package:** Buy a "10-hour package" → User has 10 hours
- [ ] **Use Hours:** Book a 2-hour lesson → User has 8 hours remaining
- [ ] **Cancel Booking:** Cancel lesson → Hours return to 10
- [ ] **Package Expiry:** Expired packages cannot be used

### 2.3 Payments & Checkout
- [ ] **Card Payment:** Complete a purchase with test card (Stripe test mode)
- [ ] **Wallet Payment:** Pay using wallet balance
- [ ] **Mixed Payment:** Part wallet, part card (if supported)
- [ ] **Receipt:** Email receipt is sent after payment

### 2.4 Refunds
- [ ] **Full Refund:** Refund entire booking → Money returns to wallet/card
- [ ] **Partial Refund:** Refund part of an order → Correct amount returned
- [ ] **Refund Reason:** Admin can add refund reason

### 2.5 Commission Calculations
- [ ] **Instructor Commission:** After lesson completion, instructor earnings calculated correctly
- [ ] **Commission Rate:** Different services have correct commission rates
- [ ] **Payout Report:** Payroll report shows accurate totals

**Notes:**
```
(Write any issues found here)
```

---

## 📅 PHASE 3: Booking System

### 3.1 Create Bookings
- [ ] **Single Lesson:** Book a 1-hour lesson → Appears on calendar
- [ ] **Multi-Participant:** Book lesson with 2+ students → All shown
- [ ] **Recurring:** Create weekly recurring lessons → All instances created
- [ ] **Group Booking:** Book a group class → Capacity enforced

### 3.2 Booking Modifications
- [ ] **Reschedule:** Move booking to different time → Calendar updates
- [ ] **Change Instructor:** Assign different instructor → Both calendars update
- [ ] **Add Notes:** Add booking notes → Visible to instructor

### 3.3 Cancellations
- [ ] **Within Policy:** Cancel within free cancellation window → Full refund
- [ ] **Outside Policy:** Cancel late → Cancellation fee applied (if configured)
- [ ] **Instructor Cancel:** Instructor cancels → Customer notified

### 3.4 Check-in/Check-out
- [ ] **Check-in:** Mark student as arrived → Status updates
- [ ] **No-Show:** Mark as no-show → Applies no-show policy
- [ ] **Check-out:** Complete lesson → Ready for payment processing

### 3.5 Calendar Views
- [ ] **Day View:** Shows all bookings for the day
- [ ] **Week View:** Shows week overview correctly
- [ ] **Month View:** Shows monthly summary
- [ ] **Instructor Filter:** Filter by instructor works

**Notes:**
```
(Write any issues found here)
```

---

## 🏄 PHASE 4: Rental System

### 4.1 Equipment Management
- [ ] **View Inventory:** All equipment shows with correct stock
- [ ] **Add Equipment:** Create new equipment item → Appears in list
- [ ] **Edit Equipment:** Change price/description → Updates correctly

### 4.2 Rental Bookings
- [ ] **Create Rental:** Rent equipment for specific dates → Stock decreases
- [ ] **Check Availability:** Unavailable equipment cannot be double-booked
- [ ] **Return Equipment:** Mark as returned → Stock increases

### 4.3 Rental Packages
- [ ] **Package Rental:** Rent equipment + lesson together
- [ ] **Package Pricing:** Package discount applies correctly

**Notes:**
```
(Write any issues found here)
```

---

## 🏨 PHASE 5: Accommodation (If Applicable)

### 5.1 Room Management
- [ ] **View Rooms:** All accommodation units visible
- [ ] **Availability Calendar:** Shows occupied/free dates

### 5.2 Accommodation Bookings
- [ ] **Book Room:** Reserve room for dates → Calendar blocks dates
- [ ] **No Double Booking:** Same room cannot be booked twice for same dates
- [ ] **Checkout:** Complete stay → Room becomes available

**Notes:**
```
(Write any issues found here)
```

---

## 🛒 PHASE 6: Shop & Products

### 6.1 Product Catalog
- [ ] **View Products:** All products display with images and prices
- [ ] **Categories:** Products filter by category correctly
- [ ] **Search:** Product search returns relevant results

### 6.2 Shopping Cart
- [ ] **Add to Cart:** Item added → Cart updates
- [ ] **Update Quantity:** Change quantity → Total recalculates
- [ ] **Remove Item:** Remove from cart → Item disappears

### 6.3 Checkout
- [ ] **Complete Order:** Checkout succeeds → Order confirmation shown
- [ ] **Order History:** Order appears in customer's history
- [ ] **Admin View:** Order appears in admin order list

### 6.4 Inventory
- [ ] **Stock Tracking:** Purchase reduces stock count
- [ ] **Out of Stock:** Cannot purchase out-of-stock items
- [ ] **Low Stock Alert:** Admin notified of low stock (if configured)

**Notes:**
```
(Write any issues found here)
```

---

## 👥 PHASE 7: User Management

### 7.1 Registration & Login
- [ ] **New Registration:** Create account → Verification email sent (if enabled)
- [ ] **Login:** Correct credentials → Dashboard access
- [ ] **Wrong Password:** Shows error, doesn't reveal if email exists
- [ ] **Password Reset:** Reset flow works end-to-end

### 7.2 User Profiles
- [ ] **View Profile:** User can see their profile
- [ ] **Edit Profile:** Changes save correctly
- [ ] **Upload Avatar:** Image uploads and displays

### 7.3 Role-Based Access
- [ ] **Student:** Can only access student features
- [ ] **Instructor:** Can access instructor dashboard, not admin
- [ ] **Manager:** Can access management features
- [ ] **Admin:** Full access to all features

### 7.4 Family Members
- [ ] **Add Family:** Add family member to account
- [ ] **Book for Family:** Book lessons for family members
- [ ] **Family Wallet:** Shared wallet balance (if applicable)

**Notes:**
```
(Write any issues found here)
```

---

## 💬 PHASE 8: Communication

### 8.1 Chat System
- [ ] **Send Message:** Message delivers instantly
- [ ] **Receive Notification:** Unread badge appears
- [ ] **File Attachment:** Can send images/documents
- [ ] **Voice Note:** Can send audio (if supported)

### 8.2 Notifications
- [ ] **Booking Confirmation:** Email sent after booking
- [ ] **Reminder:** Reminder sent before lesson (if configured)
- [ ] **Cancellation Notice:** Email sent on cancellation
- [ ] **Push Notifications:** Mobile push works (if enabled)

**Notes:**
```
(Write any issues found here)
```

---

## 📝 PHASE 9: Forms & Compliance

### 9.1 Form Builder
- [ ] **Create Form:** Build a custom form → Saves correctly
- [ ] **Public Link:** Form accessible via public URL
- [ ] **Submit Form:** Submission saves to database
- [ ] **View Responses:** Admin can view all submissions

### 9.2 Waivers & Legal
- [ ] **View Waiver:** Customer sees waiver before booking
- [ ] **Sign Waiver:** Digital signature saves
- [ ] **Waiver Storage:** Signed waiver retrievable by admin
- [ ] **Version Update:** New waiver version prompts re-sign

**Notes:**
```
(Write any issues found here)
```

---

## 📊 PHASE 10: Reporting & Analytics

### 10.1 Financial Reports
- [ ] **Revenue Report:** Shows accurate totals
- [ ] **Date Filtering:** Filter by date range works
- [ ] **Export:** Can export to CSV/PDF

### 10.2 Booking Reports
- [ ] **Booking Summary:** Counts match actual bookings
- [ ] **Instructor Report:** Shows lessons per instructor
- [ ] **Utilization:** Capacity usage accurate

### 10.3 Dashboard KPIs
- [ ] **Today's Revenue:** Matches actual transactions
- [ ] **Booking Count:** Matches calendar entries
- [ ] **Active Users:** Count is reasonable

**Notes:**
```
(Write any issues found here)
```

---

## 🔒 PHASE 11: Security

### 11.1 Authentication
- [ ] **Session Timeout:** Inactive sessions expire
- [ ] **Concurrent Login:** Handles multiple sessions correctly
- [ ] **2FA:** Two-factor authentication works (if enabled)

### 11.2 Authorization
- [ ] **API Protection:** Cannot access other users' data via API
- [ ] **Role Enforcement:** Cannot escalate privileges
- [ ] **Admin Routes:** Blocked for non-admin users

### 11.3 Data Protection
- [ ] **HTTPS:** All traffic encrypted (production)
- [ ] **Passwords:** Stored hashed, not plaintext
- [ ] **Sensitive Data:** Credit card numbers not stored raw

**Notes:**
```
(Write any issues found here)
```

---

## 📱 PHASE 12: Mobile & Performance

### 12.1 Responsive Design
- [ ] **Phone View:** App works on mobile (320px width)
- [ ] **Tablet View:** App works on tablet (768px width)
- [ ] **Desktop View:** App works on desktop (1920px width)

### 12.2 Performance
- [ ] **Page Load:** Pages load under 3 seconds
- [ ] **No Crashes:** No JavaScript errors in console
- [ ] **Smooth Scroll:** Lists scroll without lag

### 12.3 Offline Handling
- [ ] **Connection Lost:** Shows appropriate message
- [ ] **Reconnect:** Recovers when connection returns

**Notes:**
```
(Write any issues found here)
```

---

## ✅ FINAL SIGN-OFF

| Phase | Status | Tested By | Date |
|-------|--------|-----------|------|
| 1. Automated Checks | ⬜ | | |
| 2. Financial System | ⬜ | | |
| 3. Booking System | ⬜ | | |
| 4. Rental System | ⬜ | | |
| 5. Accommodation | ⬜ | | |
| 6. Shop & Products | ⬜ | | |
| 7. User Management | ⬜ | | |
| 8. Communication | ⬜ | | |
| 9. Forms & Compliance | ⬜ | | |
| 10. Reporting | ⬜ | | |
| 11. Security | ⬜ | | |
| 12. Mobile & Performance | ⬜ | | |

**Overall Status:** ⬜ Not Started / 🟡 In Progress / ✅ Production Ready

**Sign-off Date:** _______________

**Signed By:** _______________

---

## 🐛 ISSUE LOG

| # | Phase | Description | Severity | Status |
|---|-------|-------------|----------|--------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

