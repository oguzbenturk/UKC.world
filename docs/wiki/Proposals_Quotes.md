# Proposals & Quotes (Teklif Hazırla)

> **Özet:** Personelin (admin/manager) müşteri için marka kimlikli, çok-dilli teklif/kotasyon (proposal) hazırlamasını sağlar; tam düzenlenebilir doküman JSONB `content` olarak saklanır, jsPDF ile PDF üretilir ve müşteri tahmin edilemez `share_code` ile auth'suz `/teklif/:code` sayfasından görür ve "kabul et" diyebilir.
>
> **Kütüphaneler:** Express 5 (ESM), PostgreSQL (`pg`, JSONB `content`), Node `crypto` (share-code), Ant Design + React (builder UI), jsPDF + jspdf-autotable (PDF), Decimal.js (para toplamları), react-i18next.
>
> **Bağlantılar:** [[Frontend_Shell]], [[Products_Shop_Inventory]], [[Lessons_Services_Packages]], [[Accommodation_Rentals]], [[Customers_CRM]], [[Misc_Integrations]], [[Notifications_System]], [[Database]], [[Backend_Server]]

---

## Sorumluluk

Bu modül, akademinin satış ekibinin bir müşteriye gönderdiği **teklif belgesini** (Teklif Hazırla) baştan sona yönetir:

1. **Builder (oluşturucu):** Personel; giriş metni, paket kalemleri, fiyat özeti (regular/savings/cash), dahil olanlar, program, avantajlar ve şartlar bölümlerini düzenler. Kalemler kataloğtan (services/accommodation/rentals/packages/products) çekilebilir.
2. **Çok-dillilik:** Her serbest-metin alanı dil-haritalı bir nesnedir (`{ en, tr, fr, de, ru, es }`); müşteri PDF/önizlemeyi istediği dilde görür.
3. **Public paylaşım:** Her teklif, üretilen 16 karakterlik base62 `share_code` ile auth'suz `/teklif/:code` adresinden açılır; müşteri PDF indirir ve teklifi **kabul** edebilir (idempotent). Görüntülenme sayacı tutulur.

`proposals` tablosu **bağımsızdır** — opsiyonel olarak bir müşteriye (`customer_id → users`) bağlanabilir ama bookings/finance ile doğrudan bağ kurmaz; kabul edildiğinde yalnız `status='accepted'` damgalanır (otomatik booking/fatura oluşmaz).

## Backend

