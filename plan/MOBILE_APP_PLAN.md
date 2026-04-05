# UKC World — Mobile App Master Plan
> Plannivo Mobile | React Native (Expo) | Generated: 2026-04-05
> Sources: 00_AUDIT.md + 6 specialist agent plans

---

## A. Architecture

### Stack
- **Framework**: Expo SDK 52 — **Managed Workflow**
- **Router**: Expo Router v4 (file-based, like React Router but for native)
- **Language**: TypeScript throughout
- **State (client)**: Zustand (auth, cart, UI state)
- **State (server)**: TanStack React Query v5 (all API data)
- **Real-time**: Socket.IO v4 client (server already supports mobile — no-origin allowed)

### Folder structure (abbreviated)
```
ukc-mobile/
├── app/                  # Expo Router pages
│   ├── (auth)/           # login, register, reset-password
│   ├── (app)/            # Authenticated screens (tab bar)
│   │   ├── (home)/       # Dashboard
│   │   ├── (bookings)/   # My bookings + book service
│   │   ├── (rentals)/    # My rentals
│   │   ├── (wallet)/     # Balance, deposit, history
│   │   ├── (chat)/       # Conversations
│   │   └── (profile)/    # Profile, settings, privacy
│   └── (public)/         # Guest-facing pages
├── src/
│   ├── api/              # Axios client + React Query hooks
│   ├── components/       # Shared UI primitives
│   ├── features/         # Domain modules (auth, bookings, wallet, etc.)
│   ├── stores/           # Zustand stores
│   ├── services/         # socket.ts, notifications.ts, storage.ts
│   ├── utils/            # currency, date, validation
│   └── i18n/             # tr.json, en.json
├── assets/
├── app.json
└── eas.json
```

### Tab Bar
| Tab | Screen | Roles |
|---|---|---|
| Home | Dashboard | All |
| Bookings | My sessions + Book | All |
| Wallet | Balance + deposit | All |
| Chat | Conversations | All |
| Profile | Profile + settings | All |

Staff members access management functions via a drawer from the Home tab.

### OTA vs Store Build
- **OTA eligible**: JS changes, UI fixes, content, new screens using existing modules
- **Store build required**: New native module, permission changes, SDK upgrades

---

## B. UI & Design

### Design Tokens
```ts
Brand primary: #0284C7 (sky-600)
Brand dark:    #1E293B (slate-800 — header)
Success:       #22C55E
Warning:       #F59E0B
Error:         #EF4444
```

### Component Mapping
| Web | Mobile |
|---|---|
| Navbar | Bottom Tab Bar |
| Sidebar | Drawer (staff) |
| `<select>` / Ant Select | Bottom Sheet |
| Ant Modal | Full-screen modal or bottom sheet |
| Ant Table | FlatList + Card rows |
| react-big-calendar | react-native-calendars |
| Framer Motion | react-native-reanimated |
| Recharts | Victory Native |
| react-hook-form + Yup | Same (works in RN) |

### Key UI Decisions
- **Fonts**: System fonts (SF Pro / Roboto) — no custom font loading for MVP
- **Dark mode**: Deferred to Phase 2
- **Haptics**: `expo-haptics` on primary CTAs, success, error, destructive actions
- **Loading**: Skeleton loaders per-screen + pull-to-refresh on all lists
- **Images**: `expo-image` with WebP + blurhash placeholders
- **SafeArea**: Every screen wrapped in `SafeAreaView` with `edges={['top','left','right']}`
- **Keyboard**: `KeyboardAvoidingView` + `behavior: 'padding'` on iOS for forms

---

## C. Payments

### Providers
| Provider | Usage | Mobile method |
|---|---|---|
| **Iyzico** | Lessons, packages, wallet deposit | `expo-web-browser openAuthSessionAsync` (3DS) |
| **Wallet** | Pay from balance | Native — no redirect |
| **Paytr** | Alternative cards | WebView |
| **Binance Pay** | Crypto deposit | QR code + `Linking.openURL` |

