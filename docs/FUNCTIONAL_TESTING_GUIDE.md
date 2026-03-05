# Functional Testing Checklist
**Format:** `[ ]` = Not tested | `[P]` = Pass | `[F]` = Fail  
**Tester:** _________________ | **Date:** _________________ | **Build/Version:** _________________

> Run tests top-to-bottom per role. Use a separate browser profile (or incognito) for each role to avoid session bleed.

---

## ROLES OVERVIEW

| Role | Landing After Login | Portal |
|------|---------------------|--------|
| `outsider` (no account) | - | Public pages only |
| `outsider` (registered) | `/book` | Booking page |
| `student` | `/student/dashboard` | Student portal |
| `trusted_customer` | `/student/dashboard` | Student portal (same as student) |
| `instructor` | `/instructor/dashboard` | Staff panel (limited) |
| `manager` | `/dashboard` | Staff panel (extended) |
| `admin` | `/dashboard` | Full access |

---

# ROLE 1  OUTSIDER / GUEST (No Account)

> No login required. Tests the entire public-facing experience.

## 1.1 Public Pages Load

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | `/` home page loads without login | `[x ]` |https://plannivo.com/ |
| 2 | `/guest` guest landing loads | `[ x]` |https://plannivo.com/guest|
| 3 | `/academy` academy landing loads | `[x ]` |https://plannivo.com/academy |
| 4 | `/academy/kite-lessons` loads with pricing | `[x ]` | |
| 5 | `/academy/foil-lessons` loads with pricing | `[ x]` | |
| 6 | `/academy/wing-lessons` loads with pricing | `[x ]` | |
| 7 | `/academy/efoil-lessons` loads with pricing | `[x ]` | |
| 8 | `/academy/premium-lessons` loads with pricing | `[ x]` | |
| 9 | `/rental` rental landing loads | `[ x]` | |
| 10 | `/rental/standard` showcase loads | `[ x]` | |
| 11 | `/rental/sls` showcase loads | `[ x]` | |
| 12 | `/rental/dlab` showcase loads | `[ x]` | |
| 13 | `/rental/efoil` showcase loads | `[x ]` | |
| 14 | `/rental/premium` showcase loads | `[x ]` | |
| 15 | `/stay` accommodation landing loads | `[x ]` | |
| 16 | `/stay/hotel` hotel page loads | `[ x]` | |
| 17 | `/stay/home` villa page loads | `[x ]` | |
| 18 | `/stay/book-accommodation` booking form loads | `[ x]` | |
| 19 | `/experience` experience landing loads | `[ x]` | |
| 20 | `/experience/kite-packages` loads | `[ x]` | |
| 21 | `/experience/wing-packages` loads | `[x ]` | |
| 22 | `/experience/downwinders` loads | `[ x]` | |
| 23 | `/experience/camps` loads | `[ x]` | |
| 24 | `/experience/book-package` loads | `[x ]` | |
| 25 | `/shop` shop landing loads | `[ x]` | |
| 26 | `/shop/browse` product grid visible without login | `[x ]` | |
| 27 | `/members/offerings` member packages visible | `[-]` |need redesign, faster loading |
| 28 | `/services/events` upcoming events visible | `[-]` |need redesign, faster loading |
| 29 | `/community/team` team page loads | `[-]` |need redesign, faster loading |
| 30 | `/contact` contact form loads | `[-]` |need redesign, faster loading, admin configuration panel |
| 31 | `/care` repair request page loads | `[-]` |need redesign, faster loading |
| 32 | `/help` help articles load | `[?]` |need redesign, faster loading, designing of proper help page |
| 33 | `/book` outsider booking page loads | ---REMOVE THIS PAGE---
| 34 | `/outsider/packages` packages list loads | `[-]` |https://plannivo.com/outsider/packages  this page is exsist with empty inside. outsider user can not have packages also because its not loged in find a solution on it |

## 1.2 Auth Protection (No Login)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 35 | Visit `/dashboard`  redirected to `/` | `[*]` | https://plannivo.com/login|
| 36 | Visit `/bookings`  redirected | `[*]` |https://plannivo.com/login |
| 37 | Visit `/finance`  redirected | `[*]` |https://plannivo.com/login |
| 38 | Visit `/student/dashboard`  redirected | `[*]` | https://plannivo.com/login|
| 39 | Visit `/chat`  redirected | `[*]` |https://plannivo.com/login |
| 40 | Visit `/admin/roles`  redirected | `[8]` | |

## 1.3 Auth Modal Triggers

| # | Test | Result | Notes |
|---|------|--------|-------|
| 41 | Click "Book" on any lesson page  Auth Modal opens (not page redirect) | `[*]` | |
| 42 | Click "Buy Package" on `/members/offerings`  Auth Modal opens | `[*]` | |
| 43 | Click "Add to Cart" in shop  Auth Modal opens | `[*]` | |
| 44 | Click "Register" for an event  Auth Modal opens | `[ ]` | |
| 45 | Auth Modal shows both Login and Register tabs | `[ ]` | |
| 46 | Close Auth Modal  stays on same page | `[ ]` | |

---

# ROLE 2  OUTSIDER (Registered, role = `outsider`)

> Has an account but has not booked yet. Lands on `/book`.

