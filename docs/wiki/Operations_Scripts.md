# Operations_Scripts

> **Özet:** Plannivo'nun `backend/scripts/` (~15) ve kök `scripts/` (~75) altındaki, uygulamadan bağımsız çalışan operasyonel scriptlerini belgeler: incident veri-tamiri, migration-sonrası backfill, import/reset, sunucu sağlık teşhisi, build/Docker/SSL deploy ve prod denetim/audit araçları. Çoğu tek-seferlik (one-shot) ve durum-korumalı (state-guarded); prod'a ya `node-ssh` ile container içinde `psql`'e SQL pipe'lanarak ya da `recordTransaction` gibi deploy edilmiş backend koduyla uygulanır.
>
> **Kütüphaneler:** Node.js (ESM `.mjs` + CJS `.cjs`), `node-ssh` (SSH/SFTP → prod), `pg`, `bcryptjs`, `dotenv`, `sharp`, ham `.sql` (psql `-f` / stdin), Windows `.bat`.
>
> **Bağlantılar:** [[Finances_Wallet]], [[Deployment_Infrastructure]], [[Database]], [[Testing_QA]], [[Bookings_Calendar]], [[Instructors_Payroll]], [[Customers_CRM]]

---

## Sorumluluk

Bu modül üretim **kodu değildir** — uygulamanın çalışma zamanına dahil olmaz. Tek-seferlik veri olaylarını (incident) onarmak, migration sonrası geçmiş veriyi yeni kurallara hizalamak, prod sunucusunu teşhis etmek ve deploy/SSL operasyonlarını sürmek için elle çalıştırılan bağımsız araçlardan oluşur. İki dizine dağılmıştır:

- `backend/scripts/` — backend servislerini doğrudan `import` eden scriptler (`../db.js`, `../services/walletService.js` vb.). Aktif `backend/.env`'in işaret ettiği DB'ye yazar (normalde local dev).
- `scripts/` — kök seviyesinde, çoğu `node-ssh` ile prod sunucusuna bağlanan; `.deploy.secrets.json`'dan `{host, user, password, path}` okuyan teşhis/deploy araçları.

Ortak desen: scriptlerin başında ne yaptığını + nasıl çalıştırılacağını anlatan uzun yorum bloğu; çoğu **dry-run varsayılan + `--apply`/`--commit`/`--execute` ile yazma**, tek `BEGIN/COMMIT` transaction, ve yeniden-çalıştırmaya karşı **idempotent guard** içerir.

---

## Kategori (a): Incident Veri-Tamiri (one-shot)

Belirli müşteri/booking için tek seferde çalışıp bir cüzdan/komisyon hatasını düzelten scriptler. Hepsi **pre-state guard** taşır: beklenen kayıt yoksa veya değer beklenenden farklıysa ROLLBACK ile durur ("körü körüne ikinci kez çıkarma yapma").

- `scripts/fix-anil-double-credit.mjs` — grup booking 7952747d fiyat-düşümünde hem per-head fan-out hem whole-booking cascade'in çift kredi açtığı +44€'yu ters çevirir; `metadata.corrects` ile çift-çalıştırma koruması (`backend/services/walletService.js` `recordTransaction`).
- `scripts/fix-damla-discount.mjs` — silinmiş `customer_package`'a bağlı yetim +140€ indirim kredisini `discountService.deleteDiscount` ile geri alır.
- `scripts/fix-orphaned-pkg-discounts.mjs` — aynı buga uğrayan 4 müşteriyi (Mert/Anıl/Yener/Mehmet) toplu işler; her hedef `discounts` tablosuyla birebir eşleşmeli, paket gerçekten yok olmalı.
- `scripts/fix-tan-broken-booking.mjs` — booking a4d3eba7'yi bozuk "paid" durumdan doğru "partial" duruma çevirir (paket saatini tüketir, partial cash-leg cüzdan charge'ı yazar, cascade ile `instructor_earnings` oluşturur — `bookingUpdateCascadeService`).
- `scripts/fix-rifat-balance.js` — Rifat'ın cancel+reversal çift-sayımını (`-260€` → `-120€`) prod'da SSH+psql ile düzeltir: reversal'ı hard-delete, adjustment'ı un-cancel, `wallet_balances`'i completed ledger'dan recompute (`wallet.allow_negative` set_config ile guard trigger bypass).
- `backend/scripts/repair-cenk-dilara-overrefund.mjs` + `scripts/run-overrefund-repair-on-prod.mjs` — indirimli üyelik silinince gross €12 iade edilip net €6 yerine windfall kalan Cenk & Dilara'ya −€6 `manual_debit` (idempotencyKey ile no-op tekrar). Prod-runner wrapper repair script'i backend container'ına base64 ile aktarıp **deploy edilmiş `recordTransaction`** ile çalıştırır (`--check` salt-okunur). Aynı bug `scripts/inspect-rifat-*.mjs` / `scripts/verify-rifat-fix.mjs` ile incelenip doğrulandı; `scripts/prod-backfill-murat-partial.js` benzer eksik partial-cash charge'ı (€95) tamir eder.

