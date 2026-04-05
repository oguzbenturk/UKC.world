# UKC World Mobile App

## WHAT WE ARE BUILDING
A React Native (Expo) mobile app for UKC World kite school (Plannivo platform).
The master plan is at plan/MOBILE_APP_PLAN.md — read it before implementing anything.

## TWO DIRECTORIES
- C:\Users\Admin\Desktop\UKC.Mobile\ukc-mobile\ = THIS project (the mobile app)
- C:\Users\Admin\Desktop\UKC.Mobile\UKC.world\ = existing web app, READ ONLY reference

## RULES
- NEVER modify files in C:\Users\Admin\Desktop\UKC.Mobile\UKC.world\
- NEVER connect to api.plannivo.com (production) — use EXPO_PUBLIC_API_URL env var
- NEVER run database migrations or connect to any database
- ALWAYS follow the plan at plan/MOBILE_APP_PLAN.md
- ALWAYS use TypeScript — no .js files
- ALWAYS handle loading, error, and empty states on every screen
- ALWAYS use t() for ALL user-facing text (i18n)
- Commit message format: "feat: description" or "fix: description"

## TECH STACK
- Expo SDK 54, Managed Workflow, Expo Router v4
- TypeScript strict mode
- Zustand (auth, cart, UI state)
- TanStack React Query v5 (all server data)
- Socket.IO v4 client
- expo-secure-store (tokens only — never AsyncStorage for secrets)
- react-i18next (Turkish + English)
- expo-image, @shopify/flash-list, react-native-reanimated, expo-haptics

## FOLDER STRUCTURE
app/              → Expo Router pages (file-based routing)
src/api/          → Axios client + React Query hooks
src/components/   → Shared UI (ui/, layout/, booking/, chat/, etc.)
src/features/     → Domain modules
src/stores/       → Zustand stores
src/services/     → Socket, push notifications, storage, haptics
src/hooks/        → Shared hooks
src/providers/    → Context providers
src/utils/        → Pure utilities (currency, date, validation)
src/constants/    → Design tokens, route names
src/i18n/         → Translation files (tr.json, en.json)
src/types/        → TypeScript interfaces

## DESIGN TOKENS
Primary:   #0284C7  (sky-600)
Dark:      #1E293B  (slate-800)
Success:   #22C55E
Warning:   #F59E0B
Error:     #EF4444
Info:      #3B82F6

Font:      System (SF Pro on iOS, Roboto on Android)
Spacing:   4px base grid (xs:4, sm:8, md:16, lg:24, xl:32)
Radius:    sm:4, md:8, lg:12, xl:16
Min touch: 44pt (iOS) / 48dp (Android)

## API
- Always use process.env.EXPO_PUBLIC_API_URL as the base URL
- Auth: Bearer token in Authorization header
- Token stored in expo-secure-store, never AsyncStorage
- 401 response → clear token → redirect to login

## NAVIGATION TABS (authenticated users)
1. Home (house icon) → Dashboard
2. Bookings (calendar icon) → My bookings + book service
3. Wallet (creditcard icon) → Balance + transactions + deposit
4. Chat (chatbubble icon) → Conversations
5. Profile (person icon) → Profile + settings

## PAYMENTS
- Primary: Iyzico via expo-web-browser openAuthSessionAsync (3DS redirect)
- Wallet: direct API call (no redirect)
- Binance Pay: QR code + Linking.openURL
- NO Stripe. NO Apple Pay in MVP.
- All products EXEMPT from Apple IAP (physical services/goods)

## WEB APP REFERENCE
The web app at C:\Users\Admin\Desktop\UKC.Mobile\UKC.world\ contains:
- src/features/ → 35+ feature modules (read for UI/data patterns)
- backend/routes/ → 60+ API route files (read for endpoint shapes)
- backend/db/migrations/ → 221+ SQL files (read for data models)
- src/shared/services/ → existing JS services to adapt for mobile
