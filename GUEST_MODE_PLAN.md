# UKC.World - Guest/Outsider Mode Implementation Plan

## 📋 Overview

**Problem Statement**: The "outsider" role was misunderstood. It should represent **anonymous/non-authenticated visitors** who access the UKC.World app interface directly, not a separate landing page.

**Solution**: Allow guests (outsiders) to browse the **existing UKC.World app interface** without authentication. They can explore all sections (Shop, Academy, Rental, Member, etc.) but encounter "Sign in to continue" prompts when trying to book or access restricted features.

**Key Concept**:
- **Same Interface** = Outsiders see the exact same sidebar, navigation, and pages as authenticated users
- **Limited Functionality** = They can browse/preview but cannot book, purchase, or access personal features
- **Seamless Registration** = When they try to perform an action, they're prompted to sign in/register
- **No Separate Landing Page** = The app itself serves as the public-facing interface

---

## 🎯 Goals

1. **Open App Access** - Allow anonymous users to browse the full UKC.World interface without authentication
2. **Preview Mode** - Show all sections (Academy, Shop, Rental, etc.) in read-only/preview mode
3. **Strategic Authentication Gates** - Prompt sign-in only when users try to book, purchase, or access personal features
4. **Seamless User Experience** - No jarring redirect to login page; inline prompts and modals
5. **Progressive Disclosure** - Let users explore freely, then encourage registration at point of intent
6. **Single Codebase** - Use existing components with conditional rendering based on auth state

---

## 🏗️ Architecture Changes

### Current State
- All routes require authentication via `ProtectedRoute`
- Login page is the entry point for unauthenticated users
- Sidebar and main app are only accessible after login

### New State
- **All routes accessible without authentication** (guest mode)
- **Sidebar visible to everyone** (Shop, Academy, Rental, Member, etc.)
- **AuthContext enhanced** to support `guest` state (null user = guest)
- **Conditional rendering** in components based on authentication state
- **Authentication prompts** appear inline when guests try restricted actions

---

## 🎨 Guest Mode Interface Structure

### 1. **Sidebar Navigation** (Same as Authenticated Users)
```
┌─────────────────┐
│  UKC World      │  [User sees same sidebar as screenshot]
├─────────────────┤
│ • Shop          │  ← All menu items visible to guests
│ • Academy       │
│ • Rental        │
│ • Member        │
│ • Care (Repairs)│
│ • Stay          │
│ • Experience    │
│ • Community     │
├─────────────────┤
│ 🔓 Sign In      │  ← Shows "Sign In" button for guests
└─────────────────┘
```

**Features**:
- **Same sidebar** as authenticated users (no differences in navigation)
- All menu items are clickable and lead to their respective pages
- Bottom shows "Sign In" button instead of user profile for guests
- Optional: Small badge "Guest Mode" or "Preview" indicator

---

### 2. **Top Bar / Header** (Same as Screenshot)
```
┌─────────────────────────────────────────────────────────┐
│  UKC World          🏫 Academy        Planning  v0.2.2  │
│                                          🔔  👤 Guest    │
└─────────────────────────────────────────────────────────┘
```

**Content**:
- Logo on left, current section name in center ("Academy", "Shop", etc.)
- Right side shows: Planning status, notifications (disabled), Guest avatar
- **For guests**: Avatar shows "Guest" or generic icon with "Sign In" on click

---

### 3. **Academy Page** (Guest View - Like Screenshot)
```
┌─────────────────────────────────────────────────────────┐
│  Welcome, Guest! [or "Welcome to UKC Academy!"]         │
│                                                           │
│  You're just one step away from booking your first      │
│  lesson. Click the button below to choose your          │
│  preferred time and instructor.                          │
│                                                           │
│  [📅 Book Your First Lesson] [🎁 Buy a Package]         │
│                                                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ Expert       │ │ Flexible     │ │ All Levels   │    │
│  │ Instructors  │ │ Scheduling   │ │ Welcome      │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                           │
│  ℹ️ After Your First Booking                             │
│  Once you complete your first booking, you'll gain      │
│  access to the full student portal...                    │
└─────────────────────────────────────────────────────────┘
```