## 2.1 Login & Landing

| # | Test | Result | Notes |
|---|------|--------|-------|
| 47 | Log in with outsider credentials | `[ ]` | |
| 48 | Redirected to `/book` booking page | `[ ]` | |
| 49 | Visit `/dashboard`  redirected back to `/book` | `[ ]` | |
| 50 | Visit `/student/dashboard`  redirected | `[ ]` | |
| 51 | Sidebar / admin nav NOT shown | `[ ]` | |

## 2.2 Book a Lesson (First Booking  Role Upgrade Flow)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 52 | `/book` page shows available lesson services | `[ ]` | |
| 53 | Select a lesson type (e.g. Kite) | `[ ]` | |
| 54 | Available dates / time slots shown | `[ ]` | |
| 55 | Select a date and time slot | `[ ]` | |
| 56 | Instructor shown for selected slot | `[ ]` | |
| 57 | Price shown in current currency | `[ ]` | |
| 58 | Select number of participants  total price updates | `[ ]` | |
| 59 | Apply promo/voucher code  discount applied | `[ ]` | |
| 60 | Proceed to payment | `[ ]` | |
| 61 | Payment gateway loads (Stripe / PayTR / Binance / Revolut / PayPal) | `[ ]` | |
| 62 | Complete payment with test credentials | `[ ]` | |
| 63 | Redirected to `/payment/callback` | `[ ]` | |
| 64 | Success screen shown with booking confirmation | `[ ]` | |
| 65 | **Role automatically upgraded to `student` after first booking** | `[ ]` | |
| 66 | After upgrade, redirect to `/student/dashboard` works | `[ ]` | |

## 2.3 Buy a Package (Outsider)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 67 | Visit `/outsider/packages`  package list shown | `[ ]` | |
| 68 | Select a package  details shown (sessions, price, validity) | `[ ]` | |
| 69 | Confirm purchase  payment flow | `[ ]` | |
| 70 | After purchase, package visible in student courses | `[ ]` | |

## 2.4 Repair Request

| # | Test | Result | Notes |
|---|------|--------|-------|
| 71 | Submit repair request on `/care` | `[ ]` | |
| 72 | Form accepts equipment description + issue description | `[ ]` | |
| 73 | Submit  confirmation message shown | `[ ]` | |

---

# ROLE 3  STUDENT / TRUSTED_CUSTOMER

> Login  `/student/dashboard`. `trusted_customer` has identical access.

## 3.1 Login & Landing

| # | Test | Result | Notes |
|---|------|--------|-------|
| 74 | Log in as student | `[ ]` | |
| 75 | Redirected to `/student/dashboard` | `[ ]` | |
| 76 | Upcoming lessons widget shown | `[ ]` | |
| 77 | Wallet balance shown | `[ ]` | |
| 78 | Active packages / courses shown | `[ ]` | |
| 79 | Instructor rating reminder banner shown (if unrated lessons exist) | `[ ]` | |
| 80 | Visit `/dashboard` (staff route)  redirected back | `[ ]` | |
| 81 | Log in as `trusted_customer`  same `/student/dashboard` access | `[ ]` | |

## 3.2 Book a Lesson

| # | Test | Result | Notes |
|---|------|--------|-------|
| 82 | Navigate to `/academy/book-service`  booking wizard opens | `[ ]` | |
| 83 | Select lesson type  available time slots shown | `[ ]` | |
| 84 | Select time slot  instructor auto-assigned | `[ ]` | |
| 85 | Pay via wallet  balance deducted | `[ ]` | |
| 86 | Pay via card  payment gateway loads | `[ ]` | |
| 87 | Pay using package session  session deducted from package | `[ ]` | |
| 88 | Booking confirmation shown | `[ ]` | |
| 89 | Booking appears in `/student/schedule` | `[ ]` | |
| 90 | Student receives notification immediately | `[ ]` | |

## 3.3 Schedule

| # | Test | Result | Notes |
|---|------|--------|-------|
| 91 | Navigate to `/student/schedule` | `[ ]` | |
| 92 | Upcoming lessons listed in chronological order | `[ ]` | |
| 93 | Click lesson  detail view (date, time, instructor, location) | `[ ]` | |
| 94 | Cancel a lesson  confirmation prompt shown | `[ ]` | |
| 95 | Confirm cancellation  lesson removed | `[ ]` | |
| 96 | Past lessons shown in separate section | `[ ]` | |

## 3.4 Courses & Packages

| # | Test | Result | Notes |
|---|------|--------|-------|
| 97 | Navigate to `/student/courses` | `[ ]` | |
| 98 | Active packages listed with remaining sessions | `[ ]` | |
| 99 | Used hours / remaining hours shown per package | `[ ]` | |
| 100 | Rental days in package shown correctly | `[ ]` | |
| 101 | Accommodation nights in package shown correctly | `[ ]` | |
| 102 | Expired package shows as expired (cannot use) | `[ ]` | |
| 103 | Click package  session breakdown detail | `[ ]` | |

## 3.5 Payments & Wallet

