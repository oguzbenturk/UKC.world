#!/usr/bin/env bash
# =============================================================================
# harden-ssh.sh — lock-out-safe SSH hardening for the Plannivo server
# (Ubuntu 22.04 / 24.04, run as root ON THE SERVER). Read HARDENING.md first.
#
# Modes (one per invocation):
#   --install-key <pubkey-file>   A: add public key(s) to /root/.ssh/authorized_keys
#                                    (validated, de-duplicated, 700/600 perms, backup)
#   --verify                      B: read-only report: sshd -T, drop-ins, key
#                                    fingerprints, recent logins, fail2ban,
#                                    unattended-upgrades, ufw, listening ports
#   --disable-password            C: requires CONFIRM_KEY_LOGIN_TESTED=yes.
#                                    Writes /etc/ssh/sshd_config.d/99-plannivo-hardening.conf,
#                                    validates (sshd -t + sshd -T), RELOADS ssh,
#                                    arms an automatic rollback in ROLLBACK_MINUTES (10)
#   --confirm                        cancel the automatic rollback (after testing)
#   --rollback                       undo C now (remove drop-in, restore, reload)
#   --fail2ban <operator-ip>      D: install + configure fail2ban sshd jail
#                                    (bantime 1h, findtime 10m, maxretry 5)
#   --unattended-upgrades            install/enable security-only automatic updates
#
# Never enables ufw, never restarts (only reloads) ssh, never touches Docker.
# =============================================================================
set -Eeuo pipefail
umask 022

readonly DROPIN_DIR=/etc/ssh/sshd_config.d
readonly DROPIN="$DROPIN_DIR/99-plannivo-hardening.conf"
readonly AK=/root/.ssh/authorized_keys
readonly ROLLBACK_SCRIPT=/root/plannivo-ssh-rollback.sh
readonly ROLLBACK_UNIT=plannivo-ssh-rollback
readonly F2B_JAIL=/etc/fail2ban/jail.d/plannivo-sshd.local
ROLLBACK_MINUTES="${ROLLBACK_MINUTES:-10}"

c_b=$'\033[1m'; c_r=$'\033[1;31m'; c_g=$'\033[1;32m'; c_y=$'\033[1;33m'; c_0=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s[ok]%s %s\n' "$c_g" "$c_0" "$*"; }
wrn()  { printf '%s[warn]%s %s\n' "$c_y" "$c_0" "$*"; }
die()  { printf '%s[error]%s %s\n' "$c_r" "$c_0" "$*" >&2; exit 1; }
hdr()  { printf '\n%s== %s ==%s\n' "$c_b" "$*" "$c_0"; }

usage() { sed -n '2,/^# =====/p' "$0" | sed 's/^# \{0,1\}//'; }