**Behavior for Guests**:
- Shows same welcome card and feature cards as authenticated users
- **"Book Your First Lesson" button** → Opens sign-in/register modal
- **"Buy a Package" button** → Opens sign-in/register modal
- All content visible, no hidden sections
- Modal/overlay appears: "Create an account to book your lesson"

---

### 4. **Shop Page** (Guest View)
```
┌─────────────────────────────────────────────────────────┐
│  🛍️ Shop                                                 │
│                                                           │
│  [Product Card 1]  [Product Card 2]  [Product Card 3]   │
│  Kite Board        Wetsuit           Harness             │
│  €XXX              €XXX              €XXX                │
│  [Add to Cart - Disabled for guests]                    │
│                                                           │
│  💡 Sign in to purchase equipment and track orders       │
└─────────────────────────────────────────────────────────┘
```

**Behavior for Guests**:
- All products visible with images, names, descriptions
- Prices visible
- **"Add to Cart" button** → Disabled with tooltip "Sign in to purchase"
- Or clicking it → Opens sign-in modal
- **No cart visible** in header for guests (or shows empty cart with CTA)

---

### 5. **Rental Page** (Guest View)
```
┌─────────────────────────────────────────────────────────┐
│  🏄 Equipment Rental                                     │
│                                                           │
│  [Calendar showing availability - read-only]            │
│                                                           │
│  [Equipment Card: Duotone Rebel]  [Equipment Card: ...]│
│  Available: Jun 1-15                                    │
│  Daily Rate: €XX                                        │
│  [Rent Now - Requires Sign In]                         │
│                                                           │
│  🔒 Create an account to rent equipment                  │
└─────────────────────────────────────────────────────────┘
```

**Behavior for Guests**:
- Calendar visible but disabled (or shows demo data)
- Equipment cards show details and pricing
- **"Rent Now" button** → Opens sign-in modal
- Optional: Blurred overlay on calendar with "Sign in to see real-time availability"

---

### 6. **Member Page** (Guest View)
```
┌─────────────────────────────────────────────────────────┐
│  🎫 Membership & Packages                                │
│                                                           │
│  [Package Card 1]     [Package Card 2]                   │
│  5-Lesson Package     Monthly Unlimited                  │
│  €XXX | Save 15%      €XXX | Best Value                 │
│  [Purchase - Requires Sign In]                          │
│                                                           │
│  ✨ Become a member to unlock exclusive benefits         │
└─────────────────────────────────────────────────────────┘
```

**Behavior for Guests**:
- Membership/package cards visible with pricing and benefits
- **"Purchase" button** → Opens sign-in modal with message: "Create an account to purchase memberships"
- Show value propositions and savings

---

### 7. **Authentication Modal/Prompt**
```
┌─────────────────────────────────────────────────────────┐
│                     🔐 Sign In Required                  │
│                                                           │
│  To book lessons, you need to create a free account     │
│  or sign in to your existing account.                   │
│                                                           │
│  [📧 Sign in with Email]                                 │
│  [📱 Continue as Guest - Limited Access]                 │
│                                                           │
│  Don't have an account?                                 │
│  [Create Free Account] [Learn More]                     │
└─────────────────────────────────────────────────────────┘
```

**Triggers**:
- Clicking "Book Your First Lesson"
- Clicking "Add to Cart" in Shop
- Clicking "Rent Now" for equipment
- Clicking "Purchase" for packages
- Accessing personal features (profile, bookings, wallet)

---

### 8. **Pages That Redirect to Login** (Cannot Browse as Guest)

Some pages should still require authentication and redirect immediately:
- **Dashboard** - Personal dashboard requires user context
- **My Bookings** - Personal booking history
- **Wallet** - Financial/payment information
- **Profile Settings** - Personal account settings
- **Admin/Manager/Instructor** panels - Role-specific pages

**Behavior**: Accessing these URLs as guest → Redirect to login with `returnUrl` parameter

---

### 9. **Guest-Accessible vs Authentication-Required**