> **Not:** Bu scriptlerin çoğu ya cüzdan ledger'ından (`recordTransaction` + `wallet_balances` cache) hesabı **recompute** eder ya da üstüne tek bir düzeltme satırı yazar; raw balance kolonuna asla elle dokunmaz. Bkz. [[Finances_Wallet]].

---

## Kategori (b): Backfill (idempotent, migration-sonrası geçmiş veri)

Bir migration veya kod düzeltmesinden sonra **eski kayıtları** yeni kurala hizalayan scriptler. Tasarımca idempotent (ikinci çalıştırma sıfır satır / "no_change") ve yeniden-çalıştırılabilir.

- `backend/scripts/backfill-stale-commissions.js` — tüm PENDING `manager_commissions` + `instructor_earnings` snapshot'larını modern türetmeyle yeniden hesaplar (paid-out satırları atlar, paket-rental için ayrı yol). `--dry-run` (varsayılan, ROLLBACK) / `--commit`. Orphan backstop: silinmiş/iptal booking'lere bağlı satırları temizler.
- `backend/scripts/backfill-membership-beach-commission.js` — migration 280 sonrası üyelik komisyonunu FULL bundle yerine yalnız **beach-fee** tabanına re-derive eder (`recomputeManagerCommissionForEntity`); `--dry-run`/`--commit`. Bkz. [[Memberships]], [[Instructors_Payroll]].
- `backend/scripts/backfill-accommodation-pay-later-charges.js` — `accommodation_charge` cüzdan kaydı eksik kalan `pay_later` konaklamaları için `recordLegacyTransaction` ile charge yazar; `wallet_transaction_id IS NULL` ile hedefler, `--apply` ile uygular. Bkz. [[Accommodation_Rentals]].
- `backend/scripts/backfill-zero-shop-prices.mjs` — sale anında fiyatsız satılan (€0) shop kalemlerini drawer ile aynı `updateShopOrderItemPrice` servisi üzerinden fiyatlar (`settleWallet=true`); **bilerek idempotent değil**, ortam başına BİR kez. Bkz. [[Products_Shop_Inventory]].
- `scripts/backfill-wallet-opening-balances.mjs` — legacy import'un cache'e yazıp ledger'a yazmadığı (drift) ~90 müşteriye `legacy_opening_balance` satırı ekler; SSH+psql, `wallet_balances_backup_*` snapshot + post-state drift verify (DO-block RAISE EXCEPTION ile abort).
- `backend/scripts/backfill-semi-private-supervision.sql` — `max_participants > 1` olan `supervision` servis/paketlerini `semi-private-supervision` tag'ine yeniden etiketler; önce REVIEW SELECT, sonra UPDATE, `BEGIN/COMMIT`.

---

## Kategori (c): Import / Reset / Migration

