# Customers & CRM

> **Özet:** Müşteri yaşam döngüsünün çekirdek modülü — müşteri listesi (DB-geneli sunucu-taraflı sıralama + keyset sayfalama), küresel müşteri çekmecesi (`useCustomerDrawer`), aksan-duyarsız isim araması, müşteri etiketleri, aile grupları (organizatör + üyeler), küçük (minor) aile üyeleri ve arkadaşlık ilişkileri. Liste bakiyesi her zaman cüzdan satırlarının EUR'ya çevrilmiş LATERAL toplamından gelir (bayat `users.balance` mirror'ı değil). Yaşam Boyu Değer (LTV) = `max(0, gelenEUR − bakiye)`.
>
> **Kütüphaneler:** React 18, React Router 7, Ant Design (Drawer/Table/Tag/Segmented), TanStack React Table + React Virtual, React Context, Express 5 (ESM), PostgreSQL (`unaccent` + `pg_trgm` eklentileri), Node `crypto` (AES-256-CBC, tıbbi notlar).
>
> **Bağlantılar:** [[Finances_Wallet]], [[Student_Portal]], [[Bookings_Calendar]], [[Memberships]], [[Authentication_Authorization]], [[Forms_Waivers_Compliance]], [[Notifications_System]], [[Frontend_Shell]], [[Backend_Server]], [[Index]]

---

## Sorumluluk

Bu modül **müşteri (customer) varlığını** ve onun etrafındaki ilişki ağını yönetir: müşteri arama/listeleme/sıralama, profil görüntüleme ve düzenleme, müşteri bakiyesinin doğru gösterimi, etiketleme (badge), aile yapıları (hem yetişkin "family group" hem de reşit olmayan "family member" çocuklar) ve müşteriler arası arkadaşlık ilişkileri (grup rezervasyonları için ön koşul).

Burada "customer" = `student`, `outsider` ve `trusted_customer` rollerinden herhangi biri (bkz. [[Authentication_Authorization]]). Personel (admin/manager/instructor) bu müşterileri yönetir; müşterinin kendi self-service yüzeyi ise [[Student_Portal]] modülüdür.

## Backend

### Müşteri listesi — `backend/routes/users.js`

`GET /users/customers/list` (`authorizeRoles(['admin','manager','instructor'])`) — modülün en kritik uç noktası. Query parametreleri: `q`, `limit` (1–200, varsayılan 50), `cursor`, `balance`, `balanceSign`, `paymentStatus`, `sortBy`, `sortDir`, `friendsOnly`.

- **Bakiye (kritik):** `balanceColumn = COALESCE(wbal.bal_eur, u.balance, 0)`. `wbal`, her `wallet_balances` satırını `currency_settings.exchange_rate` ile EUR'ya çeviren bir `LEFT JOIN LATERAL SUM(...)`'dır — `GET /finances/accounts/:id` (çekmecenin kaynağı) ile **byte-aynı** matematik, böylece tablo bakiyesi çekmece bakiyesiyle birebir eşleşir. `bal_eur`, müşterinin hiç cüzdan satırı yoksa `NULL`; cüzdan var ama 0'a denkleşiyorsa `0`'dır. Bu yüzden `NULLIF(...,0)` **kullanılmaz** — aksi halde "cüzdan 0" ile "cüzdan yok" karışır ve bayat `users.balance` dirilir (Deniz/Tan vakası: cüzdan 0 iken `users.balance` bayat 35 gösteriyordu). Yalnızca cüzdan-öncesi (imported) müşterilerin borcu hâlâ `users.balance`'tadır.
- **İsim ifadesi:** `nameExpr = COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.name, '')`. SELECT, ORDER BY ve keyset karşılaştırmasında tek otorite olarak yeniden kullanılır.
- **Aksan-duyarsız arama (migration 283):** Arama `unaccent(lower(nameExpr)) LIKE unaccent(lower($p))` ile yapılır; email aynı şekilde, telefon yalnızca `lower(...)`. İki sorunu çözer: (1) ismi yalnızca `u.name`'de olan (first/last boş) "Barbora Amélie Krejčí" gibi import müşteriler artık bulunur; (2) "amelie" → "Amélie", "krejci" → "Krejčí" eşleşir. `unaccent`, `pg_trgm` ile aynı güven sınıfında trusted bir eklentidir (`backend/db/migrations/283_unaccent_customer_search.sql`).
- **Sunucu-taraflı sıralama:** `SORTABLE` haritası (`id|name|email|role|balance|created_at`) ile her sıralama **tüm DB üzerinde, sayfalamadan ÖNCE** uygulanır. Eskiden frontend yalnızca yüklü sayfayı sıralıyordu, bu yüzden gerçek en üst/alt için "Load more" ile tüm sayfaları gezmek gerekiyordu.
- **Keyset sayfalama:** Cursor, `{ v: <son sıralama değeri>, id: <son id> }` JSON'unun opak base64url token'ıdır. WHERE, `(sortExpr cmp $v OR (sortExpr = $v AND u.id cmp $id))` ile aynı global sırada devam eder — sınırlarda atlanan/tekrar eden satır olmaz. Eski "bare-id" cursor'lar geriye uyumlu okunur.
- **`friendsOnly=true`:** `user_relationships` üzerinden `status='accepted'` çift yönlü `EXISTS` ile yalnızca mevcut kullanıcının arkadaşlarını süzer (grup rezervasyonu için).
- **`pending_count`:** `bookings.payment_status='pending'` sayımı alt-sorgu ile join'lenir; `payment_status` alanı (`overdue`/`pending`/`paid`) bakiye işaretine ve bu sayıma göre türetilir.