| # | Test | Result | Notes |
|---|------|--------|-------|
| 104 | Navigate to `/student/payments` | `[ ]` | |
| 105 | Full transaction history listed | `[ ]` | |
| 106 | Click transaction  receipt / detail | `[ ]` | |
| 107 | Top up wallet via card  payment gateway | `[ ]` | |
| 108 | Wallet balance updates after successful top-up | `[ ]` | |
| 109 | Top up via bank transfer  pending (awaits admin approval) | `[ ]` | |
| 110 | Pay for service using wallet  balance deducted | `[ ]` | |
| 111 | Insufficient wallet balance  error, cannot proceed | `[ ]` | |
| 112 | Partial wallet + card payment  both deducted correctly | `[ ]` | |

## 3.6 Rate an Instructor

| # | Test | Result | Notes |
|---|------|--------|-------|
| 113 | After completed lesson, rating prompt appears | `[ ]` | |
| 114 | Rate instructor (15 stars + comment) | `[ ]` | |
| 115 | Submit rating  saved; prompt disappears | `[ ]` | |

## 3.7 Profile

| # | Test | Result | Notes |
|---|------|--------|-------|
| 116 | Navigate to `/student/profile` | `[ ]` | |
| 117 | Update display name  saved | `[ ]` | |
| 118 | Update phone number  saved | `[ ]` | |
| 119 | Update emergency contact  saved | `[ ]` | |
| 120 | Upload / change avatar photo  image updated | `[ ]` | |

## 3.8 Family Management

| # | Test | Result | Notes |
|---|------|--------|-------|
| 121 | Navigate to `/student/family` | `[ ]` | |
| 122 | Add a child / family member (name, DOB) | `[ ]` | |
| 123 | Family member appears in list | `[ ]` | |
| 124 | Edit family member details  saved | `[ ]` | |
| 125 | Remove family member  confirmation  removed | `[ ]` | |
| 126 | Book a lesson for family member  member selectable in booking form | `[ ]` | |

## 3.9 Friends

| # | Test | Result | Notes |
|---|------|--------|-------|
| 127 | Navigate to `/student/friends` | `[ ]` | |
| 128 | Search for another student by name/email | `[ ]` | |
| 129 | Send friend request | `[ ]` | |
| 130 | Accept an incoming friend request | `[ ]` | |
| 131 | Friend appears in friends list after acceptance | `[ ]` | |

## 3.10 Group Bookings

| # | Test | Result | Notes |
|---|------|--------|-------|
| 132 | Navigate to `/student/group-bookings` | `[ ]` | |
| 133 | Create group booking at `/student/group-bookings/create` | `[ ]` | |
| 134 | Invite friends to the group from creation form | `[ ]` | |
| 135 | Share group invitation link | `[ ]` | |
| 136 | Request group lesson at `/student/group-bookings/request` | `[ ]` | |
| 137 | View group booking detail `/student/group-bookings/:id` | `[ ]` | |
| 138 | Group invitation link `/group-invitation/:token` works without login | `[ ]` | |
| 139 | Logged-in student accepts invite  added to group | `[ ]` | |
| 140 | Guest accepts invite  Auth Modal  register  added to group | `[ ]` | |
| 141 | Decline invite  not added to group | `[ ]` | |
| 142 | Join full group  error "Group is full" | `[ ]` | |

## 3.11 Rentals (Student)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 143 | Navigate to `/rental/book-equipment` | `[ ]` | |
| 144 | Available equipment shown (type, size, status) | `[ ]` | |
| 145 | Select equipment and date/duration | `[ ]` | |
| 146 | Price calculated correctly | `[ ]` | |
| 147 | Confirm rental booking | `[ ]` | |
| 148 | Rental appears in `/rental/my-rentals` | `[ ]` | |

## 3.12 Accommodation (Student)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 149 | Navigate to `/accommodation` | `[ ]` | |
| 150 | Select unit type and check-in/check-out dates | `[ ]` | |
| 151 | Available units shown with price | `[ ]` | |
| 152 | Confirm booking | `[ ]` | |
| 153 | View booking in `/stay/my-accommodation` | `[ ]` | |

## 3.13 Shop

| # | Test | Result | Notes |
|---|------|--------|-------|
| 154 | Browse `/shop/browse`  products visible | `[ ]` | |
| 155 | Add item to cart  cart badge updates | `[ ]` | |
| 156 | Open cart  items listed with correct quantities | `[ ]` | |
| 157 | Update quantity  total updates | `[ ]` | |
| 158 | Remove item from cart | `[ ]` | |
| 159 | Checkout and pay via wallet | `[ ]` | |
| 160 | Checkout and pay via card | `[ ]` | |
| 161 | Order confirmed  appears in payment history | `[ ]` | |

## 3.14 Events

| # | Test | Result | Notes |
|---|------|--------|-------|
| 162 | Browse `/services/events`  events shown | `[ ]` | |
| 163 | Register for an event | `[ ]` | |
| 164 | Event registration appears in schedule | `[ ]` | |
| 165 | Cancel event registration | `[ ]` | |

## 3.15 Membership

| # | Test | Result | Notes |
|---|------|--------|-------|
| 166 | Browse `/members/offerings` | `[ ]` | |
| 167 | Buy a membership plan | `[ ]` | |
| 168 | Membership active in `/student/courses` | `[ ]` | |

## 3.16 Support Tickets