[[ $# -ge 1 ]] || { usage; exit 2; }
[[ $EUID -eq 0 ]] || die "run as root"

ssh_unit() {
  if systemctl cat ssh.service >/dev/null 2>&1; then echo ssh; else echo sshd; fi
}
sshd_bin() { command -v sshd 2>/dev/null || echo /usr/sbin/sshd; }
sshd_test() { mkdir -p /run/sshd; "$(sshd_bin)" -t; }
sshd_eff()  { mkdir -p /run/sshd; "$(sshd_bin)" -T 2>/dev/null; }
# no 'sshd -T | grep -q' anywhere: with pipefail an early grep exit = SIGPIPE = false failure
eff_has()   { local e; e=$(sshd_eff); grep -Eqi -- "$1" <<<"$e"; }
reload_ssh() {
  local u; u=$(ssh_unit)
  if systemctl is-active --quiet "$u"; then
    systemctl reload "$u"
    ok "systemctl reload $u (existing sessions stay connected)"
  else
    wrn "$u.service is not active (socket activation?) — new config applies to the next connection"
  fi
}
session_ip()   { [[ -n ${SSH_CONNECTION:-} ]] && awk '{print $1}' <<<"$SSH_CONNECTION"; }
session_port() { [[ -n ${SSH_CONNECTION:-} ]] && awk '{print $2}' <<<"$SSH_CONNECTION"; }

# successful-login lines: journal (sshd / sshd-session identifiers), else /var/log/auth.log
auth_log() { # since, journalctl syntax e.g. -24h, -7d
  local out
  out=$(journalctl -t sshd -t sshd-session --since "$1" --no-pager -o short-iso 2>/dev/null \
        | grep -E 'Accepted (publickey|password|keyboard-interactive)' || true)
  if [[ -z $out && -r /var/log/auth.log ]]; then
    out=$(grep -hE 'sshd.*Accepted (publickey|password|keyboard-interactive)' /var/log/auth.log || true)
  fi
  if [[ -n $out ]]; then printf '%s\n' "$out"; fi
  return 0
}

key_re='^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)$'

# =============================================================================
# A) --install-key
# =============================================================================
install_key() {
  local f=${1:-}
  [[ -n $f && -r $f ]] || die "usage: $0 --install-key <pubkey-file> (file not readable: '$f')"
  grep -q 'PRIVATE KEY' "$f" && die "$f looks like a PRIVATE key — pass the .pub file"

  install -d -o root -g root -m 0700 /root/.ssh
  [[ -e $AK ]] || install -o root -g root -m 0600 /dev/null "$AK"
  chown root:root "$AK"; chmod 600 "$AK"

  local line type blob i added=0 backed_up=0 fp
  local -a tok
  while IFS= read -r line || [[ -n $line ]]; do
    line=${line%$'\r'}
    line=${line#"${line%%[![:space:]]*}"}
    [[ -z $line || $line == \#* ]] && continue
    read -r -a tok <<<"$line"
    type=""; blob=""
    for ((i = 0; i < ${#tok[@]} - 1; i++)); do
      if [[ ${tok[i]} =~ $key_re ]]; then type=${tok[i]}; blob=${tok[i+1]}; break; fi
    done
    [[ -n $type ]] || die "unsupported/invalid key line (ssh-dss and unknown types are refused): ${line:0:50}..."
    fp=$(ssh-keygen -l -f <(printf '%s\n' "$line") 2>/dev/null) || die "ssh-keygen cannot parse key: ${line:0:50}..."
    if [[ $type == ssh-rsa ]]; then
      local bits; bits=$(awk '{print $1}' <<<"$fp")
      (( bits >= 3072 )) || wrn "RSA key has only $bits bits — ed25519 recommended"
    fi
    if grep -qF -- "$type $blob" "$AK"; then
      ok "already present: $fp"
      continue
    fi
    if ((backed_up == 0)); then
      cp -p "$AK" "$AK.bak-$(date +%Y%m%d%H%M%S)"; backed_up=1
    fi
    # make sure the file ends with a newline before appending
    if [[ -s $AK && $(tail -c1 "$AK" | od -An -c | tr -d ' ') != '\n' ]]; then printf '\n' >>"$AK"; fi
    printf '%s\n' "$line" >>"$AK"
    added=$((added + 1))
    ok "added: $fp"
  done <"$f"
  chmod 600 "$AK"; chown root:root "$AK"

  hdr "authorized_keys now ($AK)"
  ssh-keygen -l -f "$AK" || wrn "ssh-keygen could not list $AK"
  hdr "relevant sshd settings"
  sshd_eff | grep -Ei '^(pubkeyauthentication|authorizedkeysfile|permitrootlogin|passwordauthentication) ' || true
  eff_has '^pubkeyauthentication yes' || wrn "PubkeyAuthentication is not 'yes' — key login will not work until fixed"

  cat <<EOF

${c_b}Next:${c_0} keep THIS session open and test the key from a SECOND terminal on Windows:
    ssh -i \$env:USERPROFILE\\.ssh\\plannivo_ed25519 -o IdentitiesOnly=yes -o PreferredAuthentications=publickey root@<server>
Only when that works: ${c_b}CONFIRM_KEY_LOGIN_TESTED=yes bash $0 --disable-password${c_0}
($added key(s) added)
EOF
}

# =============================================================================
# B) --verify  (read-only)
# =============================================================================
verify() {
  hdr "sshd effective settings (sshd -T)"
  sshd_test && ok "sshd -t: config valid" || wrn "sshd -t reports an error"
  sshd_eff | grep -Ei '^(port|listenaddress|permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|authenticationmethods|permitemptypasswords|maxauthtries|logingracetime|usepam|authorizedkeysfile|x11forwarding) ' | sort || true
  grep -Eiq '^[[:space:]]*Match[[:space:]]' /etc/ssh/sshd_config "$DROPIN_DIR"/*.conf 2>/dev/null \
    && wrn "Match blocks present — sshd -T above shows the non-Match defaults; check them by hand"
  grep -Eq '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/\*\.conf' /etc/ssh/sshd_config \
    && ok "sshd_config includes $DROPIN_DIR/*.conf" || wrn "sshd_config has no 'Include $DROPIN_DIR/*.conf' — drop-ins are ignored"

  hdr "drop-ins ($DROPIN_DIR) — first value wins, files load in name order"
  ls -l "$DROPIN_DIR" 2>/dev/null || true
  local f
  for f in "$DROPIN_DIR"/*.conf; do
    [[ -e $f ]] || continue
    say "--- $f"; grep -Ev '^[[:space:]]*(#|$)' "$f" || true
  done

  hdr "root authorized_keys"
  if [[ -f $AK ]]; then
    stat -c '%A %U:%G %n' /root/.ssh "$AK"
    ssh-keygen -l -f "$AK" 2>/dev/null || wrn "no valid keys in $AK"
  else
    wrn "$AK does not exist"
  fi
  for f in /home/*/.ssh/authorized_keys; do
    [[ -e $f ]] && say "also: $f ($(grep -cEv '^[[:space:]]*(#|$)' "$f") keys)"
  done

  hdr "successful SSH logins, last 7 days (method user ip -> count)"
  auth_log "-7d" | sed -E 's/.*Accepted ([a-z-]+) for ([^ ]+) from ([^ ]+) .*/\1 \2 \3/' | sort | uniq -c | sort -rn | head -n 20 || true
  if [[ -n ${SSH_CONNECTION:-} ]]; then
    local ip port; ip=$(session_ip); port=$(session_port)
    local own; own=$(auth_log "-2d" | grep -E "from $ip port $port " | tail -n 1 | sed -E 's/.*Accepted ([a-z-]+) .*/\1/' || true)
    say "this session: from $ip port $port, authenticated by: ${own:-unknown}"
  fi

  hdr "automatic rollback timer"
  systemctl list-timers --all --no-pager "$ROLLBACK_UNIT.timer" 2>/dev/null | grep -q "$ROLLBACK_UNIT" \
    && systemctl list-timers --all --no-pager "$ROLLBACK_UNIT.timer" || say "none armed"

  hdr "fail2ban"
  if command -v fail2ban-client >/dev/null; then
    systemctl is-active fail2ban || true
    fail2ban-client status sshd 2>/dev/null || wrn "sshd jail not running"
    [[ -f $F2B_JAIL ]] && { say "--- $F2B_JAIL"; cat "$F2B_JAIL"; }
  else
    say "not installed  (bash $0 --fail2ban <your-ip>)"
  fi

  hdr "unattended-upgrades"
  if dpkg -s unattended-upgrades >/dev/null 2>&1; then
    apt-config dump 2>/dev/null | grep -E '^APT::Periodic::(Update-Package-Lists|Unattended-Upgrade) ' || wrn "APT::Periodic not set"
    say "apt-daily-upgrade.timer: $(systemctl is-enabled apt-daily-upgrade.timer 2>/dev/null) / $(systemctl is-active apt-daily-upgrade.timer 2>/dev/null)"
    tail -n 3 /var/log/unattended-upgrades/unattended-upgrades.log 2>/dev/null || true
  else
    say "not installed  (bash $0 --unattended-upgrades)"
  fi
  [[ -f /var/run/reboot-required ]] && wrn "reboot required: $(tr '\n' ' ' </var/run/reboot-required.pkgs 2>/dev/null)"

  hdr "ufw (report only — this script never enables it)"
  if command -v ufw >/dev/null; then ufw status verbose || true; else say "ufw not installed"; fi
  say "note: ports published by Docker (-p) bypass ufw rules via the DOCKER iptables chain"

  hdr "listening TCP ports (ss -ltnp)"
  ss -ltnpH 2>/dev/null | awk '
    { addr=$4; proc=$6
      if (addr ~ /^(127\.|\[::1\]|::1)/) scope="local "
      else if (addr ~ /^(0\.0\.0\.0|\*|\[::\]):/) scope="ALL-IF"
      else scope="iface "
      printf "%s  %-28s %s\n", scope, addr, proc }' | sort -u
  say "(ALL-IF = listens on every interface -> internet-reachable unless a provider/host firewall blocks it)"
}

# =============================================================================
# C) --disable-password
# =============================================================================
disable_password() {
  [[ ${CONFIRM_KEY_LOGIN_TESTED:-} == yes ]] || die "refusing: first log in with your key in a SECOND session, then run:
    CONFIRM_KEY_LOGIN_TESTED=yes bash $0 --disable-password"

  # --- safety checks -------------------------------------------------------
  [[ -s $AK ]] || die "$AK is empty or missing — install a key first (--install-key)"
  local nkeys; nkeys=$( (ssh-keygen -l -f "$AK" 2>/dev/null || true) | wc -l)
  (( nkeys >= 1 )) || die "no valid key in $AK"
  ok "$nkeys valid key(s) in $AK"
  grep -Eq '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/\*\.conf' /etc/ssh/sshd_config \
    || die "/etc/ssh/sshd_config does not Include $DROPIN_DIR/*.conf — the drop-in would be ignored. Fix by hand."
  eff_has '^pubkeyauthentication yes' || die "PubkeyAuthentication is not 'yes' — aborting"
  if [[ ${SKIP_KEY_LOG_CHECK:-} != yes ]]; then
    local recent; recent=$(auth_log "-24h")
    grep -q 'Accepted publickey for root ' <<<"$recent" \
      || die "no 'Accepted publickey for root' in the auth log of the last 24h — log in with the key first (override: SKIP_KEY_LOG_CHECK=yes)"
    ok "found a successful root key login in the last 24h"
  fi
  # keys that sshd_config sets BEFORE the Include line would win over any drop-in
  local pre
  pre=$(awk 'tolower($0) ~ /^[[:space:]]*include[[:space:]]/ {exit} {print}' /etc/ssh/sshd_config \
        | grep -Ei '^[[:space:]]*(PasswordAuthentication|KbdInteractiveAuthentication|ChallengeResponseAuthentication|PermitRootLogin|MaxAuthTries)[[:space:]]' || true)
  [[ -z $pre ]] || die "sshd_config sets these BEFORE its Include line (they would override the drop-in) — move/remove them by hand first:
$pre"

  local ts; ts=$(date +%Y%m%d%H%M%S)
  local bdir="/root/ssh-hardening-backup-$ts"
  mkdir -p "$bdir"; chmod 700 "$bdir"
  cp -a /etc/ssh/sshd_config "$bdir/"
  cp -a "$DROPIN_DIR" "$bdir/" 2>/dev/null || true
  ok "backup of current ssh config: $bdir"

  # --- other drop-ins that would win (first value wins, e.g. 50-cloud-init.conf) ---
  local -a edited=()
  local f key
  for f in "$DROPIN_DIR"/*.conf; do
    [[ -e $f && $f != "$DROPIN" ]] || continue
    if grep -Eiq '^[[:space:]]*(PasswordAuthentication|KbdInteractiveAuthentication|ChallengeResponseAuthentication|PermitRootLogin|MaxAuthTries)[[:space:]]' "$f"; then
      for key in PasswordAuthentication KbdInteractiveAuthentication ChallengeResponseAuthentication PermitRootLogin MaxAuthTries; do
        sed -i -E "s/^([[:space:]]*${key}[[:space:]].*)$/# \1    # disabled by plannivo-hardening $ts/I" "$f"
      done
      edited+=("$(basename "$f")")
      wrn "commented out conflicting settings in $f (original in $bdir/sshd_config.d/)"
    fi
  done

  # --- rollback script (used by the timer, by --rollback, and by you) ---------
  {
    echo '#!/bin/bash'
    echo "# Generated by harden-ssh.sh at $ts — undoes --disable-password."
    echo 'set -u'
    echo "rm -f '$DROPIN'"
    for f in "${edited[@]}"; do
      echo "cp -a '$bdir/sshd_config.d/$f' '$DROPIN_DIR/$f'"
    done
    echo 'mkdir -p /run/sshd'
    echo 'if /usr/sbin/sshd -t; then'
    echo '  systemctl reload ssh 2>/dev/null || systemctl reload sshd'
    echo '  echo "SSH hardening rolled back: password login allowed again."'
    echo 'else'
    echo "  echo 'sshd -t FAILED after rollback — compare /etc/ssh with $bdir' >&2"
    echo 'fi'
    echo "systemctl stop $ROLLBACK_UNIT.timer 2>/dev/null || true"
  } >"$ROLLBACK_SCRIPT"
  chmod 700 "$ROLLBACK_SCRIPT"
  ok "rollback script: $ROLLBACK_SCRIPT"

  # --- drop-in ---------------------------------------------------------------
  local tmp; tmp=$(mktemp "$DROPIN_DIR/.plannivo.XXXXXX")
  cat >"$tmp" <<EOF
# Managed by scripts/ops/harden-ssh.sh ($ts). Rollback: $ROLLBACK_SCRIPT
# (or: rm $DROPIN && sshd -t && systemctl reload ssh)
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
MaxAuthTries 4
EOF
  chmod 644 "$tmp"
  mv -f "$tmp" "$DROPIN"
  ok "wrote $DROPIN"

  # --- validate --------------------------------------------------------------
  if ! sshd_test; then
    bash "$ROLLBACK_SCRIPT" || true
    die "sshd -t failed — rolled back, nothing reloaded"
  fi
  local eff; eff=$(sshd_eff)
  local bad=0 want
  # (sshd -T prints prohibit-password under its old alias "without-password")
  for want in 'passwordauthentication no' 'kbdinteractiveauthentication no' 'permitrootlogin (prohibit-password|without-password)' 'pubkeyauthentication yes' 'maxauthtries 4'; do
    if grep -Eqix "$want" <<<"$eff"; then ok "effective: $want"; else wrn "NOT effective: $want (got: $(grep -i "^${want%% *} " <<<"$eff"))"; bad=1; fi
  done
  if ((bad)); then
    bash "$ROLLBACK_SCRIPT" || true
    die "effective config does not match — rolled back. Run --verify and look for other files setting these keys."
  fi

  # --- arm automatic rollback, then reload -----------------------------------
  systemctl stop "$ROLLBACK_UNIT.timer" >/dev/null 2>&1 || true
  systemctl reset-failed "$ROLLBACK_UNIT.timer" "$ROLLBACK_UNIT.service" >/dev/null 2>&1 || true
  systemd-run --quiet --unit="$ROLLBACK_UNIT" --description="Plannivo SSH hardening auto-rollback" \
    --on-active="${ROLLBACK_MINUTES}m" --timer-property=AccuracySec=1s /bin/bash "$ROLLBACK_SCRIPT"
  ok "automatic rollback armed: runs in ${ROLLBACK_MINUTES} min unless you run --confirm"

  reload_ssh

  cat <<EOF

${c_b}DO NOT CLOSE THIS SESSION.${c_0} Within ${ROLLBACK_MINUTES} minutes, from a NEW Windows terminal:
  1) key login must work:
       ssh -i \$env:USERPROFILE\\.ssh\\plannivo_ed25519 -o IdentitiesOnly=yes root@<server>
  2) password login must be refused ("Permission denied (publickey)"):
       ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive root@<server>
  3) both OK -> in any root session:   ${c_b}bash $0 --confirm${c_0}

If key login FAILS: do nothing — the timer restores password login in ${ROLLBACK_MINUTES} min —
or run ${c_b}$ROLLBACK_SCRIPT${c_0} in this still-open session.
Manual rollback any time:  rm $DROPIN && sshd -t && systemctl reload ssh
(and restore ${edited[*]:-nothing else} from $bdir/sshd_config.d/ if listed).
Last resort if every SSH session is gone: the provider's web/VNC/serial console
(logs in through getty+PAM, not sshd, so the root password still works there) ->
run $ROLLBACK_SCRIPT.
EOF
}

confirm() {
  if systemctl stop "$ROLLBACK_UNIT.timer" >/dev/null 2>&1; then
    systemctl reset-failed "$ROLLBACK_UNIT.timer" "$ROLLBACK_UNIT.service" >/dev/null 2>&1 || true
    ok "automatic rollback cancelled — hardening is permanent ($DROPIN)"
  else
    wrn "no rollback timer was armed"
  fi
  sshd_eff | grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|maxauthtries) ' || true
  say "Manual rollback stays available: $ROLLBACK_SCRIPT"
}

rollback() {
  if [[ -x $ROLLBACK_SCRIPT ]]; then
    bash "$ROLLBACK_SCRIPT"
  else
    rm -f "$DROPIN"
    sshd_test && reload_ssh
    ok "removed $DROPIN and reloaded"
  fi
}

# =============================================================================
# D) --fail2ban <operator-ip>
# =============================================================================
fail2ban_setup() {
  local ip=${1:-}
  [[ $ip =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}(/[0-9]{1,2})?$ || $ip =~ ^[0-9a-fA-F:]{2,39}(/[0-9]{1,3})?$ ]] \
    || die "usage: $0 --fail2ban <your-public-ip>   (got '$ip')"
  local sip; sip=$(session_ip || true)
  if [[ -n $sip && $sip != "${ip%/*}" ]]; then
    wrn "you are connected from $sip but asked to whitelist $ip — make sure $ip is right"
  fi
  local ports; ports=$(sshd_eff | awk 'tolower($1)=="port"{print $2}' | sort -u | paste -sd, -)
  [[ -n $ports ]] || ports=ssh

  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban python3-systemd
  install -d -m 0755 /etc/fail2ban/jail.d
  [[ -f $F2B_JAIL ]] && cp -p "$F2B_JAIL" "$F2B_JAIL.bak-$(date +%Y%m%d%H%M%S)"
  cat >"$F2B_JAIL" <<EOF
# Managed by scripts/ops/harden-ssh.sh — sshd brute-force protection.
# Overrides /etc/fail2ban/jail.d/defaults-debian.conf (.local is read last).
[sshd]
enabled  = true
backend  = systemd
port     = $ports
bantime  = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 ::1 $ip
EOF
  chmod 644 "$F2B_JAIL"
  fail2ban-client -t >/dev/null || die "fail2ban config test failed (fail2ban-client -t)"
  systemctl enable --quiet fail2ban
  systemctl restart fail2ban
  sleep 2
  fail2ban-client status sshd
  ok "fail2ban active; $ip is never banned. Unban someone: fail2ban-client set sshd unbanip <ip>"
}

# =============================================================================
# unattended-upgrades (security pocket only, no auto-reboot)
# =============================================================================
unattended_setup() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades
  local f=/etc/apt/apt.conf.d/20auto-upgrades
  [[ -f $f ]] && cp -p "$f" "/root/20auto-upgrades.bak-$(date +%Y%m%d%H%M%S)"
  cat >"$f" <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  cat >/etc/apt/apt.conf.d/52plannivo-unattended-upgrades <<'EOF'
// Managed by scripts/ops/harden-ssh.sh
// Origins stay the Ubuntu default from 50unattended-upgrades (= *-security only).
Unattended-Upgrade::Automatic-Reboot "false";
// A Docker engine upgrade restarts EVERY container on this host (Plannivo and the
// other apps). Patch these by hand in a maintenance window instead.
Unattended-Upgrade::Package-Blacklist {
  "docker.io"; "docker-ce"; "docker-ce-cli"; "containerd"; "containerd.io"; "runc"; "docker-compose";
};
EOF
  systemctl enable --now --quiet apt-daily.timer apt-daily-upgrade.timer
  ok "unattended-upgrades enabled (security only, no automatic reboot, docker packages held back)"
  apt-config dump | grep -E '^APT::Periodic::(Update-Package-Lists|Unattended-Upgrade) '
  say "dry run (takes ~30s):"
  unattended-upgrade --dry-run 2>&1 | tail -n 5 || true
}

# =============================================================================
case "$1" in
  --install-key)          shift; install_key "${1:-}" ;;
  --verify)               verify ;;
  --disable-password)     disable_password ;;
  --confirm)              confirm ;;
  --rollback)             rollback ;;
  --fail2ban)             shift; fail2ban_setup "${1:-}" ;;
  --unattended-upgrades)  unattended_setup ;;
  -h|--help)              usage ;;
  *)                      usage; exit 2 ;;
esac