### Payment Flow
1. **Wallet balance sufficient** → Pay instantly → Booking confirmed
2. **Wallet insufficient** → Open Iyzico 3DS in `WebBrowser.openAuthSessionAsync` → Returns to `ukc://payment/callback` → Confirm booking

### App Store Compliance — IAP Exemption
**All UKC World products are EXEMPT from Apple IAP:**
- Kite/foil/wing/eFoil lessons = physical in-person service (Guideline 3.1.3(e))
- Equipment rentals = physical goods/service (3.1.3(e))
- Accommodation = physical lodging (3.1.3(e))
- Shop products = physical retail goods (3.1.1 exemption)
- Wallet top-up = funds physical-service purchases only

**App Review Notes to submit**: "All purchases are for physical services and physical goods consumed in the real world. Under App Store Guidelines 3.1.3(e), these are exempt from in-app purchase requirements."

### Apple Pay / Google Pay
Deferred to Phase 2 (requires Iyzico native SDK + custom Expo module). MVP uses wallet + Iyzico WebBrowser.

---

## D. Authentication

### Login flow
1. Email + password → `POST /api/auth/login`
2. If `requires2FA: true` → TOTP input screen → `POST /api/auth/2fa/verify`
3. Receive JWT → store in `expo-secure-store`
4. Check consent status → show consent modal if needed
5. Route to role-based home screen

### Register flow
1. Email + password + name → `POST /api/auth/register`
2. JWT returned → same as login flow step 3+

### Token lifecycle
- Current: 24h JWT (no refresh — mobile needs longer sessions)
- **Required backend addition**: Refresh token endpoint `POST /api/auth/refresh`
- Biometric re-authentication after 7 days

### Biometric auth (`expo-local-authentication`)
- Opt-in after first successful login
- Face ID (iOS) / Touch ID (iOS) / Fingerprint (Android)
- Biometric failure → password fallback
- Stored preference in `expo-secure-store`

### Guest mode
- Public pages accessible without login
- "Sign In" / "Register" prompts when trying to book
- No forced registration gate

### Account deletion
**Required by App Store + Play Store.**

Backend must add: `DELETE /api/users/me`
- Verify password → soft-delete user → anonymize PII → cancel pending bookings → revoke tokens → queue GDPR deletion job

Mobile flow: Profile → Settings → Account → Delete Account → Password confirm → Success → Clear storage → Logout

### No Apple Sign-In required
Web app uses email/password only (no OAuth). App Store Guideline 4.8 only requires Apple Sign-In when other social logins exist. We have none.

---

## E. API & Backend Integration

### API Client
```ts
// Axios instance with JWT interceptor + 401 auto-logout
// Base URL from EXPO_PUBLIC_API_URL env var
// Timeout: 15s
// Retry: 2× on GET with exponential backoff
// No retry on POST (prevent double-booking)
```

### New endpoints required (backend must add before beta)
| Priority | Endpoint | Purpose |
|---|---|---|
| P0 | `POST /api/auth/refresh` | Token refresh for long mobile sessions |
| P0 | `DELETE /api/users/me` | Account deletion (store requirement) |
| P0 | `POST /api/notifications/push-token` | Register Expo push token |
| P1 | `POST /api/bookings/:id/refund-request` | Customer refund request |

### Offline support
- `networkMode: 'offlineFirst'` in React Query
- React Query cache persisted to `AsyncStorage` via `@tanstack/query-async-storage-persister`
- Offline banner when no internet (mirrors web `NetworkStatusBanner`)
- **Blocked offline**: payment initiation, booking creation, chat send
- **Available offline**: view cached bookings, wallet, notifications, products

### Real-time (Socket.IO)
No backend changes needed — server already allows no-origin connections.
Client reconnects automatically on network restore.
Events: `notification:new`, `chat:message`, `booking:updated`, `wallet:balance_updated`, `rental:updated`, `reschedule:request`