- `backend/scripts/import_customers_from_json.mjs` — `customers_registration.json`'dan **local dev** DB'ye müşteri import (student rolü; pozitif bakiye → `wallet_balances` + paired `legacy_opening_balance` ledger; negatif → legacy `users.balance` EUR; çakışan/eksik e-postaya deterministik sentetik adres).
- `backend/scripts/import_customers_to_prod.mjs` — aynı veriyi tek SQL dosyasına üretip SCP ile prod'a atar, container içinde `psql -f` çalıştırır; `preferred_currency='TRY'` zorlar, `ON CONFLICT (email) DO NOTHING` ile mevcutları korur.
- `backend/scripts/migrate_walletless_legacy_debts.sql` + `scripts/migrate-walletless-legacy-debts.mjs` — import'un yalnız `users.balance`'a koyduğu NEGATIF borçlara (Malek −1191, Dinçer −45, Weber −10) EUR `wallet_balances` + paired ledger verir; snapshot tablosu + iki-aşamalı self-verify (abort on mismatch), idempotent. Runner SQL'i base64 ile prod psql'e pipe'lar.
- `backend/scripts/schema-only-reset.mjs` — `public`'teki tüm **veriyi** TRUNCATE eder (schema + `schema_migrations` korunur), roller/currency/security `settings`/tek admin user'ı yeniden seed eder; dry-run varsayılan, `--execute` ile yazar. Bkz. [[Database]], [[Authentication_Authorization]].
- `backend/scripts/apply-db-migrations.js` — `backend/db/migrations`'tan belirli SQL dosyalarını doğrudan uygular, `schema_migrations` ledger'ına checksum'la kaydeder (filename ile zaten uygulandıysa atlar). Bkz. [[Database]].
- `backend/scripts/dev-reset-passwords.js` — `db:sync` prod hash'lerini ezdikten sonra sabit dev hesap listesine ortak dev parolası yazar, kilit/başarısız-login sayaçlarını sıfırlar (`npm run dev:reset-passwords`).

---

## Kategori (d): Deploy-Killer & Sunucu Sağlık Teşhisi

2026-05'te docker build'i SIGKILL'leyen rogue `observed.service` + `/usr/local/bin/free_proc.sh` watchdog incident'ini avlamak için yazılan, çoğu **salt-okunur** SSH teşhis scriptleri (hepsi `node-ssh`, ortak `run(label, cmd)` helper). Bkz. [[Deployment_Infrastructure]].

