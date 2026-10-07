# Plannivo restore runbook

Restores what `plannivo-backup` (`scripts/ops/backup-nightly.sh`) produces. Every
command runs **on the server as root** unless marked *Windows*.

> **Before any restore:** take a fresh safety copy of the current state
> (`plannivo-backup --no-upload` takes about 2 minutes) unless the server is gone.
> Never stop the **host** nginx: it also serves the other apps.

---

## 0. What a backup folder contains

`/root/backups/nightly/<YYYY-MM-DD>/` holds everything. Google Drive (`gcrypt:` = encrypted `gdrive:Plannivo-backups`) has the
**small set** in `gcrypt:daily|weekly|monthly/<date>/`. Uploads are not tarred off-site; they are
**mirrored** file by file:

| Drive path | Content | Kept |
|---|---|---|
| `gcrypt:daily/<date>/` | small set (all files below except the uploads tar) | 7 newest |
| `gcrypt:weekly/<date>/` | Sunday copy of the small set | 4 newest |
| `gcrypt:monthly/<date>/` | small set from the 1st (or the first good run) of each month | 6 newest |
| `gcrypt:uploads/current/` | 1:1 mirror of the uploads volume, as of the last successful night | always |
| `gcrypt:uploads/deleted/<date>/` | files deleted or overwritten in the volume that night (old versions) | 30 days |
| `gcrypt:plannivo-full-2026-10-05T17-12-48/` | manual full backup from 2026-10-05, never touched by the script | manual |


| File | Content |
|---|---|
| `plannivo.dump` | `pg_dump -Fc` of DB `plannivo` (custom format, compressed) |
| `plannivo.dump.toc.txt` | `pg_restore --list` of the dump |
| `globals.sql.gz` | `pg_dumpall --globals-only` (roles incl. password hashes) |
| `rowcounts.before.tsv` / `rowcounts.after.tsv` | exact per-table row counts right before/after the dump |
| `volume-plannivo_uploads_data.tar.gz` | uploads (`/app/uploads` in backend). **Local only, newest 2 days** (checksum in `SHA256SUMS.local`) |
| `uploads-filelist.tsv.gz` | path / size / mtime of every upload file at backup time (off-site); tells you what the mirror should hold |
| `volume-plannivo_n8n_data.tar.gz` | n8n home (workflows, credentials, sqlite DB) |
| `volume-plannivo_redis_data.tar.gz` | redis AOF/RDB (cache and queues; optional to restore) |
| `config-secrets.tar.gz` | `root/plannivo/backend/.env.production`, `root/plannivo/SSL/`, `etc/nginx/`, `etc/letsencrypt/`, `root/.acme.sh/` (paths relative to `/`) |
| `aydin_demo.dump` (+`.toc.txt`) | demo DB, **Sunday folders only** |
| `MANIFEST.txt` | host, date, postgres version, **app git commit** at backup time |
| `SHA256SUMS` | checksums of the off-site files (`SHA256SUMS.local` covers the local-only uploads tar) |

`config-secrets.tar.gz` and `globals.sql.gz` hold secrets. Keep restored copies in `/root/restore` (mode 700) and delete them when done.

---

## 1. Get the backup files into `/root/restore/<date>`

```bash
install -d -m 700 /root/restore
```

### 1a. From the server's own folder (fastest)
```bash
ls /root/backups/nightly/                     # newest 7 days
D=2026-10-12                                  # pick one
cp -a /root/backups/nightly/$D /root/restore/$D
```
Older manual backups made before this system are in `/root/backups/` (outside `nightly/`).

### 1b. From Google Drive (rclone + gcrypt)
```bash
rclone lsf --dirs-only gcrypt:daily/          # also: gcrypt:weekly/  gcrypt:monthly/
D=2026-10-12
rclone copy gcrypt:daily/$D /root/restore/$D -P --tpslimit 8
```
Older dates: `gcrypt:weekly/` or `gcrypt:monthly/`. Uploads come from the mirror (section 3b).
On a **new server**, first install rclone (`bash install-backup.sh` does it) and put the
`[gdrive]` + `[gcrypt]` sections from your password-manager copy of `rclone.conf` into
`/root/.config/rclone/rclone.conf` (chmod 600). You need:
- Drive access to the account. `gdrive:` currently uses rclone's shared client_id (full
  `drive` scope), so any re-authorised token works. If you later switch to your own client
  with scope `drive.file`, only that same client_id can see the folder. If the token has
  expired, run `rclone config reconnect gdrive:` (headless: answer `n` and use
  `rclone authorize` on Windows, as in install-backup.sh).
