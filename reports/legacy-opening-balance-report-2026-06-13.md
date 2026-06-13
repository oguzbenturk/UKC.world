# Legacy Opening-Balance Report — "balance with no history record"

**Date:** 2026-06-13
**Trigger:** Customer **Aylin Browarzik** showed a +€100 balance "from last year" with no matching record in her financial history.

---

## What actually happened (the flow)

1. When Plannivo was migrated from the **previous app** (the old system), each customer's
   leftover balance was imported as a single synthetic wallet transaction:

   - `transaction_type = 'legacy_opening_balance'`
   - `description = "Opening balance migrated from previous app (backfill 2026_05_31)"`
   - dated **2026-05-31 13:24:28**

2. That row **does** carry an `available_delta`, so it correctly feeds the customer's
   live wallet balance (`wallet_balances.available_amount`).

3. **But** the admin financial-history / payment-history view deliberately hides this
   transaction type:

   `backend/routes/finances.js:620`
   ```js
   // Hide synthetic backfill entries (one per migrated user — they're not real
   // payment activity and would inflate admin totals + clutter the table).
   const HIDDEN_TRANSACTION_TYPES = ['legacy_opening_balance'];
   ```
   It is filtered out of **both** the transaction rows and the stats totals
   (finances.js:632 and :684-685).

**Result:** the displayed balance includes the opening balance, but the history never
shows where it came from. The balance "appears from nowhere."

### Proof (reconciliation)
For **all 90** affected customers, the gap between the displayed balance and the sum of
the *visible* history equals the hidden opening balance **exactly** (90/90):

```
displayed_balance − visible_history_sum  ==  legacy_opening_balance     (100% match)
```

### Aylin Browarzik specifically
- Opening balance migrated 2026-05-31: **+€100** (hidden from admin history)
- At the time you looked she had **no other activity** → balance = +€100, history empty.
- New activity was recorded today 2026-06-13 (accommodation −180, package −500,
  deposit +560), so her balance is now **−€20**. The original €100 is still in there,
  just invisible in the admin history.

---

## ⚠️ Admin vs. customer inconsistency

The **student portal** does **NOT** hide these rows.
`backend/services/studentPortalService.js:860-867` selects all `wallet_transactions`
(only excluding cancelled + ghost pending-CC) and **sums them into the customer's
lifetime "Total Paid" / balance aggregates**.

So the migrated opening-balance row is:
- **Invisible** to the admin (your view) — finances.js hides it
- **Visible** to the customer in their own portal — student portal shows it

This is the opposite of what you'd expect and is worth deciding on (see recommendations).

---

## Scope

| Currency | Customers | Total opening balance |
|----------|-----------|------------------------|
| EUR      | 60        | €4,853.13              |
| TRY      | 29        | ₺69,414.00             |
| USD      | 1         | $0.50                  |
| **Total**| **90**    | (mixed currencies)     |

- **81 of 90** have had **zero** wallet activity since the migration — their *entire*
  displayed balance is the invisible opening balance, with a completely empty history.
- **9 of 90** have had activity since; for them the opening balance is the unexplained
  offset on top of their visible transactions.
- Only **1** customer also has a non-zero `users.balance` mirror (€10) — minor; the
  wallet value wins in the displayed balance, so no double-count.

---

## Full list (all 90 customers in the same situation)

`opening_bal` = migrated last-year balance (hidden).
`current_bal` = balance shown in the app today.
`visible_history_sum` = what the admin history actually adds up to.
`hidden_gap` = current_bal − visible_history_sum (always == opening_bal).

### EUR (60)

