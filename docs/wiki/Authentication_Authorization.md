# Authentication & Authorization

> **Özet:** Plannivo'nun kimlik doğrulama katmanı; e-posta/parola login (case-insensitive), rotasyonlu refresh token ile sessiz oturum yenileme, TOTP 2FA, e-posta doğrulama ve parola sıfırlama akışlarını içerir. Yetkilendirme iki katmanlıdır: JWT'ye gömülü rol adı eşleşmesi + `roles.permissions` (JSONB) tabanlı granüler `scope:action` kontrolü, böylece özel (custom) roller de korunur. Rol değişince Redis `session_revoked_after:<uid>` markerı ile eski token'lar anında reddedilir.
>
> **Kütüphaneler:** jsonwebtoken (HS256), bcryptjs, custom TOTP (HMAC-SHA1/Base32), express-rate-limit, helmet, Redis (cacheService), React Context.
>
> **Bağlantılar:** [[Backend_Server]], [[Frontend_Shell]], [[Database]], [[Customers_CRM]], [[Student_Portal]], [[Notifications_System]], [[Dashboard_Metrics_Admin]], [[Shared_Backend_Utilities]]

---

## Sorumluluk

Bu modül "kullanıcı kim ve neye erişebilir" sorusunu yönetir:

- **Kimlik doğrulama (AuthN):** login, register (self-service `outsider`), logout, token yenileme, e-posta doğrulama, parola sıfırlama, parola değiştirme, 2FA (TOTP + backup kodları).
- **Yetkilendirme (AuthZ):** rol bazlı + JSONB izin bazlı erişim kontrolü, özel rol yönetimi (`roles` CRUD), oturum iptali (rol değişiminde).
- **Güvenlik altyapısı:** rate limit, CSRF (double-submit cookie), hesap kilitleme, güvenlik denetim günlüğü (`security_audit`).

---

## Backend

### Rotalar

`backend/routes/auth.js` — ana kimlik doğrulama yüzeyi (`/api/auth/*`):

- `POST /login` — `authRateLimit`. Kullanıcıyı **`LOWER(u.email) = LOWER($1)`** ile bulur (JS'de `toLowerCase()` YOK; tek bir lower otoritesi olarak Postgres `LOWER()` kullanılır — Türkçe noktalı-İ gibi karakterlerde JS↔Postgres farkı login'i bozardı). `ORDER BY (u.email = $1) DESC` ile birebir eşleşmeyi önceler. Hesap kilidi (`account_locked`), hesap süresi (`account_expired_at`), `email_verified` bloğu ve 2FA dallanmasını uygular.
- `GET /me` — `authenticateJWT`. Taze rol + `role_permissions` döner; DB erişilemezse token'a güvenmek yerine **503** döner (SEC-010).
- `POST /refresh-token` — `authenticateJWT`. DB'den güncel rolü okuyup yeni JWT basar. Yanıta `permissions`'ı dahil eder (atlamak custom rolleri her sessiz yenilemede gated sayfalardan dışarı atıyordu — bkz. Tuzaklar).
- `POST /refresh-session` — **PUBLIC + CSRF-exempt**. Access JWT'yi değil, httpOnly **refresh cookie**'sini doğrular; süresi dolmuş access JWT'yi bile yenileyebilir. Her zaman açık `/music` ekranını login tutan akış budur.
- `POST /logout` — `authenticateJWT`. JWT `jti`'sini Redis `blacklist:<jti>` listesine ekler (TTL = token exp), refresh token ailesini iptal eder, cookie'leri temizler.
- `POST /register` — `authRateLimit`. Yeni `outsider` rolü oluşturur/atar, cüzdan açar, kullanıcıyı tüm kanal sohbetlerine ekler, doğrulama e-postası gönderir.
- `POST /change-password`, `POST /forgot-password`, `POST /validate-reset-token`, `POST /reset-password`, `POST /verify-email`, `POST /resend-verification` — parola politikası: min 8 + büyük/küçük harf + rakam + özel karakter (`@$!%*?&`).
- `GET /csrf` — login öncesi `csrf_token` cookie'sini set eden bootstrap ucu.

`backend/routes/twoFactor.js` (`/api/auth/2fa/*` benzeri): `setup-2fa`, `enable-2fa`, `disable-2fa`, `verify-2fa` (login'deki `temp2fa` token'ını tüketir), `backup-codes/count`, `backup-codes/regenerate`, `2fa-status`. Backup kodları 8 adet, `bcrypt` ile hash'lenir ve **yalnızca bir kez** gösterilir; doğrulanan kod listeden silinir.