- the **same** crypt `password` and `password2`. Without them the files cannot be decrypted.

### 1c. From a local folder (e.g. a copy on the Windows PC)
*Windows*, PowerShell. Download it from Drive first if needed (same rclone.conf sections on Windows):
```powershell
rclone copy gcrypt:daily/2026-10-12 C:\restore\2026-10-12 -P
scp -r C:\restore\2026-10-12 root@<server>:/root/restore/
```

### 1d. Verify the files (always do this)
```bash
cd /root/restore/$D
sha256sum -c SHA256SUMS                    # every line must say OK
[ -f SHA256SUMS.local ] && sha256sum -c SHA256SUMS.local   # uploads tar (local copies only)
gzip -t *.gz && echo gzip-OK
cat MANIFEST.txt
```

---

## 2. Database

### 2a. Restore into a new DB, then swap (recommended, easy to undo)
```bash
D=2026-10-12; R=/root/restore/$D
cd /root/plannivo
# 1. stop the writers (frontend, db and redis keep running)
docker stop plannivo_backend_1 plannivo_n8n_1

# 2. safety copy of what is there now
docker exec plannivo_db_1 pg_dump -U plannivo -d plannivo -Fc -f /tmp/pre-restore.dump
docker cp plannivo_db_1:/tmp/pre-restore.dump /root/restore/pre-restore-$(date +%F-%H%M).dump
docker exec plannivo_db_1 rm -f /tmp/pre-restore.dump

# 3. restore into plannivo_restore
docker cp $R/plannivo.dump plannivo_db_1:/tmp/restore.dump
docker exec plannivo_db_1 psql -U plannivo -d postgres -c 'DROP DATABASE IF EXISTS plannivo_restore' -c 'CREATE DATABASE plannivo_restore OWNER plannivo'
docker exec plannivo_db_1 pg_restore -U plannivo -d plannivo_restore --exit-on-error /tmp/restore.dump
```
Then **verify** (see 2d) against `plannivo_restore`, and swap:
```bash
docker exec plannivo_db_1 psql -U plannivo -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('plannivo','plannivo_restore') AND pid <> pg_backend_pid()" \
  -c "ALTER DATABASE plannivo RENAME TO plannivo_before_restore_$(date +%Y%m%d)" \
  -c "ALTER DATABASE plannivo_restore RENAME TO plannivo"
docker exec plannivo_db_1 rm -f /tmp/restore.dump
docker start plannivo_backend_1 plannivo_n8n_1
```
Undo: stop the backend again, then rename the two databases back.
Drop the old DB after a few days: `DROP DATABASE plannivo_before_restore_YYYYMMDD`.

### 2b. In-place restore (fewer steps, cannot be undone without the safety copy)
```bash
docker stop plannivo_backend_1 plannivo_n8n_1
docker cp $R/plannivo.dump plannivo_db_1:/tmp/restore.dump
docker exec plannivo_db_1 pg_restore -U plannivo -d plannivo --clean --if-exists --exit-on-error /tmp/restore.dump
docker exec plannivo_db_1 rm -f /tmp/restore.dump
docker start plannivo_backend_1 plannivo_n8n_1
```

### 2c. Roles (only on a fresh DB server)
`POSTGRES_USER` (`plannivo`) is created by the container from `.env.production`.
The globals add any extra roles and set the role password hashes from backup time.
The "role plannivo already exists" error is expected:
```bash
gzip -dc $R/globals.sql.gz | docker exec -i plannivo_db_1 psql -U plannivo -d postgres
```
Restore `.env.production` from the **same** backup (section 4) so `DATABASE_URL` matches that password.

