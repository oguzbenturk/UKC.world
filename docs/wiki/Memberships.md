# Memberships

> **Özet:** Üyelikler ve "member offerings" — VIP / sezonluk plaj geçiş paketleri ile ekipman deposu (storage box) abonelikleri. Müşteri portalından satın alınır, resepsiyon/admin tarafından elle atanır; ücret cüzdana / banka transferine / Iyzico karta yansır, manager komisyonu sadece "beach fee" porsiyonundan hesaplanır. Aktif üyelik, rescue boat hizmetinde otomatik %50 üye indirimi açar.
>
> **Kütüphaneler:** Express 5 (ESM), PostgreSQL, React 18, Ant Design, TanStack React Query, dayjs, Decimal-benzeri yuvarlama (Math.round 2dp).
>
> **Bağlantılar:** [[Finances_Wallet]], [[Instructors_Payroll]], [[Lessons_Services_Packages]], [[Customers_CRM]], [[Payments_Currency]], [[Student_Portal]], [[Notifications_System]], [[Dashboard_Metrics_Admin]]

---

## Sorumluluk

Bu modül iki ürün tipini tek bir tabloda (`member_offerings`) yönetir:

1. **Membership / Beach Pass** (`category = 'membership'`) — plaj tesisi erişimi, VIP ayrıcalıklar, sezonluk paketler (bundle'lar id 50-53). Tamamı komisyona tabidir (manager %10).
2. **Storage** (`category = 'storage'`) — bireysel ekipman deposu kutuları. Fiyat iki parçaya bölünür: **beach fee** (komisyona tabi) + **storage fee** (komisyona tabi DEĞİL). Kutular tüm storage planları arasında GLOBAL paylaşılır ve numaralandırılır.

Bir müşterinin **aktif** (`status='active'`, süresi geçmemiş) üyeliği olması, [[Lessons_Services_Packages]] içindeki **rescue boat** hizmetinde otomatik %50 üye indirimi tetikler (`membershipPricingService.js`).

## Backend

### Rotalar — `backend/routes/memberOfferings.js` (`/member-offerings`)

**Public / Auth:**
- `GET /member-offerings` — aktif teklifler (misafir + müşteri). Storage için `available_count` hesaplanır: `total_capacity − COUNT(DISTINCT storage_unit)` (GLOBAL, tüm storage planları üstünden, `LATERAL` join).
- `GET /member-offerings/my-purchases` — oturum sahibinin satın alımları.
- `POST /member-offerings/:offeringId/purchase` — müşteri satın alımı. Ödeme yöntemleri: `wallet`, `cash`/`pay_later` (negatif bakiye, "merkeze öde"), `card`/`credit_card` (Iyzico → `pending_payment`), `bank_transfer`/`transfer` (makbuz + admin onayı). Deposit %20 desteklenir. Storage ise ilk GLOBAL boş kutu otomatik atanır.
- `POST /member-offerings/purchases/:id/cancel` — kullanıcı kendi `pending_payment` (terk edilmiş Iyzico) satın alımını iptal eder.

**Admin (`ADMIN_ROLES = admin, manager, developer, front_desk, receptionist`):**
- `GET /admin/all` — pasifler dahil tüm teklifler.
- `GET /admin/:offeringId/storage-units` — **storage box staff picker** verisi. `1..total_capacity` tam ızgara; her kutu GLOBAL doluluk + sakin isim(ler)i (`ARRAY_AGG`) + en geç (`MAX`) bitiş tarihi. Dolu kutular UI'da seçilebilir kalır (kasıtlı PAYLAŞIM). `total_capacity` boşsa `unconfigured: true` döner.
- `POST /` ve `POST /batch` — teklif(ler) oluştur. `beach_fee_amount`: non-storage ise = `price` (tam komisyon); storage ise verilen beach porsiyonu (yoksa 0).
- `PUT /:id`, `DELETE /:id` (soft, `is_active=false`).
- `GET /admin/purchases` — tüm satın alımlar; `computed_status` (cancelled / expired / status) CASE ile hesaplanır. **2026-10-08:** `?status=` artık **efektif** (süre-duyarlı) statüye göre süzer (`purchaseStatusWhere`: `active` | `expiring` (+`expiringDays`, vars. 30) | `expired` | `pending` | `cancelled` | `upcoming`; geçersiz değer 400) — eskiden `mp.status` süzüldüğü için `/memberships/active` süresi dolmuşları da gösteriyordu. Satırlar ayrıca `user_name` (ad+soyad, yoksa `name`), `user_phone`, `user_avatar`, `offering_duration_days`, `offering_family`, `offering_duration` taşır. Tek frontend tüketicisi `AdminMembersPage`.
- `GET /admin/stats` (2026-10-08) — Members sayfası KPI'ları, tek çağrı (`membershipStatsService.getMembershipStats`): `total/active/activePeople/expiring7/expiring30/expired/expiredRecent/pending/cancelled/upcoming`, `storage {memberships, active, inUse, capacity, boxes[{unit, state: used|ending|starting, holders, holder, endsAt}]}`, `beach {memberships, active}`, `newThisMonth`, `soldThisMonth/Year` (ay/yıl sınırı iş saat diliminde), `types[{key: family:duration, count, active}]`, `renewalsDue` (7 gün içinde biten aktifler, en fazla 20).
- `POST /admin/purchases/remind` `{purchaseIds}` (2026-10-08, ≤200) — iptal edilmemiş her satın alım için uygulama-içi bildirim (`dispatchNotification`, tip `general`, `data.kind='membership_renewal'`, `idempotencyKey membership-renewal:<id>:<gün>` → aynı gün ikinci kez gitmez); yanıt `{requested, sent, skipped}`. E-posta yok.
- `POST /admin/purchases` — **resepsiyon/elle satış**. Çoğu üyelik buradan satılır. "Daily" (duration_days=1) teklifler tarih aralığına göre per-day çarpılır (`priceMultiplier`, beach/storage oranı korunur). Storage kutusu: staff belirli kutu seçebilir (dolu olsa bile PAYLAŞIM) veya otomatik. `pg_advisory_xact_lock('storage_unit_assign')` ile eşzamanlı otomatik-atama yarışı serileştirilir.
- `POST /admin/purchases/:id/cancel` ve `DELETE /admin/purchases/:id` — **membership delete control** (`admin, manager, developer, owner, front_desk, receptionist` — resepsiyon 2026-08-12'de eklendi; frontend eşleniği `MemberPurchasesSection.jsx MEMBERSHIP_MANAGE_ROLES`). Soft-cancel veya hard-delete; tam finansal geri sarma (idempotent cüzdan iadesi, kutu serbest, bekleyen banka makbuzu 'rejected', bekleyen manager komisyonu iptal).
- `GET /admin/pending-payments` + `PATCH /admin/pending-payments/:id/action` — banka transferi makbuz onay/red akışı.

### Servisler

- **`backend/services/membershipStatsService.js`** (2026-10-08) — efektif statü SQL'i (`effectiveStatusSql`: cancelled → cancelled; `expires_at` yok → saklı statü; geçmiş → `expired`), aile (`familySql`: storage = `category='storage'`, beach = `group_key='beach_pass'`, aksi halde kategori) ve süre kovası (`durationBucketSql`, `duration_days`'ten: ≤1 day, ≤7 week, ≤45 month, <360 season, yıl) yardımcıları + `purchaseStatusWhere` + `getMembershipStats`. Kutu haritası doluluğu box picker ile AYNI predicate'i kullanır; kapasite = storage tekliflerinin `MAX(total_capacity)`'si.

- **`backend/services/membershipPricingService.js`** (YENİ) — "müşteri aktif üye mi" + "rescue hizmeti üyeye ne indirim verir" tek doğruluk kaynağı. `hasActiveMembership(db, userId)`, `computeRescueMemberDiscount(service, gross, isMember)` → `{applies, percent, discountAmount, netAmount}`. %50 oranı `services.member_discount_percent` kolonunda saklanır (bkz. migration 281, [[Lessons_Services_Packages]]).
- **`backend/services/managerCommissionService.js`** — `recordMembershipCommission(purchase)` + `membershipCommissionableBase({offeringPrice, beachFeeAmount, discount})`. Komisyon tabanı = **sadece beach porsiyonu** (storage hariç). İndirim beach dilimine PRO-RATA uygulanır (`ratio = beach / price`). `beach_fee_amount == null` → legacy/tam fiyat. Saf storage (beach=0) hiç komisyon satırı yazmaz. `ENTITY_COMMISSION_MAP.member_purchase` (priceCol `offering_price`, idType `int`) indirim düzenlendiğinde `recomputeManagerCommissionForEntity` ile tabanı yeniden hesaplar.
- **`backend/services/walletService.js` → `getEntityNetCharges({memberPurchaseId})`** — over-refund fix'in kalbi. `member_purchases.id` SERIAL int, `related_entity_id` UUID olduğundan ücret/iade satırları id'yi `metadata.memberPurchaseId`'de (indirim-ayar kredileri `metadata.entity_id`'de) taşır; her ikisi `COALESCE` edilir. Bu fallback olmadan indirim görünmez kalır ve silmede GROSS ücret iade edilirdi.

