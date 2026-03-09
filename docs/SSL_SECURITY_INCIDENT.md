# ⚠️ SSL CERTIFICATE SECURITY INCIDENT

## CRITICAL: Action Required

**Date Discovered:** February 17, 2026  
**Severity:** CRITICAL  
**Issue:** SSL/TLS private keys were committed to Git repository

---

## What Happened

The following SSL certificate files were found in Git history:
- `SSL/ca_bundle.crt` - CA Bundle
- `SSL/certificate.crt` - SSL Certificate  
- `SSL/private.key` - **PRIVATE KEY (COMPROMISED)**

These files are now removed from the git index, but **still exist in git history**. Anyone with access to the repository can retrieve the private key from old commits.

---

## Immediate Actions Required

### 1. ✅ DONE: Removed from Git Index
```bash
git rm --cached SSL/*.crt SSL/*.key
```
Files are now staged for removal. **Commit this change:**
```bash
git commit -m "security: Remove SSL certificates from git tracking"
```

### 2. 🔴 URGENT: Replace SSL Certificate

**The current SSL certificate is COMPROMISED and must be replaced immediately.**

**Options:**

#### Option A: Let's Encrypt (Recommended - Free & Automated)
```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Generate new certificate
sudo certbot certonly --webroot -w /var/www/acme-webroot -d plannivo.com -d www.plannivo.com

# Certificates will be in:
# /etc/letsencrypt/live/plannivo.com/fullchain.pem → certificate.crt
# /etc/letsencrypt/live/plannivo.com/privkey.pem → private.key
# /etc/letsencrypt/live/plannivo.com/chain.pem → ca_bundle.crt

# Copy to SSL directory (for Docker)
sudo cp /etc/letsencrypt/live/plannivo.com/fullchain.pem ./SSL/certificate.crt
sudo cp /etc/letsencrypt/live/plannivo.com/privkey.pem ./SSL/private.key
sudo cp /etc/letsencrypt/live/plannivo.com/chain.pem ./SSL/ca_bundle.crt
sudo chown $USER:$USER ./SSL/*
sudo chmod 600 ./SSL/private.key
sudo chmod 644 ./SSL/*.crt

# Restart services
docker-compose -f docker-compose.production.yml restart nginx
```

#### Option B: Commercial SSL Provider
1. Purchase new SSL certificate from your provider
2. Generate new CSR and private key
3. Replace files in `SSL/` directory (NOT in git)

### 3. 🔴 CRITICAL: Clean Git History

**⚠️ WARNING:** This rewrites git history. All team members must re-clone the repository!

**Before running these commands:**
- ✅ Notify all team members
- ✅ Backup the repository: `git clone --mirror <repo-url> backup.git`
- ✅ Ensure no one is working on the code

#### Method 1: BFG Repo-Cleaner (Recommended)
```bash
# Download BFG
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar
mv bfg-1.14.0.jar bfg.jar

# Create a fresh clone
cd ..
git clone --mirror git@github.com:YOUR-USERNAME/UKC.world.git ukc-cleaned.git
cd ukc-cleaned.git

# Remove SSL files from history
java -jar ../bfg.jar --delete-files "*.key" --delete-files "*.crt" --delete-folders SSL

# Cleanup
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (THIS REWRITES HISTORY!)
git push --force

# Team members must:
cd UKC.world
git fetch origin
git reset --hard origin/main  # or origin/master
```

#### Method 2: git-filter-repo (Alternative)
```bash
# Install git-filter-repo
pip3 install git-filter-repo

# Backup first!
cd ..
cp -r UKC.world UKC.world-backup

cd UKC.world

# Remove SSL directory from all history
git filter-repo --path SSL --invert-paths --force

# Force push
git push origin --force --all
git push origin --force --tags

# Team members must re-clone:
rm -rf UKC.world
git clone <repository-url> UKC.world
```

#### Method 3: Manual git filter-branch (Slowest but built-in)
```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch SSL/ca_bundle.crt SSL/certificate.crt SSL/private.key" \
  --prune-empty --tag-name-filter cat -- --all

git reflog expire --expire=now --all
git gc --prune=now --aggressive

git push origin --force --all
git push origin --force --tags
```