### 2d. Verify the DB
```bash
# same exact-count query the backup uses
cat > /root/restore/rowcount.sql <<'SQL'
SELECT format('%I.%I', n.nspname, c.relname),
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp)'
ORDER BY 1;
SQL
DB=plannivo_restore   # or plannivo after the swap
docker exec -i plannivo_db_1 psql -X -q -A -t -F $'\t' -U plannivo -d $DB < /root/restore/rowcount.sql > /root/restore/now.tsv
diff $R/rowcounts.before.tsv /root/restore/now.tsv && echo "row counts identical"
```
Small differences are expected **only** in the log tables that were written during the dump
(`currency_update_logs`, `security_audit`, `notifications`, `audit_logs`, `query_performance_log`,
`user_sessions`, `wind_history`). Compare those to `rowcounts.after.tsv` as well.

### 2e. App version and migrations
`MANIFEST.txt` shows the app commit at backup time. If the server now runs **newer** code,
apply the newer migrations to the restored DB:
```bash
docker exec plannivo_backend_1 node migrate.js up
```
If you restore to an older app version, deploy that commit first (`git checkout <commit>` locally, then `npm run push-all`).

Health check (send a browser User-Agent, because the host WAF answers a bare curl with 403):
```bash
curl -s -A 'Mozilla/5.0' https://ukc.plannivo.com/api/health
```

### 2f. Demo DB (`aydin_demo.dump`, Sunday folders)
```bash
docker stop aydin_backend_1 2>/dev/null || true      # check the name: docker ps --filter name=aydin
docker cp $R/aydin_demo.dump aydin_db_1:/tmp/restore.dump
docker exec aydin_db_1 pg_restore -U aydin -d aydin_demo --clean --if-exists --exit-on-error /tmp/restore.dump
docker exec aydin_db_1 rm -f /tmp/restore.dump
docker start aydin_backend_1 2>/dev/null || true
```

---

## 3. Docker volumes (uploads, n8n, redis)

Stop the containers that use a volume before you replace its contents:

| Volume | Stop first | Source |
|---|---|---|
| `plannivo_uploads_data` | `plannivo_backend_1` (the frontend serves it read-only and can keep running) | local tar (newest 2 days) **or** Drive mirror `gcrypt:uploads/current` |
| `plannivo_n8n_data` | `plannivo_n8n_1` | `volume-plannivo_n8n_data.tar.gz` |
| `plannivo_redis_data` | `plannivo_redis_1` (optional restore: it only holds cache and queues) | `volume-plannivo_redis_data.tar.gz` |

### 3a. From a tar (n8n, redis, or uploads from the local tar)
```bash
V=plannivo_n8n_data          # or plannivo_redis_data / plannivo_uploads_data
docker stop plannivo_n8n_1   # the container(s) using it, see table
# safety copy of the current content
docker run --rm -v $V:/v:ro alpine:3.20 tar -C /v -czf - . > /root/restore/$V-before-restore.tar.gz
# replace the contents (ownership and permissions are preserved: busybox tar runs as root)
docker run --rm -i -v $V:/v alpine:3.20 sh -c 'find /v -mindepth 1 -delete && tar -C /v -xzpf -'   < $R/volume-$V.tar.gz
docker run --rm -v $V:/v:ro alpine:3.20 sh -c 'du -sh /v; find /v -type f | wc -l'
docker start plannivo_n8n_1
```

### 3b. Uploads from the Drive mirror (latest state)
```bash
install -d -m 700 /root/restore/uploads
rclone copy gcrypt:uploads/current /root/restore/uploads -P --tpslimit 8 --transfers 4
# compare with the file list of the backup you are restoring
zcat $R/uploads-filelist.tsv.gz | wc -l ; find /root/restore/uploads -type f | wc -l
docker stop plannivo_backend_1
docker run --rm -v plannivo_uploads_data:/v:ro alpine:3.20 tar -C /v -czf - . > /root/restore/uploads-before-restore.tar.gz
docker run --rm -v plannivo_uploads_data:/v -v /root/restore/uploads:/src:ro alpine:3.20   sh -c 'find /v -mindepth 1 -delete && cp -a /src/. /v/ && chown -R 1001:1001 /v'
docker start plannivo_backend_1
```
The mirror reflects the **last successful night**. Files deleted or overwritten in the last 30 days are in
`gcrypt:uploads/deleted/<date>/<same/path>`. The date is the night the change was noticed. List them with
`rclone lsf -R gcrypt:uploads/deleted/<date>`.
Restoring uploads "as of" an older date = mirror + files from `deleted/` folders newer than that date.
Use `uploads-filelist.tsv.gz` of that date as the checklist.