## Frontend

- **`src/features/members/pages/MemberOfferings.jsx`** (`/members/offerings`) — public satın alma sayfası. `group_key` ile teklifler tek karta toplanır (süre seçici). `OfferingCard` görselli kart, storage için `available_count` rozeti ("X left" / "Sold Out"). Satın alma modalı (`TwoColumnModal`): süre varyantı, başlangıç tarihi, ödeme yöntemi (wallet / deposit %20 / banka). Iyzico kart akışı `IyzicoPaymentModal`. Admin staff buradan müşteri seçip elle atayabilir.
- **`src/features/members/pages/AdminMembersPage.jsx`** (`/calendars/members` ve `/memberships/active`) — **2026-10-08 yeniden yazıldı** (tasarım panoları "Members & Customers"): 6 KPI kutusu (`MembersKpis`, tıklayınca süzer), durum + tür çipleri sayılarla (`MembersToolbar`), arama/sıralama ("önce ilgi gerekenler"), masaüstünde seçimli tablo + toplu "yenileme hatırlatması gönder", mobilde kartlar (`MembersList`), depo kutu haritası (`StorageBoxMap`), bu hafta yenilenecekler (`RenewalsDue`). `view/type/q/sort` URL'de; `?status=` ve `defaultStatus` hâlâ çalışır. Yenile / Geri kazan → `NewMemberDrawer` `initial={{userId, offeringId, startDate}}` ile önden dolu açılır (yeni başlangıç = mevcut bitiş, bittiyse bugün). Saf yardımcılar `members/membersFormat.js`, sorgular `members/useMembers.js` (anahtarlar `admin-member-purchases` / `admin-member-stats` önekini korur). Eski sayfadaki "Assign membership" düğmesi çalışmıyordu (`QuickMembershipModal`'a `visible` veriliyordu, prop `open`) — artık `NewMemberDrawer`. Testler: `tests/unit/frontend/members/AdminMembersPage.test.jsx`, `tests/unit/backend/members/members-customers-overview.test.js`. Aşağıdaki eski açıklama tarihseldir: `defaultStatus="active"` prop'u **Active Memberships** görünümünü açar (bitiş tarihine göre `byExpiryAsc`, en yakın önce). **Outlet instance-reuse stale-filter** bug'ı: aynı `AdminMembersPage` örneği iki rotada paylaşıldığından `useEffect([initialStatus])` ile status filtresi senkronlanır. Paylaşılan kutu rozeti (`sharedStorageUnits`: aynı kutu >1 canlı satın alım → "Box #N (shared)" altın renk). Sil aksiyonu managers+ ile gated (`canManage`). `EnhancedCustomerDetailModal` müşteri drawer'ı, `ApplyDiscountModal` üyeliğe indirim.
- **`src/features/services/pages/MembershipSettings.jsx`** (`/services/memberships`) — teklif CRUD (Drawer). Storage edit/create modunda **iki alanlı** fiyat: "Beach Fee" (manager %10) + "Storage Fee" (komisyon yok); `price = beach + storage`. Create modunda tier tablosu (Daily/Weekly/Monthly/Seasonal/Yearly + Custom) → `POST /batch`. Canlı önizleme kartı.
- **`src/features/members/components/NewMemberDrawer.jsx`** + **`QuickMembershipModal`** (Dashboard FAB "New Membership") — çoklu müşteriye elle atama. **`StorageUnitPicker`**: `GET /admin/:offeringId/storage-units`'tan gelen ızgara; boş kutular beyaz/emerald, dolu kutular amber ve "tap to share" (kasıtlı paylaşım uyarısı). `total_capacity` ayarlı değilse "Settings → Memberships" yönlendirmesi.
- **`src/features/members/components/MemberUpsellBanner.jsx`** — public landing alt bandı; Lessons / Rentals / Shop / **Rescue Boat ("Members save 50%")** kartları. [[Outsider_Marketing]] sayfalarında görünür.
- **`src/features/members/components/MemberPurchasesSection.jsx` / `PendingMemberPaymentsTab.jsx`** — müşteri detayında satın alım listesi + bekleyen banka onay sekmesi.

