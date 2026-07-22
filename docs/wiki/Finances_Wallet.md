# Finances & Wallet

> **Özet:** Tüm para hareketleri `wallet_transactions` defterinden (append-only ledger) geçer; `wallet_balances` çok para birimli (EUR/TRY/USD) bir önbellektir ve completed satırların `*_delta` toplamından yeniden hesaplanabilir. İndirimler ayrı `discounts` tablosunda tutulur (ham fiyat ASLA mutasyona uğramaz), giderler `business_expenses` içinde, oran/ayarlar `financial_settings` içindedir. Finans sayfaları (Finance + hizmet kırılımları + Ödeme Geçmişi + Giderler) bu defteri okur.
>
> **Kütüphaneler:** Node/Express (ESM), PostgreSQL (`pg`, LATERAL join + `FOR UPDATE`), Decimal.js (para — float YASAK), React 18 + Ant Design + TanStack Query, dayjs.
>
> **Bağlantılar:** [[Payments_Currency]], [[Bookings_Calendar]], [[Lessons_Services_Packages]], [[Memberships]], [[Instructors_Payroll]], [[Products_Shop_Inventory]], [[Customers_CRM]], [[Database]], [[Operations_Scripts]], [[Testing_QA]], [[Shared_Backend_Utilities]]

---

## Sorumluluk
Bu modül platformun **finansal hakikat kaynağıdır**. Her satış (ders, kiralama, üyelik, mağaza, konaklama) ve her geri ödeme/indirim/maaş, müşteri cüzdanına bir defter satırı olarak yazılır. Modül şunları sağlar:
- Çift girişli benzeri bir **append-only ledger** (`wallet_transactions`) ve ondan türetilen **çok para birimli bakiye önbelleği** (`wallet_balances`).
- Para birimi başına yeniden hesaplama (`recomputeBalanceFromLedger`) ve drift tespiti (`findBalanceLedgerDrift`) — önbellek bozulduğunda otoriter düzeltme yolu.
- Manuel yüzde **indirimler** (`discounts` tablosu) ve ödenmiş kalemlerde indirimi cüzdana iade eden `discount_adjustment` kredileri.
- **Giderler** (`business_expenses`) ve vergi/sigorta/ekipman/ödeme-yöntemi **oranları** (`financial_settings`).
- Mutabakat (reconciliation), günlük operasyon raporları, gelir anlık görüntüleri ve nakit-modu toplayıcı.

## Backend