| Page/Feature | Guest Access | Authentication Required |
|--------------|--------------|------------------------|
| Academy (browse) | ✅ Yes | ❌ No |
| Book lesson | ❌ No | ✅ Yes |
| Shop (browse products) | ✅ Yes | ❌ No |
| Add to cart / Purchase | ❌ No | ✅ Yes |
| Rental (browse equipment) | ✅ Yes | ❌ No |
| Rent equipment | ❌ No | ✅ Yes |
| Member (view packages) | ✅ Yes | ❌ No |
| Purchase package | ❌ No | ✅ Yes |
| View services list | ✅ Yes | ❌ No |
| View instructors list | ✅ Yes | ❌ No |
| Dashboard | ❌ No | ✅ Yes |
| My Bookings | ❌ No | ✅ Yes |
| Wallet | ❌ No | ✅ Yes |
| Profile Settings | ❌ No | ✅ Yes |

---

## 🎨 UI/UX Patterns for Guest Mode

### Pattern 1: Disabled Buttons with Tooltips
```jsx
<Button 
  disabled={!isAuthenticated}
  onClick={handleBooking}
  tooltip={!isAuthenticated ? "Sign in to book" : ""}
>
  Book Your Lesson
</Button>
```

### Pattern 2: Modal/Overlay on Click
```jsx
const handleBooking = () => {
  if (!isAuthenticated) {
    showAuthModal({ 
      title: "Sign In to Book",
      message: "Create a free account to book your lesson",
      returnUrl: "/academy/book"
    });
    return;
  }
  // Proceed with booking
};
```

### Pattern 3: Inline Banner/Alert
```jsx
{!isAuthenticated && (
  <Alert type="info">
    💡 Sign in to access booking, purchase history, and personalized features.
    <Button>Sign In</Button>
  </Alert>
)}
```

### Pattern 4: Blurred/Locked Content
```jsx
<div className={!isAuthenticated ? 'blur-sm pointer-events-none' : ''}>
  {/* Content */}
</div>
{!isAuthenticated && (
  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
    <Card>
      🔒 Sign in to view
      <Button>Create Account</Button>
    </Card>
  </div>
)}
```

---

## 🔧 Technical Implementation Plan

### Phase 1: Authentication System Refactor
**Goal**: Make authentication optional, not required

1. **Update AuthContext** (`src/shared/contexts/AuthContext.jsx`):
   ```javascript
   // Current: user = null means loading or not authenticated
   // New: user = null means guest, loading = separate state
   
   const [user, setUser] = useState(null); // null = guest
   const [loading, setLoading] = useState(true);
   const [isAuthenticated, setIsAuthenticated] = useState(false);
   
   const isGuest = !isAuthenticated; // Helper for components
   ```

2. **Remove ProtectedRoute wrapper** from public-accessible routes:
   ```javascript
   // Before: All routes wrapped in <ProtectedRoute>
   // After: Only specific routes require authentication
   
   <Route path="/academy" element={<AcademyPage />} /> // No protection
   <Route path="/shop" element={<ShopPage />} /> // No protection
   <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
   ```

3. **Create PublicRoute component** (optional):
   ```javascript
   // Redirects authenticated users away from login page
   const PublicRoute = ({ children }) => {
     const { isAuthenticated } = useAuth();
     if (isAuthenticated) return <Navigate to="/dashboard" />;
     return children;
   };
   ```

---

### Phase 2: Component Updates for Guest Mode

1. **Sidebar Component** (`src/shared/components/layout/Sidebar.jsx`):
   ```javascript
   const { user, isAuthenticated } = useAuth();
   
   // Show all menu items to guests
   // Only change: footer shows "Sign In" instead of user profile
   
   {isAuthenticated ? (
     <UserProfile user={user} />
   ) : (
     <Button onClick={openAuthModal}>🔓 Sign In</Button>
   )}
   ```

2. **Academy Page** (`src/features/academy/pages/AcademyPage.jsx`):
   ```javascript
   const { isAuthenticated } = useAuth();
   
   const handleBookLesson = () => {
     if (!isAuthenticated) {
       openAuthModal({
         title: "Sign In to Book",
         message: "Create a free account to book your first lesson"
       });
       return;
     }
     // Proceed with booking
   };
   ```

3. **Shop Page** (`src/features/shop/pages/ShopPage.jsx`):
   ```javascript
   const handleAddToCart = (product) => {
     if (!isAuthenticated) {
       openAuthModal({
         title: "Sign In to Purchase",
         message: "Create an account to add items to your cart"
       });
       return;
     }
     // Add to cart
   };
   ```

