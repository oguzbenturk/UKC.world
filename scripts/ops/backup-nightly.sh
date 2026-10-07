#!/usr/bin/env bash
# =============================================================================
# plannivo-backup — nightly production backup for Plannivo (UKC)
#
# Installed by install-backup.sh as /usr/local/sbin/plannivo-backup and run
# from /etc/cron.d/plannivo-backup at 03:30 server time.
#
# What it does (each run, into /root/backups/nightly/<YYYY-MM-DD>/):
#   1. pg_dump -Fc of the prod DB  + pg_dumpall --globals-only
#      + exact per-table row counts taken right BEFORE and right AFTER the dump
#   2. tar.gz of the docker volumes plannivo_n8n_data / plannivo_redis_data
#      (read-only mount into a throw-away alpine container) — go off-site
#   3. tar.gz of plannivo_uploads_data — LOCAL ONLY, kept for the newest 2 days
#      (off-site, uploads are mirrored incrementally instead, see 7)
#   4. tar.gz of secrets/config: backend/.env.production, SSL/, /etc/nginx,
#      /etc/letsencrypt, /root/.acme.sh   (plaintext locally, root-only 0600;
#      encrypted off-site by the rclone `crypt` remote)
#   5. Sunday: pg_dump of the demo DB (aydin_db_1 / aydin_demo)
#   6. Verify: pg_restore --list + full archive read, gzip -t, SHA256SUMS
#      (SHA256SUMS = off-site set, SHA256SUMS.local = local-only uploads tar)
#   7. Off-site (Google Drive via rclone crypt remote "gcrypt"):
#      - refuses to upload if `rclone about gdrive:` reports < 2 GB free
#      - SMALL set -> gcrypt:daily/<date>/ (everything except the uploads tar),
#        rclone cryptcheck + decrypt round-trip of SHA256SUMS
#      - uploads: rclone sync <volume dir> gcrypt:uploads/current
#        --backup-dir gcrypt:uploads/deleted/<date>  (only new/changed files move;
#        deleted/overwritten files are kept 30 days), then rclone check
#        (Sundays: full cryptcheck)
#   8. Sunday: restore drill — restore the dump into a throw-away postgres
#      container (no ports, no network, no named volumes, --rm) and compare
#      per-table row counts with the live counts of this same run
#   9. Promote small set: Sunday -> gcrypt:weekly/<date>/, 1st of month (or first
#      good run of a month) -> gcrypt:monthly/<date>/
#  10. Retention (only folders named YYYY-MM-DD are ever deleted, and only under
#      gcrypt:daily|weekly|monthly|uploads/deleted — nothing else at the gcrypt
#      root, e.g. plannivo-full-2026-10-05T17-12-48, is ever touched):
#      local: 7 newest dirs, uploads tar only in the newest 2
#      remote: 7 daily / 4 weekly / 6 monthly, uploads/deleted 30 days
#  11. Email: on ANY failure always; on success only the weekly (Sunday) summary
#
# It touches ONLY: plannivo_* / aydin_db_1 containers (read-only exec), the
# three plannivo_* volumes (read-only), /root/backups/nightly, the folders
# listed in 10 on the gcrypt remote, its own log/lock/state files, and throw-away containers labelled
# plannivo.backup=*. Nothing else on the server (classicraiders, thehallow,
# lm-sync, ...) is read or modified.
#
# Usage:
#   plannivo-backup                  normal run (what cron does)
#   plannivo-backup --force-weekly   also do the Sunday-only work today
#                                    (demo DB, restore drill, summary email);
#                                    weekly/monthly promotion still follows the
#                                    real calendar
#   plannivo-backup --no-upload      local backup + verify only (first test)
#   plannivo-backup --test-email     send a test email and exit
#   plannivo-backup --help
#
# Config: /etc/plannivo-backup.conf (bash KEY=value, root-owned, 0600).
# Exit code: 0 = success, non-zero = something failed (and an email was sent).
# =============================================================================
set -Eeuo pipefail
umask 077
export LC_ALL=C

readonly VERSION="1.1.0"
CONF_FILE="${PLANNIVO_BACKUP_CONF:-/etc/plannivo-backup.conf}"

# ----------------------------------------------------------------------------
# Defaults — override any of these in /etc/plannivo-backup.conf
# ----------------------------------------------------------------------------
BACKUP_ALERT_EMAIL="ozibenturk@gmail.com"   # comma-separated recipients
BACKUP_ROOT="/root/backups/nightly"
LOG_FILE="/var/log/plannivo-backup.log"
LOCK_FILE="/run/lock/plannivo-backup.lock"
STATE_DIR="/var/lib/plannivo-backup"
APP_DIR="/root/plannivo"
ENV_FILE="/root/plannivo/backend/.env.production"   # SMTP settings are read from here

DB_CONTAINER="plannivo_db_1"
DB_USER="plannivo"
DB_NAME="plannivo"
VOLUMES="plannivo_n8n_data plannivo_redis_data"   # tarred, go off-site
UPLOADS_VOLUME="plannivo_uploads_data"             # tarred locally only + mirrored off-site
UPLOADS_MAX_DELETE=500                             # sync aborts if more files would be deleted/moved in one night
CONFIG_PATHS_REQUIRED="/root/plannivo/backend/.env.production /root/plannivo/SSL /etc/nginx"
CONFIG_PATHS_OPTIONAL="/etc/letsencrypt /root/.acme.sh"

DEMO_ENABLED=1
DEMO_DB_CONTAINER="aydin_db_1"
DEMO_DB_USER="aydin"
DEMO_DB_NAME="aydin_demo"

WEEKLY_DOW=7        # date +%u ; 7 = Sunday
MONTHLY_DOM=01      # date +%d

DRILL_ENABLED=1
DRILL_IMAGE="postgres:15-alpine"
TAR_IMAGE="alpine:3.20"
DRILL_READY_TIMEOUT=180
# Log-style tables that are written continuously (cron jobs, request logging,
# session refresh, wind polling). For these ONLY, the restored row count may
# differ from the live before/after bracket by up to DRILL_DRIFT_MAX rows.
# Every other table must match exactly (or lie inside the before..after
# bracket if it changed while pg_dump was running).
DRILL_DRIFT_TABLES="public.currency_update_logs public.security_audit public.notifications public.audit_logs public.query_performance_log public.user_sessions public.wind_history"
DRILL_DRIFT_MAX=500
DRILL_IGNORE_TABLES=""                      # space-separated schema.table, compared not at all