## Veri Modeli

- **`member_offerings`** — katalog. Kolonlar: `price`, `period` (day/month/season/year — güvenilmez, isimden türetilir), `duration_days`, `category` (membership/storage/freerider), `total_capacity` (storage), `group_key` (kart toplama), `beach_fee_amount` (komisyon tabanı), görsel/kart alanları (`image_url`, `badge`, `badge_color`, `highlighted`, `card_style`, `gradient_*`).
- **`member_purchases`** — satın alımlar (PK `id` SERIAL **int**). Snapshot kolonları: `offering_name`, `offering_price`, `beach_fee_amount`. `status` (active / pending / pending_payment / cancelled), `payment_status`, `payment_method`, `storage_unit` (atanan kutu no), `expires_at`, `gateway_transaction_id` (Iyzico token), `created_by`. **memberPurchaseId** her yerde bu id'yi ifade eder.
- **`bank_transfer_receipts`** — banka transferi makbuzları; `member_purchase_id` FK `ON DELETE SET NULL`. Onayla/Reddet akışı üyeliği aktive/iptal eder.
- **`storage_unit`** ayrı bir tablo DEĞİLDİR — kapasite `member_offerings.total_capacity`, atanan kutu `member_purchases.storage_unit` (1..N int). Doluluk her zaman canlı satın alımların `COUNT(DISTINCT storage_unit)`'ından türetilir.
- **`discounts`** (entity_type `member_purchase`, entity_id `String(id)`) — üyeliğe manuel indirim. Bkz. [[Finances_Wallet]] / discount tablosu kuralı.
- **`manager_commissions`** (source_type `membership`) — beach-fee tabanlı komisyon. Migration **280** (`beach_fee_amount` her iki tabloya + backfill).

