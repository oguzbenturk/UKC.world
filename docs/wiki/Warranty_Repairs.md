# Warranty_Repairs

> **Özet:** UKC.Care garanti sistemi (Duotone/ION ürünleri) — müşteri girişsiz public form ile talep açar, 8 karakterlik okunabilir kodla takip eder; garanti ekibi ayrı bir kodla portal kullanır; admin tüm yaşam döngüsünü `/admin/warranty`'den yönetir. Ayrıca daha basit, hesap-tabanlı `repair_requests` (tamir/atölye iş emri) akışı vardır. Gönderilen her e-postanın gerçek teslim durumu Resend webhook (Svix imzalı) ile `email_deliveries` tablosuna işlenir.
>
> **Kütüphaneler:** Node.js + Express (ESM), PostgreSQL (`pg`), `multer` (medya yükleme), `archiver` (ZIP export), `express-validator`, Resend/Svix HMAC (`crypto`), React 18 + Ant Design + TanStack Query, react-i18next, dayjs.
>
> **Bağlantılar:** [[Products_Shop_Inventory]], [[Notifications_System]], [[Outsider_Marketing]], [[Customers_CRM]], [[Backend_Server]], [[Database]], [[Authentication_Authorization]]

---

## Sorumluluk

İki ayrı ama akraba alt-sistem barındırır:

1. **UKC.Care garanti talepleri (`warranty_claims`)** — üretici (Duotone Pro Center) garanti süreci. Anonim public form → ekip incelemesi → üretici ile koordinasyon → çözüm/red/kapatma. Tam bir olay zaman çizelgesi (timeline), medya kanıtları (foto/video + dahili PDF "Product Bill"), durum geçiş makinesi, üretici talep numarası kilidi ve aktör atıfı içerir. **Hiçbir tarafta login yoktur** — hem müşteri hem ekip tek-kullanımlık okunabilir kod (`/care/track/:code`, `/care/staff/:code`) ile erişir.
2. **Tamir talepleri (`repair_requests`)** — daha hafif atölye iş emri akışı. Kayıtlı kullanıcı veya misafir (tracking token ile) talep oluşturur; admin/manager durum + atama + atölye notu yönetir; taraflar dahili/harici yorumlarla yazışır. Bu akış garantiden bağımsızdır, kendi tablolarını kullanır.

Garanti, kasıtlı olarak ürün-katalog tablolarından (`products`, bkz. [[Products_Shop_Inventory]]) **bağımsızdır**: talep, serbest-metin ürün adı/marka/model/seri üzerinden açılır, bir SKU'ya FK ile bağlanmaz (müşteri ürünü UKC'den almamış olabilir).

## Backend

### Rotalar
- `backend/routes/publicWarranty.js` → `/api/public/warranty/*` — **auth yok**. Üç yüzey:
  - **Public submit:** `POST /` (multipart, foto+video; PDF YASAK — `allowDocuments:false`), `formSubmissionRateLimit`.
  - **Müşteri takibi:** `GET /track/:code`, `GET /track/:code/media/:mediaId` — `warrantyLookupRateLimit` + `requireValidToken` (regex `^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$`). `document` türü medya bu yüzeyde **asla** servis edilmez.
  - **Ekip portalı:** `GET /staff/:code` (+`/media/:mediaId`, `/media/archive` ZIP), `POST /staff/:code/note`, `/files` (PDF dahil), `PATCH /staff/:code/claim-number`, `PATCH /staff/:code/status`. Token `loadStaffLinkByToken` ile `warranty_staff_links`'e çözülür; ekip `closed` durumuna **geçemez**.
- `backend/routes/warrantyAdmin.js` → `/api/warranty/admin/*` — `authenticateJWT` + `authorizeRoles(['admin','manager'])` (owner miras alır, bkz. [[Authentication_Authorization]]). Admin-adına talep oluşturma (`POST /`, opsiyonel `notify_customer=false`), liste/arama/sayfalama (`GET /`), istatistik (`GET /stats`), talep detayı (`GET /:id` → claim+events+media+staffLinks), durum/not/müşteri-güncellemesi, kapatma/silme (soft-delete + dosya hard-delete), medya ekleme/silme + ZIP export, **e-posta teslim durumu** (`GET /:id/email-deliveries`), staff-link oluştur/yeniden-gönder/iptal, claim-number admin override. Her yıkıcı işlem `logAuditEvent` ile `audit_logs`'a parallel satır yazar (bkz. [[Backend_Server]]).
- `backend/routes/repairRequests.js` → `/api/repair-requests/*` — `GET /` (admin/manager hepsini, kullanıcı kendininkini), `GET /statistics` (admin/manager), `POST /guest` (auth yok, tracking_token döner), `GET /track/:token` (auth yok), `POST /` (admin başkası adına `userId` ile), `PATCH /:id` (admin/manager), yorumlar `GET|POST /:id/comments` (dahili yorum yalnız admin/manager).
- `backend/routes/resendWebhook.js` → `/api/webhooks/resend` — Resend olayları (`email.delivered/.bounced/.complained/.opened`…). CSRF-muaf `/api/webhooks/` prefix'i altında; ham gövde `req.rawBody`'den (server.js `express.json` verify callback) okunur (imza + `sanitizeInput` mutasyonu nedeniyle). **Svix imza doğrulaması** (`whsec_` → base64 anahtar, `${id}.${ts}.${rawBody}` HMAC-SHA256, ±5 dk replay koruması, `timingSafeEqual`). Secret yoksa "ilk-açılış toleransı" ile UNVERIFIED kabul edip uyarır.