### 3c. Single upload files
```bash
rclone lsf -R gcrypt:uploads/current | grep <name>              # or gcrypt:uploads/deleted/<date>
rclone copy gcrypt:uploads/current/path/to/file /root/restore/one/ --tpslimit 8
docker cp /root/restore/one/file plannivo_backend_1:/app/uploads/path/to/file
docker exec -u 0 plannivo_backend_1 chown 1001:1001 /app/uploads/path/to/file
```
From the local tar instead: `tar -C /root/restore/one -xzf $R/volume-plannivo_uploads_data.tar.gz ./path/to/file`.

On a **new server**, run the normal deploy first (`npm run push-all`), which creates the
volumes with compose labels. Then stop the services and restore into those volumes.

---

## 4. Secrets and config: .env.production, SSL, nginx, letsencrypt, acme.sh

Always extract into a staging folder first, then copy only what you need.
The host nginx and the certificates also serve the other apps on this server.
```bash
S=/root/restore/cfg-$D; install -d -m 700 $S
tar -tzvf $R/config-secrets.tar.gz | less              # inspect
tar -C $S -xzpf $R/config-secrets.tar.gz
```
| What | Restore | Activate |
|---|---|---|
| `.env.production` | `cp -a $S/root/plannivo/backend/.env.production /root/plannivo/backend/` | `docker restart plannivo_backend_1` (push-all also uploads it from the dev PC: keep both in sync) |
| Container SSL | `cp -a $S/root/plannivo/SSL/. /root/plannivo/SSL/` | `docker restart plannivo_frontend_1` |
| Host nginx (Plannivo site only) | `diff -ru $S/etc/nginx /etc/nginx`, then copy just the needed files, e.g. `cp -a $S/etc/nginx/sites-available/ukc.plannivo.com /etc/nginx/sites-available/` | `nginx -t && systemctl reload nginx` (never `stop`) |
| Whole `/etc/nginx` (new server only) | `cp -a $S/etc/nginx/. /etc/nginx/` | `nginx -t && systemctl reload nginx` |
| Let's Encrypt (new server) | `tar -C / -xzpf $R/config-secrets.tar.gz etc/letsencrypt` (keeps the live→archive symlinks) | `certbot renew --dry-run` |
| acme.sh (new server) | `tar -C / -xzpf $R/config-secrets.tar.gz root/.acme.sh` | `~/.acme.sh/acme.sh --install-cronjob` then `~/.acme.sh/acme.sh --list` |

Delete the staging folder afterwards: `rm -rf $S`.

---

## 5. Full server loss: order of operations

1. New Ubuntu 22.04/24.04 server. Install Docker, docker-compose **1.29** (v1), nginx, certbot, and git.
2. Clone the repo to `/root/plannivo`. Get the backup (1b) and verify it (1d).
3. Restore `.env.production` and `SSL/` (section 4). Restore the host nginx config and certificates (section 4).
4. From the dev PC, run `npm run push-all` (uploads `dist/` and the env, then starts all containers and creates the volumes).
5. Stop backend and n8n. Restore the DB (2a or 2b; add 2c on a fresh DB), n8n/redis (3a) and the uploads from the Drive mirror (3b). Start them again.
6. Point DNS to the new IP. `nginx -t && systemctl reload nginx`. Check that the certificates are valid.
7. Re-install the backup (`install-backup.sh`, then the rclone config from your password manager) and the hardening (HARDENING.md).
8. Verify (section 6).

---

## 6. Verification checklist

- [ ] `sha256sum -c SHA256SUMS`: all OK
- [ ] row counts match (2d), with differences only in the log tables
- [ ] `curl -s -A 'Mozilla/5.0' https://ukc.plannivo.com/api/health` returns ok
- [ ] uploads file count ≈ `zcat uploads-filelist.tsv.gz | wc -l`
- [ ] log in as admin. Check the latest bookings, wallet balances and an uploaded image/avatar.
- [ ] n8n (`n8n.plannivo.com`): Kai workflow present and active
- [ ] `docker ps --filter name=plannivo_`: all healthy
- [ ] `plannivo-backup --force-weekly` succeeds after the restore (new baseline, drill passes)