- `scripts/check-server-memory.mjs` — `free -h`, swap, docker memory, `docker stats`, disk, dmesg OOM taraması.
- `scripts/check-oomd.mjs` — `systemd-oomd` durumu + son kill'leri, `/proc/pressure/memory`, cgroup memory.pressure, build penceresi journal grep.
- `scripts/check-apparmor.mjs` — AppArmor/audit AVC denies; ardından `--security-opt apparmor=unconfined / seccomp=unconfined / --privileged` ile npm install dener (sandbox eler).
- `scripts/check-rlimits.mjs` — container ulimit, docker.service systemd memory ayarları, conntrack, uzun-süren container & 100-paket curl testi.
- `scripts/find-killer.mjs` — host'ta (docker dışı) npm install, çalışan systemd servisleri, güvenlik ajanları (wazuh/falco/crowdstrike…), audit log, cron-driven killer taraması.
- `scripts/inspect-observed.mjs` — `observed` servisini inceler; **geçici durdurup** docker npm install dener (killer testi), sonra yeniden başlatır.
- `scripts/read-free-proc.mjs` — rogue `free_proc.sh` içeriğini + izin/oluşturma tarihini okur.
- `scripts/remove-killer-and-retry.mjs` — `observed.service`+`free_proc.sh`'ı `/root/.observed_backup_*`'a yedekler, stop/disable/remove eder, build doğrulama testi koşar (**yazma** yapan tek deploy-killer script'i).
- `scripts/find-oci-hooks.mjs` — OCI prestart hook, nvidia-container-runtime, containerd hook config, 5'li ardışık docker run flakiness testi.

---

## Kategori (e): Build / Docker Teşhisi

Aynı incident bağlamında build-failure kök-neden avı (salt-okunur + repro denemeleri):

- `scripts/debug-docker-build.mjs` — cgroup v2 `memory.events`, build penceresi `journalctl --dmesg`, docker.service systemd limitleri, `package-lock.json` boyutu.
- `scripts/diagnose-and-fix-build.mjs` — uzun-süren container içinde `npm ci --loglevel=verbose` repro + öncesi/sonrası bellek.
- `scripts/investigate-build-failure.mjs` — build hata penceresinin derin teşhisi.
- `scripts/install-buildx-and-test.mjs` / `scripts/install-buildx-v2.mjs` — `docker-buildx-plugin` kurar, BuildKit ile backend image build testi.
- `scripts/test-npm-isolation.mjs` — 1GB allocation, node startup, `--memory=4g`, host `npm ci` ile izolasyon testleri.
- `scripts/test-new-dockerfile.mjs`, `scripts/test-ignore-scripts.mjs`, `scripts/verify-fix.mjs`, `scripts/verify-fix-v2.mjs` — yeni Dockerfile / `--ignore-scripts` / düzeltme doğrulama denemeleri.

---

## Kategori (f): SSL Deploy / Inspect

ZeroSSL 90-günlük manuel yenilemeyi destekleyen scriptler (host nginx TLS sonlandırır). Bkz. [[Deployment_Infrastructure]].

- `scripts/ssh-ssl-setup.mjs` — `inspect` / `deploy <file>`: host nginx config inceleme + ZeroSSL HTTP file-validation token'ını `.well-known/pki-validation`'a koyma.
- `scripts/deploy-ssl-validation.mjs` — nginx.conf + validation dosyasını yükler, frontend container reload, erişilebilirlik doğrular (kullanıcı yetkili).
- `scripts/deploy-ssl-only.mjs` — yalnız cert refresh: `SSL/` dosyalarını yükler, server-side `fullchain.crt` rebuild, frontend nginx container reload (git/build/version yok).
- `scripts/inspect-host-nginx.mjs` — host nginx versiyon/process/`nginx -T`/plannivo config taraması.
- `scripts/reload-host-nginx.mjs` — `nginx -t` + `systemctl reload nginx` (downtime'sız) + harici HTTPS cert doğrulama (`openssl s_client`).
- `scripts/restart-ssl.bat` — Windows: yeni SSL'i uygulamak için frontend container restart.

---

## Kategori (g): Prod Teşhis & Audit

- `scripts/run-prod-sql.js` — bir local `.sql` dosyasını prod DB'ye uygular (SFTP→`docker cp`→`psql -v ON_ERROR_STOP=1 -f`). **Genel amaçlı prod uygulama aracı**; DO-block scriptleri atomik rollback olur.
- `scripts/fetch-prod-logs.js` — son backend logları + PDF/bill/OOM/error grep'leri + container status (salt-okunur).
- `scripts/fetch-booking-errors.js` — başarısız booking + constraint tanımını inceler (salt-okunur).
- `scripts/prod-scope-partial-bookings.js` — cüzdan charge'ı eksik partial-paket booking'leri prod'da kapsamlandırır.
- `scripts/audit-discount-commissions.mjs` — indirimden etkilenen booking'lerde STORED komisyonu discount-aware yeniden hesapla ile karşılaştırır (STALE = fazla ödeme, IGNORED = paket hourly_rate davranışı); `--fix` ile STALE satırları cascade üzerinden düzeltir. Bkz. [[Instructors_Payroll]].
- `scripts/scan-cancel-reversal-pairs.sql` — completed reversal + cancelled/silinmiş orijinal çiftlerinden doğan phantom bakiyeleri + cache↔ledger drift'i salt-okunur tarar.
- `scripts/scan-partial-delete-victims.sql` — pre-v0.1.294 booking-silme boşluklarının kurbanlarını tarar (iade edilmemiş charge, paket-saat drift, silinmiş booking'lere bağlı earnings/komisyon).
- `scripts/classify-deleted-earnings.sql` — silinmiş booking'lere bağlı `instructor_earnings`'i `dup`/`nottaught`/`REVIEW` olarak sınıflandırır (keep-safe).
- `scripts/cleanup-deleted-booking-earnings.sql` — payroll'a girmemiş earnings'i siler + pending komisyonları iptal eder (canlı DELETE akışını taklit, idempotent DO-block).
- `backend/scripts/audit-pending-commissions.sql` — backfill ÖNCESİ kapsam kontrolü: pending komisyon/earnings satırlarını entity güncel fiyatı eksi aktif indirimle karşılaştırır (salt-okunur).

---

## Kategori (h): Bakım

- `scripts/kill-ports.js` — Windows local dev: 3000/3001/4000 portlarındaki süreçleri `netstat`+`taskkill /F` ile öldürür.
- `scripts/find-unused-tables.cjs` — gömülü ~140 tablo listesini tüm kaynak kodda (`.js/.jsx/.ts/.tsx/.java/.xml/.sql`) arar, hiç referans verilmeyen tabloları raporlar. Bkz. [[Database]].
- `scripts/scan-i18n-usage.mjs` — `src/` altında `t(...)` çağırıp `useTranslation()` çağırmayan dosyaları (kesin crash) tarar.
- `backend/scripts/optimize-existing-uploads.js` — on-disk upload originallerini `sharp` ile downscale eder (dosya adı + format değişmez → DB linkleri kırılmaz); dry-run varsayılan, `--commit`, atomik temp+rename, idempotent. Bkz. [[Products_Shop_Inventory]].
- `scripts/check-integrity.mjs` / `backend/scripts/test-financial-reconciliation.js` — DB tutarlılık + finansal mutabakat (stored vs hesaplanan bakiye) kontrolleri. Bkz. [[Testing_QA]].
- `scripts/smoke-test-frontdesk.mjs` — frontdesk overhaul için auth + rol-gate uçtan-uca smoke testi (`npm run dev` çalışırken).
- `scripts/db-sync-from-prod.js` (`npm run db:sync`) — prod DB'yi local dev container'a kopyalar. Bkz. [[Database]], [[Deployment_Infrastructure]].

> **Dipnot:** `scripts/push-all.js` (deploy), `scripts/push-sync.js`, `scripts/sync-n8n-workflow.js`, `scripts/verify-legal-docs-prod.mjs` ve `scripts/kai-eval/` bu düğümün kapsamı dışındadır (sırasıyla [[Deployment_Infrastructure]], [[Misc_Integrations]] ve Kai eval).

---

## Veri Modeli (dokunulan tablolar)

| Tablo | Scriptler | İşlem |
|------|-----------|-------|
| `wallet_transactions` / `wallet_balances` | fix-*, repair-*, backfill-wallet-*, migrate-walletless-*, scan-cancel-reversal | recompute / düzeltme satırı / legacy_opening_balance |
| `manager_commissions` / `instructor_earnings` | backfill-stale, backfill-membership-beach, audit-discount, cleanup/classify-deleted | re-derive / cancel / sınıflandır |
| `discounts` | fix-damla, fix-orphaned-pkg | `deleteDiscount` ile reversal |
| `users` / `wallet_balances` | import_customers_*, dev-reset-passwords, schema-only-reset | insert / parola reset / truncate+seed |
| `bookings` / `customer_packages` | fix-tan, prod-backfill-murat, scan-partial-delete | durum/saat düzeltme |
| `schema_migrations` | apply-db-migrations | ledger insert |

---

## Dikkat / Tuzaklar

- **`backend/scripts/*` aktif `backend/.env` DB'sine yazar** — normalde local dev. Prod'a uygulamak için ya `DATABASE_URL` export edilir ya da `run-overrefund-repair-on-prod.mjs` gibi bir SSH wrapper script container içinde çalıştırır.
- **`scripts/*.mjs` SSH araçları** `.deploy.secrets.json` (gitignored) gerektirir; çoğu prod container'larını `plannivo_db_1` / `plannivo_backend_1` olarak sabit-kodlar.
- SQL'i prod'a taşırken yaygın desen: base64 encode → `echo '<b64>' | base64 -d | docker exec -i plannivo_db_1 psql ... -v ON_ERROR_STOP=1` (shell quoting + heredoc kırılganlığını eler).
- Incident-fix scriptleri **tek-seferlik tasarlanmıştır**: çalıştırıldıktan sonra tekrar koşmak guard sayesinde no-op'tur, ama yeni bir benzer olay için kopyalanıp özelleştirilmesi beklenir (sabit-kodlu UUID/ID listeleri).
- `backfill-zero-shop-prices.mjs` **idempotent DEĞİL** (tekrar çalıştırma tekrar charge eder) — ortam başına bir kez.
- Negatif bakiye guard trigger'ı: cüzdanı eksiye götürmesi gereken düzeltmeler `allowNegative:true` (servis yolu) veya `set_config('wallet.allow_negative','true')` (ham SQL) kullanır.
- Bu düğümdeki scriptler **kaynak kodu değildir**; CI/test dışında çalışır, çoğu deploy artifact'ı olarak commit edilmez veya tek kullanımlıktır.