| # | Test | Result | Notes |
|---|------|--------|-------|
| 169 | Navigate to `/student/support` | `[ ]` | |
| 170 | Create new ticket (subject + description) | `[ ]` | |
| 171 | Ticket appears with status "Open" | `[ ]` | |
| 172 | Admin replies  student sees reply in thread | `[ ]` | |
| 173 | Student replies to thread | `[ ]` | |
| 174 | Close ticket  status "Closed" | `[ ]` | |

## 3.17 Notifications

| # | Test | Result | Notes |
|---|------|--------|-------|
| 175 | Navigate to `/notifications` | `[ ]` | |
| 176 | Unread notifications listed first | `[ ]` | |
| 177 | Click notification  navigates to relevant page | `[ ]` | |
| 178 | Mark single notification as read  badge decreases | `[ ]` | |
| 179 | Mark all as read | `[ ]` | |
| 180 | Real-time toast when admin creates booking for this student | `[ ]` | |
| 181 | Reschedule notification when admin reschedules booking | `[ ]` | |
| 182 | Accept reschedule  booking moves to new time | `[ ]` | |
| 183 | Decline reschedule  original time kept or cancelled per policy | `[ ]` | |

## 3.18 Chat

| # | Test | Result | Notes |
|---|------|--------|-------|
| 184 | Navigate to `/chat` | `[ ]` | |
| 185 | Start conversation with an instructor | `[ ]` | |
| 186 | Send text message  appears in thread | `[ ]` | |
| 187 | Receive reply in real-time (no page refresh) | `[ ]` | |
| 188 | Unread badge shown on nav icon | `[ ]` | |

## 3.19 Settings

| # | Test | Result | Notes |
|---|------|--------|-------|
| 189 | Navigate to `/settings` | `[ ]` | |
| 190 | Update notification preferences (email, SMS, WhatsApp)  saved | `[ ]` | |
| 191 | Change password  success | `[ ]` | |
| 192 | Enable 2FA  QR code shown | `[ ]` | |
| 193 | Verify 2FA code  2FA activated | `[ ]` | |
| 194 | Disable 2FA | `[ ]` | |
| 195 | View active sessions | `[ ]` | |
| 196 | Log out other sessions | `[ ]` | |

## 3.20 Privacy / GDPR

| # | Test | Result | Notes |
|---|------|--------|-------|
| 197 | Navigate to `/privacy/gdpr` | `[ ]` | |
| 198 | Request data export  JSON/CSV download | `[ ]` | |
| 199 | Request account deletion  confirmation prompt | `[ ]` | |

---

# ROLE 4  INSTRUCTOR

> Login  `/instructor/dashboard`. Can manage own students, view all bookings, create bookings.

## 4.1 Login & Access Checks

| # | Test | Result | Notes |
|---|------|--------|-------|
| 200 | Log in as instructor | `[ ]` | |
| 201 | Redirected to `/instructor/dashboard` | `[ ]` | |
| 202 | Today's lessons shown on dashboard | `[ ]` | |
| 203 | Weekly earnings / commission summary shown | `[ ]` | |
| 204 | Visit `/admin/roles`  redirected (no access) | `[ ]` | |
| 205 | Visit `/finance/refunds`  redirected (no access) | `[ ]` | |
| 206 | Visit `/admin/vouchers`  redirected (no access) | `[ ]` | |
| 207 | Visit `/instructors`  redirected (no access) | `[ ]` | |

## 4.2 My Students

| # | Test | Result | Notes |
|---|------|--------|-------|
| 208 | Navigate to `/instructor/students` | `[ ]` | |
| 209 | Only own assigned students shown (not all students) | `[ ]` | |
| 210 | Search students by name | `[ ]` | |
| 211 | Click student  `/instructor/students/:id` | `[ ]` | |
| 212 | Student detail shows all sessions with this instructor | `[ ]` | |
| 213 | Add a lesson note to student | `[ ]` | |
| 214 | Note saved and visible on student record | `[ ]` | |

## 4.3 Bookings (Instructor View)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 215 | Navigate to `/bookings` | `[ ]` | |
| 216 | View all bookings list | `[ ]` | |
| 217 | Create new booking (select student, lesson type, date) | `[ ]` | |
| 218 | Conflict check runs when selecting a time slot | `[ ]` | |
| 219 | Booking saved  appears in list | `[ ]` | |
| 220 | Edit existing booking  change date/time | `[ ]` | |
| 221 | Mark booking as "Completed" | `[ ]` | |
| 222 | Cancel a booking | `[ ]` | |
| 223 | View `/bookings/calendar` | `[ ]` | |
| 224 | Filter calendar by own name | `[ ]` | |

## 4.4 Customers

| # | Test | Result | Notes |
|---|------|--------|-------|
| 225 | Navigate to `/customers` | `[ ]` | |
| 226 | View customer list | `[ ]` | |
| 227 | Create new customer at `/customers/new` | `[ ]` | |
| 228 | View customer detail and booking history | `[ ]` | |

## 4.5 Equipment, Inventory, Rentals

| # | Test | Result | Notes |
|---|------|--------|-------|
| 229 | Navigate to `/equipment`  equipment list shown | `[ ]` | |
| 230 | Navigate to `/inventory`  stock levels visible | `[ ]` | |
| 231 | Navigate to `/rentals`  active rentals listed | `[ ]` | |
| 232 | Create new rental booking | `[ ]` | |

