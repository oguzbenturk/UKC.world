# 🧪 Comprehensive Application Testing Plan

Use this checklist to systematically verify every feature in the application. Mark items as completed with `[x]` after testing.

---

## 🔐 1. Authentication & Security
*Core login flow and role protection.*

- [ ] **Login (Email/Password)**
    - [ ] Test with valid Admin credentials.
    - [ ] Test with valid Instructor credentials.
    - [ ] Test with valid Student credentials.
    - [ ] Test with invalid password (should show error).
- [ ] **Registration**
    - [ ] Register a new user (Sign Up flow).
    - [ ] Verify email confirmation flow (if active).
- [ ] **Password Reset**
    - [ ] Request password reset link.
    - [ ] Verify reset token flow.
- [ ] **Session Management**
    - [ ] Verify automatic logout on token expiry.
    - [ ] Verify manual logout clears session.
    - [ ] specific roles cannot access other role pages (e.g., Student accessing Admin dashboard).

---

## 🏢 2. Management Console (Admin/Manager)
*The business command center.*

### 📊 Dashboard
- [ ] **KPI Cards**: Verify revenue, user count, and booking numbers match DB.
- [ ] **Charts**: specific graphs render correctly (Revenue, Attendance).
- [ ] **Recent Activity**: Check if the log feed updates.

### 👥 User Management
- [ ] **Students List**:
    - [ ] Filter/Search students.
    - [ ] Create new student manually.
    - [ ] Edit student profile.
    - [ ] Archive/Delete student.
- [ ] **Instructors List**:
    - [ ] View list of instructors.
    - [ ] Add new instructor.
    - [ ] Assign commission rates.

### 📅 Front Desk & Calendars
- [ ] **Day/Week/Month View**: Verify calendar rendering.
- [ ] **Filtering**: Filter by Activity Type or Instructor.
- [ ] **Manual Booking**: Admin creating a booking for a user.
- [ ] **Waitlist**: Manually adding a user to waitlist.

### 💰 Finance & Point of Sale
- [ ] **Transactions List**: specific payment history loads.
- [ ] **Invoicing**: Generate a manual invoice.
- [ ] **Wallet Management**: Manually credit/debit a user's wallet.
- [ ] **Reports**: Export financial report (CSV/PDF).

### 🛠 Service Setup
- [ ] **Services**: Create/Edit a class type (Price, Duration).
- [ ] **Packages**: Create/Edit a credit package (e.g., "10 Class Pass").
- [ ] **Resources**: Manage rooms or spots available.

---

## 📱 3. Member Portal (Student/Trusted Customer)
*The mobile-first experience for customers.*

### 👤 Profile & Wallet
- [ ] **My Profile**: Update personal info/avatar.
- [ ] **Digital Wallet**: Check balance.
- [ ] **Payment Methods**: Add/Remove credit card.
- [ ] **Purchases**: View history of orders.

### 🛒 Booking & Shop
- [ ] **Class Booking**:
    - [ ] Book a class using Wallet credits.
    - [ ] Book a class using Drop-in payment (Stripe/Payment Gateway).
    - [ ] Cancel a booking (check cancellation policy window).
- [ ] **Shop**:
    - [ ] Browse products.
    - [ ] Add to cart and checkout.
- [ ] **Stay/Accommodation**:
    - [ ] Browse rooms.
    - [ ] Book a stay.

### 📄 Compliance
- [ ] **Waivers**: Verify digital signature flow.
- [ ] **Forms**: Fill out required intake forms.

---

## 🎓 4. Staff Portal (Instructor)
*The employee workspace.*

### 📋 Daily Operations
- [ ] **My Schedule**: specific upcoming classes appear.
- [ ] **Attendance**:
    - [ ] Check-in students (Mark present/absent).
    - [ ] View student notes (Medical/Skill level).
- [ ] **Availability**: Set unavailable times/leaves.

### 💵 Payroll
- [ ] **Earnings**: specific commission calculations are correct.
- [ ] **History**: View past payouts.

---

## 🌍 5. Public / Outsider View
*Unauthenticated experience.*

- [ ] **Landing Page**: Verify loading and layout.
- [ ] **Public Schedule**: View classes without logging in.
- [ ] **Guest Booking**:
    - [ ] Book as guest (Input details + Payment).
    - [ ] Receive confirmation email.
- [ ] **Registration**: Sign up as new member.

---

## 🧩 6. Feature Modules
*Specific capabilities across the platform.*

### 💬 Chat System
- [ ] **1:1 Chat**: Send message between Admin and Student.
- [ ] **Notifications**: Verify bubble/badge updates.
- [ ] **Attachments**: Send an image/file.

### 🏄 Rentals & Equipment
- [ ] **Inventory**: Check stock levels.
- [ ] **Rental Booking**: Book equipment for specific dates.
- [ ] **Returns**: Mark item as returned/damaged.

### 🔧 Repairs (Care)
- [ ] **Ticket Creation**: Create a repair ticket.
- [ ] **Status Update**: Move ticket from "In Progress" to "Done".
- [ ] **Billing**: Charge for the repair.

### 📝 Form Builder
- [ ] **Editor**: Create a custom form (Drag & drop).
- [ ] **Response**: Submit the form as a user.
- [ ] **Data**: View form responses as Admin.

---

## 🧪 7. Technical Checks
- [ ] **Mobile Responsiveness**: Test on mobile viewport (Chrome DevTools).
- [ ] **Performance**: Ensure pages load under 2 seconds.
- [ ] **Errors**: Check browser console for red errors during navigation.
- [ ] **Real-time**: Test socket updates (e.g., booking slots update without refresh).
