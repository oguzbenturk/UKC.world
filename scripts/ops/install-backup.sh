#!/usr/bin/env bash
# =============================================================================
# install-backup.sh — idempotent installer for the Plannivo nightly backup
#
# Run ON THE SERVER as root, from the folder that also contains
# backup-nightly.sh (e.g. after: scp -r scripts/ops root@host:/root/plannivo-ops):
#
#   bash /root/plannivo-ops/install-backup.sh            # rclone via official script
#   bash /root/plannivo-ops/install-backup.sh --rclone-apt   # rclone from Ubuntu apt instead
#
# What it does (safe to re-run):
#   - apt installs missing basics: curl ca-certificates unzip logrotate cron
#   - installs rclone if missing (official install script, or apt with --rclone-apt);
#     if `rclone listremotes` already shows gcrypt: it skips install/config and only verifies
#   - installs backup-nightly.sh as /usr/local/sbin/plannivo-backup (0700)
#   - creates /etc/plannivo-backup.conf template (0600) — never overwrites an existing one
#   - creates /root/backups/nightly (0700) and /var/lib/plannivo-backup
#   - writes /etc/cron.d/plannivo-backup (03:30 server time)
#   - writes /etc/logrotate.d/plannivo-backup
#   - pre-pulls alpine:3.20 and postgres:15-alpine (used by the backup)
#
# It does NOT configure rclone remotes (needs a browser OAuth) — it prints the
# exact steps instead. It does not touch any other app on the server.
# =============================================================================
set -Eeuo pipefail
umask 022

RCLONE_VIA_APT=0
for a in "$@"; do
  case "$a" in
    --rclone-apt) RCLONE_VIA_APT=1 ;;
    -h|--help) sed -n '2,/^# =====/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
SRC_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC_SCRIPT="$SRC_DIR/backup-nightly.sh"
[[ -f $SRC_SCRIPT ]] || { echo "backup-nightly.sh not found next to installer ($SRC_DIR)" >&2; exit 1; }

TARGET=/usr/local/sbin/plannivo-backup
CONF=/etc/plannivo-backup.conf
CRON=/etc/cron.d/plannivo-backup
LOGROTATE=/etc/logrotate.d/plannivo-backup
LOG=/var/log/plannivo-backup.log
BACKUP_ROOT=/root/backups/nightly

say() { printf '\033[1;34m[install]\033[0m %s\n' "$*"; }

if [[ -r /etc/os-release ]]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  case "${VERSION_ID:-}" in 22.04|24.04) ;; *) say "WARNING: tested for Ubuntu 22.04/24.04, this is ${PRETTY_NAME:-unknown}";; esac
fi

# --- packages ---------------------------------------------------------------
need=()
for p in curl ca-certificates unzip logrotate cron util-linux coreutils gzip tar; do
  dpkg -s "$p" >/dev/null 2>&1 || need+=("$p")
