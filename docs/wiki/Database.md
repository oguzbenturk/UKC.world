# Database

> **Özet:** Plannivo, tek `pg.Pool` üzerinden erişilen bir PostgreSQL veritabanı kullanır; şema, `backend/db/migrations/` altındaki sıralı SQL migration'larıyla (283 numaraya kadar) yönetilir — bu klasör AUTHORITATIVE'dir, `backend/migrations/` DEĞİL. Tüm parasal değerler `NUMERIC` sütunlarda saklanır ve uygulama katmanında Decimal.js ile işlenir (kayan nokta YASAK); çok-para-birimli cüzdan, ayrı `discounts` tablosu ve idempotent ledger temel finansal güvence kalıplarıdır.
>
> **Kütüphaneler:** PostgreSQL, `pg` (node-postgres), uuid-ossp / pgcrypto eklentileri, unaccent eklentisi, Decimal.js (app katmanı).
>
> **Bağlantılar:** [[Backend_Server]], [[Finances_Wallet]], [[Bookings_Calendar]], [[Lessons_Services_Packages]], [[Authentication_Authorization]], [[Payments_Currency]]

---

## Sorumluluk

Veritabanı tüm kalıcı durumu tutar: kullanıcılar, rezervasyonlar, cüzdan/finans ledger'ı, dersler/paketler, üyelikler, ürünler/mağaza, eğitmen maaş/komisyon, garanti talepleri, formlar, bildirimler ve entegrasyon durumu. Bağlantı ve havuz yönetimi `backend/db.js`'de, migration uygulaması `backend/db.js` (`_runMigrations`) + `backend/migrate.js` CLI'da yaşar.

## Bağlantı ve Havuz (`backend/db.js`)

- Bağlantı string'i önceliği: `LOCAL_DATABASE_URL` → `DATABASE_URL` → `DB_HOST/DB_NAME/DB_USER` birleşik.
- **Üretim güvenlik ağı:** `NODE_ENV !== 'production'` iken string prod IP `217.154.201.29` içeriyorsa başlatma hard-fail eder — yerel dev'in prod DB'ye yazmasını önler (bkz. `CLAUDE.md`).
- SSL: prod + yerel-olmayan host'ta açık (`DB_SSL` ile geçersiz kılınabilir).
- Havuz ayarları: `max: 20`, `min: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 10000`, `keepAlive: true`, `maxUses: 7500`, `allowExitOnIdle: false`. Başlangıçta önceden ısıtılır (SSL+TCP el sıkışma maliyetini ilk isteklerden kaldırır).
- **Enstrümantasyon:** her sorgu sarmalanır — yavaş sorgular (>`DB_SLOW_QUERY_THRESHOLD_MS`=1500ms) ve havuz doygunluğu (`waitingCount >= 18` ve `idleCount === 0`) uyarı loglar; periyodik havuz snapshot'ı.
- **Tip parser'ları:** TIMESTAMP WITHOUT TIME ZONE (OID 1114) UTC olarak okunur (`str + 'Z'`); DATE (OID 1082) ham `YYYY-MM-DD` string olarak döner — aksi halde UTC+3 host'ta tarih bir gün geri kayar.
- `pool` named export'tur; `getPoolStats()` ve `getMigrationPromise()` izleme için.

## Migration Sistemi

İki giriş noktası, aynı `_runMigrations` mantığını paylaşır:

- **`backend/migrate.js`** — CLI. `npm run migrate:up` (uygula) ve `node backend/migrate.js status` (bekleyenleri listele). `up` modu `MIGRATION_CLI_MODE=true` + `RUN_DB_MIGRATIONS=true` ayarlar, sonra `db.js`'den `runDbMigrations`'ı çağırır.
- **`backend/db.js`** — `RUN_DB_MIGRATIONS === 'true'` ve `MIGRATION_CLI_MODE` yokken import'ta otomatik çalışır (sunucu açılışı).