### Cüzdan defteri — `backend/services/walletService.js`
Modülün kalbi. Önemli ihraçlar:
- `recordTransaction({...})` — **TÜM** para yazımlarının tek giriş noktası. `BEGIN` → `ensureBalance` (`FOR UPDATE` ile bakiye satırını kilitler) → bakiyeyi Decimal.js ile günceller → `wallet_transactions` satırını ekler → COMMIT. Negatif bakiye guard'ı vardır; `allowNegative: true` bayrağı (iadeler için) bunu aşar ama opsiyonel `overdraft_limit` tabanına ve `wallet_audit_logs`'a `wallet.negative_balance_override` denetim satırına tabidir. `idempotencyKey` (UNIQUE indeks, migration 265) yinelenen webhook/çağrıları no-op yapar.
- `fetchTransactions(userId, {...})` — Ödeme Geçmişi/Finans tablolarını besleyen okuyucu. İçinde dört LATERAL join: (1) `discounts` toplamı, (2) `booking_charge_adjustment` katlama, (3) shop `item_price_adjustment` katlama, (4) yetim (orphan) tespiti. Per-satır indirim join'i `entity_id = COALESCE(related_entity_id::text, metadata->>'orderId', metadata->>'memberPurchaseId')` ile eşleşir — çünkü `shop_order`/`member_purchase` SERIAL-int PK kullanır ve `related_entity_id` (UUID) NULL'dır.
- `recomputeBalanceFromLedger(userId, currency)` — `wallet_balances`'ı **completed** satırların `SUM(*_delta)`'sından yeniden inşa eder (ON CONFLICT upsert). Mutabakat cron'unun ve incident onarımlarının otoriter yolu.
- `findBalanceLedgerDrift({tolerance})` — önbellek ≠ defter olan cüzdanları salt-okunur listeler (sessizce ezmez, uyarır).
- `getEntityNetCharges({...})` — bir satış varlığının para birimi başına **net açık borcunu** döndürür (completed satırların `available_delta` toplamı; ücretler negatif, iadeler pozitif). İade çağrıcıları bununla **tam olarak ne tahsil edildiyse, orijinal para biriminde** iade eder ve çift-iadeyi önler. `shop_order`/`member_purchase` için indirim kredisini de saymak üzere `COALESCE(metadata->>'orderId', metadata->>'entity_id')` kullanır (aksi halde brüt iade edilir).
- Para yardımcıları: `toNumeric`/`sumMoney` (NUMERIC(18,4)'e Decimal.js ile kuantize; float drift yok), `resolveDirection` (credit/debit/adjustment), `resolveStoredAvailableDelta` (saklı 0 ≠ NULL — migration 258 maaş-cüzdan hatası buna bağlı).
- Mevduat/çekim/KYC/banka hesabı/ödeme yöntemi yaşam döngüsü de buradadır (`createDepositRequest`, `approveDepositRequest`, `requestWithdrawal`, `submitKycDocument` vb.).

### Cancel + reversal çift-geri-alma (KRİTİK kavram)
Eski silme yolu bir işlemi silerken HEM orijinali `status='cancelled'` yapardı HEM de bir `*_reversal` (tersine çevirme) satırı eklerdi — bu **iki kez geri alma** demekti ve önbellek defter toplamını çift sayardı (incident 2026-06-10, Erkan Özgen +€390). `backend/routes/finances.js` `DELETE /transactions/:id` artık yalnızca orijinali `cancelled` işaretler (reversal satırı YOK); `hardDelete` modu satırı tamamen siler. İstatistikler `right(transaction_type, 9) != '_reversal'` ile reversal'ları dışlar (cancel+reversal çifti ekonomik olarak sıfırlanır).

### İndirimler — `backend/services/discountService.js`
- `discounts` tablosunda **(entity_type, entity_id[, participant_user_id])** başına tek satır; yeniden uygulama UPSERT eder. Orijinal fiyat uygulama anında kaynak tablodan okunur, mutlak indirim tutarı kilitlenir (`computeDiscountAmount`, Decimal.js ROUND_HALF_UP).
- Desteklenen varlıklar (`ENTITY_CONFIG`): booking, rental, accommodation_booking, customer_package (UUID PK) + member_purchase, shop_order (SERIAL int PK).
- **Ödenmiş** bir kaleme indirim uygulandığında, fazla tahsilatı iade etmek için `discount_adjustment` (credit) cüzdan satırı yazılır; indirim değişince `discount_adjustment_reversal` ile tersine çevrilip taze kredi yazılır (`findOpenDiscountAdjustment` reversal'ı timestamp yerine `metadata.reversal_of` ile eşleştirir — aynı transaction'da NOW() sabit olduğu için).
- **`skipWalletCredit` opsiyonu (2026-07-16):** kredi yalnızca **brüt cüzdan borcunu** telafi eder; nakit/kart quick-sale'de müşteri zaten NET öder, kredi basmak bedava para olur. Çağıran `skipWalletCredit:true` geçerse discounts satırı yazılır ama kredi atlanır. `reverseOpenDiscountCreditsForEntity(client, entityType, entityId, {reason, createdBy})` (export) — bir varlığı hard-delete etmeden ÖNCE açık indirim kredilerini kapatmak için (aksi halde discounts satırı silinince kredi ledger'da yetim kalır). Bkz. [[Products_Shop_Inventory]] ve MEMORY `zeynep_karahan_bill_wallet_gap`.
- **Over-refund düzeltmesi:** SERIAL-int varlıklarda indirim kredisi `discountCorrelationMeta` ile aynı korelasyon anahtarını (`memberPurchaseId`/`orderId`) taşır; aksi halde indirimli bir üyelik silinince `getEntityNetCharges` indirimi göremez ve brüt iade edilir (€12 net €6 olan %50 indirimli üyelik). Bkz. MEMORY `membership_discount_overrefund_fix`.
- Fiyat-düzenleme rebase'leri: `recomputeBookingDiscountsForPriceEdit`, `recomputeDiscountForRental/CustomerPackage/AccommodationBooking` — fiyat değişince mutlak indirim tutarını yeniden tabanlar ve `recomputeManagerCommissionForEntity` + instructor earnings cascade'ini tetikler.

