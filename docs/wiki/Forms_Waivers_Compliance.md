# Forms, Waivers & Compliance

> **Özet:** Sürükle-bırak dinamik form builder (çok adımlı, public link + analytics + yanıt yönetimi), dijital imzalı sorumluluk feragatnameleri (waivers) ve booking öncesi zorunluluk middleware'i, KVKK/GDPR uyumluluğu (veri export/anonimleştirme + public yasal sayfalar) ve eğitmen puanlama/geri bildirim sistemi bu modülde toplanır. Form gönderimleri `quick_links` üzerinden `/f/:linkCode` public URL'iyle açılır; feragatnameler `liability_waivers` tablosunda IP + user-agent + base64 imza ile yasal delil olarak saklanır.
>
> **Kütüphaneler:** React 18, Ant Design (form builder UI), özel HTML `<canvas>` imza (react-signature-canvas DEĞİL), Express 5 (ESM), PostgreSQL (JSONB), `sharp` (imza sıkıştırma/WebP), `express-validator`, `uuid`.
>
> **Bağlantılar:** [[Bookings_Calendar]], [[Customers_CRM]], [[Notifications_System]], [[Authentication_Authorization]], [[Instructors_Payroll]], [[Outsider_Marketing]], [[Student_Portal]], [[Backend_Server]], [[Database]], [[Shared_Backend_Utilities]], [[Accommodation_Rentals]], [[Warranty_Repairs]]

---

## Sorumluluk

Bu modül dört ayrı ama birbirine komşu alanı kapsar:

1. **Dinamik Form Builder** — admin/manager'ın kod yazmadan çok adımlı formlar tasarlaması; formun public link ile dışarıya açılması; gönderimlerin toplanması, analitiği ve CSV/JSON export'u. Servis/kayıt/anket/iletişim formları için kullanılır.
2. **Sorumluluk Feragatnameleri (Waivers)** — dijital imza ile yasal feragat toplama, sürümleme, süre/sürüm bazlı geçerlilik ve **booking/rental öncesi zorunluluk** denetimi.
3. **KVKK/GDPR Uyumluluk** — kullanıcı rıza yönetimi (terms + pazarlama izinleri), GDPR Madde 15 veri export'u, Madde 17 anonimleştirme, public yasal belgeler (KVKK/Gizlilik/Hizmet Koşulları).
4. **Geri Bildirim & Puanlama** — öğrencinin ders sonrası eğitmeni puanlaması (`ratings`) ve eski/oyunlaştırılmış başarım odaklı `feedback` sistemi.

---

## Backend

Rotalar `backend/server.js` içinde mount edilir (parantez içi auth notu):