Migration mekaniği:
- Ledger tablosu `schema_migrations` (filename, checksum, applied_at; legacy `migration_name`/`executed_at` sütunları da desteklenir; `filename` üzerinde UNIQUE index).
- `backend/db/migrations/` içindeki `*.sql` dosyaları ada göre sıralanır; `performance_indexes` kalıbı atlanır.
- SQL, tırnak / dollar-quoting / yorum-farkında bir ayrıştırıcıyla (`splitSqlStatements`) ifadelere bölünür.
- `CONCURRENTLY` içeren dosyalar transaction DIŞINDA, ayrı bir client'ta çalışır; diğerleri `BEGIN/COMMIT` içinde.
- Toleranslı hata yönetimi: eksik tablo/sütun (42P01/42703) üzerinde index oluşturma atlanır; FK tip uyumsuzluğu (42804) atlanır.
- Checksum farkı = uyarı + yeniden-uygulamayı atlama (idempotent). Bir dosya ada göre uygulanmışsa tekrar çalıştırılmaz.

**İş kuralı:** Migration dosyası oluşturduktan/değiştirdikten SONRA daima `npm run migrate:up` çalıştır (`CLAUDE.md` workflow kuralı). `RUN_DB_MIGRATIONS` ayarlı değilse açılışta migration çalışmaz.

## Migration Dosya Envanteri

`backend/db/migrations/` AUTHORITATIVE klasördür ve numaralı + birkaç eski adlandırılmış dosya içerir (~222 SQL dosyası). Temsili gruplar (dosya ADLARINDAN):

- **001–047 — çekirdek:** `001_create_instructor_commissions`, `002_create_instructor_services`, `004_create_customer_packages`, `015_add_customer_package_id_to_bookings`, `017_create_family_members_table`, `018_create_liability_waivers_table`, `022_create_audit_logs_table`, `024_create_wallet_core_tables`, `025_create_wallet_deposit_requests`, `026–028` cüzdan banka/KYC/yöntem, `029_create_payment_gateway_webhook_events`, `030_extend_wallet_transactions`, `031_enable_wallet_overdraft`, `032/033` service revenue ledger (oluştur+düşür), `045_add_accommodation_images`, `046/047` paket tipi/referansları.
- **Eski adlandırılmış dosyalar (numaralı değil):** `add_multi_currency_support.sql` (`currency_settings`), `add_multi_user_booking_support.sql` (`booking_participants`), `add_new_features.sql` (`feedback`, `student_achievements`, `payment_intents`, `refunds`, `push_subscriptions`, `notifications`, `notification_settings`), `add_rental_id_to_transactions.sql`, `create_backup_tables.sql` (`deleted_bookings_backup` vb.), `add_*_to_booking_participants.sql`.
- **101–166 — özellikler:** `102_create_voucher_system` (`voucher_campaigns`/`voucher_codes`/`voucher_redemptions`/`user_vouchers`), `103_create_manager_commission_system` (`manager_commission_settings`/`manager_commissions`/`manager_payouts`/`manager_payout_items`), `105_create_repair_requests`, `106_create_marketing_campaigns`, `114_create_quick_links`, `118_create_chat_system` (`conversations`/`conversation_participants`/`messages`/`message_reactions`), `119–122` ürün alt-kategorileri, `123_create_shop_orders` (`shop_orders`/`shop_order_items`/`shop_order_status_history`), `125_create_business_expenses`, `126–136` form motoru (`form_templates`/`form_steps`/`form_fields`/`form_submissions`/...), `149_enforce_lesson_discipline_tags`, `156–164` konaklama/rental/mağaza ayarlamaları.
- **173–230 — olgunlaşma:** `185_enhance_manager_salary_system` (`manager_salary_records`), `186_create_instructor_category_rates`, `187_create_instructor_skills`, `188_create_user_tags`, `200_create_kai_tables`, `201_create_bank_transfer_receipts`, `211_add_security_features` (`security_audit`/`user_sessions`/`api_keys`), `212_create_products_table`, `213/214_*_performance_indexes`, `223_create_student_skills_progress_goals`, `224_create_instructor_availability`, `225_create_student_recommendations`, `228_ensure_notification_realtime_trigger`, `230_add_notification_type_enum`.
- **231–283 — son katman:** `239_add_payment_method_to_customer_packages`, `240_add_self_student_support`, `242_add_email_verification`, `243_add_booking_reminder_tracking`, `244_add_telegram_integration`, `251_add_semi_private_supervision_category`, **`255_create_discounts_table`**, `256_add_discount_id_to_wallet_transactions`, `258_separate_staff_salary_from_wallet_balance`, `262_create_warranty_claims` (+ staff_links/media/events), `263_create_spotify_integration`, `264_create_family_groups`, **`265_wallet_integrity_hardening`** (idempotency + overdraft + guard trigger), `266_deleted_user_wallet_archive`, `268_create_refresh_tokens`, `269_create_proposals`, `271_create_product_categories`, `273_add_lower_email_index`, `274_warranty_documents`, `276_create_email_deliveries`, `277_add_product_is_visible`, **`278_create_booking_package_consumption`**, `280_add_beach_fee_to_member_offerings`, `281_add_rescue_boat_category`, `282_add_booking_passengers`, `283_unaccent_customer_search`.