Aynı dosya ayrıca müşteri **CREATE/UPDATE/DELETE**'i yönetir (`POST /`, `PUT /:id`, soft-delete) — rol bazlı `getAllowedFieldsByRole()` ile yazılabilir alanları kısıtlar, email'i `LOWER()` ile saklar (case-insensitive login için, bkz. [[Authentication_Authorization]]) ve `USER_LIST_CACHE_PATTERNS` ile booking/rental arama cache'ini busts.

### Lifetime Value — `backend/routes/finances.js`

`GET /finances/accounts/:id` çekmecenin tek veri kaynağıdır ve **LTV**'yi cüzdan kimliğinden türetir: `available = moneyIn − tüketim ⇒ tüketim = moneyIn − available`. `wallet_transactions`'tan yalnızca "para-GİREN" tarafı sınıflandırır (`wallet_deposit`, `legacy_opening_balance`, pozitif `payment`, negatif `payment_reversal`), her parayı EUR'ya çevirir ve **`lifetimeValue = Math.max(0, inflowsEur − balance)`** hesaplar (`finances.js:492`). Bu, eski "EUR-only net debit" sezgiselini değiştirir — o yöntem yalnızca maaş kredisi alan bir instruktöre kocaman bir LTV gösteriyordu; yeni kimlik bu hesapları doğru biçimde €0 okur. Yanıtta `total_spent` ve `lifetime_value` aynı değeri taşır. Bakiye, çoklu-para cüzdan satırlarının EUR toplamıdır; cüzdansız legacy müşteriler için **yalnızca personel** görüntülerken `users.balance` borcu yüzeye çıkar (müşterinin kendi görünümü cüzdan-gerçeğinde kalır).

### İlişki/aile/onay rotaları

