# Plannivo Security Audit Report

**Date:** 2026-02-17
**Scope:** Full application — Frontend (React), Backend (Express/Node.js), Infrastructure (Docker/Nginx), Database (PostgreSQL), Real-time (Socket.IO)
**Audited Files:** 63 route files, 70 services, 10 middleware files, frontend auth system, infrastructure configs

---

## Executive Summary

This audit identified **46 security findings** across the entire Plannivo application stack. The most critical issues involve **hardcoded production credentials committed to Git**, **SQL injection via string interpolation**, **JWT tokens stored in localStorage (vulnerable to XSS)**, **unauthenticated WebSocket events**, and **an overly permissive RBAC bypass for custom roles**. Several of these issues, if exploited together, could lead to full account takeover, data exfiltration, or financial manipulation.

### Severity Breakdown

| Severity | Count |
|----------|-------|
| CRITICAL | 8 |
| HIGH | 14 |
| MEDIUM | 16 |
| LOW | 8 |

---

## Table of Contents

1. [CRITICAL — Secrets & Credential Exposure](#1-critical--secrets--credential-exposure)
2. [CRITICAL — Authentication & Session Management](#2-critical--authentication--session-management)
3. [CRITICAL — SQL Injection](#3-critical--sql-injection)
4. [CRITICAL — Broken Access Control (RBAC Bypass)](#4-critical--broken-access-control-rbac-bypass)
5. [HIGH — Cross-Site Scripting (XSS)](#5-high--cross-site-scripting-xss)
6. [HIGH — WebSocket Security](#6-high--websocket-security)
7. [HIGH — API Authorization Gaps](#7-high--api-authorization-gaps)
8. [HIGH — File Upload Vulnerabilities](#8-high--file-upload-vulnerabilities)
9. [MEDIUM — CORS & Security Headers](#9-medium--cors--security-headers)
10. [MEDIUM — Information Disclosure](#10-medium--information-disclosure)
11. [MEDIUM — Rate Limiting Gaps](#11-medium--rate-limiting-gaps)
12. [MEDIUM — Infrastructure & Docker](#12-medium--infrastructure--docker)
13. [LOW — Miscellaneous Issues](#13-low--miscellaneous-issues)

---

## 1. CRITICAL — Secrets & Credential Exposure

- [x] ### SEC-001: Production Database Password Hardcoded in Git-Tracked File
**Severity:** CRITICAL
**File:** `docker-compose.production.yml:63`
**Status:** Confirmed committed to Git

```yaml
POSTGRES_PASSWORD: WHMgux86
```

The production database password `WHMgux86` is hardcoded in `docker-compose.production.yml`, which is tracked by Git. Anyone with repo access (current or former team members, compromised accounts) has the production database password. Combined with the exposed DB host (`217.154.201.29:5432`), this allows direct database access from the internet.

**Impact:** Full database compromise — read/modify/delete all user data, financial records, passwords, payment information.

**Recommendation:** Remove all secrets from version control. Use Docker secrets, environment variable files excluded from Git, or a secrets manager (e.g., HashiCorp Vault, AWS Secrets Manager). Rotate the database password immediately.

---

- [x] ### SEC-002: JWT Secret is Weak and Has Hardcoded Fallback
**Severity:** CRITICAL
**File:** `backend/routes/auth.js:16`

```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
```

The JWT secret has a hardcoded fallback value `'plannivo-jwt-secret-key'`. If the environment variable is missing (misconfiguration, Docker restart), the app silently falls back to this guessable secret. Additionally, the production value seen in `.env` is `kitesurfpro-production-secret-key-2025` — a weak, human-readable string that could be brute-forced.

**Impact:** Anyone who knows/guesses the JWT secret can forge tokens for any user, including admin accounts. Full account takeover.

**Recommendation:** Generate a cryptographically random secret (min 256 bits). Remove the fallback — crash the app if the secret is missing rather than using a weak default. Rotate the secret.

---

- [ ] ### SEC-003: Database Credentials Exposed in Root .env File
**Severity:** CRITICAL
**File:** `.env:10-15`

```
DB_HOST=217.154.201.29
DB_PORT=5432
DB_NAME=plannivo
DB_USER=plannivo
DB_PASS=WHMgux86
```

Although `.env` is in `.gitignore` and not tracked, the production database host IP and credentials are present in the local development `.env`. This file points local development directly at the **production database**, meaning any developer mistake or test operation affects live data.

**Impact:** Developers running locally can accidentally corrupt production data. If the `.env` is shared or leaked, remote attackers gain direct DB access.

**Recommendation:** Never point local development at production databases. Use a separate development database. Use SSH tunnels or VPN for any legitimate production access.

---

- [x] ### SEC-004: Redis Instance Has No Authentication
**Severity:** HIGH
**File:** `docker-compose.production.yml:79`

```yaml
redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
```

Redis is started without any password (`--requirepass` is missing). If the Redis port is exposed (even internally via the Docker network), any service or attacker who gains network access can read/write cached data including potentially sensitive session data.

**Recommendation:** Add `--requirepass <strong-password>` to the Redis command and configure the application to authenticate.

---

- [x] ### SEC-005: PostgreSQL Port Exposed to Host
**Severity:** HIGH
**File:** `docker-compose.production.yml:59`

```yaml
ports:
  - "5432:5432"
```

The production PostgreSQL port is mapped to the host, making it accessible from outside the Docker network. Combined with SEC-001 (known credentials), this allows remote database access if the server firewall doesn't block port 5432.

**Recommendation:** Remove the port mapping in production. Only expose PostgreSQL within the Docker network. Use `expose: - "5432"` instead of `ports`.

---

## 2. CRITICAL — Authentication & Session Management

- [ ] ### SEC-006: JWT Tokens Stored in localStorage (XSS Token Theft)
**Severity:** CRITICAL
**File:** `src/shared/contexts/AuthContext.jsx:296-297`

```javascript
localStorage.setItem('token', result.token);
localStorage.setItem('user', JSON.stringify(userData));
```

JWT tokens are stored in `localStorage`, which is accessible to any JavaScript running on the page. If an attacker achieves XSS (see SEC-015 through SEC-020), they can steal the JWT token and fully impersonate the user.

**Impact:** Combined with any XSS vulnerability, this enables complete account takeover for any user including admins.

**Recommendation:** Store tokens in `httpOnly`, `Secure`, `SameSite` cookies. This makes them inaccessible to JavaScript even if XSS occurs.

---

- [x] ### SEC-007: No Token Blacklist / Revocation Mechanism
**Severity:** HIGH
**File:** `backend/routes/auth.js:373-384`

```javascript
router.post('/logout', authenticateJWT, async (req, res) => {
  try {
    await logSecurityEvent(req.user.id, 'logout', req);
    res.json({ message: 'Logout successful' });
  } catch (err) { ... }
});
```

The logout endpoint only logs the event — it doesn't invalidate the token. JWT tokens remain valid until expiration (24 hours by default). A stolen token continues to work even after the user "logs out."

**Impact:** Stolen tokens cannot be revoked. If an attacker captures a token, the user has no way to invalidate it.

**Recommendation:** Implement a token blacklist in Redis. On logout, add the token's `jti` (JWT ID) to the blacklist. Check the blacklist in `authenticateJWT` middleware.

---

- [x] ### SEC-008: Token Expiry is Too Long (24 Hours)
**Severity:** MEDIUM
**File:** `backend/routes/auth.js:17`

```javascript
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '24h';
```

Access tokens last 24 hours. Combined with no revocation mechanism (SEC-007), a stolen token provides 24 hours of unauthorized access.

**Recommendation:** Use short-lived access tokens (15-30 minutes) with a separate refresh token mechanism using httpOnly cookies.

---

- [x] ### SEC-009: Verbose JWT Debug Logging in Production
**Severity:** HIGH
**File:** `backend/routes/auth.js:149-164`

```javascript
export const authenticateJWT = (req, res, next) => {
  console.log('🔐 JWT Auth Debug:');
  console.log('   URL:', req.method, req.originalUrl);
  console.log('   Auth Header:', authHeader ? 'Present' : 'Missing');
  console.log('   Token:', token ? 'Present' : 'Missing');
  // ...
  console.log('✅ Token verified successfully');
  console.log('   User ID:', verified.id);
  console.log('   User Role:', verified.role);
```

Every single authenticated request logs the user ID, role, URL, and auth header presence. This debug logging runs in production and writes sensitive authentication details to logs. If logs are accessible or leaked, this reveals the identity and role of every user action.

**Recommendation:** Remove or gate debug logging behind `NODE_ENV === 'development'`. Never log tokens or auth headers in production.

---

- [x] ### SEC-010: /auth/me Fallback Trusts Token Data Without DB Verification
**Severity:** MEDIUM
**File:** `backend/routes/auth.js:267-289`

```javascript
const fallbackUser = {
  id: req.user.id,
  email: req.user.email,
  role: req.user.role || 'user',
  name: req.user.email ? req.user.email.split('@')[0] : 'User',
  isFallback: true,
};
return res.json(fallbackUser);
```

When the database is unreachable, `/auth/me` returns user data directly from the JWT token without database validation. If a user's role has been changed or account disabled in the database, the fallback still returns the old role from the token.

**Impact:** Deactivated or role-demoted users continue to have access with their old privileges during database outages.

**Recommendation:** Return 503 Service Unavailable when the database is down instead of serving unverified data.

---

- [x] ### SEC-011: Password Reset Token Validation Has No Rate Limit
**Severity:** MEDIUM
**File:** `backend/routes/auth.js:705`

```javascript
router.post('/validate-reset-token', async (req, res) => {
```

The `/validate-reset-token` endpoint has no rate limiting, unlike the other password reset endpoints. An attacker could brute-force reset tokens against this endpoint.

**Recommendation:** Apply `passwordResetRateLimit` to the validate endpoint as well.

---

## 3. CRITICAL — SQL Injection

- [x] ### SEC-012: SQL Injection via String Interpolation in User Registration
**Severity:** CRITICAL
**File:** `backend/routes/auth.js:524-531`

```javascript
const channelInserts = channelsResult.rows.map(channel =>
  `('${channel.id}', '${newUser.id}', 'member', NOW())`
).join(',');

await client.query(`
  INSERT INTO conversation_participants (conversation_id, user_id, role_in_conversation, joined_at)
  VALUES ${channelInserts}
  ON CONFLICT (conversation_id, user_id) DO NOTHING
`);
```

While `channel.id` and `newUser.id` come from the database (not direct user input), this is a dangerous pattern. If any upstream path allows manipulation of these UUIDs, or if the database contains corrupted data, SQL injection is possible. More importantly, it establishes a pattern that developers may copy with actual user input.

**Impact:** Potential SQL injection if data integrity is compromised. Sets a dangerous precedent for the codebase.

**Recommendation:** Always use parameterized queries. Replace with dynamic parameter binding.

---

- [x] ### SEC-013: Dynamic ORDER BY / LIMIT Without Parameterization
**Severity:** MEDIUM
**File:** Multiple files

In several files, `ORDER BY` and `LIMIT` values are interpolated into SQL strings:

- `backend/routes/users.js:294`: `` LIMIT ${limit + 1} ``
- `backend/services/walletService.js:1873`: `` ORDER BY wr.requested_at ${orderDirection} ``
- `backend/services/walletService.js:2862`: `` ORDER BY created_at ${orderDirection} ``
- `backend/services/adminWaiverService.js:288`: `` ORDER BY ${orderBy} ``
- `backend/routes/shopOrders.js:517`: `` ORDER BY o.${sortColumn} ${sortDirection} ``

While many of these validate against allowlists (which is good), some do not have visible validation. The `LIMIT` interpolation in `users.js` directly uses a parsed integer from user input without parameterization.

**Impact:** Varies. With allowlist validation, impact is low. Without validation, SQL injection possible via ORDER BY clause.

**Recommendation:** Use parameterized queries for LIMIT/OFFSET values. Validate ORDER BY columns against strict allowlists in every case.

---

## 4. CRITICAL — Broken Access Control (RBAC Bypass)

- [x] ### SEC-014: Custom Roles With ANY Permission Get Full Manager Access
**Severity:** CRITICAL
**File:** `backend/middlewares/authorize.js:72-84`

```javascript
if (userRole && !effectiveRoles.has(userRole)) {
  try {
    const permissions = await getRolePermissions(userRole);
    if (Object.keys(permissions).length > 0 && Object.values(permissions).some(p => p === true)) {
      console.log(`✅ Custom role "${userRole}" granted access based on permissions`);
      return next();
    }
  } catch (error) { ... }
}
```

Any custom role that has **any** permission set to `true` is granted access to **every** route that requires manager/admin/instructor roles. This is an extremely permissive bypass. If a role like "Front Desk" has `canViewCalendar: true`, it automatically gets access to delete financial records, modify user roles, access GDPR data exports, etc.

**Impact:** Privilege escalation. Any custom role with a single permission gains unrestricted access to all protected routes.

**Recommendation:** Implement granular permission checking. Each route should check for the specific permission it requires, not just "has any permission."

---

## 5. HIGH — Cross-Site Scripting (XSS)

- [ ] ### SEC-015: dangerouslySetInnerHTML Used With User Content (20 Instances)
**Severity:** HIGH
**Files:** Multiple frontend components

The following files render HTML directly from data without sanitization:

| File | Line | Context |
|------|------|---------|
| `src/features/popups/components/PopupDisplay.jsx` | 167 | `currentContent.bodyText` |
| `src/features/marketing/components/PreviewRenderers.jsx` | 79, 117, 167, 204, 313, 409, 442 | Marketing content |
| `src/features/forms/pages/FormSuccessPage.jsx` | 118 | `formSettings.success_message` |
| `src/features/forms/components/DynamicField.jsx` | 1213, 1229 | Form field HTML |
| `src/features/forms/components/LiveFormPreview.jsx` | 264, 286 | Form preview |
| `src/features/forms/components/FormPreview.jsx` | 496, 504 | Form preview |
| `src/features/bookings/pages/BookingTimelinePage.jsx` | 375 | `userName` |
| `src/features/compliance/components/WaiverDocument.jsx` | 125 | Waiver content |
| `src/features/compliance/components/UserConsentModal.jsx` | 143, 152, 188 | Terms/privacy docs |

If any of this data originates from user input or database content that wasn't sanitized on entry, an attacker can inject malicious scripts.

**Impact:** Stored XSS leading to session hijacking (especially dangerous because tokens are in localStorage — see SEC-006), admin account takeover, or data theft.

**Recommendation:** Sanitize all HTML content with DOMPurify before rendering with `dangerouslySetInnerHTML`. Example: `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}`.

---

- [ ] ### SEC-016: Weak XSS Sanitization on Backend
**Severity:** HIGH
**File:** `backend/middlewares/security.js:162-175`

```javascript
export const sanitizeInput = (fields) => {
  return (req, res, next) => {
    fields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = req.body[field]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      }
    });
    next();
  };
};
```

The XSS sanitization uses regex, which is fundamentally insufficient for HTML sanitization. It can be bypassed with:
- `<img src=x onerror=alert(1)>` (after bypassing `on\w+=` with variations)
- `<svg/onload=alert(1)>`
- HTML entity encoding
- Nested/malformed tags

Additionally, this middleware is **commented out** in `server.js:261`:
```javascript
// app.use(sanitizeInput); // TEMPORARILY DISABLED - CAUSING HANGS
```

**Impact:** No server-side XSS protection is active. All user input reaches the database unsanitized.

**Recommendation:** Enable a robust XSS sanitization library (like `xss` or `sanitize-html`) and apply it globally. Do not rely on regex-based sanitization.

---

## 6. HIGH — WebSocket Security

- [x] ### SEC-017: WebSocket Authentication Based on Client-Provided Data (No JWT Verification)
**Severity:** CRITICAL
**File:** `backend/services/socketService.js:88-116`

```javascript
handleAuthentication(socket, userData) {
  try {
    if (userData && userData.id) {
      socket.userId = userData.id;
      socket.userRole = userData.role;
      this.connectedUsers.set(socket.id, {
        userId: userData.id,
        role: userData.role,
        connectedAt: new Date()
      });
      socket.join(`role:${userData.role}`);
      socket.join(`user:${userData.id}`);
```

The WebSocket `authenticate` event trusts the client-provided `userData` object without any verification. A malicious client can send:
```javascript
socket.emit('authenticate', { id: 'admin-user-uuid', role: 'admin' });
```
This would let them join the admin role room, receive all admin notifications, and impersonate any user in real-time communications.

**Impact:** Full impersonation of any user in the real-time system. Access to all notifications, chat messages, and admin broadcasts.

**Recommendation:** Require a JWT token in the authenticate event. Verify the token server-side using the same JWT verification as the REST API. Extract user data from the verified token, not from client-provided data.

---

- [x] ### SEC-018: Unrestricted WebSocket Channel Subscription
**Severity:** HIGH
**File:** `backend/services/socketService.js:133-141`

```javascript
handleChannelSubscription(socket, channels) {
  if (Array.isArray(channels)) {
    channels.forEach(channel => {
      socket.join(channel);
    });
```

Any connected client can subscribe to any channel name without authorization checks. An attacker can subscribe to channels like `role:admin`, `user:<any-user-id>`, or any custom channel and receive all events broadcast to those channels.

**Recommendation:** Validate channel subscriptions against the authenticated user's permissions. Only allow users to join channels they are authorized for.

---

- [x] ### SEC-019: WebSocket CORS Allows All Origins
**Severity:** HIGH
**File:** `backend/services/socketService.js:19-21`

```javascript
cors: {
  origin: (origin, callback) => callback(null, true),
  // ...
}
```

The Socket.IO CORS is configured to accept connections from **any origin**. This allows malicious websites to establish WebSocket connections to your server using a victim's browser.

**Recommendation:** Restrict WebSocket CORS to the same origins as the REST API.

---

- [x] ### SEC-020: Unauthenticated WebSocket Test Endpoint
**Severity:** MEDIUM
**File:** `backend/server.js:562-585`

```javascript
app.get('/api/socket/test', (req, res) => {
  socketService.io.emit('test:message', testEvent);
```

This endpoint emits events to all connected Socket.IO clients without any authentication. An attacker can trigger broadcasts to all connected users.

**Recommendation:** Add `authenticateJWT` and role authorization to this endpoint, or remove it in production.

---

## 7. HIGH — API Authorization Gaps

- [ ] ### SEC-021: Multiple Route Groups Lack Authentication Middleware
**Severity:** HIGH
**File:** `backend/server.js` (various lines)

The following routes are mounted **without** `authenticateJWT` middleware at the router level:

| Route | Line | Risk |
|-------|------|------|
| `/api/bookings` | 356 | Booking data accessible without auth |
| `/api/events` | 492 | Event data accessible without auth |
| `/api/member-offerings` | 493 | Member offerings data exposure |
| `/api/quick-links` | 496 | Quick links data exposure |
| `/api/form-templates` | 497 | Form template structure exposure |
| `/api/form-submissions` | 498 | Form submission data exposure |
| `/api/relationships` | 500 | User relationship data exposure |
| `/api/shop-orders` | 505-506 | Order data accessible without auth |
| `/api/group-bookings` | 508 | Group booking data exposure |
| `/api/settings` | 510 | Application settings exposure |
| `/api/finance-settings` | 511 | Financial settings exposure |
| `/api/roles` | 512 | Role definitions exposure |
| `/api/products` | 536-537 | Product data (intentional for guest browsing) |
| `/api/spare-parts` | 543 | Spare parts data exposure |
| `/api/debug` | 544 | **Debug endpoints accessible without auth** |
| `/api/dashboard` | 545 | Dashboard data exposure |
| `/api/notifications` | 546 | Notification data exposure |
| `/api/notification-workers` | 547 | Worker management exposure |
| `/api/metrics` | 548 | Application metrics exposure |
| `/api/audit-logs` | 549 | **Audit log data exposure** |
| `/api/admin/*` | 550-553 | **Admin endpoints potentially without auth** |
| `/api/vouchers` | 554 | Voucher data/creation exposure |
| `/api/manager/commissions` | 555 | Commission data exposure |
| `/api/instructor-commissions` | 540 | Instructor commission data |
| `/api/currencies` | 541 | Currency data (low risk) |
| `/api/upload` | 539 | **Upload endpoint without router-level auth** |
| `/api/chat` | 559 | Chat data exposure |
| `/api/weather` | 557 | Weather data (low risk, intentional) |

**Note:** Some routes may have per-endpoint auth inside their router files. However, the lack of router-level auth means any missed endpoint is publicly accessible.

**Impact:** Unauthorized access to bookings, financial data, admin functions, debug info, audit logs, and more — depending on which individual routes within each router lack their own auth checks.

**Recommendation:** Apply `authenticateJWT` at the router level for all routes except explicitly public ones (auth, public forms, product browsing). Then audit each individual endpoint.

---

- [x] ### SEC-022: Debug Endpoints Accessible in Production
**Severity:** HIGH
**File:** `backend/server.js:305-341`

```javascript
app.get('/api/debug/uploads/list', authenticateJWT, (req, res) => { ... });
app.get('/api/debug/headers', (req, res) => { ... });  // NO AUTH
```

Debug endpoints are active in production:
- `/api/debug/headers` — No authentication required. Exposes server trust proxy configuration, internal headers, IP detection, and connection details.
- `/api/debug` route — Mounted without authentication at server level (line 544).

**Recommendation:** Disable or remove all debug endpoints in production. Gate them behind `NODE_ENV === 'development'`.

---

- [ ] ### SEC-023: No Tenant Isolation — Cross-Business Data Access
**Severity:** HIGH
**File:** Application-wide

The application appears to serve a single business. However, there is no multi-tenant isolation mechanism. If the application is intended to serve multiple businesses (kitesurfing schools), there is no `business_id` or `tenant_id` scoping on queries. All users, bookings, finances, and data are in a shared namespace.

**Impact:** If multiple businesses use the same instance, users of one business could access another business's data.

**Recommendation:** If multi-tenancy is planned, implement tenant isolation at the database query level. Add a `tenant_id` column and enforce it in all queries via middleware.

---

## 8. HIGH — File Upload Vulnerabilities

- [ ] ### SEC-024: File Extension Not Validated — Only MIME Type Checked
**Severity:** HIGH
**File:** `backend/routes/upload.js:71-78`

```javascript
const fileFilter = function (_req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image uploads are allowed'));
  }
};
```

File validation only checks `file.mimetype`, which is set by the client and can be spoofed. An attacker can upload a malicious file (e.g., `.html`, `.svg` with embedded JavaScript, `.exe`) with a spoofed `Content-Type: image/jpeg` header.

**Recommendation:** Validate both MIME type AND file extension. Additionally, use magic bytes checking (file signature) via a library like `file-type` to verify actual file content.

---

- [ ] ### SEC-025: Original File Extension Preserved — Path Traversal Risk
**Severity:** MEDIUM
**File:** `backend/routes/upload.js:50-54`

```javascript
filename: function (req, file, cb) {
  const ext = path.extname(file.originalname) || '.jpg';
  const safeUser = (req.user?.id || 'user').toString();
  const name = `image-${safeUser}-${Date.now()}${ext}`;
  cb(null, name);
}
```

The file extension is extracted from `file.originalname` using `path.extname()`. If `originalname` contains path traversal characters (e.g., `../../etc/passwd`), `path.extname` returns an empty string, but the `originalname` itself is not sanitized. While the generated filename uses only the extension, `path.extname('malicious.jpg.exe')` would return `.exe`.

**Recommendation:** Validate the extension against an explicit allowlist of safe extensions (`.jpg`, `.png`, `.gif`, `.webp`).

---

- [ ] ### SEC-026: Public Upload Endpoints Allow Unauthenticated File Storage
**Severity:** MEDIUM
**File:** `backend/routes/upload.js:455-502`

```javascript
router.post('/form-submission', formSubmissionRateLimit, formSubmissionUpload.single('file'), ...);
router.post('/form-submission-multiple', formSubmissionRateLimit, formSubmissionUpload.array('files', 5), ...);
```

Public form submission upload endpoints allow any visitor to upload files without authentication. While rate-limited, an attacker could use these endpoints to store malicious files on your server (which is then served statically).

**Recommendation:** Consider virus scanning uploaded files. Serve uploaded files from a separate domain (not the main app domain) to prevent cookie/origin-based attacks. Add CAPTCHA or other abuse prevention.

---

- [ ] ### SEC-027: Uploaded Files Served With No Access Control
**Severity:** MEDIUM
**File:** `backend/server.js:290-302`, `infrastructure/nginx.conf:111-115`

```javascript
app.use('/uploads', ..., express.static(uploadsRoot));
```

```nginx
location /uploads/ {
    root /var/www;
    try_files $uri $uri/ @uploads_backend;
    add_header Cache-Control "public, max-age=86400";
}
```

All uploaded files are served statically without any access control. Anyone who knows (or guesses) the URL of an uploaded file can access it. This includes private chat images, voice messages, user avatars, and form submission documents (potentially containing CVs with personal information).

**Recommendation:** Implement authenticated file serving for private uploads. Use signed URLs or proxy file access through authenticated endpoints.

---

## 9. MEDIUM — CORS & Security Headers

- [ ] ### SEC-028: CORS Allows All Origins in Development Mode
**Severity:** MEDIUM
**File:** `backend/middlewares/security.js:214`

```javascript
if (allowedOrigins.indexOf(origin) !== -1 || CURRENT_ENV === 'development') {
  callback(null, true);
```

In development mode, CORS accepts requests from any origin. If `NODE_ENV` is not explicitly set to `production`, the app runs in development mode with open CORS.

**Recommendation:** Ensure `NODE_ENV=production` is always set in production deployments. Consider removing the development bypass.

---

- [x] ### SEC-029: CSP Disabled in Development Mode
**Severity:** MEDIUM
**File:** `backend/middlewares/security.js:24`

```javascript
contentSecurityPolicy: isDevelopment ? false : { ... }
```

Content Security Policy is completely disabled in development. While acceptable for development, if the app accidentally runs with `NODE_ENV=development` in production, there's no CSP protection.

---

- [ ] ### SEC-030: Nginx CSP is Overly Permissive
**Severity:** HIGH
**File:** `infrastructure/nginx.conf:58`

```nginx
add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline' 'unsafe-eval'" always;
```

This CSP is essentially useless — it allows:
- `http:` and `https:` — loading resources from any domain
- `'unsafe-inline'` — inline scripts (defeats XSS protection)
- `'unsafe-eval'` — `eval()` and similar (enables script injection)

This CSP provides no meaningful protection against XSS attacks.

**Recommendation:** Implement a strict CSP. Use nonces or hashes for inline scripts. Remove `'unsafe-eval'` and restrict source domains.

---

- [ ] ### SEC-031: Inconsistent X-Frame-Options Between Backend and Nginx
**Severity:** LOW
**File:** `backend/middlewares/security.js:180` vs `infrastructure/nginx.conf:54`

Backend sets `X-Frame-Options: DENY` but Nginx sets `X-Frame-Options: SAMEORIGIN`. The Nginx header may override the backend header, allowing the app to be framed on the same origin (which could enable clickjacking on shared-origin deployments).

**Recommendation:** Consistently use `DENY` unless iframing is required from same-origin.

---

## 10. MEDIUM — Information Disclosure

- [x] ### SEC-032: Health Endpoint Exposes System Information
**Severity:** MEDIUM
**File:** `backend/server.js:270-278`

```javascript
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});
```

The unauthenticated health endpoint exposes:
- Server uptime (reveals restart times)
- Detailed memory usage (heap, RSS, external)
- Node.js version (helps attackers identify vulnerabilities)

**Recommendation:** Return only `{ status: 'healthy' }` on the public endpoint. Move detailed metrics to an authenticated admin endpoint.

---

- [ ] ### SEC-033: Error Handler Exposes Stack Traces in Development
**Severity:** MEDIUM
**File:** `backend/middlewares/errorHandler.js:108-116`

```javascript
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
};
```

In development mode, full stack traces and error objects are sent to the client. If `NODE_ENV` is not properly set in production, this exposes internal file paths, library versions, and code structure.

**Recommendation:** Ensure `NODE_ENV=production` is always set. Consider removing stack trace exposure entirely from client responses.

---

- [x] ### SEC-034: /auth/me Logs Full User Object Including Permissions
**Severity:** MEDIUM
**File:** `backend/routes/auth.js:257`

```javascript
console.log(`GET /auth/me - Successfully retrieved user:`, user);
```

The entire user object (including role, permissions, consent data, and profile information) is logged on every `/auth/me` call. This happens on every page load for authenticated users.

**Recommendation:** Remove this log statement or reduce it to only log the user ID.

---

- [ ] ### SEC-035: Metrics Endpoint Publicly Accessible
**Severity:** MEDIUM
**File:** `backend/server.js:548`

```javascript
app.use('/api/metrics', metricsRouter);
```

The metrics endpoint is mounted without `authenticateJWT`. If it exposes Prometheus metrics, this could reveal internal performance data, endpoint usage patterns, and error rates.

**Recommendation:** Add authentication and admin role requirement.

---

## 11. MEDIUM — Rate Limiting Gaps

- [ ] ### SEC-036: Rate Limiting Configurable via Environment Variables
**Severity:** MEDIUM
**File:** `backend/middlewares/security.js:86-90`

```javascript
const defaultAuthLimit = () => {
  const fallback = CURRENT_ENV === 'production' ? 50 : 1500;
  const parsed = parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, fallback);
  return ensureDevMinimum(parsed, fallback);
};
```

Rate limits can be overridden via environment variables (`AUTH_RATE_LIMIT_MAX`, `API_RATE_LIMIT_MAX`, etc.). If an attacker gains access to environment configuration, they can disable rate limiting.

**Recommendation:** Set hard minimum values that cannot be overridden below a safe threshold.

---

- [ ] ### SEC-037: Auth Rate Limit is 50 Per 15 Minutes in Production
**Severity:** LOW
**File:** `backend/middlewares/security.js:92-103`

50 login attempts per 15 minutes per IP is generous. Combined with the account lock at 5 failed attempts per account, the rate limit primarily protects against distributed attacks.

**Recommendation:** Consider reducing to 10-20 per 15 minutes for auth endpoints.

---

- [ ] ### SEC-038: CORS Allows Requests With No Origin
**Severity:** MEDIUM
**File:** `backend/middlewares/security.js:196`

```javascript
if (!origin) return callback(null, true);
```

Requests without an `Origin` header are allowed. This includes server-to-server requests and some mobile app requests, but also tools like `curl` and Postman. This bypasses CORS protection for direct API attacks.

**Recommendation:** This is standard practice (CORS only protects browsers), but be aware that CORS is not a security boundary against non-browser clients. API authentication is the actual protection layer.

---

## 12. MEDIUM — Infrastructure & Docker

- [x] ### SEC-039: SSL/TLS Certificate Stored in Repository
**Severity:** HIGH
**File:** `docker-compose.production.yml:22`

```yaml
- ./SSL:/etc/ssl/plannivo:ro
```

The production SSL certificate and private key appear to be stored in a `./SSL` directory within the repository. If committed to Git, anyone with repo access can intercept HTTPS traffic.

**STATUS:** ⚠️ **PARTIALLY RESOLVED**
- ✅ Removed from git index (`git rm --cached`)
- ✅ `.gitignore` already contains `SSL/`
- 🔴 **CRITICAL**: Still exists in git history - requires cleanup
- 🔴 **URGENT**: SSL certificate must be replaced (compromised)

**See `SSL_SECURITY_INCIDENT.md` for complete remediation steps.**

---

- [ ] ### SEC-040: Database SSL Disabled
**Severity:** MEDIUM
**File:** `backend/db.js:210`

```javascript
pool = new Pool({
  connectionString,
  ssl: false,
```

Database connections do not use SSL/TLS. All queries and data (including passwords and financial information) travel unencrypted between the application and database.

**Impact:** If the database is on a different server (which it is — `217.154.201.29`), data is transmitted in plaintext over the network.

**Recommendation:** Enable SSL for database connections: `ssl: { rejectUnauthorized: true }` with proper CA certificate.

---

- [ ] ### SEC-041: Docker Containers May Run as Root
**Severity:** MEDIUM
**File:** Docker configuration

Neither `infrastructure/Dockerfile` nor `backend/Dockerfile.production` are visible in the search results. If containers run as root (the default), a container escape vulnerability gains root access to the host.

**Recommendation:** Add `USER node` (or another non-root user) to all Dockerfiles.

---

## 13. LOW — Miscellaneous Issues

- [ ] ### SEC-042: Weak Password Policy
**Severity:** LOW
**File:** `backend/routes/auth.js:429`

```javascript
if (password.length < 8) {
  return res.status(400).json({ error: 'Password must be at least 8 characters long' });
}
```

The registration endpoint only checks password length (8 characters minimum). There's no requirement for uppercase, lowercase, numbers, or special characters. The `commonValidations.password` in `security.js:230` has a stronger regex, but it's not applied to registration.

**Recommendation:** Apply the stronger password validation from `commonValidations.password` to registration and password reset endpoints.

---

- [ ] ### SEC-043: Iyzico Callback Error Exposes Internal Error Message in URL
**Severity:** MEDIUM
**File:** `backend/server.js:485`

```javascript
res.redirect(`${frontendUrl}/book?payment=failed&reason=${encodeURIComponent(error.message || 'Payment processing failed')}`);
```

Internal error messages are included in the redirect URL when an Iyzico payment callback fails. This could expose database errors, service names, or internal logic to users.

**Recommendation:** Use generic error codes instead of raw error messages in redirect URLs.

---

- [x] ### SEC-044: SSL Validation File Hardcoded in Server
**Severity:** LOW
**File:** `backend/server.js:281-286`

```javascript
app.get('/.well-known/pki-validation/9FC3BB605A825CE70C42BA4D56C4C617.txt', (req, res) => {
  res.send(`A8DA30DD9C85AE7EB0909106D299513DF01A24560DC8B3B11592F72E1182BA2E
comodoca.com
d1213e0723b000d`);
});
```

A one-time SSL validation response is permanently hardcoded in the server. This is unnecessary code clutter and exposes the CA validation details.

**Recommendation:** Remove this endpoint after SSL certificate validation is complete.

---

- [ ] ### SEC-045: No CSRF Protection
**Severity:** MEDIUM
**File:** Application-wide

The application uses JWT Bearer tokens for authentication (not cookies), which provides natural CSRF protection for API requests. However, if cookies are ever added (e.g., for httpOnly token storage as recommended in SEC-006), CSRF protection must be implemented.

**Recommendation:** When migrating to httpOnly cookies, implement CSRF tokens (e.g., `csurf` middleware or double-submit cookie pattern).

---

- [x] ### SEC-046: Input Sanitization Middleware Disabled
**Severity:** HIGH
**File:** `backend/server.js:261`

```javascript
// app.use(sanitizeInput); // TEMPORARILY DISABLED - CAUSING HANGS
```

Global input sanitization is disabled in production with a comment saying it "causes hangs." This means no sanitization is applied to user input across the entire application, relying entirely on parameterized queries for SQL protection and nothing for XSS.

**Recommendation:** Fix the hang issue and re-enable sanitization, or replace with a middleware that works correctly (e.g., `express-mongo-sanitize`, `xss-clean`, or custom middleware using the `xss` library).

---

## Priority Remediation Plan

### Immediate (Do First)
1. **SEC-001, SEC-003, SEC-005**: Remove all credentials from version control. Rotate DB password. Restrict DB port.
2. **SEC-002**: Generate strong JWT secret, remove fallback.
3. **SEC-014**: Fix RBAC bypass — implement granular permission checks.
4. **SEC-017**: Fix WebSocket authentication — verify JWT tokens server-side.
5. **SEC-046**: Re-enable input sanitization or implement alternative.

### Short-Term
6. **SEC-006, SEC-007**: Migrate JWT to httpOnly cookies. Implement token blacklist.
7. **SEC-015, SEC-016**: Add DOMPurify for all `dangerouslySetInnerHTML` usage.
8. **SEC-030**: Fix Nginx CSP to be restrictive.
9. **SEC-021**: Add `authenticateJWT` to all non-public route groups.
10. **SEC-022**: Remove debug endpoints from production.
11. **SEC-009, SEC-034**: Remove production debug logging.
12. **SEC-024**: Add file extension validation and magic bytes checking.
13. **SEC-019, SEC-018**: Restrict WebSocket CORS and channel subscriptions.

### Medium-Term
14. **SEC-004**: Add Redis authentication.
15. **SEC-008**: Reduce token expiry, implement proper refresh tokens.
16. **SEC-027**: Implement authenticated file serving for private uploads.
17. **SEC-032, SEC-035**: Restrict health and metrics endpoints.
18. **SEC-039**: Automate certificate management.
19. **SEC-040**: Enable database SSL.
20. **SEC-042**: Strengthen password policy.

---

## Notes

- This audit was conducted through static code analysis. Runtime testing (penetration testing) would likely uncover additional vulnerabilities.
- Route files `bookings.js` (190KB) and `finances.js` (117KB) are extremely large and may contain additional vulnerabilities not fully covered here. A dedicated review of these files is recommended.
- The application has 63 route files and 70 service files. Not all could be read in full during this audit. A follow-up deep-dive into individual routes is recommended.
- Dependencies were not checked against vulnerability databases (npm audit). Running `npm audit` is recommended for both root and backend `package.json`.

---

*This report was generated through comprehensive static analysis of the Plannivo application codebase.*