4. **Header Component**:
   ```javascript
   {isAuthenticated ? (
     <>
       <NotificationBell />
       <UserAvatar user={user} />
     </>
   ) : (
     <>
       <Badge>Guest</Badge>
       <Button size="small" onClick={openAuthModal}>Sign In</Button>
     </>
   )}
   ```

---

### Phase 3: Backend API Changes

1. **Public API endpoints** (no JWT required):
   ```javascript
   // Backend: Make certain endpoints public
   
   // Before: All require authenticateJWT
   router.get('/api/services', authenticateJWT, getServices);
   
   // After: Some endpoints public
   router.get('/api/services', getServices); // No auth required
   router.get('/api/instructors', getInstructors); // No auth required
   router.get('/api/equipment', getEquipment); // No auth required
   
   // Still protected:
   router.post('/api/bookings', authenticateJWT, createBooking);
   router.get('/api/bookings/my', authenticateJWT, getMyBookings);
   ```

2. **Rate limiting** on public endpoints:
   ```javascript
   import rateLimit from 'express-rate-limit';
   
   const publicApiLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100, // Limit each IP to 100 requests per window
     message: 'Too many requests from this IP'
   });
   
   router.get('/api/services', publicApiLimiter, getServices);
   ```

3. **Update API client** (`src/shared/services/apiClient.js`):
   ```javascript
   // Current: Always sends JWT token
   // New: Only send token if user is authenticated
   
   const apiClient = axios.create({
     baseURL: '/api',
   });
   
   apiClient.interceptors.request.use((config) => {
     const token = localStorage.getItem('token');
     if (token) {
       config.headers.Authorization = `Bearer ${token}`;
     }
     // If no token, proceed without auth header (guest request)
     return config;
   });
   ```

---

### Phase 4: Create Authentication Modal Component

```javascript
// src/shared/components/ui/AuthModal.jsx

import { Modal, Button, Form, Input } from 'antd';

const AuthModal = ({ visible, onClose, title, message, returnUrl }) => {
  const [mode, setMode] = useState('signin'); // 'signin' or 'register'
  
  return (
    <Modal open={visible} onCancel={onClose} footer={null}>
      <div className="text-center">
        <h2>{title || "Sign In Required"}</h2>
        <p>{message}</p>
        
        {mode === 'signin' ? (
          <SignInForm returnUrl={returnUrl} />
        ) : (
          <RegisterForm returnUrl={returnUrl} />
        )}
        
        <Button type="link" onClick={() => setMode(mode === 'signin' ? 'register' : 'signin')}>
          {mode === 'signin' ? "Don't have an account? Register" : "Already have an account? Sign In"}
        </Button>
      </div>
    </Modal>
  );
};
```

**Usage**:
```javascript
// Create context for auth modal
const { openAuthModal } = useAuthModal();

// Trigger from anywhere
openAuthModal({
  title: "Sign In to Book",
  message: "Create a free account to book your first lesson",
  returnUrl: "/academy/book"
});
```

---

### Phase 5: Route Configuration

```javascript
// src/routes/AppRoutes.jsx

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

const AppRoutes = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes - no authentication required */}
        <Route path="/" element={<Navigate to="/academy" />} />
        <Route path="/academy" element={<AcademyPage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/rental" element={<RentalPage />} />
        <Route path="/member" element={<MemberPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/instructors" element={<InstructorsPage />} />
        
        {/* Authentication routes */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        
        {/* Protected routes - authentication required */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
        <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        
        {/* Admin/Manager routes */}
        <Route path="/admin/*" element={<ProtectedRoute roles={['admin']}><AdminPanel /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
};
```

---

## 🔐 Authentication Flow

### Guest User Journey
```
Visit UKC.World (/) 
    ↓
Redirects to /academy (default landing)
    ↓
Browse Academy, Shop, Rental, Member sections freely
    ↓
Click "Book Your Lesson" 
    ↓
Auth Modal appears: "Sign In Required"
    ↓
    ├→ Sign In → Dashboard (role-based)
    ├→ Register → Onboarding → Dashboard
    └→ Cancel → Stay as guest, continue browsing
```