## 4.6 Finance (Instructor  read access)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 233 | Navigate to `/finance`  overview loads | `[ ]` | |
| 234 | Navigate to `/finance/lessons`  payout split visible | `[ ]` | |
| 235 | Navigate to `/finance/refunds`  redirected (no access) | `[ ]` | |

## 4.7 Calendars

| # | Test | Result | Notes |
|---|------|--------|-------|
| 236 | `/calendars/lessons` loads | `[ ]` | |
| 237 | `/calendars/rentals` loads | `[ ]` | |
| 238 | `/calendars/events` loads | `[ ]` | |

## 4.8 Chat & Notifications

| # | Test | Result | Notes |
|---|------|--------|-------|
| 239 | `/chat`  start conversation with student | `[ ]` | |
| 240 | Message sent / received in real-time | `[ ]` | |
| 241 | Notification received when student books with this instructor | `[ ]` | |

---

# ROLE 5  MANAGER

> Login  `/dashboard`. All instructor access + business management tools.

## 5.1 Login & Access Checks

| # | Test | Result | Notes |
|---|------|--------|-------|
| 242 | Log in as manager | `[ ]` | |
| 243 | Redirected to `/dashboard` | `[ ]` | |
| 244 | Dashboard KPIs load (revenue, bookings, students) | `[ ]` | |
| 245 | Visit `/admin/deleted-bookings`  redirected (admin only) | `[ ]` | |
| 246 | Visit `/admin/spare-parts`  redirected (admin only) | `[ ]` | |

## 5.2 Instructor Management

| # | Test | Result | Notes |
|---|------|--------|-------|
| 247 | Navigate to `/instructors` | `[ ]` | |
| 248 | View instructors list (name, speciality, status) | `[ ]` | |
| 249 | Create new instructor at `/instructors/new` | `[ ]` | |
| 250 | Assign specialities (Kite, Foil, Wing) | `[ ]` | |
| 251 | Set commission rate for instructor | `[ ]` | |
| 252 | Edit instructor at `/instructors/edit/:id` | `[ ]` | |
| 253 | Deactivate instructor  removed from booking options | `[ ]` | |
| 254 | Reactivate instructor  back in booking options | `[ ]` | |

## 5.3 Services Management

| # | Test | Result | Notes |
|---|------|--------|-------|
| 255 | `/services/lessons`  create lesson service (name, duration, price) | `[ ]` | |
| 256 | Assign instructors to the lesson service | `[ ]` | |
| 257 | Set max participants | `[ ]` | |
| 258 | Deactivate service  no longer bookable by students | `[ ]` | |
| 259 | `/services/rentals`  create rental service | `[ ]` | |
| 260 | `/services/shop`  add new product (name, price, stock, image) | `[ ]` | |
| 261 | Edit product  saved | `[ ]` | |
| 262 | Set product inactive  hidden from shop | `[ ]` | |
| 263 | `/services/packages`  create lesson package (e.g. 10 Kite Lessons) | `[ ]` | |
| 264 | Set package price, session count, validity | `[ ]` | |
| 265 | Manually assign package to a student | `[ ]` | |
| 266 | `/services/memberships`  create membership plan | `[ ]` | |
| 267 | Set plan price, validity, benefits | `[ ]` | |
| 268 | Deactivate plan  hidden from `/members/offerings` | `[ ]` | |
| 269 | `/services/categories`  create / edit / delete category | `[ ]` | |
| 270 | `/services/accommodation`  create new unit | `[ ]` | |
| 271 | Set unit availability / blocked dates | `[ ]` | |

## 5.4 Finance

| # | Test | Result | Notes |
|---|------|--------|-------|
| 272 | `/finance`  revenue summary shown | `[ ]` | |
| 273 | Date range filter updates KPIs | `[ ]` | |
| 274 | Export finance report  file downloaded | `[ ]` | |
| 275 | `/finance/lessons` loads | `[ ]` | |
| 276 | `/finance/rentals` loads | `[ ]` | |
| 277 | `/finance/membership` loads | `[ ]` | |
| 278 | `/finance/shop` loads | `[ ]` | |
| 279 | `/finance/accommodation` loads | `[ ]` | |
| 280 | `/finance/events` loads | `[ ]` | |
| 281 | `/finance/daily-operations`  cash-in / cash-out entry | `[ ]` | |
| 282 | Mark transaction as reconciled | `[ ]` | |
| 283 | `/finance/expenses`  add expense (category, amount, date, receipt) | `[ ]` | |
| 284 | Edit expense  saved | `[ ]` | |
| 285 | Delete expense  removed | `[ ]` | |
| 286 | `/finance/refunds`  find and process a refund (to wallet) | `[ ]` | |
| 287 | Process refund to original payment method | `[ ]` | |
| 288 | `/finance/wallet-deposits`  approve pending deposit  student balance increases | `[ ]` | |
| 289 | Reject wallet deposit  student notified | `[ ]` | |
| 290 | `/finance/bank-accounts`  add a bank account | `[ ]` | |
| 291 | `/finance/settings`  set tax rate | `[ ]` | |
| 292 | `/finance/settings`  change default currency | `[ ]` | |