Rota kayıtları `backend/server.js` (≈satır 1420-1463). Garanti medyası `/uploads/warranty/` üzerinden **asla** statik servis edilmez — server.js bu prefix'i gateler (aşağıda "Tuzaklar").

### Servisler
- `backend/services/warrantyService.js` — sistemin kalbi. Token üretimi (`generateUniqueToken`, collision-checked, 10 deneme), **durum geçiş makinesi** (`STATUS_TRANSITIONS`, `isValidTransition`, `STAFF_ALLOWED_STATUSES`), claim CRUD + `listClaims`/`getStatsForAdmin`, `updateClaimStatus` (FOR UPDATE kilidi, `rejected` için not zorunlu), `addNote`/`addCustomerUpdate`, medya kayıt iliştir/sök (`attachMediaRecord`/`detachMediaRecord` — denormalize sayaçları transaction içinde günceller), staff-link yaşam döngüsü, **claim-number kilidi** (`setStaffClaimNumber` sahiplik kilidi vs `setAdminClaimNumber` override), aktivite digest yardımcıları (`listClaimRecipients`/`getActivityForDigest`/`markActivityNotified`). Her mutasyon `warranty_claim_events`'e satır yazar (authoritative timeline).
- `backend/services/warrantyMediaService.js` — `multer` disk storage (`_pending` → claim klasörü relocate), MIME→kind eşleme (`photo`/`video`/`document`), boyut/sayı/kota doğrulaması (`validateUploadedFiles`: 30MB foto, 500MB video, 50MB PDF, 1.5GB/talep; 10/3/20 adet), dosya temizleme/silme, **ZIP export** (`streamClaimMediaArchive`: `Customer/` vs `Team/` klasörleri + `manifest.csv` rol/yükleyici/kind koruyarak — `archiver` lazy `createRequire` ile). `document` kind public formda reddedilir.
- `backend/services/warrantyNotificationService.js` — tüm e-posta/bildirim fan-out'u. Müşteri e-postaları `skipConsentCheck:true` (claimant kayıtlı kullanıcı değil, hepsi transactional). Talep gönderiminde müşteri + adminler (`notifyClaimSubmittedToAdmins`: in-app/Telegram via `dispatchNotification` + doğrudan markalı e-posta). **Aktivite digest** (`queueClaimActivityDigest`/`flushClaimActivityDigest`): her değişiklik 3dk debounce (`WARRANTY_DIGEST_DEBOUNCE_MS`) penceresinde ATANMIŞ ekibe TEK bundle e-posta; alıcı kendi eylemini geri almaz (`recipientAuthored`); watermark satırda (`last_activity_notified_at`) → kaybolan timer kendini onarır.
- `backend/services/repairRequestService.js` — `repair_requests` CRUD + misafir token üretimi (32-byte hex), güvenli public görünüm (`getRepairRequestByToken`, dahili not yok), durum güncelleme + bildirim (status/not değişiminde `dispatchNotification`), yorum erişim kontrolü (sahip VEYA admin/manager) + `dispatchToStaff` fan-out.
- `backend/services/emailDeliveryService.js` — **app-genelinde** giden e-posta logu. `recordEmailSend()` (emailService send-anında çağırır, best-effort, asla throw etmez), `applyEmailEvent()` (webhook → satır eşleme: önce `provider_id`, sonra son 5 günde recipient+subject; durum ileri-yönlü `STATUS_RANK` ama bounce/complaint her zaman kazanır), `listDeliveriesForEntity()` (admin paneli için).
- E-posta şablonları: `backend/services/emailTemplates/warrantyClaimSubmitted.js`, `warrantyStatusChange.js`, `warrantyStaffLink.js`, `warrantyClaimClosed.js`, `warrantyActivityDigest.js`.