### Rotalar
- `backend/routes/finances.js` — ana finans API'si: `/finances/accounts/:id` (LTV dahil), `/finances/transactions` (Ödeme Geçmişi + stats + breakdown + trend), `/finances/summary`, hizmet kırılımları (`/lesson-breakdown`, `/rental-breakdown`, `/membership-breakdown`, `/accommodation-breakdown`, `/events-breakdown`), `/wallet-deposits`, iade/charge işlemleri (`process-refund`, `process-charge`), bakiye senkron (`balance-sync/:id`, `reset-balance`).
- `backend/routes/wallet.js` — müşteri-yönlü cüzdan: `/wallet/summary`, `/transactions`, `/deposit` (+ `/deposit/binance-pay`), `/deposits/:id/status|verify`, `/withdrawals`, KYC + banka hesapları + ödeme yöntemleri.
- `backend/routes/discounts.js` — indirim uygula/listele/sil (servisi bir client transaction içinde sarar).
- `backend/routes/businessExpenses.js` — gider CRUD (`finances:read`/`finances:write` izinleri; front_desk/receptionist okuyabilir) + `/summary/by-period`.
- `backend/routes/financialSettings.js` + `backend/routes/financeDailyOperations.js`.

### Yardımcı servisler
- `financialReconciliationService.js` — periyodik bütünlük denetimi; `findBalanceLedgerDrift`'i çağırır, tutarsızlıkları otomatik düzeltir.
- `financialSettingsService.js` — aktif `financial_settings` satırı + `financial_settings_overrides` (vergi/sigorta/ekipman oranı, ödeme-yöntemi ücretleri); accrual vs cash ayrımı.
- `dailyOperationsService.js` — günlük nakit-bazlı raporlar; legacy `transactions` tablosu donduğu için artık `wallet_transactions`'ı okur (EUR'a normalize, deposit'ler gelir sayılır, charge'lar hariç).
- `cashModeAggregator.js` + `revenueSnapshotService.js` + `serviceRevenueLedger.js` — accrual/cash modu toplama, net gelir anlık görüntüleri (feature-flag'li), hizmet-bazlı gelir defteri.
- `staffPaymentService.js` — instructor + manager payout'ları için ortak cancel + cache-resync + re-record cascade'i ([[Instructors_Payroll]]).

### Legacy finansal doğrulama — `backend/utils/financialValidation.js` (TUTARSIZLIK RİSKİ)
`validateAndCorrectFinancialData(pool, userId)` eski mimariden kalma bir yardımcıdır ve **otoriter defterle çatışır** — bu yüzden yeni kodda kullanılmamalı, [[Shared_Backend_Utilities]] altında "tehlikeli legacy" olarak işaretlenir:
- Donmuş **legacy `transactions` tablosunu** okur (artık para hareketleri `wallet_transactions`'a yazılır; bu tablo güncellenmez). Bakiyeyi `payment`/`credit`/`charge`/`debit`/`refund` tiplerinden hesaplar — `wallet_transactions`'ın çok para birimli `*_delta` modelini bilmez.
- Hesapladığı değeri doğrudan **`users.balance`/`total_spent` ÜSTÜNE YAZAR** (`UPDATE users SET balance=..., total_spent=...`). Oysa otoriter bakiye `wallet_balances` (+ türetildiği `wallet_transactions`) içindedir; `users.balance` yalnızca `WALLET_ENABLE_LEGACY_MIRROR` ile EUR cüzdandan aynalanan türetilmiş bir alandır (bkz. Akış §5). Bu yardımcı tek para birimli, float (`parseFloat` + `+=`) hesabını otoriter alanların üstüne yazarsa **müşteri bakiyesini drift'e sokar** — Decimal.js kuantizasyonunu ve diğer para birimlerini (TRY/USD) yok sayar.
- Doğru tutarsızlık tespiti/düzeltmesi için `findBalanceLedgerDrift` + `recomputeBalanceFromLedger` (yukarıda) ve `financialReconciliationService.js` kullanılmalıdır — bu legacy yardımcı **değil**.

### İşlem enum tek-kaynağı — `backend/constants/transactions.js`
Tüm stringly-typed finans enum'larının **tek kaynağı** ([[Shared_Backend_Utilities]]). Buradaki bir yeniden adlandırma, string'i okuyan her tüketiciye (rotalar, servisler, audit scriptleri) yayılır. İhraçlar:
- `TRANSACTION_TYPE` — `wallet_transactions.transaction_type` değerleri (`payment`, `deduction`, `package_purchase`, `discount_adjustment`, `booking_charge_adjustment`, `accommodation_charge_adjustment`, `package_price_adjustment`).
- `WALLET_ENTITY_TYPE` — `wallet_transactions.entity_type` + `discounts.entity_type` paylaşımlı varlık string'leri (`booking`, `rental`, `customer_package`, `accommodation_booking`, `manager_payment`, `instructor_payment`).
- `WALLET_TX_STATUS` (`completed`/`cancelled`/`pending`/`failed`), `BOOKING_STATUS`, `PAYMENT_STATUS`, `PAYMENT_METHOD`, `TX_DIRECTION` (`credit`/`debit`).
- Nakit-bazlı toplama için tip grupları: `PAYMENT_TYPES`, `REFUND_TYPES`, `EXCLUDED_REVENUE_TYPES`, `SERVICE_TYPE_TO_PAYMENT_TYPES` — `dailyOperationsService`/`cashModeAggregator` bunlarla geliri sınıflandırır.

## Frontend
Tümü `src/features/finances/pages/` altında; rotalar `src/routes/AppRoutes.jsx` içinde `finances:read` izniyle korunur:
- `Finance.jsx` (`/finance`) — finans gösterge paneli/hub; hizmet kırılımı sekmelerine giriş.
- `FinanceLessons.jsx`, `FinanceRentals.jsx`, `FinanceMembership.jsx`, `FinanceShop.jsx`, `FinanceAccommodation.jsx`, `FinanceEvents.jsx` (`/finance/...`) — her hizmet türü için gelir kırılımı; ilgili `/*-breakdown` uçlarını okur, indirim-netting uygular.
- `FinanceDailyOperations.jsx` (`/finance/daily-operations`) — günlük nakit/iade tablosu (dailyOperationsService).
- `PaymentHistory.jsx` (`/finance/payment-history`) — tüm defter satırları + grafikler; `LEDGER_NOISE_TYPES` seti (`discount_adjustment`, `booking_charge_adjustment` vb.) tablodan gizlenir (bunlar başka satırları katlayan iç ayarlamalardır).
- `ExpensesPage.jsx` (`/finance/expenses`) — `business_expenses` CRUD UI.
- `WalletDepositsAdmin.jsx` + `BankAccountsAdmin.jsx` + `FinanceSettingsPage.jsx` + `PaymentRefunds.jsx` — yönetici cüzdan/banka/ayar/iade ekranları.
- `PaymentCallback.jsx` (`/payment/callback`) — Iyzico dönüşü ([[Payments_Currency]]).

## Veri Modeli
- **`wallet_transactions`** — append-only defter. Önemli kolonlar: `user_id`, `currency`, `transaction_type`, `status` (`pending`/`completed`/`failed`/`cancelled`), `direction` (`credit`/`debit`/`adjustment`), `amount`, `available_delta`/`pending_delta`/`non_withdrawable_delta` (+ `balance_*_after`), `booking_id`/`rental_id`, `related_entity_type`/`related_entity_id` (UUID), `metadata` (JSONB — SERIAL-int id'ler `orderId`/`memberPurchaseId` burada), `discount_id`, `idempotency_key` (UNIQUE), `transaction_date`.
- **`wallet_balances`** — (user_id, currency) UNIQUE önbellek: `available_amount`/`pending_amount`/`non_withdrawable_amount`, opsiyonel `overdraft_limit`.
- **`discounts`** — (customer_id, entity_type, entity_id, participant_user_id, percent, amount, currency, reason); `amount >= 0` CHECK; kısmi UNIQUE indeksler (participant NULL / NOT NULL).
- **`business_expenses`**, **`financial_settings`** (+ `financial_settings_overrides`), **`wallet_audit_logs`**, **`wallet_deposit_requests`**, **`wallet_bank_accounts`**, **`wallet_payment_methods`**, **`wallet_kyc_documents`**, **`wallet_settings`**, **`currency_settings`** ([[Payments_Currency]]).

## Akış/İş Mantığı
1. **Satış ücreti:** booking/rental/shop/membership akışı `recordTransaction` çağırır (negatif `available_delta`). Bakiye `FOR UPDATE` ile kilitlenir, Decimal.js ile güncellenir, satır eklenir.
2. **İndirim (ödenmiş kalem):** `applyDiscount` → `discounts` UPSERT → `postDiscountAdjustment` (credit, `allowNegative:true`) → manager/instructor cascade.
3. **Silme/iade:** `getEntityNetCharges` ile net açık borç orijinal para biriminde okunur → iade kredisi yazılır (cancel-only, reversal YOK).
4. **Mutabakat:** cron `findBalanceLedgerDrift` → sapma varsa uyar/`recomputeBalanceFromLedger`.
5. **Legacy bakiye:** `WALLET_ENABLE_LEGACY_MIRROR` açıksa `users.balance`/`total_spent` yalnızca EUR cüzdanlardan aynalanır. `legacy_opening_balance` tipi satırlar Ödeme Geçmişinde "Previous app balance" olarak gösterilir ama istatistik dışı tutulur.

## Dikkat/Tuzaklar
- **Para = Decimal.js, ASLA float.** `toNumeric`/`sumMoney` her yazımda NUMERIC(18,4)'e kuantize eder.
- **`wallet_balances` türetilmiş bir önbellektir.** Ham SQL ile cüzdana yazan herhangi bir kod onu drift'e sokar; tek otoriter düzeltme `recomputeBalanceFromLedger`'dır.
- **`related_entity_id` UUID-typed'tır.** `shop_order`/`member_purchase` SERIAL-int olduğu için id `metadata.orderId`/`memberPurchaseId`'de yaşar; tüm join'ler `COALESCE` ile her ikisini de eşlemeli yoksa indirim/iade görünmez (over-refund kaynağı).
- **Cancel + reversal = çift geri alma.** Asla ikisini birden yazma; yalnızca `cancelled` işaretle (veya hardDelete).
- **`allowNegative` yalnızca iade-tarzı kredilerde** kullanılmalı; `overdraft_limit` tabanı + denetim satırı vardır.
- **Ham fiyat kolonlarını ASLA mutasyona uğratma** — indirimler ayrı tabloda; `getActiveDiscountAmount`/`discountSumLateral` ile çıkar.
- Ödeme Geçmişi/Finans toplamları reversal ve `*_adjustment` satırlarını çift saymamak için dikkatle filtreler (`LEDGER_NOISE_TYPES`, `right(...,9) != '_reversal'`).
- **`recordLegacyTransaction` delta-override'ları FORWARD etmeli (2026-07-22 fix).** Wrapper eskiden `availableDelta`/`pendingDelta`/`nonWithdrawableDelta` alanlarını kabul etmiyordu → `createStaffPayment`'ın `availableDelta: 0`'ı sessizce düşüyordu ve Mayıs 2026'dan beri HER maaş ödemesi/kesintisi personelin kişisel cüzdanına ±tutar yazdı (~€15.9k fantom kredi, 7 personel). Onarım: `backend/scripts/repair-staff-payout-wallet-leak.mjs` (payout satırlarının delta'ları 0'landı + cüzdanlar recompute). Aynı sınıftaki latent site: `services.js` non-trusted pay-later borç satırı (`availableDelta: 0`) — artık forward ediliyor.

## Prod Teşhis & Audit Scriptleri
Bu modülde geçmiş incident'lar (cancel+reversal çift-geri-alma, kısmi-silme yetimleri, over-refund) tek seferlik onarım gerektirdi. İlgili salt-okunur tarama ve idempotent temizlik scriptleri `scripts/` kökünde tutulur ([[Operations_Scripts]]); finansal bütünlük denetimi [[Testing_QA]] kapsamındadır. Tümü `backend/.env`'in işaret ettiği DB'ye karşı çalışır (prod için SSH ile prod env'e geçilir).

### Bütünlük denetimi — `scripts/check-integrity.mjs`
DB tutarlılık + finansal bütünlük denetleyicisi; CI/elle çalıştırılan kapsamlı kontrol seti. `DATABASE_URL` (backend/.env → root .env sırasıyla) okur, kritik bulunca exit 1 verir. Finansal kontroller: **cüzdan bakiyesi ≠ işlem toplamı** (kritik), **`users.balance` ≠ `wallet_balances.balance`** (uyarı — legacy ayna drift'i), tamamlanmış-ama-ödenmemiş booking'ler, orijinali olmayan iadeler. Ek olarak booking/rental/paket/mağaza/konaklama/veri-kalitesi (çift-rezervasyon, negatif stok/saat, sipariş-toplam uyuşmazlığı, geçersiz rol, yinelenen e-posta) kontrolleri. Çıktı renkli özet (Passed/Warnings/Critical).

### Cancel+reversal çift-geri-alma taraması — `scripts/scan-cancel-reversal-pairs.sql`
Salt-okunur. `status='completed'` bir `%reversal%` satırı + tersine çevirdiği orijinalin (metadata `reversedTransactionId`) artık `cancelled` ya da hard-deleted olduğu **fantom bakiyeleri** bulur (her iki durum da tek başına orijinali geri alır; ikisi birden completed-defteri 2× sallar). İkinci sorgu tüm cüzdanlarda **önbellek ≠ completed-defter sapmasını** (`available_amount` vs `SUM(available_delta)`) listeler. Bkz. "Cancel + reversal" bölümü.

### Kısmi-silme kurbanları — `scripts/scan-partial-delete-victims.sql`
Salt-okunur. Pre-v0.1.294 booking-silme açıklarının kurbanlarını tarar: (A) soft-deleted booking'lerin hiç (tam) iade edilmemiş açık net cüzdan ücretleri (`booking_id`/`related_entity_id` üzerinden `SUM(available_delta) < 0`), (B) ilgili payroll/komisyon yetimleri. Bkz. MEMORY `partial_booking_delete_and_edit_gaps`.

### Silinen-booking kazanç sınıflandırma + temizlik — `scripts/classify-deleted-earnings.sql` + `scripts/cleanup-deleted-booking-earnings.sql`
- `classify-deleted-earnings.sql` (salt-okunur): soft-deleted booking'lere bağlı kalan `instructor_earnings` satırlarını **`dup`** (canlı kopya var), **`nottaught`** (ders hiç `completed` olmadı) veya **`REVIEW`** (tamamlanmış ders, telafisi yok → olası kayıp instructor ödemesi) olarak sınıflandırır.
- `cleanup-deleted-booking-earnings.sql` (idempotent DO bloğu): payroll'a girmemiş (`payroll_id IS NULL`) yetim `instructor_earnings` satırlarını siler + hâlâ pending `manager_commissions`'ı iptal eder — v0.1.294'ten beri canlı `DELETE /bookings/:id` akışının yaptığını eski silmeler için telafi eder; yeniden çalıştırma 0 satır etkiler.

### İndirim-farkında komisyon denetimi — `scripts/audit-discount-commissions.mjs`
Salt-okunur teşhis (`--fix` ile düzeltir). İndirimden (booking veya `customer_package`) etkilenen, `instructor_earnings` satırı olan her booking için **saklı komisyonu** indirim-farkında yeniden hesaplanan değerle karşılaştırır; iki sorun yüzeye çıkar: **STALE** (komisyon indirimsiz tam fiyattan hesaplanmış → payroll-kilitliyse instructor fazla ödenmiş) ve **IGNORED** (paketin saklı `package_hourly_rate`'i ders değerini sabitlediği için paket indirimi komisyona hiç ulaşmaz — davranış sorusu). `--fix`, `BookingUpdateCascadeService` ile STALE satırları yeniden hesaplar (payroll-kilitli satırlar atlanır).