## 5.5 Bookings & Calendars

| # | Test | Result | Notes |
|---|------|--------|-------|
| 293 | Create booking for any student + any instructor | `[ ]` | |
| 294 | Edit and reschedule booking | `[ ]` | |
| 295 | Student notified of reschedule in real-time | `[ ]` | |
| 296 | Cancel booking | `[ ]` | |
| 297 | `/bookings/calendar`  drag-and-drop to reschedule | `[ ]` | |
| 298 | `/calendars/members`  active members calendar | `[ ]` | |
| 299 | `/calendars/stay`  accommodation calendar | `[ ]` | |
| 300 | `/calendars/shop-orders`  mark order "Ready for pickup" | `[ ]` | |
| 301 | Mark shop order "Collected" | `[ ]` | |
| 302 | `/calendars/events`  create new event | `[ ]` | |
| 303 | Cancel event  registrants notified | `[ ]` | |

## 5.6 Equipment & Inventory

| # | Test | Result | Notes |
|---|------|--------|-------|
| 304 | Add new equipment (type, serial, purchase date) | `[ ]` | |
| 305 | Mark equipment "Under Repair"  not bookable for rentals | `[ ]` | |
| 306 | Mark equipment "Retired" | `[ ]` | |
| 307 | Adjust stock level manually in `/inventory` | `[ ]` | |
| 308 | Low stock warning shown on item | `[ ]` | |

## 5.7 Customer Management

| # | Test | Result | Notes |
|---|------|--------|-------|
| 309 | Search customer by name / email | `[ ]` | |
| 310 | Filter customers by role | `[ ]` | |
| 311 | Export customer list to CSV | `[ ]` | |
| 312 | Create customer  duplicate email  error | `[ ]` | |
| 313 | Change customer role  permissions change immediately | `[ ]` | |
| 314 | Add note to customer record | `[ ]` | |
| 315 | View full customer profile + booking history | `[ ]` | |

## 5.8 Vouchers

| # | Test | Result | Notes |
|---|------|--------|-------|
| 316 | `/admin/vouchers`  create voucher (code, % off, expiry, max uses) | `[ ]` | |
| 317 | Apply voucher at booking  discount applied correctly | `[ ]` | |
| 318 | Apply expired voucher  error | `[ ]` | |
| 319 | Voucher exceeds max uses  error | `[ ]` | |
| 320 | Deactivate voucher  immediately unusable | `[ ]` | |

## 5.9 Waivers

| # | Test | Result | Notes |
|---|------|--------|-------|
| 321 | `/admin/waivers`  create waiver template | `[ ]` | |
| 322 | Assign waiver to a service | `[ ]` | |
| 323 | Student shown waiver during booking | `[ ]` | |
| 324 | Student signs waiver  stored on booking | `[ ]` | |
| 325 | View signed waivers for a booking | `[ ]` | |

## 5.10 Roles Admin

| # | Test | Result | Notes |
|---|------|--------|-------|
| 326 | `/admin/roles`  view default roles | `[ ]` | |
| 327 | Create custom role with specific permissions | `[ ]` | |
| 328 | Assign custom role to a user | `[ ]` | |
| 329 | User with custom role gets correct access | `[ ]` | |
| 330 | Edit custom role permissions | `[ ]` | |
| 331 | Cannot delete built-in roles (button hidden/disabled) | `[ ]` | |

## 5.11 Support Tickets

| # | Test | Result | Notes |
|---|------|--------|-------|
| 332 | `/admin/support-tickets`  all open tickets listed | `[ ]` | |
| 333 | Reply to ticket  message sent to student | `[ ]` | |
| 334 | Change ticket priority (Low / Medium / High) | `[ ]` | |
| 335 | Assign ticket to staff member | `[ ]` | |
| 336 | Close ticket  student notified | `[ ]` | |

## 5.12 Ratings Analytics

| # | Test | Result | Notes |
|---|------|--------|-------|
| 337 | `/admin/ratings-analytics`  average per instructor shown | `[ ]` | |
| 338 | Filter by date range | `[ ]` | |
| 339 | Drill into individual instructor  all reviews shown | `[ ]` | |

## 5.13 Marketing

| # | Test | Result | Notes |
|---|------|--------|-------|
| 340 | `/marketing`  create email campaign | `[ ]` | |
| 341 | Send test email  delivered | `[ ]` | |
| 342 | Schedule campaign  sent at scheduled time | `[ ]` | |
| 343 | View open rate / click stats | `[ ]` | |
| 344 | Create popup widget with trigger condition | `[ ]` | |
| 345 | Popup appears on configured public page | `[ ]` | |

## 5.14 Form Builder

| # | Test | Result | Notes |
|---|------|--------|-------|
| 346 | `/forms`  create new form | `[ ]` | |
| 347 | Add text field, dropdown (with options), file upload field | `[ ]` | |
| 348 | Mark a field as required | `[ ]` | |
| 349 | Reorder fields via drag-and-drop | `[ ]` | |
| 350 | Preview form at `/forms/preview/:id` | `[ ]` | |
| 351 | Publish form  short URL `/f/:code` generated | `[ ]` | |
| 352 | Submit form at `/f/:code` without login | `[ ]` | |
| 353 | Submit with missing required field  validation error | `[ ]` | |
| 354 | Success page `/f/success/:code` shown after submit | `[ ]` | |
| 355 | View analytics at `/forms/:id/analytics` | `[ ]` | |
| 356 | View responses at `/forms/:id/responses` | `[ ]` | |
| 357 | Export responses to CSV | `[ ]` | |