## Akış / İş Mantığı

**Satın alma (müşteri, wallet):** offering çek → mevcut aktif abonelik kontrolü → storage kapasite kontrolü (GLOBAL DISTINCT) → cüzdandan düş (`recordTransaction`, currency çapraz-çevrim destekli) → `member_purchases` INSERT → cüzdan debit satırını `metadata.memberPurchaseId` ile damgala (iade/iptal yolunun ücreti bulabilmesi için) → COMMIT → `recordMembershipCommission` (fire-and-forget, beach tabanı).

**Banka transferi:** purchase `pending_payment` + `bank_transfer_receipts` satırı → dashboard'a real-time event → admin `PATCH .../action approve` → üyelik `active`, audit cüzdan satırları, bildirim ([[Notifications_System]]), `recordMembershipCommission`. **Zombie-membership revival fix:** onay öncesi `FOR UPDATE OF mp` ile statü kilitlenir; `cancelled` ise reaktivasyon reddedilir.

**Komisyon (beach-only):** `beachBase = membershipCommissionableBase(offeringPrice, beach_fee_amount, discount)`. İndirim varsa `beach − discount * (beach/price)`. Storage dilimi metadata'da `storageExcluded` olarak loglanır. Manager rate `getCommissionRate(settings, 'membership')`: `membership_rate` unset ise default %10'a düşer (eskiden sessizce 0 ödüyordu).

**İptal / silme:** `getEntityNetCharges({memberPurchaseId})` ücreti önceki iadelerle netler → para birimi başına idempotent `member_purchase_refund` kredisi (`idempotencyKey: member-purchase-refund:<id>:<currency>`). Storage kutusu cancelled satır DISTINCT'ten düştüğü için otomatik serbest kalır. Bekleyen banka makbuzu 'rejected', bekleyen komisyon iptal.

## Dikkat / Tuzaklar

- **Saklı statü hiçbir zaman `expired` olmaz (2026-10-08).** Statüyü güncelleyen bir job yok; demo'da 15 üyelik `active` saklıyken süresi dolmuştu. Her yeni sorgu `effectiveStatusSql` / `purchaseStatusWhere` kullanmalı — `mp.status = 'active'` ile süzmek süresi dolmuşları "aktif" sayar. Veri yeniden yazılmadı; `expires_at` düzenlemek üyeliği kendiliğinden yeniden aktif yapar.