### Push Notifications (Expo Push → FCM + APNs)
Replace web push subscriptions with Expo Push tokens.
Notification categories: booking confirmed/reminder/cancelled, payment success, chat message, rental reminder, reschedule request, group invite.
Permission: request AFTER first booking confirmation (not on app launch).

---

## F. Localization

### Current state
The web app has NO i18n library — all text is hardcoded in components (mix of Turkish and English).

### Mobile implementation: `react-i18next`

```ts
// src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import tr from './tr.json';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, tr: { translation: tr } },
  lng: 'tr',                     // Default Turkish (primary market)
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
```

**Language detection**: Check device locale (`expo-localization`), fall back to Turkish.

**Translation files**: All user-facing strings must be in `en.json` and `tr.json`. No hardcoded strings in components.

### Currency formatting
```ts
// src/utils/currency.ts (using Decimal.js — same as web)
export function formatCurrency(amount: Decimal, currency: string): string {
  // TRY: ₺1.234,56  |  EUR: €1,234.56  |  USD: $1,234.56
}
```

Primary currency: **TRY** for Turkish users, **EUR** for international.
Multi-currency: EUR, TRY, USD, GBP (matches web wallet).

### Date/time
- Use `date-fns` (already in web dependencies) with locale: `tr` or `en`
- All dates shown in user's local timezone
- Consistent format: `dd MMM yyyy` (e.g., "05 Nis 2026" in Turkish)

### RTL readiness
Arabic/RTL not currently needed. Turkish is LTR. Design with `I18nManager.isRTL` awareness but do not fully implement RTL layouts for MVP.

---

## G. Security & Compliance

### Token storage
- **JWT**: `expo-secure-store` ONLY — never `AsyncStorage`
- **Zustand auth store**: persisted with `expo-secure-store` backend, not `AsyncStorage`

### Network
- HTTPS enforced — reject non-HTTPS in production builds
- No certificate pinning for MVP (maintenance burden outweighs benefit)

### Payment security
- Zero card data in app — Iyzico WebBrowser handles PCI
- No payment logging in mobile app
- Screenshot prevention on wallet/payment screens via `expo-screen-capture`

### App privacy
- App switcher blur overlay on payment/auth screens
- Jailbreak: warn user + disable biometrics (no force-close)

### GDPR (EU)
- Data export: Profile → Privacy → Export My Data → `POST /api/gdpr/export`
- Consent status checked on every login
- Communication preferences (email/SMS/WhatsApp) per `user_consents` schema

### KVKK Law 6698 (Turkey — primary market)
- Same as GDPR: consent, access, rectify, delete, portability
- Cross-border transfer: Expo Push uses FCM/APNs (US servers) — disclose in privacy policy
- Data stored on EU/Turkey servers (backend infrastructure)
- Communication opt-in required per channel (already implemented in `user_consents`)

### App Tracking Transparency (iOS 14.5+)
Request BEFORE any analytics initialization:
```ts
const { status } = await requestTrackingPermissionsAsync();
// Only initialize PostHog if status === 'authorized'
```
`app.json` must include: `"NSUserTrackingUsageDescription": "We use anonymous analytics to improve app experience."`

### iOS Privacy Nutrition Labels
Collected: Name/Email/Phone (linked), Purchase history (linked), Usage (not linked), Crash data (not linked), Photos (linked — profile only), Messages (linked — chat)
Not collected: Precise location, Contacts, Browsing history, Financial info (Iyzico handles)

---

## H. Testing & QA

### Unit tests (Jest)
- Utilities: 100% coverage
- Hooks: 90% coverage
- API services: 90% coverage
- Zustand stores: 80% coverage

### E2E tests (Maestro — preferred over Detox for managed Expo)
Required flows before any store submission:
1. Register → Login → Dashboard
2. Login with 2FA
3. Book lesson (wallet payment)
4. Book lesson (Iyzico WebBrowser — manual only)
5. Cancel booking
6. Shop browse → checkout
7. Book rental
8. Chat message send
9. Notification tap → correct screen
10. Deep link (group invitation token)
11. Forgot password reset
12. Enable biometric
13. Delete account