> NOT: `users`, `bookings`, `services`, `rentals`, `accommodation_units`, `instructor_earnings` gibi en temel tablolar `backend/db/migrations/`'da CREATE TABLE'a sahip DEĞİLDİR — bunlar migration ledger'ından önceki taban şemaya aittir; sonraki migration'lar yalnızca `ALTER TABLE ... ADD COLUMN` ile genişletir. `member_offerings`/`member_purchases` tabloları `backend/migrations/` (authoritative-OLMAYAN eski klasör, `104_create_member_offerings.sql`) içinde oluşturulur ama prod şemasında mevcuttur.

## Ana Tablolar ve Sorumlulukları

### Kullanıcılar ve Erişim
- **`users`** — tüm aktörler (admin/manager/instructor/student/outsider/receptionist/trusted_customer). `role` JWT'ye yansır; `email` LOWER saklanır (migration 273 partial index, login büyük-küçük harf düzeltmesi); `deleted_at` soft-delete; `iyzico_card_user_key` kayıtlı kart; `name`/`first_name`/`last_name` (bazı kayıtlarda yalnız `name` dolu). Bkz. [[Customers_CRM]], [[Authentication_Authorization]].
- **`roles`** — JSONB `permissions` (örn. `bookings:read`, `*`). `backend/middlewares/authorize.js` ada göre çözer + 5dk cache. Rol UUID'leri ortam-bazında değişir (sabit kodlanmaz).
- **`refresh_tokens`** (268) — dönen oturum token'ları, reuse-detection. **`user_sessions`** / **`api_keys`** / **`security_audit`** (211).
- **`family_members`** (017), **`family_groups`** + **`family_group_members`** (264), **`user_tags`** (188), **`user_relationships`**.

### Rezervasyon ve Takvim (bkz. [[Bookings_Calendar]])
- **`bookings`** — çekirdek ders/rezervasyon tablosu. UUID PK. Önemli: `amount` GRUP TOPLAMI'dır (katılımcı paylarının toplamı); `status` enum (`pending`/`confirmed`/`cancelled`/`completed` + 202 `pending_payment`); `payment_status`; `customer_package_id` (015); `reminder_sent_at` (243); `partial_hours` (267); `customer_user_id`/`student_user_id`/`instructor_user_id`.
- **`booking_participants`** (add_multi_user_booking_support) — çok-katılımcılı (grup/semi-private) dersler; `package_hours_used`/`cash_hours_used`/`customer_package_id` kolonları.
- **`booking_charge_adjustment`** — wallet ledger'da fiyat-düzeltme satırları olarak temsil edilir (transaction_type); fiziksel ayrı tablo değil, finans geçmişi katlamasında kullanılır.
- **`booking_package_consumption`** (278/279) — derslerin paket saatlerini FIFO çapraz-paket tüketimini izleyen ledger; `original_rate` (279).
- **`booking_passengers`** (282), **`booking_reschedule_notifications`** (159), **`group_lesson_requests`** (158).

