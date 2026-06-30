# Deployment Infrastructure

> **Özet:** Plannivo, 5+ servisli bir docker-compose yığını olarak dağıtılır (frontend nginx, backend Node, PostgreSQL, Redis, n8n). Dağıtım, geliştirici makinesinden `scripts/push-all.js` ile yürütülür: env değiştir → versiyon yükselt → frontend build → git commit/push → SSH ile sunucuda tarball yükle + `docker-compose` yeniden inşa. Lokal geliştirme tamamen izole (`localhost:5432/plannivo_dev`); prod'a asla yazmaz.
>
> **Kütüphaneler:** Docker + docker-compose (v1, 1.29), nginx (unprivileged alpine), Node 20-alpine, postgres:15-alpine, redis:7-alpine, n8n 2.14.2, NodeSSH (push-all/db-sync), Vite (build), GNU/Windows `tar`, ZeroSSL.
>
> **Bağlantılar:** [[Backend_Server]], [[Database]], [[Tech_Stack]], [[Notifications_System]], [[Misc_Integrations]], [[Weather_WindReport]], [[Architecture_Overview]]

---

## Sorumluluk

Bu modül, uygulamanın yerel geliştirme ortamından üretim sunucusuna nasıl paketlenip dağıtıldığını tanımlar:

- **Lokal dev:** Frontend (Vite :3000) ve backend (Nodemon :4000) host'ta natif çalışır; PostgreSQL + Redis Docker container'larında (`docker-compose.development.yml`).
- **Üretim:** Tek bir sunucuda `docker-compose.production.yml` ile 5 servis. Host üzerindeki ayrı bir nginx TLS sonlandırması yapar; container nginx sadece localhost portlarını (8080/8443) dinler.
- **Dağıtım kanalı:** `npm run push-all` — tek komutla build + git + SSH deploy.

## Servisler (`docker-compose.production.yml`)

Proje adı `plannivo`, ağ `app-network` (bridge), tüm servisler `restart: unless-stopped`.

| Servis | Image / Build | Port (host) | Notlar |
|---|---|---|---|
| **frontend** | `nginxinc/nginx-unprivileged:alpine` | `127.0.0.1:8080`, `127.0.0.1:8443` | Önceden derlenmiş `./dist` salt-okunur mount; `infrastructure/nginx.conf` + `security-headers.conf`; SSL `./SSL` ve `acme-webroot` mount. Container içinde build YOK. |
| **backend** | `./backend/Dockerfile.production` | (iç) 4000 | `NODE_ENV=production`, env dosyası `./backend/.env.production`. Healthcheck `/api/health`. Non-root `backend` (UID 1001). Bkz. [[Backend_Server]]. |
| **db** | `postgres:15-alpine` | `127.0.0.1:5432` | Volume `postgres_data`. Env prod dosyasından (`POSTGRES_PASSWORD` vb.). `pg_isready` healthcheck. Bkz. [[Database]]. |
| **redis** | `redis:7-alpine` | (iç) 6379 | `--appendonly yes --requirepass "${REDIS_PASSWORD}"`. Volume `redis_data`. |
| **n8n** | `n8nio/n8n:2.14.2` | `127.0.0.1:5678` | Kai otomasyon motoru; `n8n.plannivo.com`, basic-auth, `PLANNIVO_API_BASE=http://backend:4000/api/agent`. Volume `n8n_data`. Bkz. [[Misc_Integrations]]. |

Paylaşılan volume: `uploads_data` (backend `/app/uploads` yazar, frontend `/var/www/uploads` salt-okunur servis eder). Üretim ön-koşulları: `dist/index.html`, `backend/.env.production`, `SSL/fullchain.crt`.

### Diğer compose dosyaları
- **`docker-compose.yml`** — temel/tam-Docker dev yığını (frontend 3000:80, backend 4000, db, redis). `infrastructure/Dockerfile` ile frontend'i container'da build eder.
- **`docker-compose.development.yml`** — SADECE `db-dev` (`plannivo_dev` DB, şifre `password`) + `redis-dev`; host'ta natif `npm run dev` ile kullanılır. `npm run db:dev:up` bunu çalıştırır.
- **`docker-compose.override.yml`** — otomatik yüklenen dev override'ları: port mapping'ler, kaynak bind-mount'ları (`./src`, `./backend`), hot-reload, `command: npm run dev`, `LOG_LEVEL=debug`.

## Dockerfile'lar