### Device matrix
iOS: iPhone SE 3 (375pt, iOS16), iPhone 14 (390pt, iOS17), iPhone 15 Pro Max (430pt, iOS18)
Android: Pixel 6 (360dp, Android12), Galaxy S22 (412dp, Android13), Galaxy S24 (412dp, Android14)

### Beta
- iOS: TestFlight (100 internal → 10k external), 2-week minimum
- Android: Firebase App Distribution, same window
- Pass criteria: 99%+ crash-free, all E2E flows passing, push + deep links working

---

## I. Performance & Stability

### Targets
| Metric | Target |
|---|---|
| Cold start | < 2 seconds |
| Screen transition | < 300ms |
| FPS | 60fps sustained |
| JS bundle | < 50MB |
| Memory (foreground) | < 200MB |

### Image performance
- `expo-image` with disk+memory cache + WebP format
- Blurhash placeholders stored in DB (add to product/user schema)
- Profile photo upload: compress to 80% JPEG, max 1200×1200 before upload

### FlatList tuning
```tsx
<FlashList  // @shopify/flash-list instead of FlatList
  estimatedItemSize={80}
  keyExtractor={(item) => item.id}
  getItemType={(item) => item.type}  // If mixed types
/>
```

### Error boundaries
Every tab screen wrapped in `<Sentry.ErrorBoundary>` with retry button.

### Sentry
- Source maps auto-uploaded via EAS Build
- Alert: > 1% error rate → Slack
- Capture all unhandled promises

### Analytics (PostHog — EU hosted for KVKK compliance)
- Track: screen views, booking lifecycle, payment lifecycle, chat usage, errors
- Only after ATT consent on iOS

---

## J. CI/CD & Release

### Pipeline (GitHub Actions + EAS)
```
PR opened    → lint + typecheck + unit tests + bundle size check
Merge to main → staging EAS build (all platforms) + OTA update + E2E tests
Tag v*.*.*   → production EAS build + store submit
```

### Environments
| Env | API | Iyzico | Analytics |
|---|---|---|---|
| development | localhost:4000 | sandbox | off |
| staging | staging-api.plannivo.com | sandbox | test project |
| production | api.plannivo.com | production | production |

### Signing
- iOS: EAS managed certificates
- Android: EAS keystore + Play App Signing (Google holds upload key)
- **Critical**: Export and backup keystores — losing them = cannot update the app

---

## K. App Store Submission

### Pre-submission checklist
See Section N (Pre-Launch Checklist).

### iOS App Store
- App name: **UKC World**
- Subtitle: Kite School & Watersports
- Category: Sports
- Screenshots: 6.9" (15 Pro Max), 6.5" (14 Plus), 5.5" (SE) — 3 screens minimum each
- Privacy Policy URL: `https://plannivo.com/privacy` (must be live)
- Support URL: `https://plannivo.com/help`
- App Review Notes: payment exemption language (see Section C)
- Age rating: 4+

### Google Play
- Feature graphic: 1024×500px
- Category: Sports
- Content rating: Everyone
- Data Safety form: per Section G privacy labels

### Payment exemption — full review note
> "This app is a management platform for UKC World, a physical kite school in Turkey. All transactions through this app are for physical services and physical goods only: in-person kite/foil/wing/eFoil lessons, physical equipment rentals, accommodation at our venue, and physical retail products (kiteboards, wetsuits, accessories). Per App Store Guidelines 3.1.3(e), physical/real-world services and per 3.1.1, physical goods are exempt from in-app purchase requirements. The wallet feature is pre-funding only for these physical purchases and cannot be used to buy any digital content."

---

## L. Timeline

### Phase 1: Setup + Architecture (Weeks 1–2)
- [ ] Initialize Expo project, configure TypeScript
- [ ] Set up Expo Router with auth + app + public route groups
- [ ] Configure EAS Build (dev/staging/prod profiles)
- [ ] Set up GitHub Actions CI pipeline
- [ ] Implement design tokens, base components (Button, Input, Card, Screen)
- [ ] Implement auth store (Zustand + SecureStore)
- [ ] Set up React Query + offline persistence
- [ ] Configure Socket.IO client
- [ ] Set up Sentry + PostHog (behind ATT gate)
- [ ] Set up react-i18next (tr + en)