### Cüzdan ve Finans (bkz. [[Finances_Wallet]], [[Payments_Currency]])
- **`wallet_balances`** (024) — kullanıcı × para birimi başına bakiye; `available_amount`/`pending_amount`/`non_withdrawable_amount` `NUMERIC(18,4)`; `UNIQUE(user_id, currency)`; `overdraft_limit` (265, NULL=sınırsız). ÇOK PARA BİRİMLİ.
- **`wallet_transactions`** (024) — değişmez ledger. `transaction_type` (payment/deposit/package_purchase/discount_adjustment/...), `status` (completed/cancelled/pending/failed), `direction` CHECK (credit/debit/adjustment), `amount` + `*_delta` sütunları, `balance_*_after` snapshot'ları, `metadata` JSONB, `related_entity_type`/`related_entity_id` (UUID), **`idempotency_key`** (265, partial UNIQUE — yinelenen gateway webhook'u çift-debit/credit edemez), `discount_id` (256). Enum'lar `backend/constants/transactions.js`'de.
- **`wallet_deposit_requests`** (025) — banka/kart yatırma istekleri; Iyzico `gateway_transaction_id` ile eşlenir; `(user_id, reference_code)` dedupe (265).
- **`discounts`** (255) — **AYRI TABLO; ham fiyat sütunları ASLA mutasyona uğramaz.** `entity_type` CHECK (booking/rental/accommodation_booking/customer_package/member_purchase/shop_order), `entity_id` TEXT (kaynak tablolar UUID veya INTEGER PK karışımı kullandığından), `percent` + `amount` (uygula-anında kilitlenir, sonradan fiyat değişse de geçmiş değişmez), `UNIQUE(entity_type, entity_id)`. İndirim tutarı `getActiveDiscountAmount`/`discountSumLateral` ile çıkarılır (MEMORY: `project_discount_separate_table`).
- Diğer: **`currency_settings`** (kur tablosu, FK hedefi), **`currency_update_logs`** (039), **`bank_transfer_receipts`** (201), **`business_expenses`** (125), **`payment_gateway_webhook_events`** (029), **`refunds`**/**`payment_intents`** (add_new_features), **`deleted_user_wallet_archive`** (266).

### Dersler, Hizmetler, Paketler (bkz. [[Lessons_Services_Packages]])
- **`services`** — ders/rental/konaklama hizmet tanımları; `category` (251 semi_private_supervision, 281 rescue_boat eklendi), `member_discount_percent`, `insurance_rate` (200), discipline tag'leri (149 zorunlu).
- **`customer_packages`** (004) — müşterinin satın aldığı paketler. UUID PK; `total_hours`/`used_hours`/`remaining_hours` `NUMERIC(5,2)`; **`status` enum CHECK: `active`/`expired`/`used_up`/`cancelled` — `'completed'` GEÇERSİZDİR** (MEMORY: `project_customer_package_status_enum`; PUT /bookings/:id 500 döngüsüne yol açtı); `gateway_transaction_id`, `pending_voucher_id`/`pending_voucher_meta` (209), `original_price` (257), `payment_method` (239), `waiting_payment` durumu (217).
- **`service_packages`** (FK hedefi), **`instructor_services`** (002), **`instructor_skills`** (187), **`instructor_category_rates`** (186), **`instructor_availability`** (224).

### Üyelikler (bkz. [[Memberships]])
- **`member_offerings`** — üyelik/bundle tanımları; `category` (204), `beach_fee_amount` (280, manager komisyonu beach kısmına dayanır), `group_key` (222).
- **`member_purchases`** — müşteri üyelik satın alımları; `status`/`payment_status` (active/pending_payment/cancelled/waiting_payment), `gateway_transaction_id` (207), `storage_unit` (205), `beach_fee_amount`. Bayat pending_payment satırları 30dk sonra otomatik iptal.

### Ürünler ve Mağaza (bkz. [[Products_Shop_Inventory]])
- **`products`** (212) — mağaza ürünleri; `original_price` (210, fiyat asla orijinalin altına inmez), `is_visible` (277, auth principal'dan zorlanır).
- **`product_variants`** — renk/beden/cinsiyet varyantları (048), varyant-başı fiyat. **`product_subcategories`** (119), **`product_categories`** (271).
- **`shop_orders`** + **`shop_order_items`** + **`shop_order_status_history`** (123) — siparişler; `deposit_percent`/`deposit_amount` + banka transferi (221), satır fiyat düzenleme (275), `shop_order_messages` (173).

### Eğitmen Maaş/Komisyon (bkz. [[Instructors_Payroll]])
- **`instructor_default_commissions`** + **`instructor_service_commissions`** (001) — komisyon oranları (yüzde veya sabit/ders).
- **`instructor_earnings`** (taban şema; 035 para birimi eklendi) — ders-başı kazanç ledger'ı.
- **`manager_commissions`** + **`manager_commission_settings`** + **`manager_payouts`** + **`manager_payout_items`** (103), **`manager_salary_records`** (185) — yönetici komisyon/maaş. Maaş 258'de cüzdan bakiyesinden ayrıldı.

### Garanti, Form, Bildirim, Entegrasyon
- **`warranty_claims`** + **`warranty_staff_links`** + **`warranty_claim_media`** + **`warranty_claim_events`** (262), warranty belgeleri (274) — UKC.Care (bkz. [[Warranty_Repairs]]).
- **`form_templates`/`form_steps`/`form_fields`/`form_submissions`** + analytics/versions/email logs (126–136) — form motoru (bkz. [[Forms_Waivers_Compliance]]).
- **`liability_waivers`** (018) + **`waiver_versions`** (019).
- **`notifications`/`notification_settings`** (add_new_features; 227–230 genişletmeler), **`email_deliveries`** (276, Resend webhook), **`push_subscriptions`**. Bkz. [[Notifications_System]].
- **`conversations`/`messages`/...** (118) — sohbet (bkz. [[Chat_Community_Events]]).
- **`proposals`** (269/270) — Teklif Hazırla (bkz. [[Proposals_Quotes]]).
- **`telegram_link_codes`** (244)/`user_telegram_chats` (246)/`telegram_delivery_log` (250), **`spotify_tokens`/`spotify_schedules`** (263), **`kai_sessions`/`kai_notes`/`kai_student_docs`/`kai_knowledge_base`** (200/232) — entegrasyonlar (bkz. [[Misc_Integrations]]).
- **`audit_logs`** (022), **`quick_links`** (114), **`marketing_campaigns`** (106), **`student_recommendations`** (225), **`student_skills_progress_goals`** (223).

## Akış / İş Mantığı

1. **Yazma yolu:** Route → service (`backend/services/*`) → `pool.query` / transaction (`client = await pool.connect(); BEGIN ... COMMIT`). Kritik finansal mutasyonlar `FOR UPDATE` kilidiyle atomiktir.
2. **Cüzdan:** Her parasal hareket `wallet_transactions`'a değişmez bir satır ekler ve `wallet_balances`'ı günceller; `idempotency_key` yinelemeleri engeller; `wallet_guard_non_negative_balance` trigger'ı (265) yetkisiz negatife düşmeyi INSERT+UPDATE'te bloklar.
3. **İndirim:** Hiçbir zaman kaynak fiyat kolonunu değiştirme; `discounts`'a UPSERT et, finans gösteriminde LATERAL ile çıkar.
4. **Mutabakat:** `reconciliationService` periyodik olarak `wallet_balances`'ı SUM(completed wallet_transactions)'dan yeniden hesaplar (cancel+reversal çift-sayımını düzeltir; MEMORY: `project_wallet_cancel_reversal_double_count`).

## Dikkat / Tuzaklar

- **AUTHORITATIVE klasör `backend/db/migrations/`'dır** — `backend/migrations/` (eski) DEĞİL. CLAUDE.md bunu açıkça belirtir.
- **`customer_packages.status`'ta `'completed'` yok** — `'used_up'` kullan.
- **Para = `NUMERIC` + Decimal.js**; kayan nokta hesaplaması para için YASAK.
- **`discounts` tablosu kutsaldır** — ham fiyat kolonları asla mutasyona uğratılmaz; `amount` uygula-anında kilitlenir.
- `wallet_transactions.related_entity_id` UUID'dir; INTEGER PK'li varlıklar (shop_orders/member_purchases) id'lerini `metadata.orderId`/`metadata.memberPurchaseId`'de taşır — finans join'lerinde `COALESCE(related_entity_id::text, metadata->>'orderId', ...)` gerekir (MEMORY: `project_payment_history_row_discount_shop_member`).
- DATE kolonları string döner, timestamp'ler UTC parse edilir — saat dilimi varsayımı yapma.
- `RUN_DB_MIGRATIONS=true` ayarlı değilse açılışta migration çalışmaz; CI/prod deploy'da bilinçli olarak ayarlanır.
- Bir migration ada göre uygulanmışsa içerik değişse bile yeniden çalışmaz (sadece checksum uyarısı) — değişiklik için YENİ numaralı migration oluştur.