---

## Post-Cleanup Verification

After cleaning git history:

```bash
# Verify SSL files are gone from history
git log --all --pretty=format: --name-only --diff-filter=A | sort -u | grep -i ssl

# Should return nothing. If files still appear, the cleanup failed.

# Check repository size (should be smaller)
du -sh .git
```

---

## Production Deployment After SSL Replacement

After installing new SSL certificates:

```bash
# On production server (217.154.201.29)
cd /path/to/UKC.world

# Verify new certificates are in place
ls -lah SSL/

# Restart nginx to load new certificates
docker-compose -f docker-compose.production.yml restart nginx

# Verify HTTPS is working
curl -I https://plannivo.com
openssl s_client -connect plannivo.com:443 -servername plannivo.com < /dev/null 2>/dev/null | openssl x509 -noout -dates

# Monitor logs for SSL errors
docker-compose -f docker-compose.production.yml logs -f nginx
```

---

## Prevention Measures Implemented

✅ **1. .gitignore Updated**
```gitignore
# SSL certificates and private keys (never commit)
SSL/
*.key
*.crt
*.pem
```

✅ **2. Pre-commit Hook (Optional)**
Create `.git/hooks/pre-commit`:
```bash
#!/bin/bash
if git diff --cached --name-only | grep -qE '\.(key|crt|pem)$'; then
    echo "❌ ERROR: Attempting to commit SSL certificate files!"
    echo "Files with .key, .crt, or .pem extensions are not allowed."
    exit 1
fi
```

Make it executable:
```bash
chmod +x .git/hooks/pre-commit
```

✅ **3. Security Audit Completed**
- SEC-039: Marked as resolved once history is cleaned
- All SSL-related secrets flagged for rotation

---

## Timeline

- **2024-2025:** SSL certificates committed to repository (security incident)
- **February 17, 2026:** Issue discovered during security audit
- **February 17, 2026:** Removed from git index
- **PENDING:** SSL certificate replacement
- **PENDING:** Git history cleanup
- **PENDING:** Team notification and repository re-clone

---

## Team Notification Template

**Subject:** URGENT: Repository Re-Clone Required - SSL Security Incident

**Body:**
```
Hi Team,

We discovered that SSL certificates (including private keys) were accidentally 
committed to our Git repository. We have taken the following actions:

1. ✅ Removed certificates from Git tracking
2. ✅ Updated .gitignore to prevent future commits
3. 🔴 PENDING: Replaced SSL certificates on production server
4. 🔴 PENDING: Cleaned Git history to remove old certificates

ACTION REQUIRED FROM YOU:

After we complete the git history cleanup, you will need to delete your local 
repository and re-clone it:

  cd ..
  rm -rf UKC.world
  git clone <repository-url> UKC.world

We will send a notification when this is required. DO NOT PUSH any changes 
until you receive the all-clear.

Timeline:
- History cleanup: [DATE/TIME]
- Re-clone deadline: [DATE/TIME]

Questions? Contact [SECURITY LEAD]
```

---

## Checklist

- [x] SSL files removed from git index
- [x] .gitignore updated with SSL patterns
- [ ] New SSL certificate obtained
- [ ] New SSL certificate deployed to production
- [ ] HTTPS verified working with new certificate
- [ ] Team notified about upcoming history rewrite
- [ ] Git history cleaned (BFG/filter-repo/filter-branch)
- [ ] Force push completed
- [ ] All team members re-cloned repository
- [ ] Old SSL certificate revoked (if applicable)
- [ ] Security incident documented
- [ ] Pre-commit hooks installed (optional)
- [ ] SEC-039 marked as fully resolved

---

## References

- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)
- [git-filter-repo](https://github.com/newren/git-filter-repo)
- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Let's Encrypt Documentation](https://letsencrypt.org/getting-started/)

---

**This incident should serve as a reminder to:**
1. Never commit secrets, keys, or certificates
2. Use .gitignore proactively
3. Consider pre-commit hooks
4. Audit repositories regularly for leaked credentials