RCLONE_REMOTE="gcrypt"                      # crypt remote over gdrive:Plannivo-backups
GDRIVE_REMOTE="gdrive"                      # underlying drive remote (for `rclone about`)
# All flags exist in rclone 1.60. --tpslimit protects the shared rclone client_id from rate limits.
RCLONE_BASE_FLAGS="--tpslimit 8 --retries 5 --low-level-retries 20"
RCLONE_XFER_FLAGS="--transfers 4 --checkers 8 --drive-chunk-size 64M --stats 5m --stats-one-line"
REMOTE_USE_TRASH="false"                    # false = pruned folders are deleted, not kept 30 days in Drive trash (quota)
MIN_REMOTE_FREE_GB=2                        # upload refused (failure email) below this much free Drive space
LOCAL_KEEP=7
LOCAL_UPLOADS_TAR_KEEP=2                    # local uploads tar only in the newest N backup dirs
UPLOADS_DELETED_KEEP_DAYS=30
REMOTE_KEEP_DAILY=7
REMOTE_KEEP_WEEKLY=4
REMOTE_KEEP_MONTHLY=6
MIN_FREE_GB=15

DUMP_TIMEOUT="2h"
TAR_TIMEOUT="2h"
UPLOAD_TIMEOUT="6h"

# ----------------------------------------------------------------------------
# Arguments
# ----------------------------------------------------------------------------
FORCE_WEEKLY=0
NO_UPLOAD=0
TEST_EMAIL=0
usage() { sed -n '2,/^# =====/p' "$0" | sed 's/^# \{0,1\}//'; }
while (($#)); do
  case "$1" in
    --force-weekly) FORCE_WEEKLY=1 ;;
    --no-upload)    NO_UPLOAD=1 ;;
    --test-email)   TEST_EMAIL=1 ;;
    -h|--help)      usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

[[ $EUID -eq 0 ]] || { echo "must run as root" >&2; exit 2; }

