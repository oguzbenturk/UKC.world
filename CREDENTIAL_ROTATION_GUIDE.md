# Credential Rotation Guide

**Created:** 2026-02-17  
**Status:** Required immediately - Current credentials are compromised in Git history

## Overview

This guide helps you rotate all compromised credentials that were previously hardcoded in the repository. All credentials mentioned in the Git history should be considered **publicly known** and must be rotated.

---

## � Quick Start - Generate All Credentials at Once

**NEW:** Use the automated credential generator to create all secure credentials:

```bash
# Run the credential generator
node generate-secure-credentials.js

# This will generate:
# - JWT Secret (256-bit HMAC-SHA256)
# - Database Password (256-bit, base64)
# - Redis Password (256-bit, hex)
# - Generic API keys

# Copy the output to your password manager
# Then update backend/.env.production with the new values
```

---

## �🔴 CRITICAL - Rotate Immediately

### 1. Database Password (SEC-001)

**Current Status:** ❌ Compromised  
**Current Password:** `WHMgux86`  
**Impact:** Full database access to anyone with Git history access

**Steps to Rotate:**

```bash
# 1. Generate a new strong password (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 2. Update backend/.env.production
# Replace POSTGRES_PASSWORD value with the new password
# Also update the DATABASE_URL connection string

# 3. Connect to production database and change password
# SSH into production server first
ssh root@217.154.201.29

# Then change PostgreSQL password
docker exec -it ukc.world-db-1 psql -U plannivo -d plannivo -c "ALTER USER plannivo WITH PASSWORD 'your-new-password-here';"

# 4. Update both files:
#    - backend/.env.production (POSTGRES_PASSWORD and DATABASE_URL)
#    - Keep them in sync

# 5. Restart the backend container
docker-compose -f docker-compose.production.yml restart backend

# 6. Verify the application still works
# Check logs: docker-compose -f docker-compose.production.yml logs backend
```

---

### 2. JWT Secret (SEC-002)

**Current Status:** ✅ FIXED - No longer has fallback  
**Previous Secret:** `kitesurfpro-production-secret-key-2025` (compromised)  
**Impact:** Anyone can forge authentication tokens for any user

**Steps to Rotate:**

```bash
# OPTION 1: Use the credential generator script (RECOMMENDED)
node generate-secure-credentials.js
# This will generate all secure credentials at once
# Copy the JWT_SECRET value from the output

# OPTION 2: Generate manually
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Example output: 7a9f8b3c2d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9

# 2. Update backend/.env.production
JWT_SECRET=<paste-the-generated-secret-here>

# 3. IMPORTANT: This will invalidate ALL current user sessions
#    Users will need to log in again
#    ⚠️  The app will now CRASH if JWT_SECRET is missing (by design for security)

# 4. Restart backend
docker-compose -f docker-compose.production.yml restart backend

# 5. Test login functionality
# If the backend doesn't start, check logs:
docker-compose -f docker-compose.production.yml logs backend
# Look for "FATAL: JWT_SECRET environment variable is not set"
```

---

### 3. Redis Password (SEC-004)

**Current Status:** ❌ No password set  
**Current Password:** None  
**Impact:** Anyone with network access can read/write cache data

**Steps to Add Password:**

```bash
# 1. Generate a strong password
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Update backend/.env.production
REDIS_PASSWORD=<paste-generated-password-here>

# 3. Update docker-compose.production.yml
# Uncomment the Redis password lines:
# - Line 82: command with --requirepass
# - Lines 85-86: env_file for Redis
# - Line 92: health check with password

# Full Redis service config should be:
#   redis:
#     image: redis:7-alpine
#     command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
#     env_file:
#       - ./backend/.env.production
#     volumes:
#       - redis_data:/data
#     networks:
#       - app-network
#     restart: unless-stopped
#     healthcheck:
#       test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
#       interval: 30s
#       timeout: 10s
#       retries: 3

# 4. Update backend code to use password
# File: backend/services/cacheService.js
# Ensure Redis client connects with password from process.env.REDIS_PASSWORD

# 5. Restart Redis and backend
docker-compose -f docker-compose.production.yml restart redis backend

# 6. Verify Redis connection
docker exec -it ukc.world-redis-1 redis-cli -a your-password-here ping
# Should return: PONG
```

