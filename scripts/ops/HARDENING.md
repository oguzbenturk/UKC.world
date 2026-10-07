# Server hardening: SSH keys, no passwords, fail2ban, security updates

Script: `scripts/ops/harden-ssh.sh` (run on the server as root). Every step is
safe against lock-out **if you follow this order**. Keep **one root SSH session open the
whole time** (session #1). Do every test in a **new** window.

## 0. Before you start

- Make sure you can open the **provider's web console** (VNC/serial console) and that you
  know the root password there. Console logins go through getty+PAM, not sshd, so they
  still work after password SSH is disabled. This is the last-resort way back in.
- Copy the scripts to the server (password login still works at this point), *Windows PowerShell*, from the repo root:
  ```powershell
  scp -r .\scripts\ops root@<server>:/root/plannivo-ops
  ```
  Keep them **outside** `/root/plannivo`, which is a git checkout that deploys reset.

## 1. Generate an ed25519 key on Windows

```powershell
ssh-keygen -t ed25519 -a 100 -C "oguz@plannivo-deploy" -f "$env:USERPROFILE\.ssh\plannivo_ed25519"
```
- Passphrase: recommended. NodeSSH then reads it from the `DEPLOY_KEY_PASSPHRASE`
  env var at deploy time (`$env:DEPLOY_KEY_PASSPHRASE = '...'` in the PowerShell session).
  With an empty passphrase, the file is protected only by your Windows account.
- Back up `plannivo_ed25519` (the private key) to your password manager.

## 2. Install the public key (step A)

```powershell
scp "$env:USERPROFILE\.ssh\plannivo_ed25519.pub" root@<server>:/root/
```
Session #1 (server):
```bash
bash /root/plannivo-ops/harden-ssh.sh --install-key /root/plannivo_ed25519.pub
```
The script validates the key, skips duplicates, sets perms 700/600 and backs up the old
`authorized_keys` to `authorized_keys.bak-*`. It also accepts files with Windows CRLF line endings.

## 3. Test the key in a SECOND session

*Windows*, new window:
```powershell
ssh -i "$env:USERPROFILE\.ssh\plannivo_ed25519" -o IdentitiesOnly=yes -o PreferredAuthentications=publickey root@<server>
```
It must log in **without asking for a password**. A passphrase prompt for the key is fine.
Optional `~/.ssh/config` entry so `ssh plannivo` works:
```
Host plannivo
    HostName <server-ip>
    User root
    IdentityFile ~/.ssh/plannivo_ed25519
    IdentitiesOnly yes
```

## 4. Verify (step B, read-only)

```bash
bash /root/plannivo-ops/harden-ssh.sh --verify
```
Run this from the key session. It should show `this session: ... authenticated by: publickey`,
your key's fingerprint, the effective `sshd -T` values, fail2ban/unattended-upgrades status,
`ufw status`, and every listening TCP port (`ss -ltnp`).

## 5. Switch the deploy tooling to the key (before disabling passwords)

`scripts/push-all.js` and `scripts/db-sync-from-prod.js` now use `privateKeyPath` when it
is set and fall back to `password` only when it is not:

| File | Lines | Change |
|---|---|---|
| `scripts/push-all.js` | 373-375 | key path = `DEPLOY_KEY_PATH` env → `privateKeyPath` → legacy `keyPath`; `~` expanded |
| `scripts/push-all.js` | 387-389 | password sent only when no key is configured; `passphrase` from `DEPLOY_KEY_PASSPHRASE` |
| `scripts/db-sync-from-prod.js` | 54-56, 60-62 | same logic (before: password only) |

(push-all already supported `keyPath`, but it sent the password as well; db-sync supported password only.)

New `.deploy.secrets.json` shape (placeholders):
```json
{
  "host": "<server-ip-or-hostname>",
  "user": "root",
  "privateKeyPath": "C:\\Users\\<you>\\.ssh\\plannivo_ed25519",
  "keyPath": "C:\\Users\\<you>\\.ssh\\plannivo_ed25519",
  "password": "<optional - only used when no key path is set>",
  "path": "/root/plannivo",
  "branch": "main",
  "n8nApiKey": "<n8n-api-key>",
  "n8nWorkflowId": "<n8n-workflow-id>"
}
```
`keyPath` (same value) is only needed for `scripts/push-sync.js` (`npm run push:sync`), which was
not changed and reads `keyPath` only. You can also drop `password` entirely once step 6 is confirmed.

Test without deploying, *Windows*, from the repo root:
```powershell
node --input-type=module -e "import {NodeSSH} from 'node-ssh'; import fs from 'fs'; const s=JSON.parse(fs.readFileSync('.deploy.secrets.json','utf8')); const c=new NodeSSH(); await c.connect({host:s.host,username:s.user||'root',privateKey:fs.readFileSync(s.privateKeyPath,'utf8'),passphrase:process.env.DEPLOY_KEY_PASSPHRASE}); console.log((await c.execCommand('whoami; hostname; uptime')).stdout); c.dispose();"
```
`npm run db:sync` is a real end-to-end test too: it only reads prod and overwrites your local dev DB.

## 6. Disable password login (step C)

Only after steps 3 and 5 worked. Session #1:
```bash
CONFIRM_KEY_LOGIN_TESTED=yes bash /root/plannivo-ops/harden-ssh.sh --disable-password
```
What it does:
1. Refuses unless `CONFIRM_KEY_LOGIN_TESTED=yes` is set, `authorized_keys` has a valid key, the
   auth log shows an `Accepted publickey for root` in the last 24h, and `sshd_config` actually
   `Include`s `sshd_config.d/*.conf`.
2. Backs up `/etc/ssh` config to `/root/ssh-hardening-backup-<ts>/` and writes `/root/plannivo-ssh-rollback.sh`.
3. Writes `/etc/ssh/sshd_config.d/99-plannivo-hardening.conf`:
   `PasswordAuthentication no`, `KbdInteractiveAuthentication no`,
   `PermitRootLogin prohibit-password`, `PubkeyAuthentication yes`, `MaxAuthTries 4`.
   In sshd the **first** value of a keyword wins, and drop-ins load in name order. So an
   earlier drop-in like the common `50-cloud-init.conf` (`PasswordAuthentication yes`)
   would silently override the `99-` file. The script comments out such conflicting lines
   (originals are in the backup) and **verifies the effective values with `sshd -T`**.
   It rolls back by itself if `sshd -t` fails or any value is not effective.
4. Arms an **automatic rollback in 10 minutes** (`systemd-run` timer; change with `ROLLBACK_MINUTES=15`).
5. **Reloads** ssh (no restart). Your open sessions stay connected.

Then within 10 minutes, *Windows*, new window:
```powershell
ssh plannivo                                                            # key: must work
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive root@<server>   # must say: Permission denied (publickey)
```
Both as expected? Then:
```bash
bash /root/plannivo-ops/harden-ssh.sh --confirm      # cancels the auto-rollback
```

### Rollback
- Do nothing: the timer restores password login after 10 minutes, or
- `bash /root/plannivo-ssh-rollback.sh` (or `harden-ssh.sh --rollback`) in any open session, or
- manually: `rm /etc/ssh/sshd_config.d/99-plannivo-hardening.conf && sshd -t && systemctl reload ssh`
  and restore any drop-in the script commented out from `/root/ssh-hardening-backup-<ts>/sshd_config.d/`.
- **Last resort**, with every SSH session gone: provider web console → log in as root with the
  password → `bash /root/plannivo-ssh-rollback.sh`. If you do not know the root password:
  use the provider's "reset root password" or rescue-system feature, then do the same.

## 7. fail2ban (step D)

Find your public IP, *Windows*: `Invoke-RestMethod https://api.ipify.org`
```bash
bash /root/plannivo-ops/harden-ssh.sh --fail2ban <your-ip>
```
This installs `fail2ban` and `python3-systemd`, then writes `/etc/fail2ban/jail.d/plannivo-sshd.local`
(`[sshd]`, systemd backend, bantime 1h, findtime 10m, maxretry 5, `ignoreip` = localhost plus your IP).
After that it tests the config, enables the service and prints `fail2ban-client status sshd`.
With a dynamic home IP you can still get banned from a new address after 5 failures.
Wait 1h, or from the console run `fail2ban-client set sshd unbanip <ip>`. Re-run the command to change the whitelisted IP.

## 8. Automatic security updates

```bash
bash /root/plannivo-ops/harden-ssh.sh --unattended-upgrades
```
This installs `unattended-upgrades`, sets `APT::Periodic` to daily, and keeps the Ubuntu default origins (the `-security` pocket only).
It sets **no automatic reboot**. Docker engine packages (`docker.io`/`docker-ce`/`containerd`/`runc`) are
**held back**: upgrading them restarts every container on the host, the other apps' containers included.
Patch those by hand in a maintenance window: `apt-get install --only-upgrade docker.io containerd runc`.
`--verify` shows when a reboot is pending (`/var/run/reboot-required`).

## 9. Firewall (report only)

The script **never enables ufw**, because the other apps on this server may need ports.
`--verify` lists `ufw status` and every listening TCP port, marking `ALL-IF` (all interfaces)
vs `local` (127.0.0.1). Notes before you change anything:
- Ports published by Docker (`-p 0.0.0.0:...`) **bypass ufw**: Docker inserts its own iptables rules.
  Plannivo's own ports are already bound to `127.0.0.1` (8080/8443/5432/5678). Use `--verify` to check the other apps.
- A provider-level firewall (cloud panel) is safer than ufw on a Docker host. Allow 22, 80 and 443,
  plus whatever the other apps need.

## 10. Afterwards

- These ~40 older one-off SSH scripts in `scripts/` read **only** `secrets.password` and will stop
  connecting once passwords are off: `run-prod-sql.js`, `fetch-prod-logs.js`, `deploy-ssl-only.mjs`,
  `reload-host-nginx.mjs`, `inspect-host-nginx.mjs`, `ssh-ssl-setup.mjs`, `run-*-repair-on-prod.mjs`, and others
  (`grep -l "secrets.password" scripts/*`). Give the ones you still use the same 3-line
  `privateKeyPath` change when you next need them. `backend/scripts/import_customers_to_prod.mjs` is the same.
- Run `--verify` again and keep its output with your notes.