- **Tarih seçicileri gün başına sabitlenmeli (2026-09-02 fix, v0.1.381).** `NewMemberDrawer`'da `startDate` başlangıç değeri `dayjs()` idi — yani BUGÜNÜN saati de dahil. antd DatePicker seçilen her tarihin saatini sıfırlar (`rc-picker/.../useRangePickerValue.js:82` → `fillTime`), dolayısıyla bitiş tarihi hep 00:00 olur. `beachDays = endDate.diff(startDate,'day') + 1` milisaniye üzerinden kırptığı için, personel **başlangıç alanına dokunmadığında** aynı iki tarih bir gün EKSİK sayılıyordu: 25 Ağu (varsayılan, 08:00) → 4 Eyl (00:00) = 9,67 gün → 9+1 = "10 gün", oysa backend 11 gün (€187) kesiyordu. Başlangıcı seçince aynı tarihler 11 gösteriyordu → "aynı günler, farklı sayı" şikâyeti. Artık her iki taraf da `startOf('day')`. Backend zaten `YYYY-MM-DD` üzerinden takvim günü sayar (`memberOfferings.js:1305`) ve önizlemeye asla güvenmez.
- **`MemberOfferings.jsx` `toISOString()` göndermemeli (2026-09-02 fix, v0.1.381).** Satın alma sayfası `startDate.toISOString()` yolluyordu; UTC+3'te yerel gece yarısı bir ÖNCEKİ günün 21:00'i olarak serileşir ve backend'in `new Date(startDate)` → `purchased_at` yazımı her üyeliği **bir gün geriye** atıyordu. Artık `format('YYYY-MM-DD')` — [[Bookings_Calendar]] drawer'ıyla aynı sözleşme.

- **member_purchases.id INT'tir, related_entity_id UUID'dir.** Cüzdan/iade satırları id'yi ASLA `related_entity_id`'ye yazmaz — daima `metadata.memberPurchaseId`. Yeni kod bu kolonu okuyup yazmalı yoksa iade ücreti bulamaz.
- **Over-refund bug (kritik):** indirimli üyelik silinince GROSS iade ediliyordu (€6-net %50-off üyelikte €12 iade → cüzdan windfall). `getEntityNetCharges` artık `COALESCE(metadata->>'memberPurchaseId', metadata->>'entity_id')` ile indirim-ayar kredisini de toplar. Repair script: `backend/scripts/repair-cenk-dilara-overrefund.mjs` (DATA prod+local onarıldı). Kod LOCAL-only, prod'a deploy EDİLMEDİ → tekrarı prod'da push-all'a kadar engellenmiyor.
- **Storage kutu doluluğu HER YERDE aynı predicate olmalı:** `category='storage' AND status IN ('active','pending','pending_payment') AND (expires_at IS NULL OR expires_at > NOW()) AND storage_unit IS NOT NULL`, `COUNT(DISTINCT storage_unit)`. `available_count`, kapasite kontrolü, otomatik atama ve staff picker bu seti paylaşır. Paylaşılan kutu (aynı storage_unit, çok satır) DISTINCT ile tek sayılır.
- **GLOBAL double-book fix:** kutular tek tekliften değil TÜM storage tekliflerinden paylaşılır; eski per-offering mantık çift rezervasyona yol açıyordu.
- **`period` kolonu güvenilmez** (örn. "Storage + Beach — Week" period='day' kayıtlı). UI süre filtresi (`deriveDuration`) önce offering ADINDAN türetir, sonra period'a düşer.
- **beach_fee_amount snapshot'tır:** `member_purchases.beach_fee_amount` satın alma anında dondurulur; sonradan teklif düzenlemesi mevcut satın alımın komisyon tabanını geriye dönük değiştirmez.
- **Daily (per-day) fiyatlama** sadece elle/admin satışta tarih aralığıyla çarpılır; backend fiyatı tarihlerden yeniden hesaplar (istemciye güvenmez), beach/storage oranı korunur.
- **Custom-role nav görünmezliği:** sidebar "Memberships" dropdown'ı ([[Frontend_Shell]]) custom-role nav'da değil — `ADMIN_ROLES` 403. `/memberships/active` = `AdminMembersPage defaultStatus="active"`.
- **Komisyon prod'da deploy DEĞİL:** migration 280 + beach-fee komisyon mantığı LOCAL; owner bundle'lar 50-53 üzerinde beach porsiyonunu Membership Settings'ten ayarlamalı.
- **Havale üyeliği artık cüzdana gerçek borç yazar (2026-08-30).** Satın alma anında tam fiyat `membership_charge` alacağı (`member_purchase` tag + `metadata.memberPurchaseId`); onay yalnızca dekont tutarını **tag'siz** `bank_transfer_payment` kredisi olarak yazar (eski `deposit`+`payment` sıfır-delta çifti kaldırıldı) ve kısmi ödemede `payment_status='partial'` bırakır; red, `getEntityNetCharges` ile alacağı iade eder. Ayrıntı: [[Finances_Wallet]].