done
if ((${#need[@]})); then
  say "apt install: ${need[*]}"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${need[@]}"
else
  say "base packages present"
fi
command -v docker >/dev/null || { echo "docker not found — this installer expects the existing Docker host" >&2; exit 1; }

# --- rclone -----------------------------------------------------------------
RCLONE_BASE=(--tpslimit 8 --retries 5 --low-level-retries 20)
if command -v rclone >/dev/null && rclone listremotes 2>/dev/null | grep -qx 'gcrypt:'; then
  # Already installed AND configured: do not reinstall or reconfigure — only verify (read-only).
  say "rclone present and gcrypt: configured: $(rclone version 2>/dev/null | head -n1) — skipping install/config"
  rclone listremotes | grep -qx 'gdrive:' || say "WARNING: no 'gdrive:' remote (the backup's free-space check uses 'rclone about gdrive:')"
  if rclone lsf --dirs-only gcrypt: "${RCLONE_BASE[@]}" >/dev/null; then
    say "gcrypt: readable. Top-level folders:"
    rclone lsf --dirs-only gcrypt: "${RCLONE_BASE[@]}" | sed 's/^/    /'
  else
    say "WARNING: 'rclone lsf gcrypt:' failed — check the token/config before the first run"
  fi
  if about=$(rclone about gdrive: --json "${RCLONE_BASE[@]}" 2>/dev/null); then
    free=$(grep -o '"free":[[:space:]]*[0-9]*' <<<"$about" | grep -o '[0-9]*$' || true)
    [[ -n $free ]] && say "Google Drive free: $(numfmt --to=iec --suffix=B "$free")"
  fi
elif command -v rclone >/dev/null; then
  say "rclone present: $(rclone version 2>/dev/null | head -n1) (gcrypt: not configured yet — see steps below)"
else
  if ((RCLONE_VIA_APT)); then
    say "installing rclone from apt"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq rclone
  else
    say "installing rclone via official script (https://rclone.org/install.sh)"
    tmp=$(mktemp -d)
    curl -fsSL https://rclone.org/install.sh -o "$tmp/install.sh"
    bash "$tmp/install.sh"
    rm -rf "$tmp"
  fi
  say "rclone installed: $(rclone version | head -n1)"
fi
rv=$(rclone version 2>/dev/null | sed -nE '1s/^rclone v([0-9]+)\.([0-9]+).*/\1 \2/p')
if [[ -n $rv ]]; then
  read -r rmaj rmin <<<"$rv"
  if (( rmaj == 1 && rmin < 60 )); then
    say "WARNING: rclone $rmaj.$rmin is older than 1.60 — the backup's flags are only verified on >= 1.60."
  fi
fi

# --- script -----------------------------------------------------------------
tmp_script=$(mktemp)
tr -d '\r' <"$SRC_SCRIPT" >"$tmp_script"          # tolerate CRLF if copied from Windows
bash -n "$tmp_script"
install -o root -g root -m 0700 "$tmp_script" "$TARGET"
rm -f "$tmp_script"
say "installed $TARGET"

# --- config template --------------------------------------------------------
if [[ -f $CONF ]]; then
  say "$CONF exists — left unchanged"
else
  cat >"$CONF" <<'EOF'
# /etc/plannivo-backup.conf — sourced by /usr/local/sbin/plannivo-backup (bash syntax).
# Must stay root-owned and mode 0600. Only override what you need; defaults
# are documented at the top of the script.

# Who receives failure alerts + the Sunday summary (comma-separated).
BACKUP_ALERT_EMAIL="ozibenturk@gmail.com"

# SMTP settings are NOT stored here: they are read at runtime from
# ENV_FILE (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, SMTP_SECURE).
#ENV_FILE="/root/plannivo/backend/.env.production"

# rclone crypt remote (over gdrive:Plannivo-backups) and the drive remote under it
#RCLONE_REMOTE="gcrypt"
#GDRIVE_REMOTE="gdrive"
# Upload is refused (failure email) if Google Drive has less free space than this
#MIN_REMOTE_FREE_GB=2
# Drive: deleted (pruned) folders go to trash (counts against quota for 30 days) if "true"
#REMOTE_USE_TRASH="false"
# Applied to every rclone call (shared rclone client_id -> keep the TPS limit)
#RCLONE_BASE_FLAGS="--tpslimit 8 --retries 5 --low-level-retries 20"

# Retention. Small set (DB, n8n, redis, config, demo) on gcrypt:daily|weekly|monthly;
# uploads are mirrored to gcrypt:uploads/current, replaced/deleted files kept in
# gcrypt:uploads/deleted/<date> for UPLOADS_DELETED_KEEP_DAYS.
#LOCAL_KEEP=7
#LOCAL_UPLOADS_TAR_KEEP=2
#REMOTE_KEEP_DAILY=7
#REMOTE_KEEP_WEEKLY=4
#REMOTE_KEEP_MONTHLY=6
#UPLOADS_DELETED_KEEP_DAYS=30
#UPLOADS_MAX_DELETE=500

# Demo DB (weekly, Sunday)
#DEMO_ENABLED=1

# Restore drill (weekly, Sunday)
#DRILL_ENABLED=1
#DRILL_DRIFT_MAX=500
#DRILL_DRIFT_TABLES="public.currency_update_logs public.security_audit public.notifications public.audit_logs public.query_performance_log public.user_sessions public.wind_history"
#DRILL_IGNORE_TABLES=""

#MIN_FREE_GB=15
EOF
  say "created $CONF template (alert email: ozibenturk@gmail.com)"
fi
chown root:root "$CONF"; chmod 600 "$CONF"

# --- directories ------------------------------------------------------------
install -d -o root -g root -m 0700 "$BACKUP_ROOT"
install -d -o root -g root -m 0700 /var/lib/plannivo-backup
touch "$LOG"; chmod 600 "$LOG"

# --- cron -------------------------------------------------------------------
cat >"$CRON" <<'EOF'
# Plannivo nightly backup — managed by scripts/ops/install-backup.sh
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""
30 3 * * * root /usr/local/sbin/plannivo-backup >>/var/log/plannivo-backup.log 2>&1
EOF
chmod 644 "$CRON"
say "cron: $CRON (03:30, server timezone: $(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo unknown))"

# --- logrotate --------------------------------------------------------------
cat >"$LOGROTATE" <<'EOF'
/var/log/plannivo-backup.log {
    weekly
    rotate 12
    compress
    delaycompress
    missingok
    notifempty
    create 0600 root root
}
EOF
chmod 644 "$LOGROTATE"
logrotate -d "$LOGROTATE" >/dev/null 2>&1 || say "WARNING: logrotate -d reported a problem with $LOGROTATE"

# --- images -----------------------------------------------------------------
for img in alpine:3.20 postgres:15-alpine; do
  docker image inspect "$img" >/dev/null 2>&1 || { say "docker pull $img"; docker pull -q "$img" >/dev/null; }
done

# --- status -----------------------------------------------------------------
remotes=$(rclone listremotes 2>/dev/null || true)
have_gdrive=0; have_gcrypt=0
grep -qx 'gdrive:' <<<"$remotes" && have_gdrive=1
grep -qx 'gcrypt:' <<<"$remotes" && have_gcrypt=1
[[ -n $(grep -E '^BACKUP_ALERT_EMAIL="[^"]+"' "$CONF" || true) ]] && email_set=1 || email_set=0

cat <<EOF

==============================================================================
 Installed. Status:  rclone gdrive: $( ((have_gdrive)) && echo OK || echo MISSING )   gcrypt: $( ((have_gcrypt)) && echo OK || echo MISSING )   alert email: $( ((email_set)) && echo set || echo NOT SET )
==============================================================================

NEXT STEPS (in this order)

 1) Set the alert recipient:
      nano $CONF          # BACKUP_ALERT_EMAIL (default ozibenturk@gmail.com)
      plannivo-backup --test-email

 2) Configure rclone — SKIP this whole step if gdrive: and gcrypt: show OK above
    (they are already configured on this server; the installer only verified them).
    The steps below are for a new server, or for moving gdrive: from rclone's
    shared client_id to your own OAuth client later (fewer rate limits).

  2a) Google Cloud Console (once, in a browser on Windows):
      - APIs & Services -> enable "Google Drive API"
      - OAuth consent screen: External; add your Google account as test user,
        scope .../auth/drive.file; then PUBLISH the app ("In production").
        (In "Testing" status Google expires refresh tokens after 7 days and the
        nightly upload would start failing.) drive.file is a non-sensitive
        scope, so no Google verification is needed.
      - Credentials -> Create OAuth client ID -> type "Desktop app"
        -> note client_id and client_secret.

  2b) On THIS server:
      rclone config
        n  (new remote)
        name> gdrive
        Storage> drive
        client_id> <your client_id>
        client_secret> <your client_secret>
        scope> drive.file
        service_account_file> (Enter)
        Edit advanced config?> n
        Use web browser to automatically authenticate?> n
      rclone now prints a line like:
          rclone authorize "drive" "eyJjbGllbnRfaWQiOi..."
      That base64 blob already contains client_id, client_secret AND
      scope=drive.file — copy the WHOLE line.

  2c) On your Windows PC (rclone is installed there), in PowerShell:
          rclone authorize "drive" "eyJjbGllbnRfaWQiOi..."     # the line from 2b
      A browser opens -> sign in with the backup Google account -> Allow.
      PowerShell prints:
          Paste the following into your remote machine --->
          {"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}
          <---End paste
      Equivalent explicit form (same result, if you prefer typing the IDs):
          rclone authorize "drive" "<client_id>" "<client_secret>"
      NOTE: this 3-argument form does not carry the scope, so rclone asks
      Google for its default (full "drive") scope. Prefer the blob from 2b to
      keep the token limited to drive.file.

  2d) Back on the server, paste the JSON at the "config_token>" prompt.
        Configure this as a Shared Drive?> n
        Keep this remote?> y

  2e) Create the folder WITH rclone (drive.file scope only sees files rclone
      itself created — a folder made in the Drive web UI is invisible to it):
          rclone mkdir gdrive:Plannivo-backups

  2f) rclone config
        n
        name> gcrypt
        Storage> crypt
        remote> gdrive:Plannivo-backups
        filename_encryption> off
        directory_name_encryption> false
        password> g  (generate, 256 bits) -> y  — WRITE IT DOWN
        password2 (salt)> g (generate, 256 bits) -> y — WRITE IT DOWN
        Edit advanced config?> n
        Keep this remote?> y
      Store BOTH crypt passwords (or the whole [gdrive]+[gcrypt] sections of
      "rclone config file") in your password manager / off the server.
      Without them the Drive copy can never be decrypted.

      Already have gdrive/gcrypt on Windows pointing at the SAME folder?
      Then instead copy those two sections from your Windows rclone.conf
      ("rclone config file" shows the path) into /root/.config/rclone/rclone.conf
      (chmod 600) — the crypt password/salt MUST be identical, and with
      drive.file the client_id must be the same one that created the folder.

  2g) Smoke test:
      chmod 600 /root/.config/rclone/rclone.conf
      echo hello | rclone rcat gcrypt:_selftest/hello.txt
      rclone cat gcrypt:_selftest/hello.txt          # -> hello
      rclone ls gdrive:Plannivo-backups/_selftest    # -> hello.txt.bin (encrypted)
      rclone purge gcrypt:_selftest

 3) First runs:
      plannivo-backup --no-upload       # local only, check /root/backups/nightly/<date>
      plannivo-backup --force-weekly    # full run: small set + uploads mirror upload, demo DB,
                                        # restore drill, cryptcheck of the mirror, summary mail
      The FIRST full run uploads the whole uploads volume (~1.1 GB) once; after
      that only new/changed files transfer. Never touched on gcrypt: anything
      outside daily/ weekly/ monthly/ uploads/ (e.g. plannivo-full-2026-10-05T17-12-48).
      tail -n 100 $LOG

 4) Done — cron runs it nightly at 03:30. Status of last run: /var/lib/plannivo-backup/last-run
==============================================================================
EOF