---

## ⚠️ IMPORTANT - Follow-Up Actions

### 4. Close Database Port (SEC-005)

**Already Fixed:** ✅ Port mapping removed from docker-compose.production.yml  
**Action Required:** Verify on production

```bash
# SSH into production server
ssh root@217.154.201.29

# Check if port 5432 is exposed
netstat -tuln | grep 5432

# Should show only internal binding (127.0.0.1 or docker network)
# Should NOT show 0.0.0.0:5432

# If port 5432 is still exposed:
# 1. Pull the updated docker-compose.production.yml
# 2. Restart the database container
docker-compose -f docker-compose.production.yml up -d --force-recreate db
```

---

### 5. Verify SSL Directory Not in Git

**Already Fixed:** ✅ SSL/ added to .gitignore

```bash
# Verify SSL directory is not tracked
git status

# If SSL directory appears in git status, remove from tracking:
git rm -r --cached SSL/
git commit -m "Remove SSL certificates from Git tracking"

# Make sure .gitignore includes:
# SSL/
# *.key
# *.crt
# *.pem
```

---

### 6. Verify .env.production Not in Git

**Already Fixed:** ✅ .env.production added to .gitignore

```bash
# Verify production env file is not tracked
git status

# If backend/.env.production appears, remove from tracking:
git rm --cached backend/.env.production
git commit -m "Remove production environment file from Git tracking"
```

---

## 📝 Checklist

After rotating credentials, verify:

- [ ] Database password changed in both PostgreSQL and .env.production
- [ ] JWT secret rotated to cryptographically random value
- [ ] Redis password added and configured
- [ ] All users can still log in (after re-authentication)
- [ ] Application connects to database successfully
- [ ] Redis caching works correctly
- [ ] Port 5432 is NOT exposed on production server
- [ ] SSL/ directory is not in Git
- [ ] backend/.env.production is not in Git
- [ ] Old credentials documented in secure password manager
- [ ] New credentials documented in secure password manager
- [ ] Team members informed that they need to re-pull credentials

---

## 🔐 Password Manager Storage

Store these in your password manager:

**Entry Name:** Plannivo Production Database  
**Username:** plannivo  
**Password:** [new rotated password]  
**URL:** postgresql://217.154.201.29:5432/plannivo  
**Notes:** Rotated on [date] due to Git exposure

**Entry Name:** Plannivo JWT Secret  
**Password:** [new rotated secret]  
**Notes:** 256-bit hex secret for JWT signing

**Entry Name:** Plannivo Redis  
**Password:** [new redis password]  
**URL:** redis://217.154.201.29:6379  
**Notes:** Added on [date] - was previously unprotected

---

## 🚨 Emergency Rollback

If rotation causes issues:

```bash
# Database connection issues
docker-compose -f docker-compose.production.yml logs backend | grep -i "database\|postgres"

# JWT issues (users can't log in)
docker-compose -f docker-compose.production.yml logs backend | grep -i "jwt\|auth"

# Redis issues (caching errors)
docker-compose -f docker-compose.production.yml logs backend | grep -i "redis\|cache"

# Temporary rollback to old credentials
# (Only if absolutely necessary and for SHORT term)
# 1. Restore old values in .env.production
# 2. Restart backend: docker-compose restart backend
# 3. FIX the underlying issue
# 4. Re-attempt rotation
```

---

## Timeline

**Day 1 (Today):**
- [x] Secure current credentials in password manager
- [x] Remove hardcoded credentials from docker-compose
- [x] Add SSL/ and .env.production to .gitignore
- [ ] Rotate database password
- [ ] Rotate JWT secret
- [ ] Add Redis password

**Day 2-3:**
- [ ] Test all rotated credentials
- [ ] Monitor application logs for auth issues
- [ ] Verify no old credentials work

**Week 1:**
- [ ] Audit Git history for any other exposed secrets
- [ ] Consider rewriting Git history to purge old credentials (advanced)
- [ ] Review access logs for suspicious database access

---

**Last Updated:** 2026-02-17  
**Next Review:** After credential rotation completion