### Authenticated User
```
Visit UKC.World (/) → Redirects to /dashboard
Access Academy/Shop/etc → Full functionality enabled
```

---

## 📊 Success Metrics

### Key Performance Indicators (KPIs)
- **Exploration Rate**: % of guests who browse multiple sections before signing up
- **Conversion Rate**: % of guests who create an account
- **Time to Registration**: Average time from landing to sign-up
- **Drop-off Points**: Where guests leave without registering
- **Feature Interest**: Most clicked features by guests (indicates interest)

### User Engagement Goals
- **Target Exploration**: 70%+ of guests visit 2+ sections
- **Target Conversion**: 15-25% of guests sign up
- **Target Time on Site**: >3 minutes before registration prompt

---

## 🚀 Deployment Strategy

### Development Steps
1. ✅ **Phase 1**: Refactor AuthContext and ProtectedRoute (1-2 days)
2. ✅ **Phase 2**: Update components for guest mode (2-3 days)
3. ✅ **Phase 3**: Create public API endpoints (1 day)
4. ✅ **Phase 4**: Build AuthModal component (1 day)
5. ✅ **Phase 5**: Update routing configuration (1 day)
6. ✅ **Testing**: Test guest flows, edge cases (2 days)
7. ✅ **Deploy**: Feature flag rollout (1 day)

### Rollout Plan
- **Week 1**: Development (Phases 1-5)
- **Week 2**: Testing and refinement
- **Week 3**: Deploy to staging, UAT
- **Week 4**: Production rollout with feature flag
- **Week 5**: Monitor metrics, gather feedback

---

## 🔄 Future Enhancements

### Post-Launch Ideas
1. **Guest Wishlist** - Allow guests to "favorite" items without account (stored in localStorage)
2. **Demo Booking Flow** - Let guests walk through booking process in demo mode
3. **Social Sharing** - Share services/products without authentication
4. **Email Capture** - Offer newsletter signup before requiring full registration
5. **Progressive Registration** - Collect minimal info first, full details later
6. **Guest Analytics** - Track which features guests explore most
7. **Personalized CTAs** - Show different prompts based on guest behavior

---

## ✅ Acceptance Criteria

### Must Have (MVP)
- ✅ All main sections (Academy, Shop, Rental, Member) browsable without login
- ✅ Sidebar and navigation visible to guests
- ✅ Authentication modal appears on restricted actions
- ✅ Seamless sign-in/register flow with return URL
- ✅ Mobile-responsive guest experience
- ✅ No breaking changes for existing authenticated users

### Should Have
- ✅ Tooltips on disabled buttons for guests
- ✅ Inline alerts/banners indicating guest mode
- ✅ Rate limiting on public API endpoints
- ✅ Analytics tracking for guest behavior

### Could Have (Nice to Have)
- Guest wishlist (localStorage)
- Demo booking walkthrough
- Email capture before full registration
- Guest session persistence across visits

---

## 📝 Notes & Considerations

### Security
- Ensure sensitive data (financial, personal) never exposed to guests
- Rate limit all public endpoints to prevent abuse
- Monitor for scraping/bot activity on public pages
- Validate all inputs on authentication actions

### Performance
- Lazy load components for guests (no need to load dashboard code)
- Cache public API responses (services, instructors)
- Minimize bundle size for first load

### Accessibility
- Keyboard navigation works for guests
- Screen reader friendly auth prompts
- Clear visual indicators for disabled actions

### SEO Considerations
- Public pages now indexable by search engines
- Add appropriate meta tags to Academy, Shop, Rental pages
- Implement structured data for services/products
- Create sitemap for public pages

---

## 🎯 Next Steps

1. **Review & Approval** - Stakeholder sign-off on guest mode approach
2. **Sprint Planning** - Break down into 1-week sprint
3. **Development Kickoff** - Start with Phase 1 (AuthContext refactor)
4. **Daily Stand-ups** - Track progress and blockers
5. **Testing** - Thorough QA on guest flows
6. **Launch** - Deploy with monitoring

---

**Created**: January 27, 2026  
**Last Updated**: January 27, 2026  
**Status**: 📋 Planning Phase
**Estimated Effort**: 8-10 days development + 3-5 days testing