- **`backend/Dockerfile`** (dev) — `node:20-alpine`, `npm ci --omit=dev`, non-root `backend` (1001), `EXPOSE 4000`, healthcheck `/api/health`, `CMD npm start`.
- **`backend/Dockerfile.production`** — aynı temel; npm 11.5.1'e yükseltir, `npm ci --omit=dev --no-audit --no-fund` + cache temizliği, non-root, `EXPOSE 4000`, `CMD npm start`.
- **`infrastructure/Dockerfile`** — frontend için iki aşamalı: aşama-1 `node:20-alpine` `npm run build`, aşama-2 `nginx-unprivileged:alpine` (dist + nginx.conf, `EXPOSE 8080`).
- **`infrastructure/Dockerfile.deploy`** — önceden derlenmiş `dist/`'i nginx imajına kopyalar (sunucuda build etmez; prod bu modeli kullanır).

## Frontend ağ katmanı (`infrastructure/nginx.conf`)

Container nginx 8080 (HTTP) / 8443 (HTTPS) dinler; **public 80/443'ü host üzerindeki ayrı nginx terminate eder** (asla durdurma — bkz. Tuzaklar).

- **`ukc.plannivo.com` (uygulama):** HTTP→HTTPS redirect; HTTPS root `/usr/share/nginx/html` (SPA, `try_files $uri $uri/ /index.html`).
  - `/api/` → `http://backend:4000` (WebSocket upgrade, X-Forwarded, 86400s timeout).
  - `/socket.io/` → backend (upgrade, buffering kapalı) — [[Notifications_System]] realtime.
  - `/uploads/warranty/` → backend (korumalı; auth bypass'ı önler, bkz. [[Warranty_Repairs]]); `/uploads/` doğrudan `/var/www/uploads`'tan, fallback backend.
  - `/assets/` 1 yıl immutable cache; `index.html` cache'siz.
- **`plannivo.com` + `www` (landing):** ayrı root `/usr/share/nginx/plannivo-landing`; ACME challenge + ZeroSSL PKI-validation yolları. Bkz. [[Outsider_Marketing]].
- **`security-headers.conf`** — HSTS (preload), X-Frame DENY, nosniff, ve GTM/Google Ads izinli sıkı CSP. TLSv1.2/1.3, HTTP/2, client_max_body_size 10MB.

## Dağıtım akışı (`scripts/push-all.js`)

`npm run push-all` adımları (bayraklar: `--retry` sadece SSH, `--no-version`, `--skip-build`, custom commit mesajı):

1. **Pre-flight:** `.deploy.secrets.json` ve `backend/.env.production` doğrula (placeholder DATABASE_URL şifresini reddeder).
2. **Versiyon yükselt:** `src/shared/constants/version.js` `APP_VERSION` patch++ ve `index.html` meta.
3. **Build:** `npm run build` (Vite → `dist/`).
4. **Env swap + git:** `backend/.env`'i geçici olarak `.env.production` ile değiştir, `git add -A` + commit + `git push origin <branch>`; `finally` bloğunda **her zaman** dev env'i (`.env.development`) geri yükler. (CLAUDE.md: push-all sonrası lokal her zaman lokal DB'ye döner.)
5. **SSH deploy (NodeSSH):**
   - `backend/.env.production` → sunucuda `.env.production.deploy` (git reset'in silmesini önlemek için temp yol).
   - `dist/`, `plannivo-landing/`, `SSL/*` → **tek gzip tarball** olarak yüklenir (`uploadDirAsTarball`), uzakta açılır. Per-dosya SFTP yerine tarball çünkü dist ~777 küçük dosya, yavaş/dengesiz SSH'te oturumu düşürüyordu. Tarball **relative path** kullanır (GNU/MSYS `tar` `C:\...`'i uzak host sanmasın diye).
   - SSL: `private.key` 640 root:101, `certificate.crt`+`ca_bundle.crt` → `fullchain.crt`.
   - Uzak script (`docker-compose --project-name plannivo -f docker-compose.production.yml`): `git fetch && git reset --hard origin/<branch>` → `.env.production` geri yükle → ön-koşul kontrolü → `build backend` → `down --remove-orphans` → `up -d` → backend health bekle → `node migrate.js up` → frontend health.
6. **n8n sync:** `kai-optimized.json`'u n8n API'ye PUT eder, workflow'u deaktive/aktive eder (bkz. [[Misc_Integrations]]).

`down --remove-orphans` + tam yeniden `up`, compose 1.29'un "ContainerConfig" bug'ını atlatmak için bilinçli (bkz. CLAUDE.md compose v1 notu).

## Veritabanı senkronizasyonu (`scripts/db-sync-from-prod.js`)

`npm run db:sync` — üretim verisini lokale kopyalar (asla tersi):
1. `.deploy.secrets.json`'dan SSH ile sunucuya bağlan.
2. Sunucuda `docker exec plannivo_db_1 pg_dump -U plannivo --clean --if-exists plannivo` → lokal `prod_dump.sql` (boyut + başlık doğrulaması).
3. `docker cp` ile `plannivo-dev-db` container'ına kopyala, `psql ... plannivo_dev -f` ile restore (`ON_ERROR_STOP=0`).
4. Geçici dump dosyalarını temizle.

## Build/dev araçları

- **`vite.config.js`** — dev server `:3000` (env override), proxy `/api` ve `/uploads` → `http://localhost:4000`; build `dist/`, terser (`drop_console`), `target es2015`, alias `@`/`src` → `./src`. Bkz. [[Tech_Stack]], [[Frontend_Shell]].
- **package.json deploy script'leri:** `dev`, `build`, `build:production`, `migrate:up`/`status`, `push-all`, `db:dev:up/down/reset`, `db:sync`, `docker:up/down/logs`, `sync:n8n`.

## Akış / İş Mantığı

Güvenli günlük döngü (CLAUDE.md):
```
npm run db:dev:up    # makine başına bir kez (lokal Postgres+Redis)
npm run db:sync      # prod verisini lokale çek (opsiyonel)
npm run dev          # lokal DB'ye karşı geliştir (prod'a yazmaz)
npm run push-all     # hazırsa üretime deploy
```
Migration kuralı: yeni migration dosyası sonrası daima `npm run migrate:up` (lokal); prod migration'ları deploy script'inde `migrate.js up` ile otomatik çalışır (bkz. [[Database]]).

## Dikkat / Tuzaklar

- **Host nginx'i ASLA durdurma:** Public TLS sonlandırması host üzerindeki nginx'te. Container nginx yalnızca `127.0.0.1:8080/8443` dinler. SSL cert yenilemesi sonrası `systemctl reload nginx` (host) gerekir (ZeroSSL 90-günlük manuel yenileme).
- **Compose v1 (1.29) only:** Sunucuda yalnızca `docker-compose` (v1) var. Deploy script `--project-name plannivo` ve tam `down`/`up` kullanır; `docker compose` (v2 alt-komut) varsayma.
- **push-all env swap penceresi:** `backend/.env` commit/push aralığında geçici olarak PROD kimlik bilgilerine geçer. `finally` her durumda `.env.development`'a geri döner — yine de bu pencerede lokal `npm run dev` çalıştırma. Pre-flight, placeholder/`:password@` DATABASE_URL'i fatal sayar.
- **Tarball relative-path zorunluluğu:** Windows'tan deploy ederken `tar` mutlaka relative arşiv adı + `-C relDir` ile çağrılır; mutlak `C:\...` yolu `tar` tarafından "host" olarak yorumlanır ve başarısız olur. Packaging başarısız olursa per-dosya SFTP fallback'ine düşer.
- **Verify prod'u browser-UA ile yap:** Çıplak `curl` host WAF tarafından 403 alabilir; prod doğrulamasında tarayıcı User-Agent başlığı kullan.
- **Deploy killer incident (2026-05):** `observed.service` + `free_proc.sh` watchdog'u >%100 CPU process'leri SIGKILL ediyordu (exit 137, OOM logu olmadan). Kaldırıldı; benzer exit 137 dönerse bu tür watchdog'ları araştır. Bu olayın forensiğinde kullanılan SSH-üzeri teşhis script'leri `scripts/` altında kalıcı olarak duruyor (`find-killer.mjs`, `inspect-observed.mjs`, `read-free-proc.mjs`, `remove-killer-and-retry.mjs` + memory/OOM/rlimit/AppArmor kontrolleri). Bkz. [[Operations_Scripts]].
- **Önceden derlenmiş dist:** Prod backend'i container'da build edilir ama frontend EDİLMEZ — `dist/` lokalde build edilip yüklenir. `--skip-build` ile mevcut `dist/`'i tekrar kullanabilirsin; `--retry` sadece SSH adımını koşar (build/git atlanır).
- **`.deploy.secrets.json` tek sır kaynağı:** SSH host/user/password/keyPath, `n8nApiKey`, `n8nWorkflowId` burada. Gitignore'lu; eksikse push-all ve db-sync fatal.
- **Lokal DB izolasyonu mutlak:** Tüm dev DB portları `127.0.0.1`'e bağlı; `db:sync` tek yönlü (prod→lokal). Üretime veri yazımı sadece push-all SSH penceresinden geçer.

## Yardımcı / teşhis script'leri

Aşağıdaki tek-kullanımlık SSH-üzeri (NodeSSH) script'ler `.deploy.secrets.json`'dan kimlik alıp sunucuda komut koşar; hepsi `scripts/` veya `backend/scripts/` altında **kalıcı** olarak tutulur (gerektiğinde tekrar koşulabilir). Detaylı envanter için bkz. [[Operations_Scripts]].

### Deploy-killer incident teşhis araçları

2026-05 deploy-killer olayının (yukarıdaki Tuzaklar'a bkz.) kök-neden avında üretilmiş ve sunucuda bırakılmış teşhis script'leri:
- **`scripts/find-killer.mjs`** — host'ta (Docker dışı) bir tmpdir'de `npm install` koşup process'in yine SIGKILL alıp almadığını izler (killer'ın Docker'a özgü olup olmadığını ayırt eder).
- **`scripts/inspect-observed.mjs`** — `observed.service`'i inceler: `systemctl status/show`, unit dosyası yolu, çalıştırılan binary, process ağacı ve açık dosyaları.
- **`scripts/read-free-proc.mjs`** — rogue `free_proc.sh` watchdog betiğinin içeriğini okur.
- **`scripts/remove-killer-and-retry.mjs`** — `observed.service` + `/usr/local/bin/free_proc.sh`'yi yedekleyip kaldırır, ardından daha önce başarısız olan build'in artık geçtiğini doğrular.
- **Sistem-seviye kontroller:** `scripts/check-server-memory.mjs`, `scripts/check-oomd.mjs` (systemd-oomd), `scripts/check-rlimits.mjs`, `scripts/check-apparmor.mjs`, `scripts/find-oci-hooks.mjs` — exit 137'nin OOM/rlimit/AppArmor/OCI-hook kaynaklı olup olmadığını ekarte eder.

### Build teşhis araçları

Sunucudaki Docker build başarısızlıklarını araştıran script'ler (çoğu deploy-killer olayıyla aynı dönemde):
- **`scripts/investigate-build-failure.mjs`**, **`scripts/debug-docker-build.mjs`**, **`scripts/diagnose-and-fix-build.mjs`** — build adımını izole edip nerede öldüğünü/başarısız olduğunu raporlar.
- **`scripts/install-buildx-and-test.mjs`** / **`scripts/install-buildx-v2.mjs`** — sunucuya buildx kurup test eder.
- **`scripts/test-npm-isolation.mjs`**, **`scripts/test-ignore-scripts.mjs`**, **`scripts/test-new-dockerfile.mjs`**, **`scripts/verify-fix.mjs`** / **`scripts/verify-fix-v2.mjs`** — npm install izolasyonu, `--ignore-scripts`, yeni Dockerfile ve nihai fix doğrulaması.

### SSL / host-nginx araçları

ZeroSSL 90-günlük manuel cert yenilemesi ve host nginx reload akışını destekleyen script'ler (bkz. [[Operations_Scripts]], host nginx tuzağı yukarıda):
- **`scripts/ssh-ssl-setup.mjs`** — sunucuda SSL dosya/dizin yapısını kurar.
- **`scripts/deploy-ssl-validation.mjs`** — ZeroSSL HTTP file-validation: güncel `nginx.conf` + `pki-validation` token dosyasını yükler, frontend nginx container'ını reload eder, erişilebilirliği doğrular.
- **`scripts/deploy-ssl-only.mjs`** — yeni cert dosyalarını (`private.key`, `certificate.crt`+`ca_bundle.crt`→`fullchain.crt`) tam bir push-all yapmadan yükler.
- **`scripts/inspect-host-nginx.mjs`** / **`scripts/reload-host-nginx.mjs`** — host üzerindeki (container değil) nginx yapılandırmasını inceler ve TLS sonlandıran host nginx'i `systemctl reload nginx` ile yeniden yükler. (`scripts/restart-ssl.bat` Windows kısayolu.)

### Veri import / reset araçları

Veritabanı tohumlama ve sıfırlama yardımcıları (lokal dev odaklı; `import_customers_to_prod` adı gereği prod yazar — dikkat). Bkz. [[Database]], [[Customers_CRM]]:
- **`backend/scripts/import_customers_from_json.mjs`** — JSON kaynaktan müşterileri (lokal) DB'ye import eder.
- **`backend/scripts/import_customers_to_prod.mjs`** — aynı import'u üretim DB'sine uygular (tek-yönlü `db:sync` istisnası; bilinçli prod yazımı).
- **`backend/scripts/schema-only-reset.mjs`** — `public` şemasındaki tüm **veriyi** truncate eder (tablo tanımları + `schema_migrations` korunur), minimal satırları (roller, currency/security ayarları, tek admin + EUR cüzdanı) yeniden tohumlar. Varsayılan dry-run; `--execute` ile uygular.
- **`backend/scripts/dev-reset-passwords.js`** (`npm run dev:reset-passwords`) — `db:sync` prod hash'lerini lokale yazdıktan sonra dev hesap şifrelerini bilinen bir dev parolasına geri sıfırlar (bkz. [[Authentication_Authorization]]).
