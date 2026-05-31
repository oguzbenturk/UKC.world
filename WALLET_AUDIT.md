# Plannivo — Cüzdan (Wallet) Sistemi Denetim Raporu

> Çok-ajanlı denetim (107 ajan, 9 kategori) ile üretildi. Her bulgu, kodu yeniden okuyan bağımsız bir **adversarial verifier** tarafından doğrulandı. Toplam 93 aday bulgu üretildi; **59'u doğrulandı**, 34'ü (kod başka bir yerde zaten önlemiş olduğu için) elendi. Risk dağılımı: **6 Kritik · 20 Yüksek · 21 Orta · 12 Düşük**.

---

## 0. Kısa Cevap (teknik olmayan dille)

**Cüzdan tek doğruluk kaynağı (single source of truth) DEĞİL. Sistem gevşek (slacky).**

Mimari aslında doğru kurulmuş: iki katman var —
- **`wallet_transactions`** = defter (ledger), her hareketin satırı.
- **`wallet_balances`** = bakiye önbelleği (cache).

Doğru tasarımda kural şu olmalı: **bakiye = defterdeki delta'ların toplamı**. Sorun, bu kuralın hiçbir yerde zorlanmaması:

1. **Bakiye okuması defteri saymıyor, sadece cache'i okuyor.** `getBalance` / `calculateAvailableBalance` doğrudan `wallet_balances` satırını döndürüyor — defterle hiç karşılaştırmıyor. Yani cache kayarsa kimse fark etmiyor.
2. **Aynı bakiyeyi en az 3 farklı "yazıcı" değiştiriyor:** doğru yol `recordTransaction` (kilitli, delta + snapshot yazıyor); `recordLegacyTransaction` (delta'yı her zaman "tam tutar" varsayar); ve **ham SQL** (`agent.js`, `finances.js`, `studentPortalService.js`). Üç farklı tutarlılık modeli, tek kolon.
3. **Üstüne bir de eski `users.balance` + `users.total_spent` kolonları üçüncü kopya olarak hâlâ okunuyor** (müşteri listesi ve hesap detayında fallback olarak). EUR-only ve bir flag'e bağlı; çoğu zaman güncellenmiyor → kayıyor.
4. **Bunun kanıtı kodun içinde:** `backend/routes/finances.js:1205`'te **2026-05-30 tarihli gerçek bir incident yorumu** var — "Rifat Doğan, -120€'luk booking -260€ olarak göründü" — cache defterden kaymış, kod reaktif olarak `SUM(delta)`'dan yeniden türetip düzeltmiş. Yani drift teorik değil, **zaten yaşandı**.

### Booking nasıl tahsil ediliyor?
- **Normal booking → İYİ yol.** `walletService.recordTransaction`: `FOR UPDATE` kilidi, delta + `balance_after` snapshot, doğru para birimi. Tek doğru kanal bu.
- **Hybrid (cüzdan + kart) → riskli.** Cüzdan borcu önce COMMIT ediliyor, *sonra* Iyzico başlatılıyor. Iyzico patlarsa cüzdandan düşülen para **geri alınmıyor** (öksüz borç). Idempotency yok → kullanıcı tekrar denerse tekrar borç.
- **Kai chatbot booking (`agent.js`) → EN KÖTÜ yol.** Ham SQL: `'EUR'` hardcoded, `UPDATE ... WHERE user_id` (currency filtresi YOK → yanlış/çoklu satırı düşürür), kilit yok, negatif kontrol yok, `available_delta=0`'lı görünmez bir defter satırı. Bu tek blok, senin 8 kategorinin neredeyse hepsini aynı anda ihlal ediyor.

### Rental nasıl tahsil ediliyor?
- `recordLegacyTransaction` ile. EUR yetmezse başka para birimine geçip `Math.round(x*100)/100` (float) ile çevirip o cüzdandan düşüyor. **Ama iade (refund) para birimi göndermiyor → her zaman EUR'ya iade.** TRY'den çekip EUR'ya iade ediyor — defter asimetrik, çekilen TRY bakiyesi hiç geri gelmiyor.

### "Slacky" nerede en çok?
- **Webhook imza doğrulaması YOK** → sahte bir POST ile cüzdana kredi yazdırılabilir (Kritik).
- **`/wallet/deposit` rol kontrolsüz** ve `autoComplete` bayrağı kullanıcıdan geliyor → herhangi bir oturum açmış kullanıcı `manual`/`crypto` ile **kendi cüzdanını bedavaya doldurabilir** (Kritik).
- **Idempotency hiçbir tahsilat yolunda yok**, `wallet_transactions`'ta unique constraint yok → her retry/duplicate webhook çift kayıt.
- **Çok-currency toplamları kur çevirmeden** yapılıyor (gelir özeti, outstanding balances) → 1500 TRY + 50 EUR = 1550 olarak toplanıyor.

> **Tek cümlelik teşhis:** Tahsilatın "mutlu yolu" (recordTransaction) sağlam; ama etrafındaki **bypass'lar** (Kai ham SQL, legacy `users.balance`, idempotency'siz callback'ler, EUR-hardcoded iadeler) sistemi tek-kaynak olmaktan çıkarıyor. Düzeltme yönü net: **tek yazıcı + tek okuma kuralı + periyodik mutabakat (reconciliation).**

---

## Öncelikli Yol Haritası (fix sırası)

**P0 — Bu hafta (para kaybı / kötüye kullanım):**
1. Webhook imza doğrulaması ekle (`paymentWebhooks.js` — `WebhookSignatureError` tanımlı ama hiç fırlatılmıyor).
2. `/wallet/deposit`: `autoComplete` varsayılanı `false`, sadece güvenilir gateway sinyaliyle `true`; `manual`/`crypto`'yu admin'e kilitle.
3. Iyzico callback'lerinde (`server.js`) cüzdan düşümünü **atomik `UPDATE ... WHERE payment_status='pending_payment' RETURNING` başarılı olduktan SONRA** ve `FOR UPDATE` ile yap.
4. `agent.js` Kai ham SQL düşümünü `recordTransaction`'a taşı (kilit + currency + delta + snapshot).

**P1 — Bu ay (tutarlılık):**
5. `recordTransaction`'a zorunlu `idempotencyKey` + `wallet_transactions`'ta unique index.
6. Tüm iade yollarında **para birimi simetrisi** (charge currency = refund currency): rentals, bookings delete, shopOrders, memberOfferings, accommodation.
7. Accommodation: kilitlenen fonu **capture** et (şu an `pending`'de sonsuza dek asılı kalıyor).
8. `studentPortalService.js` self-cancel **çift kredisini** düzelt (hem `users.balance` hem wallet'a yazıyor).
9. Hybrid booking iadesini sadece **cüzdandan düşen porsiyon** kadar yap.

**P2 — Yapısal (tek kaynak):**
10. `users.balance`/`total_spent` legacy kolonlarını emekliye ayır (hiçbir yerde okuma).
11. **Reconciliation job:** `SUM(delta WHERE completed) == wallet_balances` her (user, currency) için doğrula, sapmada sustur değil **alarm ver**.
12. Para matematiğini Decimal.js'e geçir (`toNumeric` float + NaN→0 yutuyor); frontend `formatCurrency` `Math.round`'u bırak (kuruşları siliyor).
13. `availableDelta`'yı `recordTransaction`'da zorunlu yap; `recordLegacyTransaction` hesaplayıp ilet; DB CHECK ekle.

---

## Doğrulanmış Bulgular (kategori bazında)

> Her bulgu: **[Risk] Dosya:Satır** · Problem · Öneri. Konumlar verifier tarafından (gerekirse düzeltilerek) onaylandı.


### 1. Veri Tipi Uyumsuzlukları (decimal vs float)  (5 doğrulanmış)

**[`Orta`] `backend/services/walletService.js:53-59`**  
- **Problem:** toNumeric — the single money primitive used for EVERY balance/delta/amount — does float math (Number.parseFloat + .toFixed(4)) instead of Decimal.js, and silently coerces NaN to 0. A malformed/NaN amount is swallowed into a 0-value transaction rather than throwing, and all read-modify-write balance arithmetic (currentAvailable + delta) accumulates float rounding error. Directly violates CLAUDE.md 'never use floating point for money'.  
- **Öneri:** Use Decimal.js (new Decimal(value)) for all amount math and throw (not return 0) on a non-finite input.

**[`Orta`] `src/shared/contexts/CurrencyContext.jsx:168-170`**  
- **Problem:** formatCurrency rounds money to a whole integer for display: `parseFloat(amount) || 0` then `Math.round(numAmount).toLocaleString('en-US')`. All fractional cents are dropped — €1.50 shows as €2, €1.49 as €1 — and there are no decimal places ever. Used by StudentWalletModal/WalletDepositModal for wallet balances stored as NUMERIC(18,4).  
- **Öneri:** Format with Intl.NumberFormat at 2 fraction digits instead of Math.round to integer.

**[`Düşük`] `backend/routes/finances.js:397-405`**  
- **Problem:** Multi-currency balance aggregation to EUR uses float division with a silent data-loss branch: `const rate = parseFloat(w.exchange_rate || 0); if (rate > 0) totalEur += avail / rate;`. If a currency's exchange_rate is NULL/0/missing, that entire non-EUR balance is silently dropped from the reported EUR total (no error), under-reporting the user's balance. Then Math.round(totalEur*100)/100 truncates to 2-dp via float.  
- **Öneri:** Fail loudly (or fetch a guaranteed rate) when exchange_rate is missing instead of dropping the row; use Decimal for the sum.

**[`Düşük`] `backend/routes/finances.js:3225`**  
- **Problem:** Wallet-deposits admin stats convert every row to EUR with `(wt.amount / COALESCE(cs.exchange_rate, 1))`. When a row's currency has no active currency_settings join (rate NULL), COALESCE substitutes 1, so e.g. a 1000 TRY deposit is counted as 1000 EUR. Foreign-currency rows with a missing rate are silently mis-valued ~40x, inflating totalAmount/avgAmount.  
- **Öneri:** Exclude rows with no rate or LEFT JOIN to a fallback rate table; never default a foreign exchange_rate to 1.

**[`Düşük`] `src/features/customers/components/UserBalances.jsx:143`**  
- **Problem:** Account balance is read with raw float coercion `parseFloat(studentAccount.balance)` (no Decimal), and `studentAccount` is an undefined identifier (the state variable is userAccount), so totalBalance is always 0 / throws. Even if the var were fixed, the parseFloat float path is used for further reduce() sums of money (lines 146-149) on NUMERIC values.  
- **Öneri:** Reference the correct state var and use Decimal for the balance/outstanding sums.


### 2. Negatif Bakiye Kontrolü  (5 doğrulanmış)

**[`Yüksek`] `backend/services/walletService.js:1351`**  
- **Problem:** Overdraft izni icin DB guard trigger'ini susturan set_config SESSION kapsaminda set edilir (is_local=false) ve hicbir yerde RESET edilmez (dosyada tek geçen yer). recordTransaction sonunda client.release() (1483) baglantiyi havuza iade eder ama wallet.allow_negative='true' GUC'u bu fiziksel baglantida kalir. Havuzdaki ayni baglantiyi yeniden kullanan, allowNegative=false ile gelen ilgisiz baska bir istek de DB negatif-bakiye guard'i devre disi halde calisir — koruma sessizce kapanir.  
- **Öneri:** is_local=true kullan (transaction-local, COMMIT/ROLLBACK ile otomatik temizlenir), 258. migrasyondaki dogru kullanimla ayni yap.

**[`Yüksek`] `backend/db/migrations/193_fix_wallet_guard_trigger.sql:9-20`**  
- **Problem:** Negatif bakiyeyi engelleyen TEK DB savunmasi bu BEFORE UPDATE trigger'idir; (a) yalnizca available_amount'u korur — pending_amount ve non_withdrawable_amount DB seviyesinde korumasiz, (b) yalnizca UPDATE'te calisir — wallet_balances'a negatif available_amount ile INSERT (ornegin ensureBalance veya quickLinksService ham insert'leri) guard'i tamamen baypas eder, (c) current_setting('wallet.allow_negative')='true' ile escape edilebilen honor-system, gercek CHECK constraint degil. Tum wallet tablolarinda negatif bakiyeyi garanti eden CHECK constraint hic yok.  
- **Öneri:** Negatif available'i tasarimca isteyen overdraft modeli icin trigger'i koru ama INSERT'i de kapsayacak BEFORE INSERT OR UPDATE yap ve overdraft_limit alt sinirini trigger icinde zorla.

**[`Orta`] `backend/services/walletService.js:1337`**  
- **Problem:** Uygulama seviyesindeki negatif kontrolu 'if (!allowNegative && nextAvailable < -0.0001) throw' seklindedir; allowNegative=true oldugunda hicbir ALT SINIR (overdraft_limit / min_balance) uygulanmaz. 031 migrasyonu overdrafta izin verir ama ne sema ne uygulama tarafinda sayisal bir taban vardir — overdraft bir kez acildiginda eksi sonsuza dek sinirsizdir; sinir yalnizca cagiranin allowNegative bayragidir.  
- **Öneri:** wallet_settings'e overdraft_limit ekle ve allowNegative=true yolunda nextAvailable < -overdraftLimit ise yine throw et.

**[`Orta`] `backend/routes/bookings.js:1579-1583`**  
- **Problem:** Negatif-bakiye override rolu cok genistir: instructor, front_desk, receptionist gibi tum staff rolleri + trusted_customer otomatik allowNegativeBalance=true alir. Bir egitmen/resepsiyon bir musteri adina rezervasyon yaparken, musterinin bakiyesi yetersiz olsa bile islem alt sinir olmadan negatife gider. allowNegative recordTransaction'a 2170/2199'da geçer.  
- **Öneri:** Instructor/receptionist icin override'i kaldir veya sayisal overdraft_limit ile sinirla; en azindan trusted_customer disindaki rollerde tabani zorla.

**[`Orta`] `backend/routes/rentals.js:428-430`**  
- **Problem:** Kiralama yolunda allowNegativeBalance override'i admin/manager/owner/front_desk/receptionist'i kapsar (yorumda 'önceden front_desk/receptionist hariçti, simdi eklendi' deniyor). Bu rollerde overdraft alt sinir olmadan acilir. Ayrica EUR yetersizse baska para birimine gecip Math.round(priceInWalletCurrency*100)/100 (670) ile yuvarlanan tutari borclandirir; cevrim+yuvarlama overdraft hesabini bozabilir.  
- **Öneri:** Override rol setini daralt veya overdraft_limit uygula; cevrim yuvarlama hatasini Decimal.js ile gider.


### 3. Race Condition / Concurrency  (7 doğrulanmış)

**[`Kritik`] `backend/server.js:554-637`**  
- **Problem:** Deferred shop-order wallet deduction in the Iyzico callback debits the wallet BEFORE the double-processing guard. The order is read with a plain non-locked SELECT (554), the idempotency check `order.payment_status === 'completed'` (577) reads that stale value, the wallet debits are executed via independent auto-committing recordTransaction calls (595-607, no shared client, no FOR UPDATE on the order), and only AFTER that does the 'atomic' guard `UPDATE ... WHERE payment_status='pending_payment'` (631-634) run. Two concurrent callbacks for the same token (Iyzico server webhook + browser return, or a gateway retry) both pass the 577 check, both commit the wallet deductions, then one loses the 631 race — but the money was already debited twice. wallet_transactions has no unique/dedupe constraint, so the second debit is permanent.  
- **Öneri:** Wrap the whole callback order-handling in one transaction; do `SELECT ... FOR UPDATE` on shop_orders by id and re-check payment_status='pending_payment' BEFORE running the deductions, and apply the deductions + status flip + wallet_deduction_data=NULL atomically in that same client.

**[`Yüksek`] `backend/routes/agent.js:862-927`**  
- **Problem:** Kai chatbot booking debits the wallet with raw SQL bypassing walletService. Balance is read with an UNLOCKED `SELECT available_amount ... ORDER BY available_amount DESC LIMIT 1` (862), the sufficiency check `balance < amount` (873) uses that pre-read value, and the actual debit `UPDATE wallet_balances SET available_amount = available_amount - $1 WHERE user_id = $2` (924) runs later with NO FOR UPDATE taken at check time, NO currency filter (it decrements EVERY currency row for the user — EUR, TRY, USD), and the INSERT hardcodes currency 'EUR' (919). Two concurrent Kai bookings can both pass the same stale balance check and both debit; the only thing preventing a stored negative is the migration-193 DB trigger, which this raw path never disarms — so it raises a hard 23514 inside COMMIT and rolls back the booking instead of returning the intended 400.  
- **Öneri:** Replace the raw read+UPDATE with a single recordTransaction({client, userId, amount:-amount, currency, allowNegative:studentIsTrusted, transactionType:'booking_charge', relatedEntityType:'booking', relatedEntityId:bookingId}) call so it inherits the FOR UPDATE lock, per-currency targeting, and graceful insufficient-balance error.

**[`Yüksek`] `backend/routes/bookings.js:2255 / 2526-2566`**  
- **Problem:** Atomicity hole that becomes a permanent orphan debit: the wallet debit is committed at client COMMIT (2255), then the card portion is initiated via Iyzico (2526). If initiateDeposit throws (2557), the handler only marks the booking payment_status='failed' via a fresh pool.query (2563) and returns 500 — the already-committed wallet debit is NEVER reversed. A retry then debits the wallet again (no idempotency on the ledger), compounding the orphan.  
- **Öneri:** Defer the wallet debit until after a successful gateway init, or on Iyzico-init failure issue a compensating recordTransaction credit (refund) for hybridWalletDeducted before returning 500.

**[`Yüksek`] `backend/services/walletService.js:1351`**  
- **Problem:** The overdraft DB-guard disarm is SESSION-scoped, not transaction-local, creating a cross-request concurrency leak. When an overdraft is permitted, recordTransaction runs `set_config('wallet.allow_negative','true', false)` with is_local=false, so the flag persists on the pooled connection after COMMIT. A subsequent unrelated request that reuses the same physical pool connection runs with the negative-balance trigger silently disarmed, removing the last DB-level backstop against negative balances for races on other code paths (e.g. the raw agent.js debit) that happen to land on that connection.  
- **Öneri:** Use is_local=true (set_config('wallet.allow_negative','true', true)) so the override is scoped to the current transaction only, matching the correct usage in migration 258.

**[`Orta`] `backend/services/walletService.js:1223-1459`**  
- **Problem:** recordTransaction, the single ledger mutator that every charge path funnels through, has no idempotency key or dedupe. wallet_transactions has no unique constraint on (booking_id/related_entity_id, transaction_type) (confirmed across all migrations), so a retried/duplicated HTTP request or a duplicated gateway callback that calls recordTransaction twice debits the wallet twice. This is the enabling condition that turns every check-then-act and callback race above into a permanent double-debit rather than a recoverable one.  
- **Öneri:** Add an idempotencyKey param persisted to a unique index on wallet_transactions (e.g. UNIQUE(related_entity_type, related_entity_id, transaction_type) or a dedicated idempotency_key column) and short-circuit on conflict.

**[`Düşük`] `backend/services/groupBookingService.js:851-871`**  
- **Problem:** Group-booking participant charge does a non-locked balance read (`SELECT available_amount FROM wallet_balances WHERE user_id=$1 AND currency=$2`, no FOR UPDATE) to decide whether to debit in the payment currency or convert to the user's wallet currency (863). The decision is check-then-act against an unlocked value; the actual debit recordTransaction (874) locks the chosen row, so with the default allowNegative=false a real overdraw is prevented, but the convert-or-not branch can be chosen on a stale balance, charging the wrong currency or unnecessarily converting.  
- **Öneri:** Add FOR UPDATE to the balance read at 851 (it already uses the shared client) so the convert/no-convert decision is made under the lock that the subsequent debit relies on.

**[`Düşük`] `backend/routes/finances.js:1113-1142`**  
- **Problem:** Admin DELETE /transactions/:id recomputes wallet_balances from a ledger SUM via INSERT ... ON CONFLICT DO UPDATE without first taking SELECT ... wallet_balances ... FOR UPDATE. This recompute path uses a different consistency model (ledger-SUM overwrite) than recordTransaction (FOR-UPDATE'd read-modify-write). The single-statement ON CONFLICT does row-lock the target at write time so concurrent recomputes serialize, but the recompute does not participate in the same lock acquisition ordering as concurrent charges, so the recomputed absolute balance reflects only ledger rows committed at the statement snapshot — combined with the EUR-only legacy users.balance reset (1154) and zero-reset branch (1145), an interleaved charge/recompute can leave the live balance transiently inconsistent until the next recompute.  
- **Öneri:** Acquire SELECT id FROM wallet_balances WHERE user_id=$1 AND currency=$2 FOR UPDATE on the same client before the recompute so it orders against in-flight recordTransaction charges.


### 4. Çift Ödeme / Idempotency  (8 doğrulanmış)

**[`Kritik`] `backend/routes/paymentWebhooks.js:45-88`**  
- **Problem:** No webhook signature verification. buildContext reads req.headers['x-signature'] (55) but it is never validated; WebhookSignatureError is defined in paymentGatewayWebhookService.js:12 yet NEVER thrown anywhere. The /iyzico, /paytr, /binance-pay routes hand the raw payload straight to handlers that will approveDepositRequest/rejectDepositRequest. A forged POST with a guessed/known deposit reference can auto-approve a deposit (credit a wallet) or auto-reject a legitimate one.  
- **Öneri:** Verify each provider's HMAC/signature against the raw body before processing (throw WebhookSignatureError on mismatch); reject unsigned requests in production.

**[`Yüksek`] `backend/server.js:573-637`**  
- **Problem:** Iyzico callback debits the wallet for a shop order (recordWalletTx loop) BEFORE the atomic 'WHERE payment_status = pending_payment' guard runs. The idempotency check at line 577 is a non-atomic read of a value fetched at line 554/574. Two concurrent or duplicated callbacks (Iyzico retries on slow 3xx, plus user multi-tab) both pass the 577 check, both execute the wallet deduction loop at 596, and only the loser is caught at the atomic UPDATE (634) — but BOTH already debited the wallet. Double wallet debit for the hybrid wallet portion.  
- **Öneri:** Move the deduction loop AFTER the atomic 'UPDATE ... WHERE payment_status = pending_payment RETURNING id' succeeds (rowCount=1), and run the debit + status flip in one DB transaction keyed on order id.

**[`Yüksek`] `backend/routes/bookings.js:2255-2566`**  
- **Problem:** Hybrid wallet+card booking COMMITS the wallet debit (recordWalletTransaction at 2159, committed at 2255), THEN initiates Iyzico at 2526. On Iyzico init failure the booking is marked payment_status='failed' (2563-2566) but the already-committed wallet debit is never reversed → orphan wallet debit with no lesson. Additionally the only 'key' is referenceCode `BKG-${booking.id}` (2530), derived from the freshly inserted booking row, so a user retry creates a NEW booking + NEW wallet debit each attempt — no idempotency on user intent.  
- **Öneri:** Either defer the wallet debit until after Iyzico init succeeds, or on the catch at 2557 reverse the committed wallet debit; and dedupe booking creation by a client-supplied idempotency key, not the new booking id.

**[`Yüksek`] `backend/routes/agent.js:862-928`**  
- **Problem:** Kai chatbot booking debits the wallet with raw SQL and ZERO idempotency. It reads balance with 'ORDER BY available_amount DESC LIMIT 1' (no FOR UPDATE) at 862, then INSERTs a hardcoded-EUR wallet_transactions row (916) and 'UPDATE wallet_balances SET available_amount = available_amount - $1 WHERE user_id=$2' with NO currency filter (924). There is no idempotency key on the agent request, so an n8n/Kai retry of the same intent creates a new booking row and a new debit each time; the check-then-act balance read is also unlocked (race).  
- **Öneri:** Route the debit through walletService.recordTransaction (FOR UPDATE, balance_after snapshot, currency-matched) and require an idempotency key on the agent booking endpoint to dedupe retries.

**[`Yüksek`] `backend/services/walletService.js:2618-2633`**  
- **Problem:** createDepositRequest's idempotency is application-level only: it does SELECT id,status FROM wallet_deposit_requests WHERE user_id=$1 AND reference_code=$2 FOR UPDATE then throws if an existing row is pending/processing/completed. But reference_code has NO DB unique index (migration 025 declares it VARCHAR(100) with no UNIQUE), so on the FIRST concurrent insert of a brand-new reference_code the FOR UPDATE locks ZERO rows and both transactions pass the check and both INSERT → duplicate deposit requests (and, once approved, double credit). The accepted idempotencyKey param (2563) is never used for dedupe at all.  
- **Öneri:** Add UNIQUE (user_id, reference_code) (partial WHERE reference_code IS NOT NULL) to wallet_deposit_requests and rely on ON CONFLICT instead of the racey SELECT...FOR UPDATE; or actually enforce idempotencyKey.

**[`Orta`] `backend/server.js:877-913`**  
- **Problem:** Iyzico callback membership branch flips member_purchases to completed with a NON-atomic 'UPDATE ... WHERE id=$1' (no WHERE payment_status guard), then records a credit (895) AND a debit (905) via raw recordTransaction. The only idempotency is the read at 875/878. Two concurrent callbacks both read payment_status!=completed, both run the unguarded UPDATE, and both write the credit+debit pair → membership charged (and credited) twice.  
- **Öneri:** Make the status flip atomic ('UPDATE member_purchases SET payment_status=completed WHERE id=$1 AND payment_status NOT IN (completed,paid) RETURNING id') and only run the wallet credit/debit when rowCount=1.

**[`Orta`] `backend/services/walletService.js:1227-1257`**  
- **Problem:** The core ledger writer recordTransaction accepts NO idempotencyKey/dedupe parameter, and wallet_transactions has no unique constraint backing any reference column (confirmed: migrations 024/030 add booking_id/rental_id/reference_number indexes but none UNIQUE). Calling it twice debits/credits twice. Every charge caller (bookings, rentals, shop, accommodation, membership, group) therefore must self-dedupe — and the audit shows none of the charge paths do.  
- **Öneri:** Add an optional idempotencyKey to recordTransaction backed by a UNIQUE partial index on wallet_transactions(metadata->>'idempotencyKey') or a dedicated column, and INSERT ... ON CONFLICT DO NOTHING returning the prior row.

**[`Düşük`] `backend/routes/bookings.js:4732`**  
- **Problem:** The reschedule-by-admin notification dispatch builds idempotencyKey = `reschedule-by-admin:${updatedBooking.id}:${Date.now()}`, appending a wall-clock timestamp. dispatchNotification dedupes via insertNotification's ON CONFLICT (idempotency_key) DO NOTHING (notificationWriter.js:16). Because Date.now() makes every retry/duplicate produce a unique key, the idempotency guard is fully defeated — a retried reschedule (or duplicate request) emits duplicate in-app + Telegram notifications. Not a money double-debit, but a real idempotency-defeating pattern in this category.  
- **Öneri:** Use a stable key tied to the reschedule event, e.g. `reschedule-by-admin:${updatedBooking.id}:${newDate}:${newStartHour}`, dropping Date.now().


### 5. Audit Log Boşlukları  (8 doğrulanmış)

**[`Kritik`] `backend/routes/agent.js:916-921`**  
- **Problem:** Kai chatbot booking writes a wallet_transactions ledger row that OMITS available_delta, pending_delta, balance_available_after/balance_pending_after/balance_non_withdrawable_after snapshots, and created_by (actor). The INSERT column list is only (user_id, booking_id, amount, currency, direction, transaction_type, description, created_at). available_delta defaults to 0 (migration 024:33 'available_delta NUMERIC(18,4) NOT NULL DEFAULT 0'), so the ledger records a debit whose delta is ZERO and whose post-balance snapshot is NULL. This is an unauditable, non-reconstructable ledger entry that breaks the invariant available_amount = SUM(available_delta WHERE status='completed').  
- **Öneri:** Route this debit through walletService.recordTransaction (pass availableDelta=-amount, createdBy=userId) instead of raw INSERT, so deltas, balance_after snapshots and actor are written.

**[`Kritik`] `backend/routes/agent.js:914-928`**  
- **Problem:** Because the agent debit's ledger row carries available_delta=0 (defaulted), it is INVISIBLE to every downstream SUM(available_delta) reconciliation. finances.js recompute (lines 1129-1131 and 1216-1227) rebuilds wallet_balances.available_amount = SUM(available_delta WHERE status='completed'); a Kai-debited user who later has any admin recompute or a single transaction deletion will have the chatbot debit silently reversed (money returned) because the ledger sum does not include it. The audit trail and the cached balance permanently disagree.  
- **Öneri:** Same fix as above (write proper deltas) — this is the concrete financial-loss consequence of the missing delta, so it must record availableDelta so recomputes preserve the debit.

**[`Yüksek`] `backend/routes/agent.js:924-926`**  
- **Problem:** The balance mutation for the Kai booking is a raw 'UPDATE wallet_balances SET available_amount = available_amount - $1 WHERE user_id = $2' with NO currency filter, while the paired ledger INSERT hardcodes currency='EUR' (line 919). On a multi-currency user the UPDATE subtracts from whatever single row collides (or fails to target the EUR row deterministically), so the mutated balance row and the audit row's stated currency can refer to different wallet rows — the ledger does not describe the row that actually changed. No FOR UPDATE lock and no balance_after snapshot means the audit trail cannot prove which row moved or to what value.  
- **Öneri:** Add 'AND currency = $3' bound to 'EUR' (matching the ledger) or use recordTransaction which locks and snapshots the exact (user_id,currency) row.

**[`Yüksek`] `backend/routes/finances.js:1102-1104`**  
- **Problem:** hardDelete mode physically DELETEs a wallet_transactions row ('DELETE FROM wallet_transactions WHERE id = $1') with no reversal/adjustment ledger entry written. The balance is then recomputed from the remaining rows, but the deleted row leaves zero audit trace — there is no record that money/history was removed, only a logger.info side note. An append-only ledger is destroyed in place.  
- **Öneri:** Instead of physical DELETE, write a compensating reversal ledger row (status='cancelled' marker + reversal entry) or at minimum insert a wallet_audit_logs entry capturing the deleted row snapshot and actor before deletion.

**[`Yüksek`] `backend/routes/rentals.js:1279-1293`**  
- **Problem:** Rental cancel refund records the credit via recordLegacyTransaction with no currency argument, so it falls back to DEFAULT_CURRENCY (EUR). But the original rental charge (rentals.js multi-currency loop ~657-683) may have debited a non-EUR wallet (e.g. TRY). The refund therefore credits a DIFFERENT currency row than was charged — the refund ledger is not symmetric with the charge ledger, so the audit trail shows an EUR credit with no matching EUR debit and the actually-charged TRY balance is never restored.  
- **Öneri:** Persist the charged currency on the rental (or read it back from the original charge ledger row) and pass that currency to the refund recordLegacyTransaction so debit/credit are symmetric.

**[`Orta`] `backend/routes/agent.js:916-921`**  
- **Problem:** No actor/created_by is recorded on the wallet_transactions row for the chatbot debit even though the acting admin/operator (userId) is in scope and IS passed to bookings.created_by at line 907 and to logAuditEvent at line 947. The wallet ledger row has a NULL created_by, so the financial mutation cannot be attributed to the operator who triggered Kai.  
- **Öneri:** Add created_by to the INSERT (value userId) so the wallet ledger row is attributable, matching how bookings.created_by and logAuditEvent.actorUserId already use userId.

**[`Orta`] `backend/routes/finances.js:1481-1492`**  
- **Problem:** Admin balance reset DELETEs ALL wallet_transactions for the user across every currency ('DELETE FROM wallet_transactions WHERE user_id = $1') and zeroes wallet_balances, then optionally writes a single balance_adjustment row. The entire prior ledger is wiped with no preserved audit copy in the wallet tables; only a logger.warn captures previousBalances. The complete transaction history (every prior debit/credit/refund) is irrecoverably destroyed, defeating any later reconciliation or dispute.  
- **Öneri:** Archive deleted rows (e.g. copy into a wallet_transactions_archive or wallet_audit_logs payload) before the bulk DELETE, or soft-cancel rows (status='cancelled') instead of deleting.

**[`Orta`] `backend/routes/finances.js:1184-1231`**  
- **Problem:** On non-hardDelete transaction deletion the code writes a reversal via recordWalletTransaction AND then forcibly re-derives wallet_balances from SUM(completed deltas) — but to do so it runs SELECT set_config('wallet.allow_negative','true', false) with is_local=false (SESSION scope, line 1212). On a pooled connection this flag stays true for the life of the physical connection, silently disarming the negative-balance guard trigger for later unrelated requests that reuse the same connection. The override is applied without any wallet_audit_logs entry, so the guard-disarm is itself unaudited.  
- **Öneri:** Use is_local=true so the GUC is transaction-scoped (as migration 258 does), or explicitly reset it to 'false' before COMMIT, and log the override.


### 6. Frontend / Backend Tutarsızlıkları  (4 doğrulanmış)

**[`Orta`] `src/shared/contexts/CurrencyContext.jsx:165-171`**  
- **Problem:** CurrencyContext.formatCurrency ALWAYS rounds to a whole integer via Math.round(numAmount), dropping all cents — €1.50 renders as '€2', €1.49 as '€1'. StudentWalletModal and WalletDepositModal use this formatter, so wallet balances and transaction amounts visibly lose/round the fractional part the backend stores as NUMERIC(18,4). A second formatter (shared/utils/formatters.js:16-19) shows conditional 2-decimals, so the same value formats differently depending on which import a component uses.  
- **Öneri:** Make CurrencyContext.formatCurrency honor decimal_places (2dp) like formatters.js; do not Math.round money to integer.

**[`Düşük`] `src/features/customers/components/UserBalances.jsx:143, 158, 295`**  
- **Problem:** Component references an undeclared identifier `studentAccount` (the actual state variable is `userAccount`, declared line 9). At lines 143 and 295 `studentAccount.balance` is read and at 158 it is in a useMemo dependency array — this throws a ReferenceError on render, so the Total Balance card and the per-row Balance column crash / never show a real value.  
- **Öneri:** Replace `studentAccount` with `userAccount` in all three places.

**[`Düşük`] `src/features/customers/components/UserBalances.jsx:44-45`**  
- **Problem:** Reads response.data.account and response.data.transactions, but /finances/accounts/:id returns a FLAT body (finances.js builds responseBody with top-level `balance`/`total_spent` and res.json(responseBody) at line 476) with NO `.account` wrapper and NO `.transactions` key. So userAccount is set to undefined and transactions to [] — even if the studentAccount crash were fixed, the balance would always read as 0 and no transactions would load.  
- **Öneri:** Read the flat fields directly: setUserAccount(response.data); and fetch transactions from the proper transactions endpoint.

**[`Düşük`] `src/features/students/components/StudentWalletModal.jsx:84-88, 176`**  
- **Problem:** The student wallet modal headline shows available+pending (totalBalance) labeled 'Total Balance' when pending>0, whereas the dashboard pill (StatsStrip) and /finances/accounts/:id `balance` show available ONLY. Same user sees one 'balance' on the dashboard and a larger one in the modal headline — three different balance definitions across views.  
- **Öneri:** Standardize the headline 'balance' to available across all surfaces; show pending separately and consistently.


### 7. Para Birimi Uyumsuzlukları  (7 doğrulanmış)

**[`Kritik`] `backend/routes/agent.js:914-927`**  
- **Problem:** Kai bot raw SQL hardcodes EUR and UPDATEs wallet_balances with no currency filter (debits wrong/multiple rows); pre-read picks highest-balance row regardless of currency.  
- **Öneri:** Use recordTransaction with currency; add AND currency to the UPDATE.

**[`Yüksek`] `backend/routes/rentals.js:657-680, 1279`**  
- **Problem:** Charge debits TRY/USD wallet but refund passes no currency, defaulting to EUR; TRY-charged rental refunded to EUR wallet.  
- **Öneri:** Pass the original charge currency to the refund.

**[`Yüksek`] `backend/routes/finances.js:2134-2144`**  
- **Problem:** Revenue summary sums amount across EUR/TRY/USD without converting; raw TRY added to EUR revenue inflates it.  
- **Öneri:** Divide amount by exchange_rate to normalize to EUR.

**[`Orta`] `backend/routes/finances.js:2183-2199`**  
- **Problem:** Outstanding-balances sums available_amount by user_id but rows are per-currency, so EUR+TRY add unconverted (50+1500=1550), corrupting credit/debt totals.  
- **Öneri:** Convert to EUR before summing or filter currency=EUR.

**[`Orta`] `backend/routes/accommodation.js:613, 629`**  
- **Problem:** Wallet payment hardcodes EUR; reads/locks only the EUR row, so TRY/USD-only guests are told insufficient or driven negative.  
- **Öneri:** Honor the guest preferred_currency/multi-currency balance.

**[`Düşük`] `src/shared/components/wallet/WalletModalManager.jsx:82-122`**  
- **Problem:** Balance double-converted: each row to EUR (ceil) then EUR to display (ceil), ignoring backend EUR available; compounding rounding skews the total.  
- **Öneri:** Use backend EUR available or convert once.

**[`Düşük`] `src/shared/contexts/CurrencyContext.jsx:165-171`**  
- **Problem:** formatCurrency Math.rounds to integer, dropping cents (1.50->2, 1.49->1); conflicts with formatters.js formatCurrency.  
- **Öneri:** Use Intl.NumberFormat with 2 decimals; consolidate.


### 8. Yetkilendirme Eksikleri  (4 doğrulanmış)

**[`Kritik`] `backend/services/walletService.js:2680-2853`**  
- **Problem:** The wallet deposit route in wallet.js around line 295 has no role gate and passes the user controlled method and autoComplete flag straight to createDepositRequest. For method manual or crypto the resolved gateway is null so no branch resets the autoComplete flag, the user supplied true value survives, and recordTransaction writes a completed wallet credit. Any authenticated user can top up their own wallet with no real payment or admin approval. The valid deposit methods set includes manual and crypto.  
- **Öneri:** Default the autoComplete flag to false, set it true only from the trusted gateway signal, and restrict manual and crypto methods plus autoComplete to admin or manager roles.

**[`Yüksek`] `backend/middlewares/authenticateAgent.js:11-49`**  
- **Problem:** The Kai agent API has only one auth layer which is the shared KAI_AGENT_SECRET. The userId and role come entirely from the request headers x-requesting-user-id and x-requesting-user-role. The verifyAgentIdentity middleware only confirms the claimed role matches that userId stored role, not that the request actually comes from that user, so anyone holding the secret can set the header to any user including an admin and perform role gated operations including wallet debits.  
- **Öneri:** Bind the user identity to a user specific short lived signed token that n8n cannot forge, or tie sensitive mutations to the caller original session.

**[`Orta`] `backend/routes/agent.js:773-928`**  
- **Problem:** In the Kai bookings route for management roles the studentUserId comes from the request body customerId or studentId field, and a wallet payment debits that arbitrary user via raw SQL bypassing the wallet service. The insert hardcodes EUR, the update on wallet_balances filtered only by user_id has no currency filter so it hits the wrong row for multi currency users, there is no FOR UPDATE lock, no balance after snapshot, and no negative balance guard.  
- **Öneri:** Route the debit through walletService recordTransaction in a single transaction with explicit ownership and currency resolution checks instead of raw SQL.

**[`Düşük`] `backend/routes/agent.js:862-873`**  
- **Problem:** The Kai wallet payment pre check reads the balance ordering by available_amount descending and taking the top row, which can be the wrong currency row, and this read is unlocked and separate from the later debit write, creating a check then act race and a wrong wallet debit risk.  
- **Öneri:** Read and debit the balance inside one FOR UPDATE transaction against the correct currency row via the wallet service.


### 9. Single Source of Truth (kesişen kategori)  (11 doğrulanmış)

**[`Yüksek`] `backend/routes/agent.js:863 / 919 / 924`**  
- **Problem:** Currency divergence in the same raw debit: the pre-read picks one row via `ORDER BY available_amount DESC LIMIT 1` (no currency filter), the ledger INSERT hardcodes currency 'EUR', and the cache UPDATE has NO currency filter at all (`WHERE user_id = $2`). On a multi-currency user this reads the highest-balance row (e.g. TRY), records the ledger entry as EUR, and the unfiltered UPDATE decrements whichever wallet_balances row(s) match user_id — three different notions of which currency was charged.  
- **Öneri:** Resolve a single explicit currency for the user, filter the SELECT, INSERT, and UPDATE all by (user_id, currency), and take a FOR UPDATE lock (or delegate to recordTransaction which does this).

**[`Yüksek`] `backend/services/walletService.js:950-977 / 1591-1594`**  
- **Problem:** The authoritative balance read trusts the cached wallet_balances row and never re-sums the ledger — calculateAvailableBalance is named as if it derives from transactions but just returns getBalance().available (the stored cache). So any writer that mutates the cache without a matching ledger delta (agent.js raw SQL) is invisible to reads: the cache stays authoritative and silently diverges from the ledger with no detection.  
- **Öneri:** Add a periodic reconciliation job (or a CHECK on read) asserting available_amount == SUM(available_delta WHERE status='completed') per (user_id,currency), and alert/repair on mismatch.

**[`Yüksek`] `backend/routes/finances.js:1205-1229`**  
- **Problem:** In-code incident evidence that the cache (wallet_balances) drifts from the ledger SUM: the comment documents 'incident 2026-05-30, Rifat Doğan, -120€ booking shown as -260€' caused by the cancel+reversal pair double-decrementing the cache, and the handler reactively re-derives available/pending/non_withdrawable from SUM(*_delta WHERE status='completed'). This proves the cache is NOT a reliable single source of truth and is only opportunistically reconciled when this specific delete path runs.  
- **Öneri:** Centralize all reversal/cancel logic so the cache can never double-decrement, and run the SUM-from-ledger re-derive as a scheduled invariant check, not only inside the delete handler.

**[`Yüksek`] `backend/services/walletService.js:1195-1221`**  
- **Problem:** mirrorLegacyBalance writes a THIRD copy of the balance into users.balance and an independently-accumulated users.total_spent, but only when WALLET_ENABLE_LEGACY_MIRROR==='true', only for EUR, and best-effort (try/catch warn, no rollback). So users.balance reflects only EUR wallet activity, never TRY/USD, drifts whenever the flag is off or any raw-SQL writer (agent.js, finances upserts) bypasses recordTransaction, and total_spent is a separate running delta unrelated to the ledger SUM. Yet downstream code (users.js, finances.js) still reads users.balance as a fallback.  
- **Öneri:** Either fully decommission users.balance/total_spent (stop reading them anywhere) or make the mirror unconditional + multi-currency-aware and reconciled; a flag-gated EUR-only best-effort mirror that is still read is a guaranteed drift source.

**[`Yüksek`] `backend/services/walletService.js:1492-1593 (recordLegacyTransaction drops availableDelta) + :1304 (recordTransaction default)`**  
- **Problem:** Migration 258 introduces a parallel 'balance concept' — staff salary/commission payouts (manager_payment/instructor_payment) must NOT touch available_amount and must pass availableDelta:0 — but this is enforced ONLY by the four call sites passing the right value. recordLegacyTransaction still defaults available_delta to the full amount, so any future staff-payout caller that forgets availableDelta will silently re-inflate the recipient's wallet balance again. There is no DB constraint or trigger distinguishing payroll from wallet credit.  
- **Öneri:** Add a guard in recordTransaction/recordLegacyTransaction that forces availableDelta=0 when entity_type IN ('manager_payment','instructor_payment'), so the invariant is enforced structurally rather than by convention.

**[`Orta`] `backend/routes/agent.js:916-927`**  
- **Problem:** Kai chatbot booking debits the wallet with RAW SQL, bypassing walletService entirely. The INSERT into wallet_transactions sets only `amount` (no available_delta, no balance_available_after snapshot) so the ledger row records available_delta=0 (DB default), while a SEPARATE raw `UPDATE wallet_balances SET available_amount = available_amount - $1` actually moves the cache. The ledger SUM(available_delta) and the cached available_amount therefore permanently disagree for any user charged via Kai — getWalletAccountSummary's ledgerDebits will undercount this charge forever.  
- **Öneri:** Replace the raw INSERT+UPDATE with a single recordTransaction({userId, amount, availableDelta:-amount, transactionType:'booking_charge', currency, client}) call so deltas + snapshots + the FOR UPDATE lock are written atomically.

**[`Orta`] `backend/routes/users.js:388-401`**  
- **Problem:** A parallel legacy store `users.balance` is still authoritative-by-fallback in the customer-list query: when wallet rows are missing or all-zero it returns `COALESCE(u.balance, 0)` as the displayed balance and even derives payment_status='overdue' from it (line 456). users.balance is only kept in sync by mirrorLegacyBalance, which is flag-gated off by default (LEGACY_MIRROR_ENABLED) and EUR-only — so this fallback can surface a stale/contradictory balance versus the wallet.  
- **Öneri:** Drop the users.balance fallback (or backfill+freeze it) so the customer list reads only wallet_balances; treat a missing wallet row as balance 0, not as a legacy lookup.

**[`Orta`] `backend/routes/finances.js:423-431`**  
- **Problem:** The account-detail endpoint /accounts/:id has the same dual-source behavior: if wallet rows are absent or the aggregate balance is 0 it overrides with legacy `users.balance` (db_balance) and sets walletSummary=null. A user with a genuine 0 wallet but a nonzero stale legacy balance will show the legacy number instead of 0 — two stores, the legacy one wins on the zero edge.  
- **Öneri:** Remove the legacy override on balance===0; a 0 wallet should report 0, and legacy reconciliation should be a one-time migration not a runtime fallback.

**[`Orta`] `backend/services/walletService.js:927-932`**  
- **Problem:** getWalletAccountSummary's totalSpent masks cache/ledger divergence instead of exposing it: resolvedDebits = max(0, netLedgerDebits, derivedDebits - ledgerRefunds) where derivedDebits = totalCredits - available. By blending a ledger-derived figure with a cache-derived figure (totalCredits comes from the ledger, available from the cache), a charge like the agent.js raw debit — which lowers `available` but contributes 0 to ledgerDebits — gets silently re-attributed via derivedDebits, hiding the fact that the two stores disagree.  
- **Öneri:** Compute totalSpent purely from the ledger and emit a warning/metric when (totalCredits - available) diverges from netLedgerDebits, rather than max()-ing them into a single plausible number.

**[`Orta`] `backend/routes/finances.js:1124-1142 / 1211-1229`**  
- **Problem:** finances.js mutates wallet_balances with RAW SQL upserts that recompute the cache from SUM(*_delta) (hardDelete path and the post-reversal re-derive), running these as a separate authoritative writer alongside recordTransaction. Because these recompute from the ledger they actually FIX drift locally, but they prove there is no single writer: the same column is written by recordTransaction (incremental, snapshot-bearing) AND by raw ledger-sum upserts here AND by raw decrements in agent.js — three writers, three different consistency models on one column.  
- **Öneri:** Funnel all cache writes through one service function (e.g. recomputeBalanceFromLedger) so there is exactly one code path that may write wallet_balances, and forbid raw UPDATEs of available_amount elsewhere.

**[`Orta`] `backend/routes/finances.js:1481-1506`**  
- **Problem:** The admin balance-reset endpoint is yet another raw writer: it DELETEs all wallet_transactions, raw-UPDATEs wallet_balances to 0, AND raw-UPDATEs the legacy users.balance to 0 in the same transaction. Resetting BOTH the cache and the legacy mirror here is an implicit admission that users.balance is a live parallel store that would otherwise 'resurface an old debt' (its own comment) — i.e. the two stores are known to disagree and must be hand-synced.  
- **Öneri:** Once users.balance is decommissioned this dual reset disappears; until then, document that ANY balance-mutating path must also clear users.balance, or the legacy fallback will contradict the wallet.


---

## Completeness Critic — Bulguların Kaçırdıkları

This is a significant NEW finding — `studentPortalService.js:1622-1642` double-credits on student self-cancel: it directly UPDATEs the legacy `users.balance` (raw SQL, 1623) AND records a wallet refund via `recordLegacyTransaction` (1628, which credits `wallet_balances.available_amount`). Two separate balance stores both credited for the same refund, with no currency arg (defaults EUR) and no idempotency. I now have thorough, code-verified evidence for all six gap areas. Here is my report.

---

# COMPLETENESS CRITIC REPORT — Wallet Audit Gaps

The 9 finders covered agent.js, the Iyzico callbacks, finances.js, and the core walletService primitives well. They MISSED an entire feature module (`services.js`), the accommodation lock-without-capture model, the deletion cascade, and nearly every refund-currency asymmetry outside rentals. Below are gaps with file:line evidence, risk, and fix.

## 1. n8n integration — CLEARED (no out-of-band write)
`scripts/sync-n8n-workflow.js:44-82` only PUTs/POSTs workflow JSON to `n8n.plannivo.com/api/v1/workflows`; it performs no DB access. `backend/routes/assistant.js:82-93` is a pure HTTP proxy to the n8n webhook (`N8N_ASSISTANT_WEBHOOK_URL`) and returns text only — no wallet mutation. The wallet damage from the Kai path is entirely the n8n workflow calling back into `backend/routes/agent.js` (already covered). No additional unaudited n8n write path exists. **Note:** `assistant.js:34` verifies the JWT but `optionalAuth` lets unauthenticated guests through (`req.user = null` → `userId: 'guest'`); the actual authz hole is in `authenticateAgent.js` (already covered), not here.

## 2. Kai chatbot — only ONE wallet tool (no top-up/refund tool)
Grep of `agent.js` confirms the only wallet-mutating action is the booking debit at 916/924 (already covered). There is no Kai top-up, refund, or package-purchase tool that writes the wallet — so no *new* uncovered Kai action. Worth flagging: the same raw debit is reachable via the management-role branch where `studentUserId` comes from request body (already noted by authz finder).

## 3. WALLET WRITE PATHS NOT IN THE CONFIRMED LIST

- **`backend/routes/services.js:1655` / `:1707` / `:1845` / `:3319`** — An ENTIRE feature module of wallet charges the confirmed list omitted. Package self-purchase debits via `recordLegacyTransaction`. **Risk:** same check-then-act race as agent.js (see #4 below) plus it is a parallel charge surface no finder reviewed. **Fix:** route all charges through a single locked `recordTransaction(client, …, FOR UPDATE)` helper.
- **`backend/routes/services.js:1158-1175`** — Pre-charge balance read is an UNLOCKED `SELECT available_amount FROM wallet_balances` (1158), then an unlocked multi-currency fallback `SELECT … ORDER BY available_amount DESC` (1170-1173) decides which currency to debit. **Risk:** check-then-act race; two concurrent package purchases pass the same stale check; wrong-currency selection on stale data. **Fix:** `SELECT … FOR UPDATE` at check time, in the same tx as the debit.
- **`backend/services/studentPortalService.js:1622-1642`** — Student self-cancel DOUBLE-credits: a raw `UPDATE users SET balance = balance + $1` (1623) AND a `recordLegacyTransaction` credit to `wallet_balances` (1628) for the *same* refund. **Risk:** the refund lands in BOTH the legacy store and the wallet cache → user credited twice wherever `users.balance` is read as fallback (users.js:388, finances.js:423). No currency arg → defaults EUR even for TRY/USD bookings. **Fix:** remove the raw `users.balance` write; let `mirrorLegacyBalance` handle legacy sync (or drop legacy entirely).
- **`backend/routes/memberOfferings.js:239`** — Membership/storage refund branch hardcodes `currency = 'EUR'` while the charge at 222-226 debits `payCurrency` (a converted non-EUR wallet). **Risk:** wrong-currency refund (same class as rentals). **Fix:** refund in the originally-charged currency.
- **`backend/routes/users.js:1012-1014`** — User hard-delete `DELETE FROM wallet_transactions` + `DELETE FROM wallet_balances` + `DELETE FROM wallet_audit_logs` with NO reversal, NO archival, NO settlement of outstanding negative/positive balance. **Risk:** an entire ledger + audit trail destroyed in place; if the user owed money (negative wallet) the debt silently vanishes; if they had a credit, the liability is erased with no record. **Fix:** soft-delete or archive wallet rows to a `*_archive` table before user deletion.
- **`backend/routes/auth.js:699`** and **`backend/services/quickLinksService.js:494`** — CLEARED of the "raw insert" smell: both are idempotent `INSERT … VALUES (…, 0, 0, 0) ON CONFLICT (user_id, currency) DO NOTHING` zero-balance bootstraps. No money moves; safe. (The earlier scout note overstated quickLinksService here.)
- **`backend/services/staffPaymentService.js:111-138`** — CLEARED: cancel/reversal correctly mirrors stored deltas (`-availableDelta`, `-pendingDelta`, `-nonWithdrawableDelta`) and skips when all deltas are zero. Properly symmetric.
- **`backend/routes/wallet.js:1314-1350`** — Iyzico refund uses `recordTransaction` properly and preserves the original currency (1318). Its only weakness is a non-atomic `metadata.refunded` idempotency read (1274) before the write (1334) — a narrow race window allowing double-refund under concurrent admin clicks. **Fix:** `SELECT … FOR UPDATE` the original tx row before the refund-already-done check.

## 4. REFUND / CANCELLATION SYMMETRY — broadly broken (wrong currency, wrong amount, no idempotency)

- **`backend/routes/bookings.js:5500` and `:5687`** — Both booking-delete refund paths call `recordWalletTransaction` with NO `currency` argument → defaults to EUR (`recordTransaction` default at walletService.js:1231). If the original booking debited a TRY/USD wallet, the refund credits the EUR wallet. **Risk:** refund currency ≠ charge currency; charged wallet never restored. **Fix:** pass the booking's charge currency.
- **`backend/routes/bookings.js:5493`** — Refund amount is `balanceRefunded = bookingAmount` (full original price), even for hybrid wallet+card bookings where only part came from the wallet. **Risk:** wallet over-credited by the card-paid portion. **Fix:** refund only the wallet-debited portion (look up the original wallet debit by `relatedEntityId`).
- **No idempotency on booking-delete refund:** `recordTransaction` has no dedupe (already confirmed) and the delete paths don't check for a prior `booking_deleted_refund` row. **Risk:** a retried delete (or the helper-delete at 5500 firing in addition to the main path at 5687) double-credits. **Fix:** `WHERE NOT EXISTS (booking_deleted_refund for this booking)` guard.
- **`backend/routes/shopOrders.js:1197` and `:1431`** — Both shop refund/cancel paths hardcode `currency: 'EUR'` and `amount: order.total_amount`, but the charge debits per-currency from a `walletDeductionPlan` (489-528, can hit TRY/USD wallets). **Risk:** TRY-debited order refunds to EUR wallet at face value (no conversion); also refunds full `total_amount` even when wallet only partially covered it. **Fix:** refund per the recorded `deductedCurrency`/`deductedAmount` in the charge metadata.
- **`backend/routes/rentals.js:1279`** — (confirmed elsewhere) charge currency is `chargeCurrency` (670, can be TRY/USD), refund passes none → EUR. Same asymmetry.
- **`backend/services/customerPackageService.js:280-302`** — CLEARED as the correct reference pattern: refund currency resolves from `deletedPackage.currency` with fallback to user's `preferred_currency`. This is what every other refund path should do.

## 5. ACCOMMODATION: funds LOCKED but NEVER CAPTURED (structural revenue + symmetry defect)

- **`backend/routes/accommodation.js:625-635`** — Wallet bookings call `lockFundsForBooking` (moves money `available → pending`, walletService.js:1616-1617) and immediately set `payment_status = PAID` (635), but **there is no `capture` call anywhere in the codebase** (verified: grep for `reason: 'capture'` / `wallet_capture` returns zero call sites). So accommodation "paid" money sits in `pending_amount` forever — never recognized as spent, still counted toward the guest's reservable balance via pending. **Fix:** call `releaseLockedFunds(reason:'capture')` on check-in/completion, or debit `available` directly instead of locking.
- **`backend/routes/accommodation.js:470-477`** — Cancel refund calls `releaseLockedFunds` (release) hardcoding `currency: 'EUR'`. This only works for the lock model; but the `pay_later` charge at 671 is a real `available` DEBIT (`accommodation_charge`), not a lock. If a pay_later booking is later cancelled through this path, `releaseLockedFunds` credits `pending` (which was never debited) → `pending` goes wrong and the real `available` debt is never refunded. **Risk:** asymmetric refund; balance corruption between the two payment models. **Fix:** branch refund logic on how the booking was actually paid (lock vs. debit).

## 6. DELETION / CASCADE — orphaned and double-counted ledgers

- **`backend/routes/users.js:1012-1014`** (detailed in #3) — the most destructive cascade: wipes wallet ledger + balances + audit with no settlement.
- **Booking deletion vs. legacy `transactions` table:** `bookings.js:5532` and `:5714` log "legacy transactions table insert skipped," but the original charge may have written BOTH a `wallet_transactions` row and a legacy `transactions` row. The financial-event/report layer (`finances.js` summaries, `cashModeAggregator.js:90-102`) reads `wallet_transactions`; if any report still joins the legacy `transactions` table, a deleted booking's charge persists there → **double-counted revenue** that the wallet refund doesn't offset. **Fix:** audit every report's source table; ensure delete reverses both stores or neither.
- **No FK cascade integrity:** `wallet_transactions.related_entity_id`/`booking_id` are indexed but not FK-constrained to bookings (migrations 024/030 add plain indexes). Deleting a booking via any path that doesn't also touch the ledger leaves **orphaned wallet_transactions** pointing at a non-existent booking — invisible to per-booking reconciliation but still summed into the balance. **Fix:** either FK with `ON DELETE` policy or a reconciliation sweep.

## 6b. THE BIGGEST STRUCTURAL SSOT RISK NO CATEGORY CAPTURED

**`backend/services/walletService.js:1304`** — `const numericAvailableDelta = availableDelta !== undefined ? toNumeric(availableDelta) : numericAmount;` combined with **`recordLegacyTransaction` (1572-1592) NEVER forwarding `availableDelta`** to `recordTransaction`.

This is the structural single-source-of-truth landmine. The ledger has TWO ways to express "how much the cached balance moved": the explicit `availableDelta` (used by `recordTransaction` callers) and the implicit "default = full amount" (used by EVERY `recordLegacyTransaction` caller, because it drops the field). The result:

1. **There is no invariant enforcing `available_delta` equals the actual balance movement.** A `recordLegacyTransaction` charge always moves `available` by the full `amount`; a `recordTransaction` charge moves it by whatever `availableDelta` the caller chose (e.g. 0 for non-wallet audit rows at memberOfferings.js:991, or 0 for pending debts at services.js:1711). The SAME `transactionType: 'payment'` row can have `available_delta = -price` from one path and `available_delta = 0` from another. So `SUM(available_delta WHERE status='completed')` — the exact formula finances.js uses to *recompute* the authoritative balance (finances.js:1129, 1216) — is only correct if every caller picked the right delta by hand.
2. **Migration 258's staff-salary separation is honor-system on top of this.** Payroll rows must pass `availableDelta: 0`, but `recordLegacyTransaction` defaults it to the full amount (1304). Any future payroll caller using the legacy function and forgetting the field will silently re-inflate the recipient's wallet — and the ledger-SUM recompute will then *bless* that inflation as truth.
3. **Therefore the "ledger is the source of truth" assumption is false.** The recompute trusts `available_delta`, but `available_delta` is itself derived inconsistently across two writer functions and ~15 call sites, with no DB CHECK that `available_delta` is consistent with the transaction's effect. The agent.js raw debit (delta=0) and these default-vs-explicit divergences mean the ledger and the cache are reconciled to *each other's errors*, not to a real invariant.

**Fix:** make `availableDelta` mandatory and explicit on `recordTransaction`; have `recordLegacyTransaction` compute and forward it; add a DB CHECK/trigger asserting `available_delta + pending_delta + non_withdrawable_delta` matches the row's direction×amount semantics; and add a periodic reconciliation job that fails loudly when `SUM(deltas) ≠ wallet_balances` rather than silently overwriting one from the other.

---

## Metodoloji

- 4 foundation ajani (sema, walletService, tahsilat yollari, frontend) zemini haritaladi.
- 9 kategori finder kanit (file:line) ile bulgu uretti.
- Her bulgu, kodu yeniden okuyup mitigasyon arayan supheci bir verifier tarafindan dogrulandi; 34 false-positive elendi.
- 1 completeness critic kapsam disi yazma yollarini taradi.
- Toplam: 93 aday -> 59 dogrulanmis bulgu.