# ----------------------------------------------------------------------------
# Config (only sourced if root-owned and not group/world writable)
# ----------------------------------------------------------------------------
if [[ -f $CONF_FILE ]]; then
  conf_owner=$(stat -c %u "$CONF_FILE")
  conf_mode=$(stat -c %a "$CONF_FILE")
  if [[ $conf_owner != 0 ]] || (( 8#$conf_mode & 8#022 )); then
    echo "refusing to source $CONF_FILE: must be owned by root and not group/world writable (is uid=$conf_owner mode=$conf_mode)" >&2
    exit 2
  fi
  # shellcheck source=/dev/null
  . "$CONF_FILE"
fi

# ----------------------------------------------------------------------------
# Logging: everything (stdout+stderr) gets a timestamp and goes to LOG_FILE
# (and to the terminal when run interactively).
# ----------------------------------------------------------------------------
mkdir -p "$(dirname "$LOG_FILE")" "$STATE_DIR"
touch "$LOG_FILE"; chmod 600 "$LOG_FILE"
LOG_START_BYTES=$(stat -c %s "$LOG_FILE")
stamp() {
  trap - EXIT ERR INT TERM
  local line
  while IFS= read -r line || [[ -n $line ]]; do
    printf '%(%Y-%m-%d %H:%M:%S)T %s\n' -1 "$line"
  done
}
exec 3>&1 4>&2
if [[ -t 3 ]]; then
  exec > >(stamp | tee -a "$LOG_FILE" >&3) 2>&1
else
  exec > >(stamp >>"$LOG_FILE") 2>&1
fi
LOGGER_PID=$!

RUN_ID="$$"
log()  { printf '[%s] %s\n' "$RUN_ID" "$*"; }
warn() { printf '[%s] WARNING: %s\n' "$RUN_ID" "$*"; WARNINGS+=("$*"); }
die()  { printf '[%s] ERROR: %s\n' "$RUN_ID" "$*"; FAIL_REASON="$*"; exit 1; }

# ----------------------------------------------------------------------------
# State
# ----------------------------------------------------------------------------
HOST_FQDN=$(hostname -f 2>/dev/null || hostname)
RUN_DATE=$(date +%F)
DOW=$(date +%u)
DOM=$(date +%d)
IS_SUNDAY=0;  [[ $DOW == "$WEEKLY_DOW" ]] && IS_SUNDAY=1
IS_MONTHLY=0; [[ $DOM == "$MONTHLY_DOM" ]] && IS_MONTHLY=1
DO_WEEKLY_WORK=$(( IS_SUNDAY || FORCE_WEEKLY ))
RUN_DIR="$BACKUP_ROOT/$RUN_DATE"
WORK_DIR="$BACKUP_ROOT/.$RUN_DATE.partial"
TMP_DIR=""
DRILL_NAME=""
DUMP_TMP_CONTAINER=""
DUMP_TMP_PATH=""
CURRENT_STEP="startup"
STEP_START=$SECONDS
FAIL_REASON=""
DRILL_RESULT="not run (only on Sundays)"
declare -a WARNINGS=() STEP_TIMES=()
readonly DATE_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}$'

START_EPOCH=$(date +%s)
UPLOADS_LOCAL_COUNT=""; UPLOADS_LOCAL_BYTES=""; UPLOADS_RESULT=""; DRIVE_SUMMARY=""
read -r -a RCLONE_BASE <<<"$RCLONE_BASE_FLAGS"
read -r -a RCLONE_XFER <<<"$RCLONE_XFER_FLAGS"
rcl()  { rclone "$@" "${RCLONE_BASE[@]}"; }                       # listing / small calls
rclx() { rclone "$@" "${RCLONE_BASE[@]}" "${RCLONE_XFER[@]}"; }   # transfers / checks
# json_num KEY JSON -> first integer value of "KEY" in rclone --json output (no jq needed)
json_num() { grep -o "\"$1\":[[:space:]]*[0-9]*" <<<"$2" | head -n 1 | grep -o '[0-9]*$' || true; }

step()      { CURRENT_STEP="$1"; STEP_START=$SECONDS; log "==> $1"; }
step_done() { local d=$((SECONDS - STEP_START)); STEP_TIMES+=("$(printf '%-34s %6ss' "$CURRENT_STEP" "$d")"); log "<== $CURRENT_STEP (${d}s)"; }
human()     { numfmt --to=iec --suffix=B "$1" 2>/dev/null || echo "${1}B"; }

# ----------------------------------------------------------------------------
# Email (SMTP settings read from ENV_FILE at runtime; never printed)
# ----------------------------------------------------------------------------
# env_get KEY VAR -> sets VAR to the value of KEY in ENV_FILE (dotenv style)
env_get() {
  local key=$1 __out=$2 line val
  line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$ENV_FILE" 2>/dev/null | tail -n 1) || { printf -v "$__out" '%s' ""; return 1; }
  val=${line#*=}
  val=${val%$'\r'}
  val=${val#"${val%%[![:space:]]*}"}                 # ltrim
  if [[ $val == \"*\" && ${#val} -ge 2 ]]; then
    val=${val:1:${#val}-2}
  elif [[ $val == \'*\' && ${#val} -ge 2 ]]; then
    val=${val:1:${#val}-2}
  else
    val=$(sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' <<<"$val")   # inline comment + rtrim
  fi
  printf -v "$__out" '%s' "$val"
}

# escape a string for a double-quoted curl config value
curl_q() { local s=$1; s=${s//\\/\\\\}; s=${s//\"/\\\"}; printf '"%s"' "$s"; }

# send_mail SUBJECT BODY_FILE  — never fails the caller; returns 1 if not sent
send_mail() {
  local subject=$1 body=$2
  if [[ -z $BACKUP_ALERT_EMAIL ]]; then
    echo "send_mail: BACKUP_ALERT_EMAIL not set in $CONF_FILE — not sending '$subject'"
    return 1
  fi
  if [[ ! -r $ENV_FILE ]]; then
    echo "send_mail: $ENV_FILE not readable — cannot send '$subject'"
    return 1
  fi
  local host port user pass from secure
  env_get SMTP_HOST host || true
  env_get SMTP_PORT port || true
  env_get SMTP_USER user || true
  env_get SMTP_PASS pass || true
  env_get EMAIL_FROM from || true
  env_get SMTP_SECURE secure || true
  if [[ -z $host || -z $port || -z $user || -z $pass ]]; then
    echo "send_mail: SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS incomplete in $ENV_FILE — cannot send"
    return 1
  fi
  [[ -n $from ]] || from=$user
  local from_addr=$from
  if [[ $from =~ \<([^>]+)\> ]]; then from_addr=${BASH_REMATCH[1]}; fi
  from_addr=${from_addr//\"/}

  # Same rule as backend/services/emailService.js: implicit TLS if SMTP_SECURE
  # is true/1 or port 465, otherwise STARTTLS (required via --ssl-reqd).
  local scheme=smtp
  secure=${secure,,}
  if [[ $secure == true || $secure == 1 || $port == 465 ]]; then scheme=smtps; fi

  local d; d=$(mktemp -d); chmod 700 "$d"
  local cfg="$d/curl.cfg" msg="$d/msg.eml" rcpt
  {
    printf 'url = %s\n'       "$(curl_q "$scheme://$host:$port/$HOST_FQDN")"
    printf 'user = %s\n'      "$(curl_q "$user:$pass")"
    printf 'mail-from = %s\n' "$(curl_q "$from_addr")"
    local -a rcpts=()
    IFS=',' read -r -a rcpts <<<"$BACKUP_ALERT_EMAIL"
    for rcpt in "${rcpts[@]}"; do
      rcpt=${rcpt//[[:space:]]/}
      if [[ -n $rcpt ]]; then printf 'mail-rcpt = %s\n' "$(curl_q "$rcpt")"; fi
    done
  } >"$cfg"
  {
    printf 'From: %s\n' "$from"
    printf 'To: %s\n' "$BACKUP_ALERT_EMAIL"
    printf 'Subject: %s\n' "$subject"
    printf 'Date: %s\n' "$(date -R)"
    printf 'Message-ID: <plannivo-backup.%s.%s@%s>\n' "$(date +%s)" "$$" "$HOST_FQDN"
    printf 'MIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\nAuto-Submitted: auto-generated\n\n'
    cat "$body"
  } >"$msg"
  local rc=0
  curl --silent --show-error --ssl-reqd --crlf --connect-timeout 20 --max-time 90 \
       -K "$cfg" -T "$msg" >/dev/null || rc=$?
  rm -rf "$d"
  if ((rc)); then echo "send_mail: curl failed (rc=$rc) for '$subject'"; return 1; fi
  echo "send_mail: sent '$subject' to $BACKUP_ALERT_EMAIL"
}

# ----------------------------------------------------------------------------
# Exit handling: failure email always, weekly summary on success
# ----------------------------------------------------------------------------
on_err() {
  local rc=$? cmd=$BASH_COMMAND line=${BASH_LINENO[0]}
  [[ -n $FAIL_REASON ]] || FAIL_REASON="command failed (rc=$rc) at line $line: $cmd"
  printf '[%s] ERROR in step "%s": %s\n' "$RUN_ID" "$CURRENT_STEP" "$FAIL_REASON"
}
trap on_err ERR
trap 'FAIL_REASON="interrupted by signal"; exit 130' INT
trap 'FAIL_REASON="terminated by signal"; exit 143' TERM

on_exit() {
  local rc=$?
  trap - ERR
  set +e
  if [[ -n $DRILL_NAME ]]; then docker rm -f -v "$DRILL_NAME" >/dev/null 2>&1; fi
  if [[ -n $DUMP_TMP_CONTAINER && -n $DUMP_TMP_PATH ]]; then docker exec "$DUMP_TMP_CONTAINER" rm -f "$DUMP_TMP_PATH" >/dev/null 2>&1; fi
  [[ -n $TMP_DIR && -d $TMP_DIR ]] && rm -rf "$TMP_DIR"

  local total=$SECONDS status
  if ((rc == 0)); then status="OK"; else status="FAILED"; fi
  if ((TEST_EMAIL)); then
    log "test-email mode finished rc=$rc"
  else
    log "RESULT $status date=$RUN_DATE rc=$rc duration=${total}s step=\"$CURRENT_STEP\" size=$(du -sb "$RUN_DIR" 2>/dev/null | cut -f1)"
    printf '%s %s rc=%s step=%s\n' "$(date -Is)" "$status" "$rc" "$CURRENT_STEP" >"$STATE_DIR/last-run"
  fi

  # Close the pipe to the timestamping logger and wait so the log is complete.
  exec 1>&3 2>&4
  wait "$LOGGER_PID" 2>/dev/null

  ((TEST_EMAIL)) && exit "$rc"

  local body; body=$(mktemp)
  if ((rc != 0)); then
    {
      echo "Plannivo nightly backup FAILED on $HOST_FQDN"
      echo
      echo "Date:        $RUN_DATE"
      echo "Failed step: $CURRENT_STEP"
      echo "Reason:      ${FAIL_REASON:-unknown}"
      echo "Exit code:   $rc"
      echo "Duration:    ${total}s"
      echo
      echo "Nothing was pruned (retention only runs after a fully verified upload)."
      if [[ -f $RUN_DIR/SHA256SUMS ]] && (( $(stat -c %Y "$RUN_DIR/SHA256SUMS") >= START_EPOCH )); then
        echo "Today's LOCAL backup is complete and verified: $RUN_DIR"
      fi
      if [[ -n $DRIVE_SUMMARY ]]; then echo "Google Drive: $DRIVE_SUMMARY"; fi
      echo "Partial work (if any): $WORK_DIR"
      echo
      echo "---- last 60 log lines of this run ($LOG_FILE) ----"
      tail -c "+$((LOG_START_BYTES + 1))" "$LOG_FILE" | tail -n 60
    } >"$body"
    send_mail "[Plannivo backup] FAILED on $HOST_FQDN ($RUN_DATE) at: $CURRENT_STEP" "$body" 2>&1 | stamp >>"$LOG_FILE"
  elif ((DO_WEEKLY_WORK)); then
    {
      echo "Plannivo backup — weekly summary for $HOST_FQDN"
      echo
      echo "Today's run: OK ($RUN_DATE, ${total}s total)"
      echo "Restore drill: $DRILL_RESULT"
      echo
      echo "Files ($RUN_DIR):"
      (cd "$RUN_DIR" 2>/dev/null && find . -maxdepth 1 -type f -printf '%f\t%s\n' | sort | while IFS=$'\t' read -r f s; do printf '  %-40s %10s\n' "$f" "$(human "$s")"; done)
      echo "  total: $(human "$(du -sb "$RUN_DIR" 2>/dev/null | cut -f1)")"
      echo
      echo "Step durations:"
      printf '  %s\n' "${STEP_TIMES[@]}"
      echo
      if ((${#WARNINGS[@]})); then echo "Warnings:"; printf '  - %s\n' "${WARNINGS[@]}"; echo; fi
      echo "Last runs (from $LOG_FILE):"
      grep -h ' RESULT ' "$LOG_FILE" 2>/dev/null | tail -n 8 | sed 's/^/  /'
      echo
      echo "Local free space: $(df -h --output=avail "$BACKUP_ROOT" 2>/dev/null | tail -n1 | tr -d ' ')"
      echo "Uploads volume (local): ${UPLOADS_LOCAL_COUNT:-?} files, $(human "${UPLOADS_LOCAL_BYTES:-0}")"
      echo "Uploads mirror: ${UPLOADS_RESULT:-not run}"
      if ((NO_UPLOAD == 0)); then
        echo
        echo "Google Drive ($GDRIVE_REMOTE:): ${DRIVE_SUMMARY:-unknown}"
        echo "Backup folders on $RCLONE_REMOTE: (dated folders / files / size):"
        local k j
        for k in daily weekly monthly uploads/current uploads/deleted; do
          j=$(rcl size --json "$RCLONE_REMOTE:$k" 2>/dev/null)
          printf '  %-16s %4s / %6s / %10s\n' "$k" \
            "$(rcl lsf --dirs-only "$RCLONE_REMOTE:$k/" 2>/dev/null | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$')" \
            "$(json_num count "$j")" "$(human "$(json_num bytes "$j")")"
        done
      fi
    } >"$body"
    send_mail "[Plannivo backup] OK weekly summary $HOST_FQDN ($RUN_DATE)" "$body" 2>&1 | stamp >>"$LOG_FILE"
  fi
  rm -f "$body"
  exit "$rc"
}
trap on_exit EXIT

# ----------------------------------------------------------------------------
# --test-email
# ----------------------------------------------------------------------------
if ((TEST_EMAIL)); then
  b=$(mktemp)
  printf 'Test message from plannivo-backup %s on %s at %s.\nIf you can read this, failure alerts and weekly summaries will reach you.\n' "$VERSION" "$HOST_FQDN" "$(date)" >"$b"
  if send_mail "[Plannivo backup] test email from $HOST_FQDN" "$b"; then rm -f "$b"; exit 0; else rm -f "$b"; exit 1; fi
fi

# ----------------------------------------------------------------------------
# Lock — two runs never overlap
# ----------------------------------------------------------------------------
mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  FAIL_REASON="another plannivo-backup run holds $LOCK_FILE (previous run still going?)"
  CURRENT_STEP="lock"
  log "ERROR: $FAIL_REASON"
  exit 3
fi

log "plannivo-backup $VERSION starting: date=$RUN_DATE dow=$DOW weekly_work=$DO_WEEKLY_WORK sunday=$IS_SUNDAY monthly=$IS_MONTHLY upload=$((1 - NO_UPLOAD))"

# ----------------------------------------------------------------------------
# Helpers for DB work
# ----------------------------------------------------------------------------
# Exact row count of every table (incl. partitioned parents), tab-separated.
read -r -d '' ROWCOUNT_SQL <<'SQL' || true
SELECT format('%I.%I', n.nspname, c.relname),
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname),
                           false, true, '')))[1]::text::bigint
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname !~ '^pg_(toast|temp)'
ORDER BY 1;
SQL

row_counts() { # container user db outfile
  docker exec -i "$1" psql -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1 -U "$2" -d "$3" <<<"$ROWCOUNT_SQL" >"$4"
  [[ -s $4 ]] || die "row count query returned nothing for $3"
}

container_running() { [[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" == "true" ]]; }

dump_db() { # container user db outfile
  local c=$1 u=$2 db=$3 out=$4
  # Dump to a FILE inside the container (not a pipe) so the archive carries
  # data offsets -> restorable from a seekable file, also with pg_restore -j.
  local inside="/tmp/plannivo-backup-$$-$db.dump"
  DUMP_TMP_CONTAINER=$c; DUMP_TMP_PATH=$inside
  timeout "$DUMP_TIMEOUT" docker exec "$c" pg_dump -U "$u" -d "$db" -Fc -f "$inside"
  # TOC must be readable ...
  docker exec "$c" pg_restore --list "$inside" >"$out.toc.txt"
  grep -q 'TABLE DATA' "$out.toc.txt" || die "dump of $db has no TABLE DATA entries"
  # ... and every data block must decompress (reads the whole archive, writes nothing)
  timeout "$DUMP_TIMEOUT" docker exec "$c" pg_restore -f /dev/null "$inside"
  docker cp "$c:$inside" "$out" >/dev/null
  docker exec "$c" rm -f "$inside"
  DUMP_TMP_CONTAINER=""; DUMP_TMP_PATH=""
  [[ -s $out ]] || die "dump of $db is empty after docker cp"
  log "dump $db OK: $(human "$(stat -c %s "$out")"), $(grep -c 'TABLE DATA' "$out.toc.txt") table-data entries"
}

# ============================================================================
# 0. Preflight
# ============================================================================
step "preflight"
for bin in docker gzip sha256sum flock timeout curl tar numfmt find; do
  command -v "$bin" >/dev/null || die "missing required command: $bin"
done
if ((NO_UPLOAD == 0)); then
  command -v rclone >/dev/null || die "rclone not installed (run install-backup.sh)"
  remotes=$(rclone listremotes)
  grep -qx "${RCLONE_REMOTE}:" <<<"$remotes" || die "rclone remote '${RCLONE_REMOTE}:' not configured (see install-backup.sh output)"
  grep -qx "${GDRIVE_REMOTE}:" <<<"$remotes" || die "rclone remote '${GDRIVE_REMOTE}:' not configured"
fi
container_running "$DB_CONTAINER" || die "container $DB_CONTAINER is not running"
for v in $VOLUMES $UPLOADS_VOLUME; do docker volume inspect "$v" >/dev/null 2>&1 || die "docker volume $v not found"; done
# Host directory of the uploads volume. Only READ by find / rclone (never written).
[[ "$(docker volume inspect -f '{{.Driver}}' "$UPLOADS_VOLUME")" == "local" ]] || die "$UPLOADS_VOLUME is not a 'local' driver volume"
UPLOADS_SRC=$(docker volume inspect -f '{{.Mountpoint}}' "$UPLOADS_VOLUME")
[[ $UPLOADS_SRC == /*/"$UPLOADS_VOLUME"/_data && -d $UPLOADS_SRC ]] || die "unexpected mountpoint for $UPLOADS_VOLUME: '$UPLOADS_SRC'"
UPLOADS_TAR="volume-$UPLOADS_VOLUME.tar.gz"
[[ -z $BACKUP_ALERT_EMAIL ]] && warn "BACKUP_ALERT_EMAIL is empty in $CONF_FILE — no alerts will be sent"
# Pull helper images up front so pull progress never mixes into a tar stream.
imgs=("$TAR_IMAGE")
if ((DO_WEEKLY_WORK && DRILL_ENABLED)); then imgs+=("$DRILL_IMAGE"); fi
for img in "${imgs[@]}"; do
  docker image inspect "$img" >/dev/null 2>&1 || docker pull -q "$img" >/dev/null || die "cannot pull image $img"
done

mkdir -p "$BACKUP_ROOT"; chmod 700 "$BACKUP_ROOT"
free_gb=$(df -P -BG "$BACKUP_ROOT" | awk 'NR==2 {gsub("G","",$4); print $4}')
last_size_gb=0
last_dir=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{4}-[0-9]{2}-[0-9]{2}' -printf '%f\n' | sort | tail -n 1)
if [[ -n $last_dir ]]; then last_size_gb=$(( $(du -sb "$BACKUP_ROOT/$last_dir" | cut -f1) / 1024 / 1024 / 1024 + 1 )); fi
need_gb=$(( MIN_FREE_GB > last_size_gb * 3 ? MIN_FREE_GB : last_size_gb * 3 ))
(( free_gb >= need_gb )) || die "only ${free_gb}G free on $BACKUP_ROOT, need >= ${need_gb}G"
log "free space ${free_gb}G (need ${need_gb}G)"

# leftovers from killed runs (we hold the lock, so these are stale)
docker ps -aq --filter label=plannivo.backup | xargs -r docker rm -f -v >/dev/null
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '.*.partial' -exec rm -rf {} +
TMP_DIR=$(mktemp -d)
mkdir -p "$WORK_DIR"
step_done

# ============================================================================
# 1. Production database
# ============================================================================
step "db: row counts before dump"
row_counts "$DB_CONTAINER" "$DB_USER" "$DB_NAME" "$WORK_DIR/rowcounts.before.tsv"
step_done

step "db: pg_dump -Fc $DB_NAME"
dump_db "$DB_CONTAINER" "$DB_USER" "$DB_NAME" "$WORK_DIR/$DB_NAME.dump"
step_done

step "db: row counts after dump"
row_counts "$DB_CONTAINER" "$DB_USER" "$DB_NAME" "$WORK_DIR/rowcounts.after.tsv"
step_done

step "db: pg_dumpall --globals-only"
docker exec "$DB_CONTAINER" pg_dumpall -U "$DB_USER" --globals-only | gzip -6 >"$WORK_DIR/globals.sql.gz"
gzip -dc "$WORK_DIR/globals.sql.gz" | grep 'CREATE ROLE' >/dev/null || die "globals dump contains no CREATE ROLE"
step_done

# ============================================================================
# 2. Docker volumes (read-only mount, throw-away container, no network)
# ============================================================================
for v in $VOLUMES $UPLOADS_VOLUME; do
  step "volume: $v"
  timeout "$TAR_TIMEOUT" docker run --rm --network none --label plannivo.backup=tar \
    -v "$v":/v:ro "$TAR_IMAGE" tar -C /v -czf - . >"$WORK_DIR/volume-$v.tar.gz"
  gzip -t "$WORK_DIR/volume-$v.tar.gz"
  log "$v: $(human "$(stat -c %s "$WORK_DIR/volume-$v.tar.gz")")"
  step_done
done

step "uploads: file list"
UPLOADS_LOCAL_COUNT=$(find "$UPLOADS_SRC" -type f | wc -l)
UPLOADS_LOCAL_BYTES=$(find "$UPLOADS_SRC" -type f -printf '%s\n' | awk '{s += $1} END {printf "%d", s}')
# small off-site record of what the mirror should contain (path, size, mtime)
find "$UPLOADS_SRC" -type f -printf '%P\t%s\t%TY-%Tm-%Td %TH:%TM\n' | sort | gzip -6 >"$WORK_DIR/uploads-filelist.tsv.gz"
log "uploads volume: $UPLOADS_LOCAL_COUNT files, $(human "$UPLOADS_LOCAL_BYTES")"
step_done

# ============================================================================
# 3. Secrets / config (env, SSL, nginx, letsencrypt, acme.sh)
# ============================================================================
step "config: env/SSL/nginx/letsencrypt"
declare -a cfg_rel=()
for p in $CONFIG_PATHS_REQUIRED; do
  [[ -e $p ]] || die "required config path missing: $p"
  cfg_rel+=("${p#/}")
done
for p in $CONFIG_PATHS_OPTIONAL; do
  if [[ -e $p ]]; then cfg_rel+=("${p#/}"); else warn "optional config path missing: $p"; fi
done
tar_rc=0
tar -C / -czpf "$WORK_DIR/config-secrets.tar.gz" -- "${cfg_rel[@]}" || tar_rc=$?
if ((tar_rc == 1)); then warn "tar reported files changed while reading config (rc=1) — archive kept"
elif ((tar_rc != 0)); then die "tar of config paths failed (rc=$tar_rc)"; fi
gzip -t "$WORK_DIR/config-secrets.tar.gz"
step_done

# ============================================================================
# 4. Demo DB (weekly)
# ============================================================================
if ((DO_WEEKLY_WORK && DEMO_ENABLED)); then
  step "demo db: pg_dump $DEMO_DB_NAME"
  container_running "$DEMO_DB_CONTAINER" || die "demo container $DEMO_DB_CONTAINER is not running (set DEMO_ENABLED=0 to skip)"
  dump_db "$DEMO_DB_CONTAINER" "$DEMO_DB_USER" "$DEMO_DB_NAME" "$WORK_DIR/$DEMO_DB_NAME.dump"
  step_done
fi

# ============================================================================
# 5. Manifest + checksums, then make the backup "complete" locally
# ============================================================================
step "manifest + SHA256SUMS"
{
  echo "plannivo-backup $VERSION"
  echo "host:            $HOST_FQDN"
  echo "date:            $RUN_DATE ($(date -Is))"
  echo "db image:        $(docker inspect -f '{{.Config.Image}}' "$DB_CONTAINER" 2>/dev/null)"
  echo "db version:      $(docker exec "$DB_CONTAINER" psql -X -A -t -U "$DB_USER" -d "$DB_NAME" -c 'SHOW server_version' 2>/dev/null)"
  echo "app git commit:  $(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "app git branch:  $(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "volumes:         $VOLUMES (off-site) ; $UPLOADS_VOLUME (local tar + off-site mirror $RCLONE_REMOTE:uploads/current)"
  echo "uploads:         $UPLOADS_LOCAL_COUNT files, $UPLOADS_LOCAL_BYTES bytes"
  echo "config paths:    ${cfg_rel[*]/#//}"
  echo "weekly work:     $DO_WEEKLY_WORK"
} >"$WORK_DIR/MANIFEST.txt"
(
  cd "$WORK_DIR"
  # SHA256SUMS = everything that goes off-site; SHA256SUMS.local = local-only uploads tar
  find . -maxdepth 1 -type f ! -name 'SHA256SUMS*' ! -name "$UPLOADS_TAR" -printf '%f\n' | sort \
    | xargs -d '\n' sha256sum -- >"$TMP_DIR/SHA256SUMS"
  mv "$TMP_DIR/SHA256SUMS" SHA256SUMS
  sha256sum -- "$UPLOADS_TAR" >SHA256SUMS.local
  sha256sum --quiet -c SHA256SUMS
  sha256sum --quiet -c SHA256SUMS.local
)
chmod 600 "$WORK_DIR"/*
chmod 700 "$WORK_DIR"
if [[ -d $RUN_DIR ]]; then
  log "replacing earlier backup of today: $RUN_DIR"
  rm -rf -- "$RUN_DIR"
fi
mv -- "$WORK_DIR" "$RUN_DIR"
log "local backup complete: $RUN_DIR ($(human "$(du -sb "$RUN_DIR" | cut -f1)"))"
step_done

# ============================================================================
# 6. Off-site: free-space check, small set, uploads mirror
# ============================================================================
# The uploads tar and its checksum file never leave the server.
OFFSITE_FILTER=(--exclude "/$UPLOADS_TAR" --exclude "/SHA256SUMS.local")
if ((NO_UPLOAD == 0)); then
  step "drive: free space"
  about=$(rcl about "$GDRIVE_REMOTE:" --json) || die "rclone about $GDRIVE_REMOTE: failed (auth or rate limit?)"
  d_total=$(json_num total "$about"); d_used=$(json_num used "$about")
  d_trash=$(json_num trashed "$about"); d_free=$(json_num free "$about")
  DRIVE_SUMMARY="used $(human "${d_used:-0}") of $(human "${d_total:-0}"), free $(human "${d_free:-0}"), trash $(human "${d_trash:-0}")"
  log "google drive: $DRIVE_SUMMARY"
  if [[ -z $d_free ]]; then
    warn "rclone about reported no 'free' value — free-space check skipped"
  elif (( d_free < MIN_REMOTE_FREE_GB * 1024 * 1024 * 1024 )); then
    die "Google Drive almost full: only $(human "$d_free") free (minimum ${MIN_REMOTE_FREE_GB} GB). Nothing was uploaded; today's LOCAL backup in $RUN_DIR is complete. Free up Drive space (empty the trash, delete other files) or lower the retention."
  fi
  step_done

  step "upload: small set -> $RCLONE_REMOTE:daily/$RUN_DATE"
  timeout "$UPLOAD_TIMEOUT" rclone copy "$RUN_DIR" "$RCLONE_REMOTE:daily/$RUN_DATE" "${OFFSITE_FILTER[@]}" \
    "${RCLONE_BASE[@]}" "${RCLONE_XFER[@]}" --log-level NOTICE
  step_done

  step "upload: cryptcheck small set"
  # cryptcheck re-encrypts local files with the remote nonce and compares the
  # underlying Drive MD5 — proves the encrypted copies are bit-exact.
  timeout "$UPLOAD_TIMEOUT" rclone cryptcheck "$RUN_DIR" "$RCLONE_REMOTE:daily/$RUN_DATE" --one-way "${OFFSITE_FILTER[@]}" \
    "${RCLONE_BASE[@]}" "${RCLONE_XFER[@]}" --log-level NOTICE
  # decrypt round-trip: proves the configured crypt password can read it back
  rcl cat "$RCLONE_REMOTE:daily/$RUN_DATE/SHA256SUMS" | cmp -s - "$RUN_DIR/SHA256SUMS" \
    || die "decrypted remote SHA256SUMS differs from local"
  step_done

  # Incremental mirror: only new/changed files transfer; files deleted or
  # overwritten since the last run are MOVED to uploads/deleted/<date>/ (kept
  # UPLOADS_DELETED_KEEP_DAYS days). --max-delete stops a mass deletion, and an
  # empty source is refused outright (wrong mount -> would empty the mirror).
  ((UPLOADS_LOCAL_COUNT > 0)) || die "uploads volume $UPLOADS_SRC has 0 files — refusing to sync (would empty the mirror)"
  mirror_ok=0
  for attempt in 1 2; do
    step "uploads: rclone sync -> $RCLONE_REMOTE:uploads/current (attempt $attempt)"
    timeout "$UPLOAD_TIMEOUT" rclone sync "$UPLOADS_SRC" "$RCLONE_REMOTE:uploads/current" \
      --backup-dir "$RCLONE_REMOTE:uploads/deleted/$RUN_DATE" --max-delete "$UPLOADS_MAX_DELETE" --skip-links \
      "${RCLONE_BASE[@]}" "${RCLONE_XFER[@]}" --log-level NOTICE
    step_done
    if ((DO_WEEKLY_WORK)); then mirror_mode="cryptcheck (content hashes)"; else mirror_mode="check (names + sizes)"; fi
    step "uploads: verify mirror — $mirror_mode"
    check_rc=0
    if ((DO_WEEKLY_WORK)); then
      timeout "$UPLOAD_TIMEOUT" rclone cryptcheck "$UPLOADS_SRC" "$RCLONE_REMOTE:uploads/current" --skip-links \
        "${RCLONE_BASE[@]}" "${RCLONE_XFER[@]}" --log-level NOTICE || check_rc=$?
    else
      timeout "$UPLOAD_TIMEOUT" rclone check "$UPLOADS_SRC" "$RCLONE_REMOTE:uploads/current" --size-only --skip-links \
        "${RCLONE_BASE[@]}" "${RCLONE_XFER[@]}" --log-level NOTICE || check_rc=$?
    fi
    step_done
    if ((check_rc == 0)); then mirror_ok=1; break; fi
    # most likely a file was uploaded/changed between sync and check -> sync again once
    warn "uploads mirror check failed (rc=$check_rc, attempt $attempt)"
  done
  ((mirror_ok)) || die "uploads mirror differs from $UPLOADS_SRC after 2 sync+check attempts"
  UPLOADS_RESULT="OK — $UPLOADS_LOCAL_COUNT files / $(human "$UPLOADS_LOCAL_BYTES") in $RCLONE_REMOTE:uploads/current, verified by $mirror_mode"
  printf '%s %s files=%s bytes=%s verify=%s\n' "$(date -Is)" "$RUN_DATE" "$UPLOADS_LOCAL_COUNT" "$UPLOADS_LOCAL_BYTES" "$mirror_mode" >"$STATE_DIR/uploads-mirror-last"
  log "uploads mirror $UPLOADS_RESULT"
else
  warn "--no-upload: off-site copy skipped"
fi

# ============================================================================
# 7. Restore drill (weekly)
# ============================================================================
if ((DO_WEEKLY_WORK && DRILL_ENABLED)); then
  step "restore drill"
  DRILL_RESULT="FAILED"
  DRILL_NAME="plannivo-restore-drill-$$"
  drill_pw=$(head -c 32 /dev/urandom | sha256sum | cut -c1-32)
  docker run -d --rm --name "$DRILL_NAME" --network none --label plannivo.backup=drill \
    -e POSTGRES_USER="$DB_USER" -e POSTGRES_DB="$DB_NAME" -e POSTGRES_PASSWORD="$drill_pw" \
    "$DRILL_IMAGE" >/dev/null
  # TCP check: the image's init phase only listens on the unix socket, so a
  # TCP answer means the real server is up.
  ready=0
  for ((i = 0; i < DRILL_READY_TIMEOUT; i += 2)); do
    if docker exec "$DRILL_NAME" pg_isready -q -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" 2>/dev/null; then ready=1; break; fi
    sleep 2
  done
  ((ready)) || die "restore drill: postgres did not become ready in ${DRILL_READY_TIMEOUT}s"

  # globals first (role "$DB_USER" already exists -> one expected error, ignored)
  gzip -dc "$RUN_DIR/globals.sql.gz" | docker exec -i "$DRILL_NAME" psql -X -q -U "$DB_USER" -d postgres >/dev/null 2>"$TMP_DIR/globals.err" || true
  # restore exactly the file that was uploaded (copied in, seekable)
  docker cp "$RUN_DIR/$DB_NAME.dump" "$DRILL_NAME:/tmp/restore.dump" >/dev/null
  restore_rc=0
  timeout "$DUMP_TIMEOUT" docker exec "$DRILL_NAME" pg_restore -U "$DB_USER" -d "$DB_NAME" --no-password \
    /tmp/restore.dump 2>"$TMP_DIR/restore.err" || restore_rc=$?
  if ((restore_rc != 0)); then
    head -n 30 "$TMP_DIR/restore.err"
    die "restore drill: pg_restore exited $restore_rc ($(grep -ci 'error' "$TMP_DIR/restore.err") error lines)"
  fi
  row_counts "$DRILL_NAME" "$DB_USER" "$DB_NAME" "$TMP_DIR/rowcounts.restored.tsv"

  # Compare: restored count must equal live (or lie within the before..after
  # bracket if the table changed while pg_dump ran). Only DRILL_DRIFT_TABLES
  # may additionally be off by <= DRILL_DRIFT_MAX rows.
  cmp_rc=0
  awk -F'\t' -v drift="$DRILL_DRIFT_TABLES" -v ignore="$DRILL_IGNORE_TABLES" -v maxd="$DRILL_DRIFT_MAX" '
    BEGIN { n = split(drift, d, " "); for (i = 1; i <= n; i++) D[d[i]] = 1
            n = split(ignore, g, " "); for (i = 1; i <= n; i++) G[g[i]] = 1 }
    FILENAME == ARGV[1] { b[$1] = $2 + 0; seen[$1] = 1; next }
    FILENAME == ARGV[2] { a[$1] = $2 + 0; seen[$1] = 1; next }
                        { r[$1] = $2 + 0; rs[$1] = 1 }
    END {
      tables = 0; exact = 0; bracket = 0; drifted = 0; fail = 0
      for (t in seen) {
        if (t in G) continue
        tables++
        if (!(t in rs)) { printf "FAIL   %s: missing after restore\n", t; fail++; continue }
        lo = (t in b) ? b[t] : a[t]; hi = (t in a) ? a[t] : b[t]
        if (lo > hi) { x = lo; lo = hi; hi = x }
        v = r[t]
        if (v >= lo && v <= hi) { if (lo == hi) exact++; else { bracket++; printf "OK~    %s: restored=%d live=%d..%d (changed during dump)\n", t, v, lo, hi }; continue }
        dist = (v < lo) ? lo - v : v - hi
        if ((t in D) && dist <= maxd) { drifted++; printf "DRIFT  %s: restored=%d live=%d..%d (allowed log table)\n", t, v, lo, hi; continue }
        printf "FAIL   %s: restored=%d live=%d..%d\n", t, v, lo, hi; fail++
      }
      for (t in rs) if (!(t in seen) && !(t in G)) { printf "FAIL   %s: exists only in restore\n", t; fail++ }
      printf "SUMMARY tables=%d exact=%d in-bracket=%d drift=%d fail=%d\n", tables, exact, bracket, drifted, fail
      exit (fail > 0)
    }' "$RUN_DIR/rowcounts.before.tsv" "$RUN_DIR/rowcounts.after.tsv" "$TMP_DIR/rowcounts.restored.tsv" \
    >"$TMP_DIR/drill-compare.txt" || cmp_rc=$?
  cat "$TMP_DIR/drill-compare.txt"
  summary_line=$(grep '^SUMMARY' "$TMP_DIR/drill-compare.txt" || echo "SUMMARY missing")
  docker rm -f -v "$DRILL_NAME" >/dev/null 2>&1 || true
  DRILL_NAME=""
  ((cmp_rc == 0)) || die "restore drill: row counts do not match — $summary_line"
  DRILL_RESULT="PASSED (${summary_line#SUMMARY })"
  log "restore drill $DRILL_RESULT"
  step_done
fi

# ============================================================================
# 8. Promote the small set: weekly / monthly (server-side copy on Drive)
# ============================================================================
if ((NO_UPLOAD == 0)); then
  if ((IS_SUNDAY)); then
    step "promote: weekly/$RUN_DATE"
    rclx copy "$RCLONE_REMOTE:daily/$RUN_DATE" "$RCLONE_REMOTE:weekly/$RUN_DATE" --log-level NOTICE
    rclx cryptcheck "$RUN_DIR" "$RCLONE_REMOTE:weekly/$RUN_DATE" --one-way "${OFFSITE_FILTER[@]}" --log-level NOTICE
    step_done
  fi
  # Monthly = the run on the 1st, or the first successful run of a month that
  # has no monthly copy yet (self-heals if the run on the 1st failed).
  if ((IS_MONTHLY == 0)); then
    rcl mkdir "$RCLONE_REMOTE:monthly"
    month_have=$(rcl lsf --dirs-only "$RCLONE_REMOTE:monthly/" | grep -c "^$(date +%Y-%m)-[0-9][0-9]/\$" || true)
    if [[ $month_have == 0 ]]; then IS_MONTHLY=1; log "no monthly copy for $(date +%Y-%m) yet — promoting today's"; fi
  fi
  if ((IS_MONTHLY)); then
    step "promote: monthly/$RUN_DATE"
    rclx copy "$RCLONE_REMOTE:daily/$RUN_DATE" "$RCLONE_REMOTE:monthly/$RUN_DATE" --log-level NOTICE
    rclx cryptcheck "$RUN_DIR" "$RCLONE_REMOTE:monthly/$RUN_DATE" --one-way "${OFFSITE_FILTER[@]}" --log-level NOTICE
    step_done
  fi
fi

# ============================================================================
# 9. Retention — only directories named exactly YYYY-MM-DD
# ============================================================================
list_local_dirs() {
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
    -regex '.*/[0-9]{4}-[0-9]{2}-[0-9]{2}' -printf '%f\n' | sort
}
step "retention: local (keep $LOCAL_KEEP days, uploads tar $LOCAL_UPLOADS_TAR_KEEP)"
mapfile -t local_dirs < <(list_local_dirs)
n=${#local_dirs[@]}
if (( n > LOCAL_KEEP )); then
  for d in "${local_dirs[@]:0:n-LOCAL_KEEP}"; do
    [[ $d =~ $DATE_RE && $d != "$RUN_DATE" ]] || continue
    log "local prune: $BACKUP_ROOT/$d"
    rm -rf -- "${BACKUP_ROOT:?}/$d"
  done
fi
mapfile -t local_dirs < <(list_local_dirs)
n=${#local_dirs[@]}
if (( n > LOCAL_UPLOADS_TAR_KEEP )); then
  for d in "${local_dirs[@]:0:n-LOCAL_UPLOADS_TAR_KEEP}"; do
    [[ $d =~ $DATE_RE && $d != "$RUN_DATE" ]] || continue
    if [[ -f $BACKUP_ROOT/$d/$UPLOADS_TAR ]]; then
      log "local prune uploads tar: $BACKUP_ROOT/$d/$UPLOADS_TAR"
      rm -f -- "${BACKUP_ROOT:?}/$d/$UPLOADS_TAR" "${BACKUP_ROOT:?}/$d/SHA256SUMS.local"
    fi
  done
fi
step_done

# Remote pruning is restricted to these folders; nothing else on the gcrypt
# remote (e.g. plannivo-full-2026-10-05T17-12-48 at its root) is ever touched.
prune_remote() { # folder keep  (keep newest N dated folders)
  local folder=$1 keep=$2 d n
  case $folder in daily|weekly|monthly) ;; *) die "prune_remote: refusing folder '$folder'" ;; esac
  rcl mkdir "$RCLONE_REMOTE:$folder"
  local -a dirs=()
  mapfile -t dirs < <(rcl lsf --dirs-only "$RCLONE_REMOTE:$folder/" | sed 's:/$::' | grep -E "$DATE_RE" | sort)
  n=${#dirs[@]}
  (( n > keep )) || { log "remote $folder: $n folders, nothing to prune"; return 0; }
  for d in "${dirs[@]:0:n-keep}"; do
    [[ $d =~ $DATE_RE && $d != "$RUN_DATE" ]] || continue
    log "remote prune: $RCLONE_REMOTE:$folder/$d"
    rcl purge "$RCLONE_REMOTE:$folder/$d" --drive-use-trash="$REMOTE_USE_TRASH" --log-level NOTICE
  done
}
prune_uploads_deleted() { # dated folders older than UPLOADS_DELETED_KEEP_DAYS
  local cutoff d
  cutoff=$(date -d "-${UPLOADS_DELETED_KEEP_DAYS} days" +%F)
  rcl mkdir "$RCLONE_REMOTE:uploads/deleted"
  local -a dirs=()
  mapfile -t dirs < <(rcl lsf --dirs-only "$RCLONE_REMOTE:uploads/deleted/" | sed 's:/$::' | grep -E "$DATE_RE" | sort)
  for d in "${dirs[@]}"; do
    [[ $d =~ $DATE_RE && $d < $cutoff ]] || continue
    log "remote prune: $RCLONE_REMOTE:uploads/deleted/$d (older than $cutoff)"
    rcl purge "$RCLONE_REMOTE:uploads/deleted/$d" --drive-use-trash="$REMOTE_USE_TRASH" --log-level NOTICE
  done
}
if ((NO_UPLOAD == 0)); then
  step "retention: remote (daily $REMOTE_KEEP_DAILY / weekly $REMOTE_KEEP_WEEKLY / monthly $REMOTE_KEEP_MONTHLY / uploads-deleted ${UPLOADS_DELETED_KEEP_DAYS}d)"
  prune_remote daily   "$REMOTE_KEEP_DAILY"
  prune_remote weekly  "$REMOTE_KEEP_WEEKLY"
  prune_remote monthly "$REMOTE_KEEP_MONTHLY"
  prune_uploads_deleted
  step_done
fi

CURRENT_STEP="done"
log "all steps OK"
exit 0