`backend/routes/roles.js` (`/api/roles`): rol listesi/CRUD. Sadece `admin` (create/update/delete/assign), liste/okuma `admin`+`manager`. `PROTECTED_ROLE_NAMES` (admin, manager, instructor, student vb.) silinemez. Rol güncellenince `invalidateRolePermissionsCache` + `permissionService.clearAllCache`. `PATCH /:id/assign` rol atadıktan sonra **`invalidateUserSessions`** çağırır.

### Middleware

`backend/middlewares/authorize.js`:

- `authenticateJWT` (aslında `auth.js`'te export edilir) — `Authorization: Bearer` ya da `plannivo_auth` cookie'sinden token okur; HS256 doğrular; `temp2fa` token'larını tam oturum olarak reddeder; `blacklist:<jti>` ve `session_revoked_after:<uid>` markerını kontrol eder.
- `authorizeRoles(allowedRoles, requiredPermission?)` — **iki aşamalı**: (1) JWT'deki rol adı `allowedRoles` ile birebir eşleşiyorsa geç. (2) Eşleşmiyorsa `roles.permissions` JSONB'sini okur, rota yolundan + HTTP metodundan `scope:action` türetir (`ROUTE_SCOPE_MAP` + `getPermissionAction`) ve `checkPermission` ile değerlendirir (`*` tam wildcard, `scope:*`, `scope:action`, write→read implikasyonu). `owner` rolü management rotalarına otomatik eklenir; `trusted_customer`, `student` erişimini miras alır.

`backend/middlewares/security.js`:

- `authRateLimit` (prod 20/15dk, min 10), `apiRateLimit`, `twoFactorRateLimit` (5/5dk), `passwordResetRateLimit`, vb.
- **CSRF** double-submit: `setCsrfCookie` (httpOnly=false, JS okunabilir), `csrfMiddleware`. Güvenli metodlar ve `Bearer` istekleri atlanır. `CSRF_EXEMPT_PREFIXES` public uçları (`/api/auth/login`, `/register`, `/verify-email`, `/forgot-password`, `/refresh-session` vb.) muaf tutar.
- CORS `allowedHeaders`'a **`X-CSRF-Token`** eklidir (dev cross-origin login için şart).

### Servisler

- `backend/services/sessionService.js` — `invalidateUserSessions(userId)`: Redis `session_revoked_after:<uid>` = epoch saniye + refresh token'ları iptal. `getSessionRevokedAfter` `iat < marker` olan access token'ları geçersiz kılar. Redis çökerse `null` döner, auth kırılmaz.
- `backend/services/refreshTokenService.js` — rotasyonlu refresh token "ailesi" (familyId). Sadece SHA-256 hash saklanır. `rotateRefreshToken` satır kilidiyle (`FOR UPDATE`) çalışır; 15 sn grace penceresi (sekme yarışları için) + `MAX_GRACE_SIBLINGS` cap; pencere dışı tekrar kullanım **theft** sayılıp tüm aileyi iptal eder (reuse detection). Sliding expiry (`REFRESH_EXPIRY_DAYS`, vars. 60).
- `backend/services/twoFactorService.js` — bağımsız TOTP (HMAC-SHA1, 30s period, 6 hane, ±1 pencere clock-skew), Base32 encode/decode, `enableTwoFactor`/`disableTwoFactor`.
- `backend/services/permissionService.js` — `hasPermission(userId, 'scope:action')` (5dk cache), `requirePermission` middleware fabrikası, `requires2FA` hassas operasyon listesi.
- `backend/services/roleUpgradeService.js`, `passwordResetService.js`, `emailVerificationService.js` — rol yükseltme (`outsider`→`student`), token üretip e-posta gönderen sıfırlama/doğrulama akışları.

### Merkezi yardımcılar (sabitler & sanitizasyon)

Kimlik/yetki katmanının küçük ama kritik yardımcıları ayrı dosyalarda toplanmıştır (detay: [[Shared_Backend_Utilities]]):

- `backend/utils/sanitizeUser.js` — `sanitizeUser(user)`: API yanıtından hassas alanları (`password_hash`, `two_factor_secret`, `two_factor_backup_codes`, `iyzico_card_user_key`, `last_login_ip`, `failed_login_attempts`, `account_locked`, `account_locked_at`) silen tek merkezi yardımcı; kullanıcı nesnesi dışarı dönmeden önce buradan geçirilmelidir.
- `backend/shared/utils/roleUtils.js` — frontend `src/shared/utils/roleUtils.js`'in **backend aynası** (`ROLES`, `ROLE_HIERARCHY`, `getRoleLevel`, `hasPermission(userRole, requiredRole)`, `isStaffRole`, `isAdminRole`, `PAY_AT_CENTER_ALLOWED_ROLES`). Dosya başlığı bunu açıkça belirtir ("Mirrors the frontend roleUtils.js"); iki kopya **elle senkron tutulur**, sapma riski vardır (bir tarafa rol/seviye eklerken diğeri de güncellenmeli).
- `backend/constants/roles.js` — name-temelli rol sabitleri (rol UUID'leri bilinçli olarak burada tutulmaz; ortamlar arası farklılaşıp reseed'de kayan ID'ler orphan `role_id` + bozuk login'e yol açmıştı, bu yüzden ID'ler runtime'da `name` ile çözülür). İçerir: `PAY_AT_CENTER_ALLOWED_ROLES` (`admin`/`manager`/`trusted_customer`), `STAFF_NEGATIVE_BALANCE_ROLES` (müşteri adına satış/rezervasyon yapıp cüzdanı negatife itebilen masa rolleri — `admin`/`manager`/`owner`/`super_admin`/`front_desk`/`receptionist`) ve tolerant `isStaffNegativeBalanceRole(role)` (lower-case + dash/space→underscore normalize). **`front_desk` ve `receptionist` aynı masa rolünün iki adıdır ve listede her zaman birlikte bulunmalıdır** (migration 261 `Recepsion`→`receptionist`; `front_desk` legacy kod-seviye alias). Not: `bookings.js`/`rentals.js` bu listenin kendi varyantlarını tutar (ek olarak `instructor`'a da izin verirler).

---

## Frontend

`src/features/authentication/` sayfaları: `pages/Login.jsx`, `pages/RegisterPage.jsx` (+ `components/RegisterModal.jsx`), `pages/ResetPassword.jsx`, `pages/VerifyEmail.jsx`, `pages/UserProfilePage.jsx`, `components/ForgotPasswordModal.jsx`.

`src/shared/contexts/AuthContext.jsx` — uygulamanın oturum beyni:

- `login`/`logout`/`refreshUser`/`refreshToken`, `silentRefresh` (kiosk'u 401 öncesi yeniler, hata olsa bile **logout etmez**), `scheduleRefresh` (token ömrünün ~%60'ında proaktif yenileme + exponential backoff + generation guard).
- `preservePermissions` — yenileme yanıtı `permissions` taşımıyorsa eldekini korur (custom rol bounce'unu önler).
- Focus/visibility/online/`storage` olaylarıyla uyanışta yenileme; başka sekmenin bastığı token'ı adopt eder.
- `useAuth` hook'u (`src/shared/hooks/useAuth.js`) context'e erişim sağlar.

`src/shared/utils/roleUtils.js` — `ROLES` sabitleri, `ROLE_HIERARCHY`, `getRoleLevel`, `hasPermission(userRole, allowedRoles)` (case-insensitive), `isShopStaff`, `getPermissionsForRole` (UI yetenek bayrakları). `PAY_AT_CENTER_ALLOWED_ROLES`.

`src/routes/AppRoutes.jsx` — `ProtectedRoute({ allowedRoles, staffOnly, requiredPermissions })`: önce `isAuthenticated`, sonra rol eşleşmesi, sonra **custom rol** için `user.permissions` üzerinden `requiredPermissions.some(...)` / türetilmiş (`system:admin`, `settings:read`/`finances:read`, vb.) kontrol. `isStaffRole` ve `BUILT_IN_ROLES` burada (modül seviyesinde) tanımlıdır. `src/shared/config/featureFlags.js` `studentPortal` ve `publicShopEnabled` bayraklarını sağlar.

---

## Veri Modeli

- **`users`** — `role_id` (FK→roles), `email`, `password_hash`, `email_verified` (migration 242 öncesi kullanıcılar grandfathered=true), `account_locked`/`account_locked_at`/`failed_login_attempts`, `account_expired_at`, `two_factor_enabled`/`two_factor_secret`/`two_factor_backup_codes`, `last_login_at`/`last_login_ip`, `deleted_at` (soft-delete).
- **`roles`** — `id`, `name` (benzersiz, case-insensitive), `description`, **`permissions` JSONB** (örn. `{"bookings:read": true, "users:*": true, "*": true}`).
- **`refresh_tokens`** — `user_id`, `family_id`, `token_hash` (SHA-256), `expires_at`, `rotated_at`, `revoked_at`, `replaced_by`, `user_agent`, `ip`.
- **`security_audit`** — `user_id`, `action`, `ip_address`, `user_agent`, `details` (JSON) — tüm login/logout/2FA/parola olayları.

> Not: oturum iptal markerı bir DB tablosu değil, Redis anahtarıdır (`session_revoked_after:<uid>`); blacklist da Redis'tedir (`blacklist:<jti>`).

---

## Akış / İş Mantığı

**Standart login:** `GET /csrf` → `POST /login` → parola `bcrypt.compare` → (2FA yoksa) `completeLogin`: access JWT (`{id,email,role,jti}`) + httpOnly `plannivo_auth` cookie + rotasyonlu refresh cookie + `csrf_token` cookie. Frontend token'ı `localStorage` + `apiClient`'a yazar.

**2FA login:** `/login` `requires2FA:true` + 10dk'lık `temp2fa` token döner → `/verify-2fa` TOTP veya backup kod doğrular → nihai JWT.

**Sessiz yenileme (kiosk):** AuthContext zamanlayıcı `silentRefresh` → `authService.refreshToken()` → (cookie-temelli) `/refresh-session` refresh cookie'sini rotate eder, taze rollü yeni access JWT verir.

**Rol değişimi:** admin `PATCH /roles/:id/assign` → `invalidateUserSessions` → Redis marker + refresh iptali → kullanıcının eski JWT'si `authenticateJWT`'de `iat < revokedAfter` ile reddedilir → frontend `/refresh-session` ile yeni rolü alır ya da yeniden login olur.

**Yetki kararı:** `authorizeRoles` rol adı eşleşmezse JSONB izinlere düşer; `ProtectedRoute` aynı mantığı istemcide uygular.

---

## Dikkat / Tuzaklar

- **Refresh strips permissions bug:** Token yenileme yanıtı `permissions`'ı atlarsa custom roller (örn. receptionist) her sessiz yenilemede gated sayfalardan atılırdı. İki uçtan düzeltildi: backend `/refresh-token` + `/refresh-session` `permissions`'ı dahil eder; frontend `preservePermissions` eldekini korur.
- **JWT'ye gömülü rol:** Rol login'de token'a yazılır; `authorizeRoles` token'ın rolüne güvenir. Bu yüzden rol değişiminde Redis marker olmadan eski rol token süresince kalır ve role-gated rotalarda 403'e yol açar.
- **Custom rol nav körlüğü:** Sidebar/route guard'ları çoğunlukla **rol-adı** temellidir; özel rollerin JSONB izinlerini görmesi için `ProtectedRoute` özel `requiredPermissions` ve türetilmiş kontroller içerir — ama `DataContext.canLoad*` bayrakları hâlâ rol-adı temelli ve custom rollere kördür.
- **`receptionist`/`front_desk` alias'ları:** Personel rol listelerinde her iki alias da bulunmalı; biri eksikse o rol gated davranışın dışında kalır.
- **`email_verified` login bloğu:** `users.email_verified = false` ise login **403 `EMAIL_NOT_VERIFIED`** döner. Migration 242 öncesi hesaplar verified sayılır; admin-eli oluşturulmuş eski hesaplar prod'da backfill ister.
- **CSRF public route exemption:** Anonim POST uçları `CSRF_EXEMPT_PREFIXES`'te (security.js) olmalı, aksi halde 403 alır. Yeni public POST eklerken bu listeyi güncelle.
- **Email case-sensitivity:** Login `LOWER()=LOWER()` ile eşleşir; `register`/`users.js` e-postayı `LOWER` saklar. JS'de ekstra `toLowerCase()` yapma — Türkçe karakterlerde Postgres ile sapar.
- **DB outage'da `/me` 503 döner** — bayat token verisine güvenmez (SEC-010); frontend bunu network-error gibi ele alıp localStorage'a düşmemeli.