## Frontend

- **Public garanti** (`src/features/warranty/pages/`):
  - `WarrantySubmitPage.jsx` — koyu temalı "ledger" form (4 bölüm: Identity/Equipment/Incident/Evidence), `WarrantyFileUploader`, başarıda `/care/track/:code?new=1`'e yönlendirir. `useSubmitWarrantyClaim` hook'u ile multipart upload + progress.
  - `WarrantyTrackPage.jsx` — müşteri takip portalı. Sekmeler: Messages (`customer_update`+`note`), Activity (durum/medya olayları), Files (`closed`/`rejected` ise medya "purged" uyarısı), Details. `WarrantyMediaGallery` ile "Your uploads" vs "From the UKC team" gruplaması.
  - `WarrantyStaffPage.jsx` — ekip portalı (`CareBrandShell`, açık tema). Claim-number kilit durumu UI'da gösterilir (`external_claim_number_set_by_staff_link_id === staffLink.id`), durum geçiş seçici (`StatusTransitionSelect isStaff`), not (müşteriye-görünür checkbox), PDF dahil dosya yükleme, timeline, ZIP indirme.
  - `AdminWarrantyListPage.jsx` — admin liste + istatistik kartları (open/last7d/awaiting_customer/with_manufacturer), arama/durum filtresi/sayfalama. `AdminWarrantyDetailModal` (URL `/admin/warranty/:id` ile senkron) ve `AdminWarrantyCreateModal`. `useAdminWarrantyList`/`useAdminWarrantyStats` hook'ları.
- **Tamir** (`src/features/repairs/pages/RepairsPage.jsx`) — rol-duyarlı: admin/manager/front_desk/receptionist/owner için atölye (repairman) görünümü (KPI kartları, durum sekmeleri, atama, atölye notları, `SparePartsOrders` sekmesi, `RepairChat` dahili/harici yorum); diğer roller `CareLandingPage`'e düşer. `/api/repair-requests` ile çalışır.
- **Pazarlama girişi** `src/features/outsider/pages/CareLandingPage.jsx` (`/care`) — public açılış; garanti formu (`/care/warranty`) ve tamir akışına yönlendirir (bkz. [[Outsider_Marketing]]).
- Frontend rotaları `src/routes/AppRoutes.jsx`: `/care`, `/care/warranty`, `/care/track/:code`, `/care/staff/:code` (hepsi public), `/repairs` (korumalı), `/admin/warranty` + `/admin/warranty/:id` (manager+).
- Servis/sabitler: `src/features/warranty/services/warrantyApi.js` (medya/ZIP URL üreticileri), `src/features/warranty/hooks/useWarranty.js`, `src/features/warranty/constants.js` (`STATUS_PALETTE`, `STATUSES`, `formatBytes`).

## Veri Modeli