### Rotalar
- `backend/routes/proposals.js` — **authed** CRUD. `server.js`'te `authenticateJWT` arkasına monte edilir ve router'ın ilk satırı `authorizeRoles(['admin','manager'])` ile **tüm uçları yalnız admin/manager'a** kısıtlar.
  - `GET /api/proposals` (filtreler: `status`, `q`, `customer_id`) — hafif liste (`content` hariç).
  - `GET /api/proposals/templates` — `is_template=true` şablon listesi.
  - `GET /api/proposals/:id` — `content` dahil tam kayıt.
  - `POST /api/proposals` — oluştur (yoksa `buildDefaultContent()` ile boş doküman).
  - `PATCH /api/proposals/:id` — kısmi güncelleme (beyaz-liste alanlar + `content`).
  - `POST /api/proposals/:id/duplicate` — klonla (yeni id + yeni share_code, `draft`'a sıfırla).
  - `POST /api/proposals/:id/save-as-template` — yeniden kullanılabilir şablona klonla (`asTemplate:true`, `prepared_for`/`customer_id` sıfırlanır).
  - `POST /api/proposals/:id/send` — `status='sent'` yap.
  - `DELETE /api/proposals/:id` — sil.
- `backend/routes/publicProposals.js` — **public**, auth'suz router. `server.js`'te `/api/public/proposals` altına `authenticateJWT` **olmadan** monte edilir (tıpkı `/api/public/forms` gibi). Erişim **yalnızca tahmin edilemez share-code** ile korunur.
  - `GET /api/public/proposals/:code` — PII/iç alanları çıkarılmış public payload; yanıtı bloklamadan `recordView()` ile görüntülenme sayar.
  - `POST /api/public/proposals/:code/accept` — müşteri kabulü (idempotent; `declined` veya süresi geçmişse reddeder).

### Servis — `backend/services/proposalsService.js`
- `generateShareCode(length=16)` — `crypto.randomBytes` ile base62 (`A-Za-z0-9`) ≈ 95 bitlik tahmin edilemez token. `createProposal` çakışmada (`23505` unique) 5 kez yeniden dener.
- `buildDefaultContent()` — prototip (`ukc_quote_kit`) şeklini taşıyan boş doküman: `brand`, `sections` (intro/package_items/price_summary/included/schedule/benefits/terms açık/kapalı bayrakları), kalem dizileri ve `price_summary._auto/_amounts` yardımcıları.
- `listProposals` / `getProposalById` — `users` ile join'leyip `created_by_name`/`customer_name` ve hesaplanmış `is_expired` (`valid_until < CURRENT_DATE`) döndürür.
- `getProposalByShareCode(code)` — public payload kurar; **`stripInternalContent()`** ile `package_items[]._source/_amounts` ve `price_summary._amounts/_auto` gibi builder-içi provenans/yardımcı alanları siler; süresi geçmişse `status`'u `'expired'`'a çevirir; `created_by`/iç `title` döndürmez.
- `updateProposal` — yalnız `TOP_LEVEL_WRITABLE` beyaz-listesini ve `content`'i günceller; geçersiz `status` değerlerini sessizce atlar; boş string'i `null`'a çevirir.
- `setStatus` / `acceptProposalByCode` / `recordView` — durum geçişleri; kabul `accepted_at = COALESCE(accepted_at, now())` ile idempotenttir.

## Frontend

`src/features/proposals/` (kendi içinde kapsüllü bir özellik modülü):

- **Sayfalar (`pages/`):**
  - `ProposalsListPage.jsx` — Ant Table liste (durum etiketi, cash_total, valid_until, görüntülenme, aksiyonlar: düzenle / kopyala / linki kopyala / public aç / sil). `/proposals/new`'de `QuickCreateWizard` açılır.
  - `ProposalBuilderPage.jsx` — sol tarafta bölüm editörleri, sağda **canlı `ProposalPreview`**. **Auto-save**: değişiklikler 1.2 sn debounce ile `PATCH`'lenir; `beforeunload`'da kaydedilmemiş uyarı; toplamlar `computeProposalTotals`/`withSyncedTotals` ile yeniden hesaplanır. PDF önizleme/indirme + public link kopyalama burada.
  - `PublicProposalView.jsx` — `/teklif/:code` müşteri görünümü; dil seçici, PDF indir, "Kabul Et" butonu (kabul/expired durumlarına göre Alert). `getPublicProposal`/`acceptPublicProposal` çağırır.
- **Bileşenler:** `components/QuickCreateWizard.jsx`, `CatalogPicker.jsx` (katalog→kalem), `MultilangInput.jsx` (dil-haritalı giriş), `editors/SectionEditors.jsx` (PackageItems/PriceSummary/Included/Schedule/Benefits/Terms editörleri), `preview/ProposalPreview.jsx` (HTML önizleme — PDF ile görsel senkron).
- **PDF:** `pdf/proposalPdfExport.js` (`exportProposalPdf({ output: 'save'|'bloburl' })`), `pdf/proposalFonts.js` (gömülü fontlar — TR/RU karakterleri için), `constants.js` (`BRAND` paleti = Duotone Antrasit + mavi, `OUTPUT_LANGUAGES`, `SECTION_ORDER`).
- **Yardımcılar (`utils/`):** `totals.js` (regular/savings/cash hesabı), `catalogToLineItem.js`, `contentValue.js`, `money.js`. **Önemli:** frontend `constants.js`'teki `buildDefaultContent`, backend'deki ile **ayna** olmalı (her ikisi de aynı doküman şeklini üretir).
- **Rota kaydı:** `src/routes/AppRoutes.jsx` — `/proposals`, `/proposals/new`, `/proposals/:id` (authed, builder), `/teklif/:code` (public, `PublicProposalView`). Üçü de `lazyWithRetry` ile lazy yüklenir.

## Veri Modeli

**`proposals`** (migration `269_create_proposals.sql`, PK = **SERIAL/INTEGER**):

- `id`, `share_code VARCHAR(24) UNIQUE NOT NULL` (16-char base62 token), `title` (iç personel etiketi), `prepared_for` (PDF'te görünen alıcı adı).
- `customer_id UUID → users(id) ON DELETE SET NULL` — opsiyonel CRM bağı (müşteriler `users` içinde yaşar, bkz. [[Customers_CRM]]).
- `language VARCHAR(5) DEFAULT 'en'`, `currency_code VARCHAR(3) DEFAULT 'EUR'`.
- `status VARCHAR(20) DEFAULT 'draft'` — `draft | sent | accepted | expired | declined` (`expired` çoğunlukla `valid_until`'dan **hesaplanır**, kalıcı yazılmaz).
- `valid_until DATE` (kota son geçerlilik), `regular_total / savings_total / cash_total NUMERIC(12,2)` (liste/sıralama için toplam anlık görüntüsü).
- `content JSONB NOT NULL DEFAULT '{}'` — tüm düzenlenebilir doküman (studio3/prototip şekli).
- `view_count INTEGER`, `last_viewed_at`, `accepted_at TIMESTAMPTZ`, `created_by UUID → users(id)`, `created_at`, `updated_at`.
- İndeksler: `share_code`, `customer_id`, `created_by`, `status`, `created_at DESC`.
- Şablon desteği migration `270_add_proposal_templates.sql` ile gelir (`is_template` bayrağı; `listProposals({ is_template:true })` ve save-as-template tarafından kullanılır).

## Akış / İş Mantığı

### Oluşturma → düzenleme → paylaşım
1. Personel `ProposalsListPage`'de "Yeni" der → `QuickCreateWizard` → `createProposal` (boş `content` ise `buildDefaultContent()`, benzersiz `share_code` üretilir).
2. `ProposalBuilderPage` editörlerinde bölümleri doldurur; her değişiklik **1.2 sn debounce** ile `PATCH /api/proposals/:id` (içerik + yeniden hesaplanmış toplamlar) olarak kaydedilir.
3. Kataloğtan kalem eklenebilir (`CatalogPicker` → `catalogToLineItem`): ders/konaklama/kiralama/paket/ürün fiyat ve adıyla bir satıra dönüşür.
4. Personel "Linki Kopyala" ile `${origin}/teklif/${share_code}` paylaşır veya PDF indirir (`exportProposalPdf`, seçilen dilde).

### Public görüntüleme ve kabul
1. Müşteri `/teklif/:code`'u açar → `GET /api/public/proposals/:code` **auth'suz** payload döner (iç alanlar `stripInternalContent` ile temizlenmiş).
2. Açılış `recordView()` ile `view_count`/`last_viewed_at` artırır (yanıtı bloklamadan, hata yutulur).
3. Müşteri dil değiştirebilir, PDF indirir, "Kabul Et" der → `POST /:code/accept` → `status='accepted'`, `accepted_at` damgalanır (idempotent; süresi geçmiş/`declined` ise reddedilir).

## Dikkat / Tuzaklar

- **Public erişim yalnızca share-code ile korunur (auth yok):** `/api/public/proposals/*` `authenticateJWT` arkasında **değildir**. Güvenlik tamamen 95-bitlik tahmin edilemez `share_code`'a dayanır. Bu yüzden public payload `getProposalByShareCode` içinde **iç alanları (created_by, iç title, `_source` provenans, `_amounts`) sızdırmaz**. Yeni alan eklerken `stripInternalContent`'i güncellemeyi unutma. CSRF-muaf public POST kuralı için bkz. [[Misc_Integrations]] (CSRF_EXEMPT_PREFIXES).
- **İki ayna `buildDefaultContent`:** Biri `backend/services/proposalsService.js`, biri `src/features/proposals/constants.js` içinde. Aynı doküman şeklini üretmeleri **şarttır**; biri değişip diğeri değişmezse builder ile PDF/preview yapısal olarak ayrışır. (Not: frontend serbest-metin alanlarını `{}` dil-nesnesi, backend `''` string ile başlatır — `MultilangInput` her ikisini de tolere eder.)
- **Authed CRUD admin/manager-only:** `proposals.js` router'ı tek satırlık `router.use(authorizeRoles(['admin','manager']))` ile kapatılır; receptionist/front_desk **göremez**. Builder rotaları (`/proposals*`) `AppRoutes`'ta korumalı bloktadır.
- **`expired` hesaplanır, yazılmaz:** Liste/builder/public hepsi `valid_until < CURRENT_DATE` ise `status`'u görüntü amaçlı `'expired'`'a çevirir ama DB'deki `status` kalıcı değişmeyebilir. Kabul, `valid_until >= CURRENT_DATE` koşuluyla sınırlıdır — süresi geçmiş teklif kabul edilemez.
- **PK tipi farkı:** `proposals.id` = **SERIAL/INTEGER** (çoğu yeni tablo UUID'dir; bu değil). Public erişim hiçbir zaman bu id'yi kullanmaz, yalnız `share_code`'u kullanır.
- **PDF font gömme:** TR/RU/özel karakterler için `proposalFonts.js` fontları jsPDF'e gömer; aksi halde diakritikler bozulur. PDF üretimi tamamen **client-side**'dır (sunucu PDF üretmez).
- **`customer_id` zayıf bağdır:** Teklif kabul edilse bile otomatik booking/fatura oluşmaz; satış ekibi kabulü gördükten sonra ilgili rezervasyon/membership'i elle açar. Bkz. [[Bookings_Calendar]] ve [[Memberships]].