| Mount | Dosya | Auth |
|---|---|---|
| `/api/form-templates` | `backend/routes/formTemplates.js` | JWT + `authorizeRoles(['admin','manager'])` |
| `/api/form-submissions` | `backend/routes/formSubmissions.js` | JWT |
| `/api/public/forms` | `backend/routes/publicForms.js` | **Public (auth yok)** — `/:code` render + `/:code/submit` |
| `/api/waivers` | `backend/routes/waivers.js` | JWT (template GET'leri public) |
| `/api/admin/waivers` | `backend/routes/adminWaivers.js` | JWT + admin/manager |
| `/api/user-consents` | `backend/routes/userConsents.js` | JWT (mount seviyesinde) |
| `/api/gdpr` | `backend/routes/gdpr.js` | JWT (admin uçları ayrıca `authorizeRoles(['admin'])`) |
| `/api/public/legal-documents` | `backend/routes/publicLegalDocuments.js` | **Public (auth yok)** |
| `/api/ratings` | `backend/routes/ratings.js` | JWT |
| `/api/feedback` | `backend/routes/feedback.js` | JWT |

**Form Builder rotaları** (`formTemplates.js`): template CRUD + soft-delete, `:id/duplicate`, `:id/export` & `POST /import` (JSON taşınabilirlik, ID'siz), `:id/steps` + `:stepId/fields` (hiyerarşik step→field yapısı), `/fields/validate` (alan tipi + regex + formül doğrulaması), `:id/versions` & `:id/restore/:versionId` (sürüm snapshot/geri alma), `:id/submissions` & `:id/submissions/export` (CSV), `:id/notifications` (form bazlı e-posta şablonları). Servisler: `formTemplateService.js`, `formSubmissionService.js`, `formAnalyticsService.js`, `formEmailNotificationService.js`.

**Public Form akışı** (`publicForms.js`): `getFormByQuickLinkCode` ile `quick_links.link_code` → form template çözülür. `GET /:code` formu döner ve `form_view` event'i atar; `POST /:code/submit` `formSubmissionRateLimit` ile spam'e karşı korunur, `validateSubmission` çalıştırır, `form_submit` event'i atar ve **bloklamadan** onay + admin alarm e-postalarını gönderir. `save-draft` / `send-resume-link` ile yarım kalan form `session_id` üzerinden kaydedilip 7 günlük link ile e-postayla devam ettirilebilir.

**Waiver rotaları** (`waivers.js`): `POST /submit` (imza base64 PNG/JPEG zorunlu, `agreed_to_terms===true`), `GET /status/:userId`, `GET /check/:userId`, `GET /history/:userId`, `GET /template[/:versionId]`. **IDOR koruması:** `user_id` mutlaka authenticated user ile eşleşmeli; family member için `family_members.parent_user_id` doğrulanır. Admin görüntülemeleri `auditLogService.logWaiverView` ile loglanır; imza sonrası `waiverNotificationService.dispatchWaiverSigned` bildirim yollar ([[Notifications_System]]).

**`adminWaivers.js`**: tüm öznelerin (kullanıcı + aile üyesi) feragat durumunu listeler (valid/expired/outdated/missing/pending/signed filtreleri), istatistik ve **CSV export** sağlar; `adminWaiverService.js` ile.

**GDPR** (`gdpr.js` + `gdprDataExportService.js`): `GET /export` (kendi verisi) & `POST /export/:userId` (admin) tüm kişisel veriyi (profil, rıza, booking, finans, mesaj, puan, eğitmen verisi, paket, konaklama, ekipman, denetim logu) tek JSON paketinde indirir; `DELETE /anonymize[/:userId]` Madde 17 anonimleştirme. `GET /rights` GDPR haklarını metinle döner. **Finansal kayıtlar 7 yıl saklama** notu export metadata'sında geçer.

**Rıza** (`userConsents.js` + `userConsentService.js`): `GET/POST /me` ile terms kabul + pazarlama izinleri (email/sms/whatsapp). `LATEST_TERMS_VERSION` (env `TERMS_VERSION`, varsayılan `2025-10-01`) ile sürüm uyuşmazlığı `CONSENT_TERMS_VERSION_MISMATCH` (400) veya kabul eksikse `CONSENT_TERMS_REQUIRED` (409) döner. `acceptWaiver===true` ile aynı transaction içinde basitleştirilmiş bir `liability_waivers` kaydı da açılabilir. Schema `ensureConsentSchema` ile **runtime'da `CREATE TABLE IF NOT EXISTS`** olarak oluşturulur (migration dışı).

**Public legal** (`publicLegalDocuments.js`): `/:type` ile `legal_documents` tablosundan aktif belgeyi döner; `kvkk`/`gizlilik` slug'ları `privacy`'ye alias'lanır, 5 dk cache.

**Puanlama** (`ratings.js` + `ratingService.js`): öğrenci `POST /` ile 1–5 booking puanı verir; `GET /unrated`, `GET /instructor/:id` (eğitmen sadece kendininkini), `GET /overview` (admin). **Google review entegrasyonu kodda YOKTUR** (sadece dahili puanlama). Eski `feedback.js` ise `feedback` tablosuna yazar + `student_achievements` oyunlaştırma rozetleri verir (INTEGER booking_id kullanır — `ratings`'ten ayrı, eski sistem).

### `ratings.js` uç-detayları (yeni eğitmen puanlama)

Tüm uçlar JWT korumalı; rol kapıları `authorizeRoles` ile (`requireStudent` = `['student']`, `requireInstructorOrAdmin` = `['instructor','admin','manager']`, `requireAdminOrManager` = `['admin','manager']`). Servis dosyası: `backend/services/ratingService.js`. **Önemli:** route adı `ratings` ama fiziksel tablo **`instructor_ratings`**'tir (servisteki tüm sorgular bu tabloyu kullanır).

| Uç | Rol | Davranış |
|---|---|---|
| `POST /` | student | `createRating` — gövde: `bookingId` (UUID, zorunlu), `rating` (1–5 int), opsiyonel `feedbackText` (≤2000), `isAnonymous` (bool), `serviceType`, `metadata` (obj). `feedbackText` `sanitizeInput` ile temizlenir. `201` döner. |
| `GET /unrated` | student | `getUnratedBookings` — kendi booking'lerinden henüz puanlanmamış + bitmiş (`completed`/`checked_out`/`done` ve geçmiş tarihli) olanları döner; opsiyonel `?limit`. |
| `GET /instructor/:instructorId` | instructor/admin/manager | `getInstructorRatings` + `getInstructorAverageRating`. **IDOR koruması:** `instructor` rolündeki kullanıcı yalnızca kendi `id`'sini sorgulayabilir, başkası için **403**. Filtre: `?serviceType`, `?limit`, `?offset`. |
| `GET /stats/:instructorId` | instructor/admin/manager | `getInstructorRatingStats` — ortalama + 1–5 yıldız dağılımı; aynı self-only IDOR kontrolü. |
| `GET /overview` | admin/manager | `getInstructorRatingOverview` — tüm eğitmenlerin toplu puan özeti; `?serviceType`, `?limit`, `?offset`, `?sortBy` (`average`/`count`/`recent`); `lesson`/`rental`/`accommodation` başına breakdown. |
| `GET /bookings/:bookingId/exists` | student | `hasRatingForBooking` — booking için puan var mı bool döner (UI'da puanla butonu gizlemek için). |

**`createRating` akışı (transaction):** booking'i `bookings`'ten çeker (silinmemiş) → çağıran `studentId` mutlaka `student_user_id` **veya** `customer_user_id` olmalı (yoksa 403) → eğitmen atanmış olmalı (yoksa 400) → booking durumu `completed`/`checked_out`/`done` değilse **409 "Lesson is not completed yet"** → aynı booking için zaten puan varsa **409 "Lesson already rated"** → `instructor_ratings` INSERT (`service_type` yalnız `lesson`/`rental`/`accommodation`'a normalize edilir, diğer her şey `lesson` olur) → ilgili `rating_request` bildirimi silinir → COMMIT sonrası `setImmediate` ile `bookingNotificationService.sendInstructorRatedNotification` (non-blocking) tetiklenir. Hatırlatma tarafı `queueRatingReminder` ile `rating_request` bildirimi kuyruğa alınır (ders bitmeden / zaten puanlanmışsa atlanır, idempotency key'li). Bildirim akışı için bkz. [[Notifications_System]].

### `feedback.js` uç-detayları (eski oyunlaştırma sistemi)

Ayrı, **eski** sistem — `feedback` + `student_achievements` tablolarına yazar, **INTEGER `booking_id`** kullanır (yeni `instructor_ratings` UUID kullanır → ikisi bağımsız). Bu rotada servis katmanı yoktur; SQL doğrudan `pool.query` ile route içinde.

| Uç | Rol | Davranış |
|---|---|---|
| `POST /` | student/admin/manager | Gövde: `bookingId` (**int**, zorunlu), `rating` (1–5 int), opsiyonel `comment` (≤1000), `skillLevel` (`beginner`/`intermediate`/`advanced`), `progressNotes` (≤500). Booking sahipliği (`student_id`) doğrulanır (yoksa 404); aynı booking'e ikinci feedback **409**. INSERT sonrası `skillLevel` verilmişse `users.skill_level` güncellenir, `checkAchievements` ile rozet kazanımı denetlenir; `{ feedback, achievements }` döner. |
| `GET /booking/:bookingId` | admin/manager/instructor/student | Booking'in feedback'i + öğrenci/eğitmen adı; öğrenci yalnız kendi feedback'ini görebilir. |
| `GET /instructor/:instructorId/summary` | admin/manager/instructor | Eğitmenin feedback özeti (toplam, ortalama, 1–5 yıldız sayıları) + son 10 feedback; `instructor` rolü yalnız kendi `id`'si için (yoksa 403). |
| `GET /achievements/:studentId` | admin/manager/instructor/student | Öğrencinin `student_achievements` rozetleri; öğrenci yalnız kendisi için (yoksa 403). |

**Rozet mantığı** (`checkAchievements`/`awardAchievement`): `first_lesson` (1. feedback), `perfect_rating` (5 yıldız), `five_lessons`/`ten_lessons` (5./10. feedback), `high_performer` (≥5 yüksek puan ve oran ≥%80). Her rozet `achievement_type` başına bir kez verilir (mevcutsa atlanır).

### Booking feedback (`feedback`) vs Instructor rating (`ratings`) farkı

İkisi **tamamen ayrı sistem**dir, birbirini beslemez:

| | `feedback.js` (eski) | `ratings.js` (yeni) |
|---|---|---|
| Tablo | `feedback` (+ `student_achievements`) | `instructor_ratings` |
| `booking_id` tipi | **INTEGER** | **UUID** |
| Servis katmanı | Yok (route içi SQL) | `ratingService.js` |
| Amaç | Ders sonrası 1–5 puan + yorum + **ilerleme notu** (skill level) + oyunlaştırma rozetleri | Eğitmen-odaklı 1–5 puan + eğitmen ortalaması/overview |
| `serviceType` | Yok (sadece ders) | `lesson`/`rental`/`accommodation` |
| Anonim puan | Yok | `is_anonymous` destekli |
| Booking durum kapısı | Sadece sahiplik | `completed`/`checked_out`/`done` zorunlu |

**Kural:** Yeni puanlama için **`ratings`** kullan; `feedback` yalnız geçmiş veriler/rozetler için durur. (Tuzaklar bölümündeki "İki ayrı geri-bildirim sistemi" notu ile bağlantılı.)

---

## Frontend

`src/routes/AppRoutes.jsx` rotaları:

- **Form Builder (korumalı):** `/forms` (`FormsListPage`), `/forms/builder/:id` (`FormBuilderPage` — üç panel: Toolbox | Canvas | Properties), `/forms/:id/analytics` (`FormAnalyticsPage`), `/forms/:id/responses` (`FormResponsesPage`), `/forms/preview/:id` (`FormPreviewPage`).
- **Public form:** `/f/:linkCode` (`PublicFormPage`), `/f/success/:linkCode` (`FormSuccessPage`).
- **Public yasal:** `/kvkk`, `/gizlilik`, `/privacy`, `/terms` → `PublicLegalPage slug=...`.
- **GDPR:** `/privacy/gdpr` (`PrivacyGdprPage` — admin Legal Documents, kullanıcı `GdprDataManager`).
- **Admin redirect:** `/admin/waivers` → `/settings?tab=waivers`, `/admin/legal-documents` → `/settings?tab=legal`.

Form builder bileşenleri (`src/features/forms/components/*`): `FieldToolbox`, `FormCanvas`, `PropertiesPanel`, `ThemeBrandingPanel`, `StepNavigator`, `StepConfigModal`, `DynamicField`, `LiveFormPreview`, `RichHTMLEditor`, `FormSelector`. Builder durumu `hooks/useFormBuilder` ile yönetilir; alan tipleri `constants/fieldTypes`.

Uyumluluk bileşenleri (`src/features/compliance/components/*`): `SignatureCanvas` (özel `forwardRef` HTML5 canvas, `toDataURL('image/png')` ile imza üretir — react-signature-canvas kütüphanesi DEĞİL), `WaiverModal`, `WaiverViewer`, `WaiverDocument`, `UserConsentModal`, `GdprDataManager`, `PrivacyGdprPage`, `PublicLegalPage`. Geri bildirim: `src/features/feedback/{pages/FeedbackPage,components/FeedbackSystem}.jsx`.

> **DİKKAT — UI ile backend uyumsuzluğu:** Şu anki `WaiverModal` aslında bir **bilgilendirme modalı**dır ("Duotone Pro Center'da yüz yüze imzalayın" — tek `Anladım` butonu). Backend ise tam dijital-imza akışını destekler. Yani yetenek backend'de mevcut, mevcut UI yüzeyi onu kullanmıyor.

---

## Veri Modeli

| Tablo | Migration | Notlar |
|---|---|---|
| `form_templates` | `126` | SERIAL PK; `category` CHECK (service/registration/survey/contact); `theme_config`/`settings` JSONB; soft-delete `deleted_at`. |
| `form_steps` | `127` | Çok adımlı form; `skip_logic`, `completion_message`. |
| `form_fields` | `128` | `field_type` CHECK (~30 tip: text…`signature`,`rating`,`calculated`,`section_header`…); `validation_rules`/`options`/`conditional_logic` JSONB; `width` CHECK (full/half/third). |
| `form_submissions` | `129` | `quick_link_id`→`quick_links`, `form_template_id`→template; `status` CHECK (draft/submitted/processed/archived/cancelled); `submission_data` JSONB + GIN index; `session_id` ile taslak takibi. |
| `form_template_versions` | `131` | Sürüm snapshot/geri yükleme. |
| `form_analytics_events` | `132` | `form_view`/`form_submit` event takibi. |
| `form_email_notifications` | `133` | Form bazlı e-posta şablonları (recipient_type, trigger_status, gecikme). |
| `form_quick_action_tokens` | `134` | Hızlı aksiyon token'ları. |
| `liability_waivers` | `018` | UUID PK; `user_id` XOR `family_member_id` (CHECK `check_signee`); `signer_user_id` (imzayı atan); `waiver_version`, `language_code`, `signature_image_url` + `signature_data` (base64), **`ip_address` NOT NULL + `user_agent`** (yasal delil), `photo_consent`. |
| `waiver_versions` | `019` (seed `023`/`036`) | `version_number` UNIQUE, `effective_date`, `is_active` (dil başına tek aktif). |
| `user_consents` | runtime (`userConsentService`) | UUID PK = `users.id`; `terms_version`, `terms_accepted_at`, `marketing_{email,sms,whatsapp}_opt_in`. Migration ile değil, ilk çağrıda oluşturulur. |
| `legal_documents` | `260` (TR/EN KVKK içerik), `131_populate` | `document_type` (terms/privacy/marketing), `version`, `content` (HTML), `is_active`. |
| `ratings` | — | UUID booking_id; 1–5; `serviceType`, `is_anonymous`, `feedback_text`. |
| `feedback` + `student_achievements` | — | Eski sistem; INTEGER booking_id; oyunlaştırma rozetleri. |

İmza dosyaları `backend/uploads/signatures/` altında `sharp` ile sıkıştırılıp (≤500KB, PNG palette / mozjpeg) saklanır; opsiyonel `backups/signatures/` yedeği + CDN URL (`SIGNATURE_CDN_BASE_URL`) desteği vardır. `/uploads` erişimi auth-korumalı olduğundan imza yolları sızıntıya karşı gated (bkz. [[Warranty_Repairs]] içindeki `/uploads` düzeltmesi).

### Feragatname master metni (`backend/config/waiverContent.js`)

Dijital imza akışında imzalanan **kanonik feragat metni** `backend/config/waiverContent.js` içinde kod sabiti olarak tutulur (DB'deki `waiver_versions` seed'i ile koordine — bu config master şablon kaynağıdır). Sabit dışa-aktarımlar (bu modülün ortak yardımcısı, bkz. [[Shared_Backend_Utilities]]):

- `WAIVER_VERSION = '2.0'`, `WAIVER_LANGUAGE = 'en'`, `EFFECTIVE_DATE = 2026-01-01`, `COMPANY_NAME = 'Duotone Pro Center'`.
- `waiverContent` — başlık + 10 bölümlü yapısal nesne: `introduction`, `assumptionOfRisk` (kite/wind sporu + su/çevre + fiziksel + ekipman + eğitim risk listeleri), `releaseOfLiability` (sue-etmeme + indemnify), `medicalFitness`, `equipmentResponsibility`, `photoVideoConsent` (opt-out kutusu → `photo_consent` ile eşleşir), `emergencyContactAuthorization`, `parentalConsent` (18 yaş altı için), `additionalTerms`, `signatureSection` (imza/IP/sürüm placeholder'ları), `footer`.
- Yardımcı fonksiyonlar: `getFormattedWaiverText(includeMinorSection)` (Markdown birleştirilmiş tam metin), `getPlainTextWaiver(...)` (e-posta/düz metin için Markdown temizlenmiş), `getWaiverSections()` (UI'da bölüm-bölüm render), `getRequiredAcknowledgments(isMinor)` (imzadan önce gösterilen zorunlu/opsiyonel onay kutuları — `risks`/`liability`/`medical`/`instructions`/`emergency` zorunlu, `photoVideo` opsiyonel, minör ise `parentalConsent` eklenir).

> **NOT:** Metnin `WAIVER_VERSION` (`2.0`) değeri, `waiverService.submitWaiver`/`createWaiverVersion`'ın "güncel sürüm" karşılaştırmasında ve `needsToSignWaiver`'ın yeniden-imza tespitinde referans olarak kullanılır; sürüm bump'ı tüm kullanıcıları yeniden imzaya düşürür.

---

## Akış / İş Mantığı

**Public form gönderimi:** Kullanıcı `/f/:linkCode` açar → `quick_links` → template çözülür, `form_view` loglanır → form doldurulur (taslak `save-draft` ile saklanabilir) → `POST /:code/submit` rate-limit + `validateSubmission` → `form_submissions` INSERT (`user_id: null`) → `form_submit` event + onay/admin e-postaları (non-blocking).

**Waiver zorunluluğu** (`backend/middlewares/waiverCheck.js`): `requireWaiver` booking/rental rotalarından önce çalışır. `BYPASS_ROLES = {admin, manager, owner}` atlanır; aksi halde `needsToSignWaiver` ile **365 günden eski VEYA sürümü güncel olmayan VEYA hiç olmayan** feragat tespit edilirse **403 `WAIVER_REQUIRED`** döner (`action.url: /profile/waiver`). `checkFamilyMemberWaiver` ise `family_member_id` için sahiplik + feragat denetler (`FAMILY_WAIVER_REQUIRED`). `warnIfNoWaiver` (soft, bloklamaz) ve `requireWaiverWithExpiry(days)` (özel süre) varyantları mevcuttur. Bu sayede feragat akışı doğrudan [[Bookings_Calendar]] ve [[Accommodation_Rentals]] ile kesişir.

**Re-sign mantığı** (`waiverService.submitWaiver`): aynı sürüm + 30 günden yeni mevcut feragat varsa yeniden imza alınmaz (`already_signed`). Yeni sürüm yayınlandığında (`createWaiverVersion` dil başına eski sürümleri pasifleştirir) tüm kullanıcılar yeniden imzaya düşer.

**Rıza akışı:** `updateUserConsent` transaction içinde; `LATEST_TERMS_VERSION` güncel değilse kabul zorunlu, sürüm uyuşmazsa hata; pazarlama izinleri ayrı boolean'lar. Terms kabulü geri alınamaz (audit log'a yazılır). [[Customers_CRM]] ve [[Outsider_Marketing]] pazarlama izinlerini buradan okur.

**GDPR export:** `gdprDataExportService.exportUserData` 13+ veri kaynağını paralel toplar, kayıt sayar, indirilebilir JSON döner. Anonimleştirme finansal kayıtları (7 yıl yasal saklama) korur.

---

## Dikkat / Tuzaklar

- **İki ayrı geri-bildirim sistemi:** `ratings` (yeni, UUID booking_id, eğitmen overview) ile `feedback`/`student_achievements` (eski, INTEGER booking_id, oyunlaştırma) **bağımsızdır**; karıştırma. Yeni puanlama için `ratings` kullan. **Google review entegrasyonu kodda yok** — sadece dahili yıldız puanı.
- **`WaiverModal` ≠ dijital imza:** Mevcut frontend modal "yüz yüze imzala" bilgilendirmesi; backend'in tam imza akışı (POST /submit + `SignatureCanvas`) ayrıdır ve şu an UI tarafından tetiklenmiyor olabilir.
- **`user_consents` migration'sız:** Tablo `ensureConsentSchema` ile runtime'da oluşur — şema migration klasöründe aranırsa bulunmaz.
- **Public rota CSRF/rate-limit:** `/api/public/forms` ve `/api/public/legal-documents` auth'suzdur; anonim POST'lar `CSRF_EXEMPT_PREFIXES` (security.js) içinde olmalı yoksa 403 ([[Authentication_Authorization]]). Submit ayrıca `formSubmissionRateLimit` ile sınırlı.
- **İmza boyutu/format:** Yalnız `data:image/(png|jpeg);base64,` kabul edilir; `sharp` 500KB üstünü kademeli kaliteyle sıkıştırır, başaramazsa hata fırlatır. `signature_data` hem dosya hem DB'de (base64 yedek) tutulur.
- **IDOR yüzeyleri:** Waiver submit/status/history ve GDPR export uçlarında kendi-verisi/aile-sahipliği kontrolü el ile yapılır; yeni uç eklerken aynı role + ownership guard'larını tekrarla.
- **`legal_documents` DELETE+INSERT seed:** Migration `260` terms/privacy/marketing satırlarını **silip yeniden** ekler; elle düzenlenen içerik bir sonraki seed migration'ında kaybolabilir.
- **Form CSV export field birleşimi:** Export, tüm gönderimlerdeki `submission_data` anahtarlarını birleştirip sütun üretir; alan adı değişiklikleri eski/yeni gönderimlerde farklı sütunlara dağılabilir.