| Dosya | Mount | Sorumluluk |
|---|---|---|
| `backend/routes/userRelationships.js` | `/api/relationships` | Arkadaşlık istekleri + engelleme (grup rezervasyonu ön koşulu) |
| `backend/routes/familyGroups.js` | `/api/family-groups` | Yetişkin akran-bağlı hesaplar (organizatör + üyeler) |
| `backend/routes/family.js` | `/api/students` (studentsRouter'dan ÖNCE mount) | Reşit olmayan çocuk aile üyeleri |
| `backend/routes/userConsents.js` | `/api/user-consents` | Şartlar kabulü + pazarlama opt-in (GDPR) |

- **`userRelationships.js`** → `GET /friends|/pending|/sent`, `GET /status/:userId`, `POST /request` (karşılıklı bekleyen istek varsa **oto-kabul**), `POST /:id/accept|decline`, `DELETE /:id/cancel`, `DELETE /friend/:userId`, `POST /block/:userId`. Servisi `userRelationshipsService.js` bir durum makinesidir (`none → pending → accepted/declined/blocked`); kabul/ret `notifications` satırlarını işaretler ve `dispatchNotification` ile bildirim yollar ([[Notifications_System]]).
- **`familyGroups.js`** → `GET /by-user/:userId`, `GET /:groupId`, `POST /` (min 2 kullanıcı, personel-only), `POST /:groupId/members`, `DELETE /:groupId/members/:userId` (organizatör çıkarılamaz; <2 kalırsa oto-dağılır), `PATCH /:groupId/organizer` (organizatör devri), `DELETE /:groupId`. Servisi `familyGroupService.js` tümü transaction'lı; üye listesi her zaman organizatör-önce sıralı. Bir kullanıcı yalnızca **tek** gruba ait olabilir.
- **`family.js`** → `GET /:userId/family`, `GET /:userId/family/:memberId`, `.../activity` (booking+rental+waiver+audit birleşik zaman çizelgesi), `.../export` (CSV), `POST` (yaş <18 zorunlu, varsayılan max 5 üye), `PUT`, `DELETE` (soft-delete + waiver temizliği). `ensureOwnFamily` middleware'i ile personel herkesi, müşteri yalnızca kendi `parent_user_id`'sini görür. Servisi `familyService.js` tıbbi notları **AES-256-CBC** ile şifreler (yazınca şifrele, okuyunca çöz). Bu çocuk-üyeler [[Bookings_Calendar]] ve [[Forms_Waivers_Compliance]]'a `family_member_id` ile bağlanır.
- **`userConsents.js`** → `GET /me`, `POST /me`. `userConsentService.js` UPSERT yapar, `LATEST_TERMS_VERSION` (env, vars. `2025-10-01`) ile sürüm uyuşmazlığını kontrol eder (`CONSENT_TERMS_VERSION_MISMATCH` 400), `acceptWaiver` ile opsiyonel waiver oluşturur (son 365 günde yoksa).

### Reşit-olmayan aile üyeleri — `backend/routes/family.js` uç noktaları

`backend/routes/family.js`, bir ebeveyn (`parent_user_id`) altındaki reşit-olmayan çocuk aile üyelerinin (`family_members` tablosu) tam CRUD'unu sağlar. Tüm router `authenticateJWT` ile sarılır (mount sırasında, `backend/server.js:486`) ve her uç nokta ayrıca `ensureOwnFamily` middleware'inden geçer: `admin`/`manager`/`owner` herhangi bir aileye erişir, `student`/`outsider` yalnızca `req.params.userId === req.user.id` ise (aksi halde 403). İş mantığı `backend/services/familyService.js`'tedir.

| Metod + yol | Servis çağrısı | Notlar |
|---|---|---|
| `GET /:userId/family` | `getFamilyMembers(userId)` | `{ success, count, data[] }` döner; tüm aktif üyeleri listeler |
| `GET /:userId/family/export` | `exportFamilyMembersCsv(userId)` | CSV indirme (`Content-Disposition: attachment; family-members-<YYYY-MM-DD>.csv`) |
| `GET /:userId/family/:memberId` | `getFamilyMemberById(memberId, userId)` | Bulunamazsa 404 |
| `GET /:userId/family/:memberId/activity` | `getFamilyMemberActivity(userId, memberId, {limit, offset, types, startDate, endDate})` | Booking + rental + waiver + audit birleşik zaman çizelgesi; `FAMILY_MEMBER_NOT_FOUND`/`status:404` → 404. Alt-sorgular `getFamilyActivityCapabilities` ile şema-yetenek tespitine göre koşullu UNION'lanır |
| `POST /:userId/family` | `createFamilyMember(memberData, userId, req.user.id)` | `validateInput(createFamilyMemberValidation)`: `full_name` (2–255) + `date_of_birth` + `relationship` (`son|daughter|child|spouse|sibling|parent|other`) zorunlu, `gender`/`medical_notes`(≤2000)/`emergency_contact`/`photo_url` opsiyonel. Çocuk ilişkileri (`son|daughter|child|sibling`) için yaş <18 zorunlu → ihlalde 400. 201 döner; `newMember.warnings` varsa yanıta eklenir |
| `PUT /:userId/family/:memberId` | `updateFamilyMember(memberId, updates, userId, req.user.id)` | `updateFamilyMemberValidation` (tüm alanlar `optional`, + `is_active` boolean). Bulunamazsa 404; "under 18"/"not found" hatası → 400 |
| `DELETE /:userId/family/:memberId` | `deleteFamilyMember(memberId, userId, req.user.id)` | Soft-delete (+ waiver temizliği); bulunamazsa 404 |

- **Üye limiti:** `createFamilyMember`, `process.env.FAMILY_MEMBER_LIMIT` (varsayılan **5**) aktif üyeyi aşarsa `FAMILY_LIMIT_REACHED` koduyla 400 döndürür (`familyService.js:364`).
- **Yaş kuralı:** `CHILD_RELATIONSHIPS = ['son','daughter','child','sibling']` hem route validasyonunda hem serviste tekrar kontrol edilir (`validateAgeUnder18`); `spouse|parent|other` yaş kısıtına tabi değildir.
- **Tıbbi notlar:** `medical_notes` yazılırken `encryptMedicalNotes` (AES-256-CBC) ile şifrelenir, okunurken çözülür — ham SQL ile okunamaz (bkz. Dikkat/Tuzaklar).
- **Mount sırası (kritik):** `backend/server.js:486`'da `app.use('/api/students', authenticateJWT, familyRouter)` **`studentsRouter`'dan önce** (satır 488) gelir; sıra bozulursa `studentsRouter` family rotalarını gölgeler. Bu çocuk-üyeler [[Bookings_Calendar]] ve [[Forms_Waivers_Compliance]]'a `family_member_id` ile bağlanır.

### Müşteri etiketleri — `backend/services/userTagService.js`

Auth/rol sistemine **dokunmayan** hafif rozetler. `addTag(userId, tag, label?, metadata?)` (UPSERT), `removeTag`, `getUserTags`, `countUsersWithTag`. Migration 188 tabloyu kurar ve mevcut shop siparişi olan herkesi `shop_customer` olarak backfill eder.

## Frontend

- **`src/features/customers/pages/Customers.jsx`** — `/customers` ana liste. TanStack React Table (`manualSorting`) + React Virtual sanallaştırma. Sıralama/sayfalama sunucu-taraflıdır: `sorting` state'i `sortBy/sortDir`'e dönüşür, `nextCursorRef` ile "Load more" aynı global sırada ekler (cursor'a bağımlı `fetchCustomers` callback'i kasıtlı olarak `nextCursor`'a depend etmez — yoksa her yüklemede liste resetlenirdi). Satıra tıklayınca `EnhancedCustomerDetailModal` açılır.
- **Küresel müşteri çekmecesi — `src/shared/contexts/CustomerDrawerContext.jsx`:** `CustomerDrawerProvider` uygulamayı sarar (`src/App.jsx`'te Auth/Currency/Data sağlayıcılarının içinde) ve tek bir `EnhancedCustomerDetailModal` örneği render eder. `useCustomerDrawer()` → `{ openCustomer, closeCustomer }`. `openCustomer(idOrObject)` bir id string'i veya `{id, ...}` nesnesi alır (kısmi veri header'ı anında çizer; çekmece geri kalanı `customer.id`'den fetch'ler). Sağlayıcı dışında çağrılırsa no-op'a düşer (stray çağrı çökmesi olmaz). Bu sayede finans tabloları gibi 7+ yüzey kendi çekmece örneğini kurmadan tam profili açabilir (bkz. [[Finances_Wallet]]).
- **`EnhancedCustomerDetailModal.jsx`** — ağır, code-split ana çekmece. Paketler (`CustomerPackageManager`), rezervasyonlar (`BookingDrawer`/`BookingDetailModal` — calendar tıklamasıyla aynı tam editör, kendi `CalendarProvider`'ında sarılı), kiralamalar, shop geçmişi, üyelikler, indirimler ve finans sekmelerini tek yerde toplar. `eventBus` ile `packages:changed` gibi olaylara abone olur.
- **`CustomerFinancialAnalytics.jsx`** (finances feature) — müşteri finans analitiği; `useCustomerDrawer` tüketicisi.
- **Diğer sayfalar:** `pages/UserDetail.jsx` (`/customers/:id`), `pages/UserFormPage.jsx` (`/customers/new`, `/customers/edit/:id` — `UserForm` shared bileşeni), `pages/CustomerProfilePage.jsx` (`/customers/:id/profile`, legacy). `FamilyLinkingModal.jsx` çekmeceden aile grubu kurar.

## Veri Modeli

| Tablo | Anahtar alanlar | Migration |
|---|---|---|
| `users` | `id` (UUID), `name`, `first_name`, `last_name`, `email` (LOWER saklanır), `phone`, `role_id`, `balance` (legacy mirror), `total_spent` (bayat), `preferred_currency`, `deleted_at` | çekirdek |
| `user_relationships` | `sender_id`, `receiver_id`, `status` (pending/accepted/declined/blocked), `message`, `accepted_at`; `UNIQUE(sender_id,receiver_id)`, `CHECK(sender_id != receiver_id)` | `backend/migrations/116` |
| `family_groups` | `id`, `name`, `organizer_user_id` (RESTRICT), `created_by`, `deleted_at` | `db/migrations/264` |
| `family_group_members` | `group_id`, `user_id` (`UNIQUE` → tek grup), `is_organizer`, `joined_at`; PK `(group_id,user_id)` | `db/migrations/264` |
| `family_members` (çocuklar) | `parent_user_id`, `full_name`, `date_of_birth`, `relationship`, `medical_notes` (AES-256 şifreli), `is_active`, `deleted_at` | (çekirdek/legacy) |
| `user_consents` | `user_id` (PK), `terms_version`, `terms_accepted_at`, `marketing_*_opt_in`; auto-`updated_at` trigger | `backend/migrations/014` |
| `user_tags` | `user_id`, `tag`, `label`, `metadata` (JSONB); `UNIQUE(user_id,tag)` | `db/migrations/188` |
| `wallet_balances`, `wallet_transactions`, `currency_settings` | bakiye + LTV kaynağı (bkz. [[Finances_Wallet]]) | — |

> Not: `family_members` (reşit olmayan çocuklar) ile `family_groups` (yetişkin akran hesapları) **ayrı** kavramlardır — birincisi bir ebeveynin çocuklarını, ikincisi staff'ın elle bağladığı yetişkin müşteri ağını modeller.

## Akış / İş Mantığı

1. **Liste açılışı:** Frontend `GET /users/customers/list` çağırır → bakiye = cüzdanların EUR LATERAL toplamı → keyset cursor ile sayfalanır. Sıralama/filtre değişince liste resetlenip baştan fetch'lenir.
2. **Profil açılışı:** Herhangi bir yüzey `openCustomer(id)` çağırır → tek küresel çekmece açılır → çekmece `GET /finances/accounts/:id`'den bakiye + LTV + cüzdan özeti çeker.
3. **Aile grubu:** Personel 2+ yetişkini bir gruba bağlar; organizatör navbar'dan diğer üyelerin profillerini görebilir (bkz. [[Student_Portal]] `FamilyManagementPage`).
4. **Arkadaşlık:** Bir müşteri diğerine istek yollar; karşılıklı bekleyen istek varsa oto-kabul; yalnızca `accepted` arkadaşlar grup rezervasyonuna davet edilebilir.

## Dikkat / Tuzaklar

- **Bakiye `NULLIF` tuzağı:** `COALESCE(wbal.bal_eur, u.balance, 0)`'ı asla `NULLIF(bal_eur, 0)` ile sarma — €0 cüzdan "cüzdan yok"a düşer ve bayat `users.balance` mirror'ı dirilir. Tablo ve çekmece bakiyesi aynı LATERAL matematiği paylaşmalı yoksa uyuşmazlık olur.
- **`users.total_spent` bayattır:** LTV her zaman `GET /finances/accounts/:id`'den (canlı `max(0, inflowsEur − balance)`) okunmalı. `CustomerFinancialAnalytics` halen ham `users.total_spent` okuyabilir (bilinen açık konu).
- **Arama `nameExpr` üzerinden gitmeli:** Yalnızca `first_name||last_name` aramak, ismi `u.name`'de olan import müşterileri kaybeder; `unaccent` olmadan aksanlı isimler ASCII yazımla bulunamaz (migration 283 gerekir; `migrate:up` çalıştırılmalı).
- **`family.js` mount sırası:** `/api/students` altında **studentsRouter'dan ÖNCE** mount edilir; sıra bozulursa family rotaları gölgelenir.
- **Tek-grup kısıtı:** `family_group_members.user_id` `UNIQUE`; bir kullanıcı iki gruba eklenirse INSERT patlar — `addMember` bunu önce kontrol eder.
- **Tıbbi notlar şifreli:** `family_members.medical_notes` AES-256-CBC; ham SQL ile okunamaz, `familyService.decryptMedicalNotes` gerekir.
- **Cache busting:** Müşteri create/update sonrası `api:users:students:*` ve `api:users:for-booking:*` cache'leri busts edilmezse yeni müşteri booking/rental aramasında görünmez.