| Customer | Email | opening_bal | current_bal | visible_history_sum | hidden_gap |
|---|---|--:|--:|--:|--:|
| Dinçer Yazgan | dinceryazgan@plannivo.com | 522.00 | 914.00 | 392.00 | 522.00 |
| Siyabend Şanlı | siyabendsanli@plannivo.com | 316.00 | 710.00 | 394.00 | 316.00 |
| Buse Yalabık | yalanikbusr@gmail.com | 312.00 | 312.00 | 0.00 | 312.00 |
| Azada ayan Alakbarli | ayan.elekberli@gmail.com | 270.00 | 270.00 | 0.00 | 270.00 |
| Dario —- | darivsjf@hotmail.com | 250.00 | 250.00 | 0.00 | 250.00 |
| Deniz Koçyiğit | denizicyigit@gmail.com | 240.00 | 240.00 | 0.00 | 240.00 |
| Sera Haznedar | serar2@hotmail.com | 215.00 | 215.00 | 0.00 | 215.00 |
| Cansu Öztürk | dtcansugunduz@hotmail.com | 207.00 | 39.00 | -168.00 | 207.00 |
| Alex Dordevic | alexdordevic@gmail.com | 195.00 | 195.00 | 0.00 | 195.00 |
| Seren aslı Tunçel | serenasli@gmail.com | 165.00 | 165.00 | 0.00 | 165.00 |
| Tom Asous | tomausos@mail.com | 145.00 | 145.00 | 0.00 | 145.00 |
| Maya Kocabaş | hekocabas@gmail.com | 140.00 | 140.00 | 0.00 | 140.00 |
| Zeynep Korkmaz | zeynepkorkmaz@gmail.com | 130.00 | 130.00 | 0.00 | 130.00 |
| Giyom Pagy | pagyg@hotmail.com | 128.00 | 128.00 | 0.00 | 128.00 |
| Orhan Ayker | orhanayker@gmail.com | 115.00 | 115.00 | 0.00 | 115.00 |
| Julie Zeynep Pagy | julieepagy@gmail.com | 108.00 | 108.00 | 0.00 | 108.00 |
| **Aylin Browarzik** | aylo1652@live.de | **100.00** | -20.00 | -120.00 | **100.00** |
| Anders Risberg | risberg@gmail.com | 100.00 | 100.00 | 0.00 | 100.00 |
| Berke Kalemoğlu | berkekalemoglu@gmail.com | 98.00 | 98.00 | 0.00 | 98.00 |
| Arn Johnsson | arnjohnson@gmail.com | 95.00 | 95.00 | 0.00 | 95.00 |
| Denizhan Haznedar | denizhanhaznedar@gmail.com | 90.00 | 90.00 | 0.00 | 90.00 |
| Aras Cebeci | arascebeci@icloud.com | 88.00 | 88.00 | 0.00 | 88.00 |
| Joshua Dowling | josheym8s@gmail.com | 70.00 | 70.00 | 0.00 | 70.00 |
| Adam O'Reilly | adam.oreilly@live.com.au | 70.00 | 70.00 | 0.00 | 70.00 |
| Ignazio Mineccia | mineccia@gmail.com | 65.00 | 65.00 | 0.00 | 65.00 |
| Kaya Uyanık | anil.uyanik@gmail.com | 53.00 | 53.00 | 0.00 | 53.00 |
| Taylan Üzmez | taylanuzmez95@gmail.com | 52.60 | 52.60 | 0.00 | 52.60 |
| Maksim Sapelkinov | saiplkakc@yandex.ru | 50.00 | 50.00 | 0.00 | 50.00 |
| Vasiliy Melnik | vesiliy@gmail.com | 46.50 | 46.50 | 0.00 | 46.50 |
| Işık Can Başak | isikcan@gmail.com | 40.00 | 40.00 | 0.00 | 40.00 |
| Zeynep Çetinavcı | zcetinavci@gmail.com | 35.00 | 35.00 | 0.00 | 35.00 |
| Ali Sivri | bsivri@gmail.com | 35.00 | 35.00 | 0.00 | 35.00 |
| Ibrahim Elis | ibrahimelis@gmail.com | 35.00 | 35.00 | 0.00 | 35.00 |
| Burcu Yalaman | burcuyalaman@gmail.com | 32.00 | -3.71 | -35.71 | 32.00 |
| Furkan Dikbaş | furkandikbas@gmail.com | 30.00 | 30.00 | 0.00 | 30.00 |
| Utku Şahin | utkusahin@gmail.com | 26.00 | 26.00 | 0.00 | 26.00 |
| Alex KS24 Studio | antoinealex@gmail.com | 25.00 | 25.00 | 0.00 | 25.00 |
| Ozan Öztürk | oozturk05@alm.ku.edu.tr | 25.00 | -245.00 | -270.00 | 25.00 |
| Nazlı Al-YAL | nazlialsal@gmail.com | 18.00 | 18.00 | 0.00 | 18.00 |
| Oguzhan Bentürk | ozibenturk@gmail.com | 16.50 | 457.00 | 440.50 | 16.50 |
| Asuman Alp Orkun | asumanalp@gmail.com | 16.00 | 16.00 | 0.00 | 16.00 |
| Bjorn Husarna | bjornhusarna@gmail.com | 10.00 | 10.00 | 0.00 | 10.00 |
| Jernej Kastelec | jernej@gmail.com | 10.00 | 10.00 | 0.00 | 10.00 |
| Niloofar Kavousi | niloofar.kavousi@gmail.com | 10.00 | 10.00 | 0.00 | 10.00 |
| Paul Noliat | paul.noliat@gmail.com | 10.00 | 10.00 | 0.00 | 10.00 |
| Bora Öztürk | boraozturk@gmail.com | 8.00 | 8.00 | 0.00 | 8.00 |
| Sıla Akcamli | sila_ppompurlu@outlook.com | 7.00 | 7.00 | 0.00 | 7.00 |
| İsmail Aksoy | aaaa@gmail.com | 5.00 | 5.00 | 0.00 | 5.00 |
| Mikhail Kozlovsleiy | mikhailkz@gmail.com | 5.00 | 5.00 | 0.00 | 5.00 |
| Ezgi Dinçerden | ezgidincerden@gmail.com | 4.00 | 4.00 | 0.00 | 4.00 |
| Domemiko Deleonardis | domemiko_deleonardis@gmail.com | 3.00 | 3.00 | 0.00 | 3.00 |
| Onur Savaş | onursavas@gmail.com | 3.00 | 3.00 | 0.00 | 3.00 |
| Alex Milligan | milliganj45@gmail.com | 2.00 | 2.00 | 0.00 | 2.00 |
| Egemen Özhan | egemen@gmail.com | 2.00 | 2.00 | 0.00 | 2.00 |
| Nail Özkardeş | ozkardesnail@gmail.com | 1.00 | 1.00 | 0.00 | 1.00 |
| Tina Annett Hoehne | tinahoehne89@googlemail.com | 1.00 | 1.00 | 0.00 | 1.00 |
| Nuri Makinacı | nuri@gmail.com | 0.98 | 187.65 | 186.67 | 0.98 |
| Hazel Kardaş | fghjjvnjhhk@mjhh.com | 0.75 | 0.75 | 0.00 | 0.75 |
| Roman Danilov | dargas2015@gmail.com | 0.50 | 0.50 | 0.00 | 0.50 |
| Sean Davran | sandavrannn@gmail.com | 0.30 | -155.70 | -156.00 | 0.30 |

