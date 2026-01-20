# Production Issues Fix Guide

## Issues Identified

### 1. WebSocket (Socket.io) Connection Failures
**Error:** `WebSocket connection to 'wss://plannivo.com/socket.io/?EIO=4&transport=websocket' failed`

**Root Cause:** 
- Nginx proxy wasn't properly passing the `X-Forwarded-Proto: https` header to Socket.io
- Socket.io wasn't configured to properly handle websocket upgrades

**Fixed in:**
- `nginx.conf` - Added `X-Forwarded-Proto https` and `proxy_buffering off` to websocket location
- `backend/services/socketService.js` - Added transports configuration with timeout settings

### 2. Avatar 404 Errors
**Error:** `GET https://plannivo.com/uploads/avatars/[uuid].jpg 404 (Not Found)`

**Root Cause:**
- Avatar files either don't exist on server or aren't synced with uploads volume
- Permissions might be wrong on the uploads directory

**Fix Instructions:**
Run these commands on the production server:

```bash
# 1. SSH to server
ssh root@plannivo.com

# 2. Verify uploads volume exists and has correct permissions
docker volume inspect kspro_uploads_data
ls -la /var/lib/docker/volumes/kspro_uploads_data/_data/

# 3. Check if avatars directory exists
ls -la /var/lib/docker/volumes/kspro_uploads_data/_data/avatars/

# 4. Create avatars directory if missing
mkdir -p /var/lib/docker/volumes/kspro_uploads_data/_data/avatars

# 5. Fix permissions on uploads volume
chmod -R 755 /var/lib/docker/volumes/kspro_uploads_data/_data/
chmod -R 755 /var/lib/docker/volumes/kspro_uploads_data/_data/avatars/

# 6. Verify nginx has read access to uploads
ls -la /var/www/uploads/

# 7. Sync uploads from backend container
docker cp kspro-backend-1:/app/uploads/. /var/lib/docker/volumes/kspro_uploads_data/_data/

# 8. Fix permissions again after sync
chmod -R 755 /var/lib/docker/volumes/kspro_uploads_data/_data/
```

## Deploy Instructions

### Option 1: Quick Deploy (Recommended)
```bash
# From your local machine
node push-all.js --title "Fix WebSocket & Avatar Upload Issues" --desc "Updated nginx WebSocket proxy headers; Added socket.io transport config; Fixed uploads volume permissions"
```

### Option 2: Manual Deploy Steps

1. **Commit changes:**
   ```bash
   git add nginx.conf backend/services/socketService.js
   git commit -m "Fix WebSocket proxy headers and socket.io configuration"
   git push
   ```

2. **Pull on server:**
   ```bash
   ssh root@plannivo.com
   cd /root/kspro
   git pull origin plannivo
   ```

3. **Rebuild and restart:**
   ```bash
   docker-compose -f docker-compose.production.yml down
   docker-compose -f docker-compose.production.yml up -d
   ```

4. **Verify services:**
   ```bash
   # Check nginx
   docker-compose -f docker-compose.production.yml logs frontend | head -20
   
   # Check backend
   docker-compose -f docker-compose.production.yml logs backend | head -20
   
   # Test health
   curl -k https://plannivo.com/health
   curl -k https://plannivo.com/api/health
   ```

## Verification Checklist

- [ ] Frontend loads without console errors
- [ ] Socket.io connects successfully (check DevTools Network tab)
- [ ] WebSocket shows as "101 Switching Protocols" response
- [ ] Avatar images load without 404 errors
- [ ] Real-time features (notifications, updates) work
- [ ] Can upload new files and see them appear

## Debugging Commands

### Check WebSocket Connection
```bash
# In browser console
fetch('https://plannivo.com/api/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

### Check Nginx Logs
```bash
docker-compose -f docker-compose.production.yml logs frontend -f
```

### Check Backend Logs
```bash
docker-compose -f docker-compose.production.yml logs backend -f
```

### List Uploaded Files
```bash
docker exec kspro-backend-1 ls -la /app/uploads/
docker exec kspro-backend-1 ls -la /app/uploads/avatars/
```

### Check Volume Mounts
```bash
docker inspect kspro-backend-1 | grep -A 20 Mounts
docker inspect kspro-frontend-1 | grep -A 20 Mounts
```

## Additional Notes

- Socket.io now uses both `websocket` and `polling` transports for better compatibility
- Nginx properly forwards `X-Forwarded-Proto: https` so Socket.io knows it's secure
- Uploads are served from shared volume mounted on both frontend (read-only) and backend (read-write)
- If avatars still 404, check that users uploaded them after the server was running

## If Issues Persist

1. **Clear Docker cache and rebuild:**
   ```bash
   docker system prune -a
   docker-compose -f docker-compose.production.yml build --no-cache
   docker-compose -f docker-compose.production.yml up -d
   ```

2. **Check certificate validity:**
   ```bash
   openssl s_client -connect plannivo.com:443 -showcerts 2>/dev/null | grep -i "subject\|issuer\|not\|expir"
   ```

3. **Verify DNS:**
   ```bash
   nslookup plannivo.com
   dig plannivo.com
   ```

4. **Check firewall:**
   ```bash
   ufw status
   ufw allow 443/tcp
   ufw allow 80/tcp
   ```