### Phase 2: UI Rebuild (Weeks 3–5)
- [ ] Login / Register / Password Reset / 2FA screens
- [ ] Student Dashboard (home screen)
- [ ] Bottom tab bar + navigation structure
- [ ] Booking list + booking detail
- [ ] Book service wizard
- [ ] Rental list + book rental
- [ ] Wallet screen (balance + transaction history)
- [ ] Notification center
- [ ] Push notification registration
- [ ] Profile + settings screen
- [ ] Consent modal (KVKK)

### Phase 3: Backend Integration (Weeks 5–7)
- [ ] **Backend**: Add `POST /auth/refresh`
- [ ] **Backend**: Add `POST /notifications/push-token`
- [ ] **Backend**: Add `DELETE /users/me`
- [ ] Connect all screens to real API endpoints
- [ ] Socket.IO real-time events (notifications, chat, booking updates)
- [ ] Offline mode + NetworkStatusBanner
- [ ] Deep linking setup (Universal Links + custom scheme)
- [ ] Chat screen (real-time messaging)
- [ ] Biometric auth flow
- [ ] Account deletion flow

### Phase 4: Payments (Weeks 7–8)
- [ ] Wallet deposit via Iyzico WebBrowser
- [ ] Wallet balance check in booking wizard
- [ ] Booking payment (wallet + Iyzico)
- [ ] Shop checkout
- [ ] Binance Pay QR
- [ ] Payment callback handling (deep link)
- [ ] Receipt / confirmation screen
- [ ] Test all payment flows in Iyzico sandbox

### Phase 5: QA + Beta (Weeks 9–11)
- [ ] Unit tests to coverage targets
- [ ] E2E Maestro flows (all 13 flows)
- [ ] Device matrix testing (6 devices)
- [ ] Accessibility audit (VoiceOver + TalkBack)
- [ ] Performance profiling (cold start, FPS, memory)
- [ ] TestFlight internal (100 testers)
- [ ] Firebase App Distribution (Android)
- [ ] 2-week beta with real users
- [ ] Bug fixes from beta feedback

### Phase 6: Store Submission + Launch (Weeks 11–12)
- [ ] App Store listing (screenshots, description, review notes)
- [ ] Play Store listing (feature graphic, Data Safety form)
- [ ] Submit for review
- [ ] Monitor for rejections
- [ ] Launch + monitor Sentry + PostHog
- [ ] Announce to existing users via email/notification

---

## M. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Apple rejects wallet top-up as IAP bypass | High | Medium | Strong App Review Notes with physical service language; be ready to clarify via Resolution Center |
| Iyzico 3DS WebBrowser flow has UX issues | Medium | Medium | Test thoroughly; consider Iyzico native SDK in Phase 2 |
| Refresh token not added before beta | High | Low | P0 backend task; gate beta behind this |
| Account deletion missing | High | Low | P0 backend task; App Store requirement |
| Push notifications not delivered (APNs setup) | High | Medium | Test on real devices early (Week 2); simulators don't support push |
| Deep link (Universal Link) verification fails | Medium | Medium | Test `.well-known/apple-app-site-association` deployment in Week 3 |
| OTA update causes crash on old cached version | Medium | Low | Version check on app start; force reload if version mismatch |
| KVKK non-compliance (cross-border data transfer) | High | Low | Disclose Expo Push / PostHog EU servers in privacy policy |
| Missing ATT prompt string in app.json | High | High | Add to app.json before first EAS build; checked in CI |
| App crashes on iPhone SE (375pt small screen) | Medium | Medium | Test on SE specifically; smallest target device |
| Android keystore lost | Critical | Low | EAS + Play App Signing + backup `.jks` to vault |
| Missing Apple Sign-In (if social login added later) | High | Low | Do not add social login without also adding Apple Sign-In |
| Chat file upload exceeds storage limits | Low | Low | Enforce 10MB limit on mobile upload; compress images |
| 2FA TOTP out of sync (time drift) | Low | Low | Backend already handles clock drift (speakeasy default ±1 period) |