## 5.15 Quick Links

| # | Test | Result | Notes |
|---|------|--------|-------|
| 358 | `/quick-links`  create quick link  short code generated | `[ ]` | |
| 359 | Visit `/quick/:code` (public)  quick booking page shown | `[ ]` | |
| 360 | Complete booking via quick link | `[ ]` | |
| 361 | Deactivate link  page shows expired/not found | `[ ]` | |

## 5.16 Legal Documents & Manager Commission

| # | Test | Result | Notes |
|---|------|--------|-------|
| 362 | `/admin/legal-documents`  edit Terms & Conditions | `[ ]` | |
| 363 | Publish new version  version number increments | `[ ]` | |
| 364 | Users prompted with consent modal on next login | `[ ]` | |
| 365 | `/admin/manager-commissions`  set commission % for manager | `[ ]` | |
| 366 | `/manager/commissions`  manager's own commission dashboard | `[ ]` | |

## 5.17 Admin Settings

| # | Test | Result | Notes |
|---|------|--------|-------|
| 367 | `/admin/settings`  change business settings  saved | `[ ]` | |

---

# ROLE 6  ADMIN

> Full access. Everything manager has, plus exclusive admin-only routes.

## 6.1 Login & Executive Dashboard

| # | Test | Result | Notes |
|---|------|--------|-------|
| 368 | Log in as admin  `/dashboard` | `[ ]` | |
| 369 | Navigate to `/admin/dashboard` | `[ ]` | |
| 370 | KPIs: revenue, bookings, students, real-time active users | `[ ]` | |
| 371 | Change period (weekly / monthly / yearly)  charts update | `[ ]` | |
| 372 | Revenue by service type chart shows correct breakdown | `[ ]` | |
| 373 | Instructor performance table shown | `[ ]` | |
| 374 | Real-time active users counter live (Socket.IO) | `[ ]` | |

## 6.2 Admin-Only Routes

| # | Test | Result | Notes |
|---|------|--------|-------|
| 375 | `/admin/deleted-bookings`  soft-deleted bookings listed | `[ ]` | |
| 376 | Restore a deleted booking  reappears in `/bookings` | `[ ]` | |
| 377 | `/admin/spare-parts`  spare parts orders listed | `[ ]` | |
| 378 | Create a spare parts order | `[ ]` | |

## 6.3 All Manager Tests

| # | Test | Result | Notes |
|---|------|--------|-------|
| 379 | All tests in Role 5  Manager pass for admin | `[ ]` | See Manager section |

---

# CROSS-ROLE INTEGRATION TESTS

> Requires two browser profiles open simultaneously.

## X.1 Admin Creates Booking  Student Sees It

| # | Test | Result | Notes |
|---|------|--------|-------|
| 380 | Admin creates lesson booking for logged-in student | `[ ]` | |
| 381 | Student receives real-time notification (no page refresh) | `[ ]` | |
| 382 | Booking appears immediately in student schedule | `[ ]` | |

## X.2 Admin Reschedules  Student Confirms

| # | Test | Result | Notes |
|---|------|--------|-------|
| 383 | Admin reschedules student booking | `[ ]` | |
| 384 | Student sees reschedule confirmation modal | `[ ]` | |
| 385 | Student accepts  booking moves to new time | `[ ]` | |
| 386 | Student declines  original time retained | `[ ]` | |

## X.3 Wallet Top-Up Approval

| # | Test | Result | Notes |
|---|------|--------|-------|
| 387 | Student requests bank transfer top-up | `[ ]` | |
| 388 | Manager sees pending in `/finance/wallet-deposits` | `[ ]` | |
| 389 | Manager approves  student balance increases immediately | `[ ]` | |
| 390 | Student receives notification of approval | `[ ]` | |

## X.4 Support Ticket Thread

| # | Test | Result | Notes |
|---|------|--------|-------|
| 391 | Student submits ticket | `[ ]` | |
| 392 | Manager sees ticket in `/admin/support-tickets` | `[ ]` | |
| 393 | Manager replies  student sees reply instantly | `[ ]` | |
| 394 | Student replies  manager sees update | `[ ]` | |

## X.5 Group Booking Full Flow

| # | Test | Result | Notes |
|---|------|--------|-------|
| 395 | Student A creates group booking | `[ ]` | |
| 396 | Student B accepts invite link  added to group | `[ ]` | |
| 397 | Guest C opens invite  Auth Modal  registers  added | `[ ]` | |
| 398 | Group appears in instructor's booking list | `[ ]` | |

## X.6 Package Session Flow

| # | Test | Result | Notes |
|---|------|--------|-------|
| 399 | Manager assigns 10-session package to student | `[ ]` | |
| 400 | Student books lesson using package session | `[ ]` | |
| 401 | Session count decrements to 9 | `[ ]` | |
| 402 | After all 10 sessions used  package blocks further bookings | `[ ]` | |
| 403 | After expiry date  package shows as expired | `[ ]` | |

