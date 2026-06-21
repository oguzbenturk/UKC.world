# Shop Catalog → xtremspor.com Price Sync (2026-06-20)

Goal: set EUR prices for the Plannivo shop based on xtremspor.com's retail prices
(xtremspor sells in Turkish Lira only), converted at the current EUR rate.

## Exchange rate used

**1 EUR = 53.14 TRY** (market rate, 2026-06-20).

> To recompute at a different rate: `Suggested EUR = TRY Current ÷ rate`.
> All TRY source prices are preserved in the files so any rate can be re-applied.

**Rate is validated by our own already-priced items** — they convert almost exactly:

| Item | Our current EUR | xtremspor TRY ÷ 53.14 |
|---|---|---|
| Spectre harness | 607 | 608 |
| Riot Curv harness | 485 | 486 |
| Amaze Core 4/3 BZ wetsuit | 371.85 | 375 |
| Seek Core 3/2 wetsuit | 310 | 314 |
| Element 3/2 wetsuit | 280 | 274 |
| Ivy vest | 170 | 172 |
| Neo Top 0.5 | 120 | 122 |
| Neo Top 2/2 | 140 | 142 |
| Slash Amp helmet | 120 | 132 |
| Plasma Shoes 2.5 | 65 | 66 |

## Files

1. **`shop-catalog-2026-06-20.csv`** — our current shop catalog, exported from the
   `products` table (all 154 products: 150 active + 4 inactive), with prices, stock,
   cost, currency, and variant price ranges.

2. **`xtremspor-price-reference-2026-06-20.csv`** — THE reference. One row per our
   product/model: our current EUR, the matched xtremspor product, its TRY price, the
   suggested EUR price (TRY ÷ 53.14), the delta, a confidence rating, and notes.

3. **`xtremspor-source-prices-2026-06-20.csv`** — the raw xtremspor price list we
   scraped (≈125 products across kites, boards, bars, harnesses, wetsuits, rashguards,
   vests, footwear, helmets, ponchos, sunglasses, caps) in TRY and EUR — traceability.

## Coverage summary

- **74 of our products matched** to a live xtremspor product (high/medium confidence).
- **Kites/boards/bars:** Duotone Evo, Rebel, Dice SLS, TS Big Air, Jaime, Select,
  Soleil, Click Bar, Trust Bar, Chicken Loop all matched. (Neo, Gonzales, Shred, Whip,
  Pro Voke and non-SLS Dice are not in xtremspor's current range.)
- **Harnesses:** Axxis, Muse, Riot Curv, Rival, Sol Curv, Apex, Nova, Spectre matched.
  (The "Curv 10/13" and "Sol 7 / Nova 6" exact spreader sizes aren't all stocked —
  nearest model used, flagged low/medium.)
- **Wetsuits/rashguards/tops/vests/footwear/helmets:** ION Amaze, Element, Seek, Static,
  Neo Top, Wetshirt, Rashguard (Lizz/Maze/Promo), Ivy/Vector vests, Plasma shoes, Slash
  Amp helmet, Poncho all matched.

## No xtremspor equivalent (keep current / own pricing)

- ION Strike line, Muse Crossback, Thermo Top, swim bottoms, Hardcap, Magma shoes,
  split-toe boots, Duotone Kite Pump.
- Mystic Block Impact Vest (Mystic brand not stocked at xtremspor).
- All **ukc-shop** own-brand merch: Hurley & RC shorts/tees/vests, Zip Hoodie,
  Manera/New Era caps, and the full sun-care range. (Ocean sunglasses DID match.)

## Applied to LOCAL dev DB (2026-06-20)

Two batches were applied to the local `products` table (base price + size-variant
prices flattened to the new price + broken compare-at prices cleared):

- **Batch 1 (high confidence):** 62 product rows — scripts `price-sync-setup.sql` +
  `price-sync-apply.sql`.
- **Batch 2 (medium confidence):** 14 product rows — scripts `price-sync-batch2-setup.sql`
  + `price-sync-batch2-apply.sql`. (Four harness size-variants xtremspor doesn't stock —
  Apex Curv 13, Nova Curv 10, Sol 7, Nova 6 — used each product's recorded RRP.)

- **Batch 3:** Binding Entity Ergo → €262 (from /urun/2025-duotone-entity-ergo-set,
  13933.40 TRY); generic "Rashguard LS" / "Rasguard LS" (4 listings) → €56 (ION Rashguard
  LS Men). Script `price-sync-batch3-apply.sql`.
- **Batch 4:** Amaze Shorty 2.5 SS suits (3 listings) → €182 (proxy from Amaze Shorty 2.0;
  xtremspor has no 2.5); one missed Seek Core 4/3 Back Zip listing → €367.
  Script `price-sync-batch4-apply.sql`.

Result: priced active products **74 → 121** (unpriced 76 → 28).

- **Batch 5 (price-floor restore):** policy = a price must never drop below its original.
  Restored the only reductions: Vest Vector Amp €193→€200 (×3), Element 3/2 €274→€280,
  Rashguard LS €56→€60 (the one €60 listing; €50/€55 listings stay raised to €56), and
  Rashguard Maze LS top size €66→€70. Verified: 0 base and 0 variant prices remain below
  the backup. Script `price-sync-batch5-restore.sql`.

Swimwear note: xtremspor sells NO swimwear (verified against their product sitemap) — so
"IOW-Bottoms Swimsuit LS" (kept €80) and "Bottoms Ball Slapper Shorts" have no source price.

**Deliberately NOT changed** (current price already inside xtremspor's colourway range,
or match too weak): Amaze Core 4/3 FZ, Seek Core 4/3, generic Rashguard LS, Wetshirt LS,
Seek Core 3/2 Shorty, Neo Top 2/1, Magma shoes.

Backup of pre-change values: table `products_price_backup_20260620` (rollback SQL in chat).
NOTE: an unrelated unpriced kite ("Neo", no xtremspor match) was deleted via the app
during this work — not part of the price sync.

> **These changes are on the LOCAL dev database only — the live shop is unchanged.**
> To go live, run the same SQL against production.

## Notes / caveats

- xtremspor prices are **retail** (end-customer) prices — converting them gives EUR
  *retail* prices, appropriate for the shop. They are NOT cost prices.
- Where a model has several colourways at different TRY prices, the representative
  (most common / in-stock base colour) price was used; ranges noted in the CSV.
- "Was TRY" = xtremspor's pre-discount price (sale items).
- Suggested EUR is rounded to whole euros.