---

## N. Pre-Launch Checklist

### Security
- [ ] JWT stored only in `expo-secure-store`, not AsyncStorage
- [ ] No API keys or secrets in JS bundle (`EXPO_PUBLIC_` prefix only for non-secrets)
- [ ] Screenshot prevention on wallet, payment, 2FA screens (`expo-screen-capture`)
- [ ] App switcher blur on sensitive screens
- [ ] HTTPS-only API calls (enforced in production)
- [ ] Biometric fallback to password works correctly

### Compliance
- [ ] KVKK consent modal shows and stores consent
- [ ] Data export (`GET /api/gdpr/export`) works end-to-end
- [ ] Account deletion (`DELETE /api/users/me`) works end-to-end
- [ ] Privacy policy live at `plannivo.com/privacy`
- [ ] ATT prompt in `app.json` (`NSUserTrackingUsageDescription` present)
- [ ] iOS privacy nutrition labels filled in App Store Connect
- [ ] Android Data Safety form filled in Play Console
- [ ] Push notifications only initialized after permission grant
- [ ] PostHog only initialized after ATT consent

### Quality
- [ ] Unit test coverage: utils 100%, hooks 90%, services 90%
- [ ] All 13 E2E Maestro flows passing
- [ ] Zero P0 crashes in Sentry on staging
- [ ] Cold start < 2s on iPhone SE
- [ ] 60fps on booking wizard + chat screens
- [ ] Bundle size < 50MB
- [ ] Accessibility: all interactive elements labeled

### UX
- [ ] Skeleton loaders on all list screens
- [ ] Empty states on all list screens
- [ ] Error + retry on all screens
- [ ] Pull-to-refresh on all lists
- [ ] Offline banner functional
- [ ] Dark mode: light mode doesn't break in system dark mode setting
- [ ] Keyboard avoidance works on all forms (iOS + Android)
- [ ] SafeArea correct on iPhone SE, 14, 15 Pro Max, Pixel 6

### Payments
- [ ] Iyzico sandbox: success flow tested
- [ ] Iyzico sandbox: failure/cancel flow tested
- [ ] Wallet payment: deduction confirmed
- [ ] Binance QR: generates correctly
- [ ] Payment callback deep link returns to correct screen
- [ ] Receipt screen shows correct data
- [ ] App Review Notes include IAP exemption language
- [ ] No card data stored or logged anywhere in the app

### Infrastructure
- [ ] EAS production build tested
- [ ] `apple-app-site-association` served at `plannivo.com/.well-known/`
- [ ] `assetlinks.json` served at `plannivo.com/.well-known/`
- [ ] Sentry source maps uploaded for production build
- [ ] New backend endpoints deployed: `/auth/refresh`, `/notifications/push-token`, `DELETE /users/me`
- [ ] Redis cache stable under mobile load
- [ ] Socket.IO handles mobile reconnection gracefully

### Store Readiness
- [ ] App icon: 1024×1024 iOS + adaptive Android created
- [ ] Splash screen branded + transitions smoothly
- [ ] Screenshots captured for all required device sizes
- [ ] App name / subtitle / description finalized
- [ ] App Review Notes written with payment exemption language
- [ ] Support URL live
- [ ] Age rating: 4+ confirmed (no content requiring higher rating)
- [ ] 2-week beta on TestFlight + Firebase App Distribution completed
- [ ] Beta feedback addressed

---

*This plan references actual UKC World/Plannivo codebase: 35+ feature modules, 60+ API route files, 221+ database migrations, Iyzico/Paytr/Binance payment gateways, Socket.IO real-time, PostgreSQL + Redis infrastructure. No generic advice — every recommendation derives from the source code.*
