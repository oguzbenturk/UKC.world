# Plannivo — Frontdesk & Customer-Flow Fix Log

Bu dosya, 2026-05-26'dan 2026-05-30'a kadarki çoklu oturumda yapılan tüm değişikliklerin kapsamlı dökümüdür. **Hiçbir şey unutulmasın diye yaz**: rol-isim tutarsızlıkları, frontdesk yetkilendirmesi, müşteri profili düzenlemeleri, stok/envanter ekranı, kayıt/aktivasyon akışı, mağaza indirimleri, vb.

> Son güncelleme: 2026-05-30. Live commit: `be4c538 Deploy: v0.1.286` (production'da). Bu dosyadaki sonraki bölüm (Phase 2) production'a HENÜZ deploy edilmedi.

---

## Phase 1 — Production'da (v0.1.286, 2026-05-28)

### Envanter (Inventory) Sayfası
- **Gruplama**: aynı `type + brand + name` için tek satır, içinde size breakdown (`M: 4 / L: 2 / XL: 1`) ve status breakdown (`4 avail / 1 in use / 1 maint`). Satırı genişletince her fiziksel birim ayrı görünüyor (seri no, condition, status, location).
- **Kategori bölümleri**: Kite / Board / Wetsuit / Harness / Control Bar / Safety Gear / Other → Ant Design `<Collapse>` paneli, her birinin başlığında toplam unit sayısı.
- Hem table view hem cards view aynı gruplamayı kullanıyor.
- Ekleme/düzenleme/silme akışı korundu; "Add unit" butonu modelin brand/name/size'ını pre-fill ediyor.
- Drawer (group view) ayrı; sub-table units listeliyor.
- i18n: 11 yeni anahtar (6 dil): `unitsLabel`, `unitLabel`, `viewUnits`, `addUnit`, `availShort`, `inUseShort`, `maintShort`, `retiredShort`, `serialNumber`, `location`, `sizesLabel`.

**Dosyalar**:
- [src/features/inventory/pages/InventoryPage.jsx](src/features/inventory/pages/InventoryPage.jsx)
- [public/locales/{en,de,es,fr,ru,tr}/common.json](public/locales/en/common.json)

---

## Phase 2 — Local, deploy edilmedi (2026-05-30 oturumu)

### A. Yeni öğrenci kaydında aktivasyon dialog'u
- `POST /users` artık `send_verification` flag'i kabul ediyor.
  - `true` → kullanıcı `email_verified=false`, sadece **verify maili** gönderiliyor (`emailVerificationService.sendVerificationEmail`).
  - `false` (Activate now) → kullanıcı `email_verified=true`, **hiçbir mail gönderilmiyor**. Staff parolayı verbal olarak iletecek. (Eski "welcome with reset link" maili kaldırıldı — kullanıcı isteği #6.)
- UserForm artık create modunda submit'ten önce Modal açıyor: 3 buton (Activate now / Send activation email / Cancel).
- Hem FAB (NewCustomerDrawer) hem Müşteri sayfasındaki Add Customer aynı UserForm'u kullandığı için her ikisi de bu davranışı sergiliyor.

**Dosyalar**:
- [backend/routes/users.js](backend/routes/users.js#L55-L155)
- [src/shared/components/ui/UserForm.jsx](src/shared/components/ui/UserForm.jsx#L530-L595)

### B. Frontdesk rol gate'leri — frontend
Aşağıdaki ekranlar artık `front_desk` + `receptionist` rollerini de tanıyor (önceden sadece admin/manager):

| Dosya | Eski | Yeni |
|---|---|---|
| [CustomerShopHistory.jsx](src/features/customers/components/CustomerShopHistory.jsx) | `ADMIN_ROLES` set | + `receptionist` |
| [EnhancedCustomerDetailModal.jsx](src/features/customers/components/EnhancedCustomerDetailModal.jsx#L198-L205) | `isAdmin` ve `isStaff` admin/manager only | + `front_desk`, `receptionist`, `owner` |
| [CustomerProfilePage.jsx](src/features/customers/pages/CustomerProfilePage.jsx#L157) | `isAdminViewing` admin/manager | + frontdesk |
| [InventoryPage.jsx](src/features/inventory/pages/InventoryPage.jsx#L146-L150) | `canManageEquipment` `front_desk` eksikti | düzeltildi |
| [FrontDeskDashboard.jsx](src/features/dashboard/pages/FrontDeskDashboard.jsx#L996-L1001) | Welcome header sadece `front_desk` rolünü gizliyordu | `receptionist` de gizlendi |
| [SparePartsOrders.jsx](src/features/admin/pages/SparePartsOrders.jsx#L40) | `isAuthorized` admin/manager | + frontdesk |
| [RepairsPage.jsx](src/features/repairs/pages/RepairsPage.jsx#L241) | `ADMIN_REPAIR_ROLES` admin/manager | + frontdesk |
| [Services.jsx](src/features/services/pages/Services.jsx#L346) | `hasPermissionToEdit` admin/manager | + frontdesk |

### C. Frontdesk rol gate'leri — backend
- **users.js**: `POST /users`, `POST /:id/activate-email`, `POST /:id/resend-verification` → `receptionist` eklendi.
- **shopOrders.js**:
  - `GET /:id` (line 943) inline rol kontrolü artık frontdesk/receptionist kabul ediyor.
  - `GET /admin/user/:userId` (line 882) receptionist eklendi.
  - `POST /admin/quick-sale` → role-derived `allowNegative`, `recordTransaction`'a geçiyor.
- **products.js**: 10 rota (CRUD + subcategories + stock + recommendation) → frontdesk + receptionist eklendi.
  - **#3 fix**: NewProductDrawer'da subcategory ekleyememe sorunu çözüldü (gate engelliyordu).
  - **#2 fix**: Ürün silme yetkisi.
- **businessExpenses.js**: GET / GET:id / POST → receptionist eklendi.
- **accommodation.js**: GET /bookings, GET /package-stays, PATCH /bookings/:id, /complete, /confirm → frontdesk + receptionist. (Unit yönetimi hâlâ admin/manager only — kasıtlı.)
- **wallet.js**: 18 wallet rotası (deposit/refund/adjust/pending-deposits) → frontdesk + receptionist + owner.
- **discounts.js**: `STAFF_ROLES` → frontdesk + receptionist (yazma yetkisi).
- **rentals.js**: `allowNegativeBalance` rolleri → frontdesk + receptionist + owner eklendi.
- **bookings.js (single/group/calendar)**: `allowNegativeBalance` artık tamamen `req.user.role`'den türetiliyor; `req.body` flag'i gözardı ediliyor (güvenlik açığı kapatıldı). Group bookings'te eksik olan `receptionist` eklendi.

### D. Frontdesk müşteri oluştururken rol kısıtlaması (#9)
UserForm'daki rol dropdown'ı, current user `front_desk` veya `receptionist` ise sadece `student`, `outsider`, `trusted_customer` rollerini gösteriyor. Admin/manager hâlâ tüm rolleri görüyor.

### E. Müşteri profilinde shop indirimi (önceki oturumda eklendi)
- [shopOrders.js getOrderWithItems](backend/routes/shopOrders.js#L56-L81) + GET /admin/user/:userId listesi `discountSumLateral('d', 'shop_order', 'o.id')` ile discount toplamını döndürüyor. Her order: `total_discount_amount`, `total_after_discount`.
- [CustomerShopHistory.jsx](src/features/customers/components/CustomerShopHistory.jsx): "Discount" butonu eklendi, `ApplyDiscountModal`'ı `entity_type='shop_order'` ile açıyor. Total kolonu indirimli fiyatı strike-through ile gösteriyor.
- [EnhancedCustomerDetailModal.jsx](src/features/customers/components/EnhancedCustomerDetailModal.jsx): `CustomerShopHistory`'ye `discountsByEntity` ve `onApplyDiscount` propsları geçiyor.
- [QuickShopSaleModal.jsx](src/features/dashboard/components/QuickShopSaleModal.jsx): Discount % field eklendi, sipariş oluştuktan sonra otomatik `POST /api/discounts` ile uyguluyor.

### F. Cüzdan eksi bakiye geçişi (frontdesk override)
- Müşteri "Allow Negative Balance" checkbox'ı ConfirmationStep'den kaldırıldı (müşteri kendini overdraft edemiyor).
- Backend tüm 3 booking flow + rentals + shop quick-sale rolden türetiyor.
- `walletService.recordTransaction`'a tek bir audit log hook'u: her overdraft için `wallet_audit_logs.action='wallet.negative_balance_override'` ile actor/customer/amount/entity yazılıyor.

### G. Membership + storage satışlarının finansal geçmişe düşmesi (#13)
- [memberOfferings.js admin/purchases](backend/routes/memberOfferings.js#L947): `member_purchases` insert'inden sonra `recordTransaction()` çağrısı ekleniyor. `relatedEntityType='member_purchase'`, payment_method aktarılıyor. Wallet ödemesi ise `availableDelta=-price`, cash/card/transfer ise `availableDelta=0` (audit row, balance dokunulmuyor).

### H. UserForm side-fixes
- Password min-length **8 karakter** zorunluluğu (hem client validator hem backend `MIN_PASSWORD_LENGTH`).
- Email uniqueness check **case-insensitive** (`LOWER(email)`).
- `language` field artık baseFields'e dahil, silent strip yok.
- `/resend-verification` artık 2-min cooldown'u **server-side** dayatıyor (429 + Retry-After).

### I. Self-registration (#8)
Read-only kontrol: `/auth/register` zaten `sendVerificationEmail`'i çağırıyor (auth.js:757). Bug yok. Yeni kullanıcılar verify maili alıyor.

---

## Phase 3 — Aynı oturumda tamamlandı (2026-05-30 öğleden sonra)

### J. #10 BookingDetailModal start time edit
- `editForm`'a `start_hour` alanı eklendi. Init sırasında booking'in `startTime` ("HH:MM") veya `start_hour` (NUMERIC, 9.5 = 09:30) ya da `time` shape'lerinden normalize ediliyor.
- HTML `<input type="time">` kullanılarak HH:MM girişi yapılıyor.
- Submit'te HH:MM → decimal dönüşümü yapılıp backend'in beklediği NUMERIC formatta gönderiliyor.
- Required validator: boşsa save bloklanıyor, açıklayıcı hata.
- Backend `PUT /bookings/:id` rolleri: `admin/manager/instructor/front_desk/receptionist` (önceden front_desk+receptionist eksikti).

### K. #11 Calendar 30-min drag-and-drop
- [DailyView.jsx](src/features/bookings/components/components/views/DailyView.jsx):
  - Fallback time slot generator artık 30-dk granularity (`m += 30`). Önceden 60-dk slot üretiyordu.
  - API-driven slot path: end time hesabı `+30 dk` (önceki kod `+1 saat` ile bitiş zamanını yanlış gösteriyordu).
  - `pixelsPerMinute = SLOT_HEIGHT / 30` (önceden `/60` idi — booking görsel boyu yarısı kadar görünüyordu).
  - `nowTopPx` aynı şekilde `/30` ile düzeltildi.
- Sonuç: hem görsel hizalama doğru hem drag-drop hedefleri her yarım saatte.

### L. #12 Calendar > Members sayfası (AdminMembersPage)
- [AdminMembersPage.jsx](src/features/members/pages/AdminMembersPage.jsx):
  - Her satıra **Edit** ve **Discount** butonları eklendi (View, Edit, Discount triplet).
  - Edit modalı: status, payment_status, expires_at, notes alanları. `PUT /member-offerings/admin/purchases/:id` çağırıyor.
  - Discount: ApplyDiscountModal `entity_type='member_purchase'` ile (discountService zaten destekliyor).
- Backend [memberOfferings.js](backend/routes/memberOfferings.js#L16): `ADMIN_ROLES` listesine `receptionist` eklendi (zaten `front_desk` vardı).

### M. Bug-hunt fixes (mega test pass)
- **`users.language` baseField REVERTED**: DB'de `language` kolonu yokmuş. `language`'i `getAllowedFieldsByRole`'ün baseFields'ından çıkardım, açıklayıcı yorum ekledim. (Önceden silent strip oluyordu ki bu doğruydu — benim "fix"im 500 üretirdi.)
- **Reset Wallet butonu** ([EnhancedCustomerDetailModal.jsx](src/features/customers/components/EnhancedCustomerDetailModal.jsx#L1360)): Artık `isAdmin` (genişletilmiş frontdesk dahil) yerine `['admin','manager','owner']`'a daraltıldı. Destructive bir aksiyon, frontdesk'in eline verilmemeli.
- **BookingDetailModal start_hour tip dönüşümü**: `bookings.start_hour` NUMERIC, ben HH:MM string gönderiyordum. Save'de decimal'e (`hh + mm/60`) çeviriyorum.
- **memberOfferings admin sale `allowNegative: true`**: Endpoint zaten staff-only; eksi bakiye yetkisi artık her seferinde geçerli, böylece wallet trigger'ı staff satışını reddetmez.

### N. Sanity passes (final)
- ✅ esbuild parse: 12 değişen JSX dosyasının hepsi temiz
- ✅ node --check: 11 değişen backend dosyasının hepsi temiz
- ✅ Vite transform: 12 JSX dosya HTTP 200 ile transpile oluyor
- ✅ Backend boot: tüm servisler ayağa kalkıyor, DB bağlanıyor

### O. Smoke test (gerçek HTTP, 24/25 ✅)
[scripts/smoke-test-frontdesk.mjs](scripts/smoke-test-frontdesk.mjs) ile localhost:4000'a karşı 24 endpoint çağrısı. Sonuçlar:

- ✅ admin + receptionist login
- ✅ POST /users (Activate now + Send verify branches, weak password 400, case-insensitive duplicate 409)
- ✅ /resend-verification 2dk cooldown server-side 429
- ✅ Frontdesk DELETE /products/:id ve POST /products/subcategories (önceden 403)
- ✅ Frontdesk PUT /bookings/:id (önceden 403)
- ✅ Frontdesk GET /shop-orders/:id (önceden 403)
- ✅ GET /shop-orders/admin/user/:userId discount fields döndürüyor
- ✅ Frontdesk POST /api/discounts hem shop_order hem member_purchase entity_type ile
- ✅ Frontdesk membership sale → wallet_transactions'a "Membership purchase: ..." satırı düşüyor
- ✅ Frontdesk quick-sale (allowNegative path, stock varsa) tamamlanıyor

### P. UI smoke test (Playwright, 7/7 ✅)

[tests/e2e/flows/ui-smoke-2026-05-30.spec.ts](tests/e2e/flows/ui-smoke-2026-05-30.spec.ts):

| Test | Doğrulanan | Sonuç |
|---|---|---|
| 1a | Admin → New Customer → aktivasyon dialog'u (3 buton: Activate now / Send verify / Cancel) | ✅ |
| 1b | Frontdesk role dropdown'unda sadece student/outsider/trusted — admin/manager/instructor yok | ✅ |
| 2a | Frontdesk customer profile Financial History tab'ini görüyor; Reset Wallet butonunu görmüyor | ✅ |
| 2b | Customer profile Shop tab açılıyor; sipariş varsa Discount butonu render oluyor | ✅ |
| 3 | Calendar > Members her satır 3 buton (View/Edit/Discount); Edit modalı açılıyor; Discount modalı açılıyor | ✅ |
| 4 | BookingDetailModal edit modunda `<input type="time">` görünüyor, "HH:MM" formatında pre-fill'li (09:00) | ✅ |
| 5 | Receptionist dashboard'unda welcome header gizli | ✅ |

Screenshots: `test-results/ui-smoke/*.png` (1a-activation-dialog.png, 2a-profile-open.png, vb).

### Q. UI smoke'un yakaladığı 1 GERÇEK bug + 1 phantom

**Gerçek bug — `Reset Wallet` butonu CustomerProfilePage'de gate'siz**: [CustomerProfilePage.jsx:2553](src/features/customers/pages/CustomerProfilePage.jsx#L2553)'te "Admin only" yorumu vardı ama hiçbir rol kontrolü yoktu. Receptionist+frontdesk de butonu görüyordu (destructive aksiyon). Fix: `['admin','manager','owner'].includes(currentUser.role)` ile gate eklendi.

**Phantom (yok) — `/customers` list spinner**: İlk run'da test 2a'da `.ant-table-row` 45s'de gelmedi, "bug" gibi göründü. Tekrar test ettim:
- Direct API hızlı (32ms)
- `repeat-each=2` ile her iki rol (admin + receptionist) ~2 saniyede 24 satır render ediyor
- Tek-run smoke testte 7/7 yeşil (gerçek list-then-click akışı)

İlk failure muhtemelen vite HMR'ın benim recent edit'lerimi recompile etmesi sırasındaki bir tek-seferlik flake'di. Gerçek bug yok. UI test sıkı selector + scroll/force-click ile stabil — bonus: test 2a'da Financial section bulma logic'i drawer'ın icon-only nav'ına uyarlandı (Tooltip title attribute üzerinden), 2b'de Discount butonu nav sidebar'daki "Discounts" section'ı yerine table içindeki action button'a scope'landı.

### R. API smoke'un yakaladığı 3 KRİTİK pre-existing bug

Smoke test çekene kadar görünmeyen, ben yeni UI'ları eklediğimde patlayan bir schema design issue ortaya çıktı:

**Bug**: `wallet_transactions.related_entity_id` kolonu UUID tipli. Ama `shop_orders.id` ve `member_purchases.id` SERIAL int. discountService.postDiscountAdjustment ve benim eklediğim membership-sale + quick-sale mirror'ları integer'ı UUID kolonuna yazmaya çalışıyordu → `invalid input syntax for type uuid: "4"` 500 hatası.

**Etki (öncesi)**:
- Bookings'e discount uygulamak çalışıyordu (UUID id).
- Shop order'a / member_purchase'a discount uygulamak → 500 (silent breakage — UI bu özelliği önceden açmıyordu, hiç fark edilmemişti).
- Membership admin sale wallet'a mirror'lanamıyordu (benim eklediğim kod) → financial history boş kalıyordu.
- Quick-sale wallet payment 500 (benim allowNegative fix'imden sonra).

**Fix**:
- [discountService.js postDiscountAdjustment](backend/services/discountService.js#L240): `ENTITY_CONFIG[entityType].idType === 'uuid'` ise `relatedEntityId` geç, değilse atla. Numerik id metadata'da kalıyor.
- [memberOfferings.js admin/purchases](backend/routes/memberOfferings.js#L995): `relatedEntityId` kaldırıldı.
- [shopOrders.js admin/quick-sale](backend/routes/shopOrders.js#L1714): `relatedEntityId` kaldırıldı.

Bu fix öncesi smoke test 17/20 idi → fix sonrası 24/25.

---

## Sıradaki

- **Deploy**: `npm run push-all` ile production'a. Kullanıcı kontrolü beklendi.

---

## Production'a deploy edilecek özetler

`be4c538` üzerine atılacak commit'te şunlar var:
- WORK-LOG.md (bu dosya)
- 6 i18n locale common.json (yeni anahtarlar)
- ~12 frontend dosyası (UserForm, EnhancedCustomerDetailModal, CustomerShopHistory, CustomerProfilePage, InventoryPage, FrontDeskDashboard, SparePartsOrders, RepairsPage, Services, BookingDetailModal, DailyView, AdminMembersPage, ConfirmationStep, QuickShopSaleModal)
- ~11 backend dosyası (users, shopOrders, products, businessExpenses, accommodation, wallet, memberOfferings, discounts, bookings, rentals, walletService)

---

## Production'a deploy edilmemiş olanlar (özet)

`git log origin/main..HEAD` çıktısı:
- Tüm B/C/D/E/F/G/H/I bölümleri.
- Şu anki HEAD `be4c538` zaten origin'de; üstüne henüz yeni commit atılmadı. Bütün yeni iş working tree'de duruyor.

Deploy etmeden önce kullanıcı manuel test edip "ok" diyecek.