## X.7 Payment Processors

| # | Processor | Test | Result | Notes |
|---|-----------|------|--------|-------|
| 404 | Stripe | Complete test payment  success | `[ ]` | |
| 405 | Stripe | Failed card  error shown, no booking created | `[ ]` | |
| 406 | PayTR | Complete test payment | `[ ]` | |
| 407 | Binance Pay | QR displayed; payment processed | `[ ]` | |
| 408 | Revolut | Redirect and return | `[ ]` | |
| 409 | PayPal | Redirect; confirm; return | `[ ]` | |
| 410 | All | `/payment/callback` success state  booking confirmed | `[ ]` | |
| 411 | All | `/payment/callback` failure state  no booking created | `[ ]` | |

---

# SYSTEM TESTS

## S.1 Network & Error States

| # | Test | Result | Notes |
|---|------|--------|-------|
| 412 | Backend unreachable  `NetworkStatusBanner` shown | `[ ]` | |
| 413 | API returns 500  error toast; page does not crash | `[ ]` | |
| 414 | Slow API  loading spinner shown | `[ ]` | |
| 415 | Fatal render error  ErrorBoundary / fallback shown | `[ ]` | |
| 416 | Auth token expires mid-session  redirect to login; return URL preserved | `[ ]` | |
| 417 | WebSocket disconnects  auto-reconnects; no data loss | `[ ]` | |

## S.2 Multi-Currency

| # | Test | Result | Notes |
|---|------|--------|-------|
| 418 | Default currency EUR shown on all prices | `[ ]` | |
| 419 | Switch to USD  all prices converted | `[ ]` | |
| 420 | Switch to GBP  all prices converted | `[ ]` | |
| 421 | Finance reports always in base currency (EUR) | `[ ]` | |

## S.3 Dark Mode

| # | Test | Result | Notes |
|---|------|--------|-------|
| 422 | Toggle dark mode  all pages render correctly | `[ ]` | |
| 423 | Refresh  dark mode preference retained | `[ ]` | |
| 424 | Charts and modals themed correctly in dark mode | `[ ]` | |

## S.4 Consent & Legal

| # | Test | Result | Notes |
|---|------|--------|-------|
| 425 | New user first login  Consent Modal blocks UI | `[ ]` | |
| 426 | Accept T&C + communication prefs  modal closes | `[ ]` | |
| 427 | Admin publishes new T&C  all users prompted on next login | `[ ]` | |

## S.5 Mobile / Responsive

| # | Test | Result | Notes |
|---|------|--------|-------|
| 428 | Public pages readable on 375px (iPhone SE) | `[ ]` | |
| 429 | Student portal navigable on mobile | `[ ]` | |
| 430 | Booking wizard works on mobile | `[ ]` | |
| 431 | Sidebar auto-closes on screen width < 1200px | `[ ]` | |

## S.6 Authentication Edge Cases

| # | Test | Result | Notes |
|---|------|--------|-------|
| 432 | Login with 2FA enabled  TOTP prompt shown | `[ ]` | |
| 433 | Wrong TOTP code  blocked | `[ ]` | |
| 434 | Correct TOTP code  access granted | `[ ]` | |
| 435 | Password reset link expired  error shown | `[ ]` | |

---

# QUICK SMOKE TEST (5 min  run after every deployment)

| # | Test | Result |
|---|------|--------|
| A | `/`  public home loads | `[ ]` |
| B | Log in as admin  `/dashboard` | `[ ]` |
| C | `/bookings`  list loads | `[ ]` |
| D | Create test booking  saved | `[ ]` |
| E | `/finance`  revenue loads | `[ ]` |
| F | Log out  redirected to `/` | `[ ]` |
| G | Log in as student  `/student/dashboard` | `[ ]` |
| H | `/student/schedule`  schedule loads | `[ ]` |
| I | Log out  session cleared | `[ ]` |
| J | Log in as instructor  `/instructor/dashboard` | `[ ]` |
| K | `/calendars/lessons`  calendar loads | `[ ]` |
| L | Log out | `[ ]` |

---

# TEST DATA SETUP CHECKLIST

Before starting testing, confirm all of the following exist:

```
[ ] Admin user account
[ ] Manager user account
[ ] Instructor user  specialities: Kite, Foil, Wing
[ ] Student user
[ ] Outsider user (role = outsider)
[ ] Trusted customer user
[ ] 3 lesson services (Kite, Foil, Wing) with instructor assigned
[ ] 2 rental services with equipment linked
[ ] 1 package: "10 Kite Lessons" (10 sessions, 6 months validity)
[ ] 1 membership plan (Seasonal / VIP)
[ ] 1 shop product with stock > 0
[ ] 1 accommodation unit with availability
[ ] 1 upcoming event
[ ] 1 active voucher code (TEST10 = 10% off)
[ ] Waiver template assigned to at least 1 lesson service
[ ] Payment processor test keys (Stripe test mode active)
[ ] Redis running OR DISABLE_REDIS=true set
[ ] Email delivery configured (Mailtrap / mock SMTP)
[ ] T&C consent version set in database
```

---

*Total test cases: 435 + 12 smoke tests | Last updated: 2026-02-27*