### TRY (29)

| Customer | Email | opening_bal | current_bal | visible_history_sum | hidden_gap |
|---|---|--:|--:|--:|--:|
| Doğa ve Deniz Koçyiğit | dogakocyigit@gmail.com | 17892.00 | 17892.00 | 0.00 | 17892.00 |
| Toprak Bilgin | senerbilgin@gmail.com | 12000.00 | 12000.00 | 0.00 | 12000.00 |
| Harun Demirci | harundemirci@gmail.com | 10000.00 | 10000.00 | 0.00 | 10000.00 |
| Onur Öztürk | onroztur@gmail.çöm | 5100.00 | 5100.00 | 0.00 | 5100.00 |
| Bengü Develioğlu | begudvl@gmail.com | 4885.00 | 4885.00 | 0.00 | 4885.00 |
| Zeynep Erözkan | zeynep_erozkan@hotmail.com | 4228.00 | 4228.00 | 0.00 | 4228.00 |
| Davut Eren Demlrci | davuteren@gmail.com | 1930.00 | 1930.00 | 0.00 | 1930.00 |
| Yağız Erdem Demirci | yagizerdem@gmail.com | 1930.00 | 1930.00 | 0.00 | 1930.00 |
| Aslıcan Özdim | studioaslicanozdim@gmail.com | 1330.00 | 1330.00 | 0.00 | 1330.00 |
| Bahadır Özdemir | bahadirozdemir33@hotmail.com | 1250.00 | 1250.00 | 0.00 | 1250.00 |
| Delfina Yılmaz | delfinayılmaz@gmail.com | 1095.00 | 1095.00 | 0.00 | 1095.00 |
| Tuğçe Kayar | tugcekayr@gmail.com | 1080.00 | 1080.00 | 0.00 | 1080.00 |
| Uğur Ceylan | ugr-cyln@hotmail.com | 1000.00 | 1000.00 | 0.00 | 1000.00 |
| Berkay Demiray | brkdmry@gmail.com | 1000.00 | 1000.00 | 0.00 | 1000.00 |
| Bulut Özdemiroğlu | bulutozd@gmail.com | 1000.00 | 1000.00 | 0.00 | 1000.00 |
| Ege Kaan | abc@gmail.com | 935.00 | 935.00 | 0.00 | 935.00 |
| Çiğdem Çimen | cigdemcimen@gmail.com | 690.00 | 690.00 | 0.00 | 690.00 |
| Çınar Erdoğan | cinarerdogan@gmail.com | 500.00 | 500.00 | 0.00 | 500.00 |
| Burak Baldırlıoğlu | burakbaldırlıoglu@gmail.com | 500.00 | 500.00 | 0.00 | 500.00 |
| Hilmi Muslu | hilmimuslu@gmail.com | 250.00 | 250.00 | 0.00 | 250.00 |
| Burcu Aydın | burcuaydin@gmail.com | 200.00 | 200.00 | 0.00 | 200.00 |
| Dilara İnce | dilaraince@gmail.com | 180.00 | 180.00 | 0.00 | 180.00 |
| Serra Didem Önem | serradidem@icloud.com | 150.00 | 150.00 | 0.00 | 150.00 |
| Ege Ertürk | egeerturkk30@gmail.com | 100.00 | 100.00 | 0.00 | 100.00 |
| Alp Arda Koçak | alpardakocak123@hotmail.com | 100.00 | 100.00 | 0.00 | 100.00 |
| Atakan Kerküklü | atakankerkuklu@gmail.com | 30.00 | 30.00 | 0.00 | 30.00 |
| Emre Murat | emre@gmail.com | 21.00 | 21.00 | 0.00 | 21.00 |
| Orkun Susuz | orkunsusuz@gmail.com | 20.00 | 20.00 | 0.00 | 20.00 |
| Emre Sivri | emresivri@gmail.com | 18.00 | 18.00 | 0.00 | 18.00 |

### USD (1)

| Customer | Email | opening_bal | current_bal | visible_history_sum | hidden_gap |
|---|---|--:|--:|--:|--:|
| Bilun Hammang | bhammang@gmail.com | 0.50 | 0.50 | 0.00 | 0.50 |

---

## Recommendations (your call — nothing changed yet)

This is **working as designed**, not a data corruption bug — the money is correct, only
the *display* of its origin is suppressed. Options:

1. **Show the opening-balance row in admin history (recommended).** Remove
   `legacy_opening_balance` from `HIDDEN_TRANSACTION_TYPES` in finances.js (or add a
   dedicated "Opening balance (migrated)" display label and keep it out of revenue
   totals only). This makes the balance self-explanatory and matches what the customer
   already sees in their portal.

2. **Keep it hidden but make totals exclude it consistently** — already true for the
   admin stats; but then also exclude it from the student-portal aggregate so admin and
   customer agree.

3. **Leave as-is** and document it as known behavior so it doesn't get re-investigated.

The main thing to decide is the **admin↔customer inconsistency** (admin hides it,
student portal shows + sums it).