Garanti (migration 262 + 272 + 274):
- **`warranty_claims`** — `id UUID`, `customer_token CHAR(8) UNIQUE`, `status TEXT` (8-değerli CHECK), müşteri/ürün serbest-metin alanları, `preferred_language` (tr/en), denormalize sayaçlar `total_bytes`/`photo_count`/`video_count`/`document_count` (kota tek SELECT'te), `external_claim_number` + kilit alanları (`*_set_by_user_id`/`*_set_by_staff_link_id`/`*_set_by_name`/`*_set_at`), `last_activity_notified_at` (digest watermark), `deleted_at` (soft-delete), `closed_at`. `updated_at` trigger'ı.
- **`warranty_staff_links`** — claim'e atanan ekip üyesi; `staff_token CHAR(8) UNIQUE`, `staff_user_id` (opsiyonel FK), `claim_number_external`, `revoked_at`.
- **`warranty_claim_media`** — `kind` (`photo`/`video`/`document`), dosya meta + `storage_path`, `uploaded_by_kind` (`customer`/`staff`/`admin`) + yükleyici FK'ları.
- **`warranty_claim_events`** — authoritative timeline; `event_type` (12-değerli CHECK: submitted/status_change/note/customer_update/media_added/media_removed/staff_assigned/staff_revoked/link_resent/claim_closed/claim_deleted/**claim_number_set**), `actor_kind`, aktör FK'ları, `visible_to_customer`, `body`, `metadata JSONB`.

Tamir: **`repair_requests`** (`user_id` VEYA `guest_name`/`guest_email`/`guest_phone` + `tracking_token`, `equipment_type`/`item_name`/`description`/`photos JSON`/`priority`/`location`/`status` pending|in_progress|completed|cancelled, `assigned_to`, `notes`) + **`repair_request_comments`** (`is_internal`).

E-posta (migration 276): **`email_deliveries`** — `provider_id` (Resend email_id, ilk webhook'tan öğrenilir), `message_id`, `recipient`/`subject`/`notification_type`, `related_entity_type`/`related_entity_id` (TEXT, UUID+INT PK'lere uyar), `status` (8-değerli CHECK), `error`, `last_event_at`. `user_id`'de FK YOK (alıcılar çoğu kez kayıtlı kullanıcı değil).

## Akış / İş Mantığı

**Garanti talebi yaşam döngüsü:**
1. Müşteri public formu doldurur → `createClaim` (transaction: claim + `submitted` event) → bekleyen dosyalar claim klasörüne taşınır → müşteri + adminlere bildirim (async, talep oluşturmayı bloklamaz).
2. Admin staff-link oluşturur → ekip üyesi e-posta ile portal linki alır; durum `submitted` → `under_review` → (`approved`/`with_manufacturer`/`awaiting_customer`) → `resolved` → `closed` zincirinde ilerler (`STATUS_TRANSITIONS` geçerli geçişleri kısıtlar).
3. Her not/durum/medya/claim-number değişimi: müşteriye anlık transactional e-posta (uygunsa) + atanmış ekibe 3dk-debounced **aktivite digest**.
4. Kapatma/red'de medya purge edilir; takip sayfasında Files sekmesi "media removed" uyarısı gösterir.

**Claim-number kilidi:** Üretici talep no'sunu ilk giren staff-link'e kilitlenir (`ownedByThisLink` değilse 403). Admin override (`setAdminClaimNumber`) kilidi bypass eder, sahipliği admin'e alır ve `set_by_staff_link_id=NULL` yaparak tüm ekibi kilitler.

**E-posta teslim takibi:** SMTP (`smtp.resend.com`) ile gönderilir → send-anında `recordEmailSend(status='sent')` → Resend webhook olayları satırı `delivered`/`bounced`/`opened`'e ilerletir → admin panelinde `GET /:id/email-deliveries` ile per-alıcı durum görünür.

## Dikkat / Tuzaklar

- **`document` (Product Bill PDF) DAHİLİDİR:** Yalnız ekip/admin yükler, public formda reddedilir (`allowDocuments:false`), müşteri takip yüzeyinde ASLA servis edilmez (geçerli mediaId ile bile 404) ve add/remove timeline olayları `visible_to_customer=false` ile müşteriden gizlenir (bir üretici bili UKC'nin toptan faturası olabilir). Admin paneli bu dosyaları JWT-korumalı `/:id/media/:mediaId` ile blob olarak çeker.
- **`/uploads/warranty/` leak fix:** Garanti medyası asla statik mount'tan servis edilemez — `backend/server.js` `/warranty/` prefix'ini gateler. Aksi halde nginx `try_files` + statik mount JWT'yi by-pass ederek dahili PDF'leri sızdırırdı.
- **Route sırası:** `/staff/:code/media/archive` ve `/:id/media/archive`, `:mediaId` paramından ÖNCE tanımlanır; yoksa "archive" literali UUID param olarak yakalanır.
- **Webhook ham gövde:** Resend imzası + alan eşleme `req.body` değil `req.rawBody`'den okunur — global `sanitizeInput` middleware'i `subject` gibi alanları mutasyona uğratabilir. `RESEND_WEBHOOK_SECRET` set edilmezse olaylar UNVERIFIED kabul edilir (yalnız ilk-açılış toleransı; operatör secret + webhook URL + domain doğrulamasını tamamlamalı).
- **Digest dayanıklılığı:** Aktivite digest in-memory timer + satır-içi watermark çiftine dayanır; süreç restart olur ve timer kaybolursa bir sonraki aktivite flush'ı atlanan olayları toplar (worst-case gecikme, kayıp değil). Müşteri-yönlü e-postalar ayrıdır, asla digest'e bağımlı değildir.
- **`repair_requests` ≠ garanti:** İki sistem ayrı tablolar/rotalar/sayfalar kullanır; aynı "Care" markası altında sunulsa da kod yolları ayrıktır. Tamir `photos` JSON-string olarak saklar (`parsePhotos` parse eder), garanti medyası ise ilişkisel `warranty_claim_media`'dır.
- **`email_deliveries` app-genelidir:** Yalnız garantiye özgü değil — tüm transactional e-postaları loglar; ama tüketici UI'ı şimdilik yalnız garanti claim detayında (`related_entity_type='warranty_claim'`).
