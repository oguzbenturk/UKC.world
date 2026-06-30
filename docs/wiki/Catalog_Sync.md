# Catalog Sync

> **Özet:** `catalog-sync/` shop ürünlerinin EUR fiyatlarını rakip site xtremspor.com'un TRY perakende fiyatlarından (1 EUR = 53.14 TRY) türeten TEK-SEFERLİK, MANUEL bir analiz ve SQL araç setidir. 4 CSV (kaynak/referans/katalog) + 8 `psql` batch script ile çalışır; "fiyat asla düşmez" kuralını GREATEST tabanlı bir floor restore adımıyla uygular. Bu, canlıda otomatik çalışan `vendorProductSyncService`'ten TAMAMEN AYRI bir tek-atımlık çalışmadır ve değişiklikler **yalnızca LOCAL dev DB'ye** uygulanmıştır.
>
> **Kütüphaneler:** PostgreSQL (`psql` meta-komutları: `\set ON_ERROR_STOP`, `\echo`), JSONB (`jsonb_set`, `jsonb_agg`, `jsonb_array_elements ... WITH ORDINALITY`), CSV.
>
> **Bağlantılar:** [[Products_Shop_Inventory]], [[Finances_Wallet]], [[Operations_Scripts]], [[Database]], [[Catalog_Sync]], [[Index]]

---

## Sorumluluk

Plannivo shop kataloğundaki (`products` tablosu) boş/eski EUR fiyatlarını, Türkiye'deki perakendeci **xtremspor.com**'un Türk Lirası perakende fiyatlarından türetmek. xtremspor yalnızca TRY ile satış yaptığı için fiyatlar sabit bir kur ile EUR'ya çevrilir:

```
Önerilen EUR = xtremspor TRY (güncel) ÷ 53.14
```

Bu kur, bizim zaten fiyatlı ürünlerimizle doğrulanmıştır (README'deki tablo): Spectre kemeri 607 ≈ 608, Riot Curv 485 ≈ 486, Amaze Core 4/3 BZ 371.85 ≈ 375 gibi neredeyse birebir eşleşir.

Bu bir **rapor + uygula** çalışmasıdır, sürekli çalışan bir servis değildir. Canlı tedarikçi senkronundan (bkz. Dikkat bölümü) bağımsızdır.

## Dosya Seti

Tümü `catalog-sync/` altındadır. Talimat dosyası: `catalog-sync/README.md`.

### CSV'ler (veri / iz sürme)
- `catalog-sync/shop-catalog-2026-06-20.csv` — değişiklik ÖNCESİ kendi kataloğumuzun export'u (154 ürün: 150 aktif + 4 pasif). Sütunlar: `status, category, subcategory, brand, name, sku, price, original_price, currency, stock_quantity, cost_price, variant_min_price, variant_max_price`. Birçok satırda `price` = `0.00` (fiyatsız).
- `catalog-sync/shop-catalog-2026-06-20-UPDATED.csv` — değişiklik SONRASI aynı katalog (örn. "Amaze Hot Shorty 1.5 LS Frontzip" 0.00 → 182.00, variant min/max = 182). `cost_price` sütunu çıkarılmıştır.
- `catalog-sync/xtremspor-price-reference-2026-06-20.csv` — ASIL referans/eşleştirme dosyası. Ürün başına bir satır: `Category, Brand, Our Product, Our Current EUR, Xtremspor Match, Xtremspor TRY, Xtremspor Was TRY, Suggested EUR, Delta EUR, Confidence, Notes`. `Confidence` = high/medium/low eşleşme güveni; `Was TRY` = xtremspor'un indirim öncesi fiyatı (kampanyalı ürünler).
- `catalog-sync/xtremspor-source-prices-2026-06-20.csv` — xtremspor'dan kazınan (scraped) ham fiyat listesi (~125 ürün). Sütunlar: `Brand, Product Name, TRY Current, TRY Was, EUR Current, In Stock, Category`. Herhangi bir kurun yeniden uygulanabilmesi için tüm TRY kaynak fiyatları korunur.

### SQL Batch Script'leri (uygulama)
psql ile sırayla çalıştırılır; hepsi `\set ON_ERROR_STOP on` ile başlar.

| Script | Rol | İçerik |
|---|---|---|
| `price-sync-setup.sql` | Batch 1 setup | `price_sync_map(nm, newprice)` haritası (62 high-confidence isim), **yedek tablosunu oluşturur**, PREVIEW/eşleşmeyen/özet sorgular |
| `price-sync-apply.sql` | Batch 1 apply | `price_sync_map`'i `products`'a yazar (base + variant + original_price temizliği) |
| `price-sync-batch2-setup.sql` | Batch 2 setup | `price_sync_map2(pat, newprice, note)` — `LIKE` desenli 14 medium-confidence eşleşme |
| `price-sync-batch2-apply.sql` | Batch 2 apply | `price_sync_map2`'yi uygular, sonra haritayı drop eder |
| `price-sync-batch3-apply.sql` | Batch 3 | Entity Ergo set → €262 + jenerik "Rashguard LS"/"Rasguard LS" (typo) → €56. Setup+apply tek dosyada |
| `price-sync-batch4-apply.sql` | Batch 4 | Amaze Shorty 2.5 SS (proxy 2.0 = €182) + kaçan Seek Core 4/3 BZ → €367 |
| `price-sync-batch5-restore.sql` | Batch 5 **geri-alma** | Fiyat-tabanı (floor) onarımı — yedeğin altına düşmüş tüm base+variant fiyatlarını orijinale geri yükler |
| `price-sync-batch6-apply.sql` | Batch 6 | Tüm Rashguard LS (+ typo) → €60'a yükseltir (asla-düşürme politikasına saygılı) |

## Akış (setup → apply → restore)

1. **Setup** (`*-setup.sql`): geçici eşleştirme tablosunu (`price_sync_map`, `price_sync_map2`) kurar. Batch 1 setup ayrıca **yedeği** alır:
   ```sql
   CREATE TABLE products_price_backup_20260620 AS
     SELECT id, name, price, original_price, variants FROM products;
   ```
   Yedek **idempotent** (drop+recreate). Setup, gerçek bir değişiklik yapmadan PREVIEW sorgularıyla "neler değişecek / hangi map satırı hiçbir aktif ürüne eşleşmedi / kaç satır güncellenecek" raporu basar.

2. **Apply** (`*-apply.sql`): `BEGIN ... COMMIT` içinde 3 adım:
   - **(1) Base price:** `UPDATE products SET price = map.newprice` (`status='active'` ve isim eşleşmesi).
   - **(2) Variant flatten:** her eşleşen ürünün JSONB `variants` dizisindeki her elemanın `{price}` alanını yeni fiyata sabitler (`jsonb_agg(jsonb_set(elem,'{price}', to_jsonb(map.newprice)))`).
   - **(3) original_price temizliği:** `original_price <= price` olan (kırık compare-at / üstü çizili) fiyatları `NULL` yapar.
   - Sonunda VERIFY sorguları (base_ok = beklenen satır sayısı, mismatched = 0 olmalı) çalışır.

3. **Restore** (`price-sync-batch5-restore.sql`): asla-düşürme kuralının zorlayıcısı. Bir EUR fiyatı yedeğin (`products_price_backup_20260620`) altına düştüyse orijinaline geri çekilir. Variant tarafı **indeks-bazlı** (`WITH ORDINALITY` + `bv.ord = cv.ord` LATERAL join) onarılır; her variant kendi orijinaliyle kıyaslanır. Geri-yüklenenler: Vest Vector Amp €193→€200 (×3), Element 3/2 €274→€280, Rashguard LS €56→€60, Rashguard Maze LS top beden €66→€70. VERIFY: `base_below` = 0, `variant_below` = 0.

## Eşleşme Kategorileri / Kapsam

- **Kites/boards/bars:** Duotone Evo, Rebel, Dice SLS, TS Big Air, Jaime, Select, Soleil, Click Bar, Trust Bar, Chicken Loop. (Neo, Gonzales, Shred, Whip, Pro Voke ve SLS-olmayan Dice xtremspor'da yok.)
- **Harnesses (ION):** Axxis, Muse, Riot Curv, Rival, Sol Curv, Apex, Nova, Spectre. (Tam spreader bedenleri Curv 10/13, Sol 7, Nova 6 stoklu değil → kaydedilmiş RRP kullanıldı, low/medium işaretli.)
- **Wetsuits / rashguard / top / vest / ayakkabı / kask:** ION Amaze, Element, Seek, Static, Neo Top, Wetshirt, Rashguard (Lizz/Maze/Promo), Ivy/Vector vests, Plasma shoes, Slash Amp kask, Poncho.
- **Eşleşmeyen / kendi fiyatı korunan:** ION Strike, Muse Crossback, Thermo Top, mayo altları (xtremspor mayo SATMIYOR), Hardcap, Magma shoes, split-toe boots, Duotone Kite Pump, Mystic Block Impact Vest ve tüm `ukc-shop` özel-marka ürünleri (Hurley/RC şort-tişört, hoodie, capler, güneş bakım serisi). Ocean Sunglasses eşleşti.

## Sonuç (LOCAL)

Fiyatlı aktif ürünler **74 → 121** (fiyatsız 76 → 28). 5 batch + 1 floor-restore + Rashguard €60 düzeltmesi LOCAL dev `products` tablosuna uygulandı.

## Veri Modeli

- `products` — shop kataloğu. İlgili sütunlar: `id`, `name` (eşleşme `TRIM(name)` ile yapılır — baştaki/sondaki boşluklara dikkat), `price` (numeric, base EUR), `original_price` (compare-at / üstü çizili), `currency`, `status` (`'active'` filtresi), `variants` (JSONB dizi; her eleman `{price, ...}`). Detay için [[Products_Shop_Inventory]].
- `products_price_backup_20260620` — değişiklik öncesi snapshot: `(id, name, price, original_price, variants)`. Geri-alma kaynağıdır; idempotent şekilde batch 1 setup'ta oluşturulur.
- `price_sync_map(nm text PK, newprice numeric)`, `price_sync_map2(pat text PK, newprice, note)` — geçici eşleştirme tabloları; apply/restore sonrası drop edilir.

## Dikkat / Tuzaklar

- **YALNIZCA LOCAL.** README açıkça uyarır: *"These changes are on the LOCAL dev database only — the live shop is unchanged."* Canlıya almak için aynı SQL production'a karşı manuel çalıştırılmalıdır. Production [[Database]] hesabı için bkz. [[Operations_Scripts]].
- **Asla-düşürme politikası** projedeki yerleşik bir sahip kuralıdır (bkz. MEMORY: *shop prices never reduce* — `GREATEST(current, original)` floor). Batch 5 bu kuralın araç-içi karşılığıdır; yeni türetilen EUR fiyatı eski fiyatın altındaysa eski fiyat korunur. Bu nedenle kurun düşürdüğü hiçbir kalemi gerçekten ucuzlatmaz.
- **`vendorProductSyncService` ile karıştırma.** O servis canlı/otomatik tedarikçi katalog senkronudur; `catalog-sync/` ise tek-seferlik manuel bir analizdir. İkisi BAĞIMSIZDIR; bu klasörü çalıştırmak o servisi tetiklemez, o servis de bu yedeği/maps'leri kullanmaz.
- **Kur sabittir (53.14).** Farklı bir kura geçmek için tüm TRY kaynak fiyatları CSV'lerde durur; `Suggested EUR = TRY ÷ yeni_kur` ile yeniden hesaplanır. Kur değişirse SQL'lerdeki sabit EUR değerleri elle güncellenmeli.
- **İsim eşleşmesi kırılgan.** Batch 1/3/4 `TRIM(p.name)=nm` (tam eşleşme), Batch 2 ise `LIKE` desenleri kullanır. Türkçe büyük-İ noktası ve apostroflu isimler (örn. "D/Lab") yüzünden Batch 2 bilinçli olarak `LIKE` tercih eder ve "patterns matching MORE than expected" guard sorgusuyla fazla eşleşmeyi denetler. Ürün adı değişirse map'ler sessizce kaçırabilir.
- **Variant fiyatları düzleştirilir.** Apply adımı bir ürünün TÜM variant fiyatlarını tek bir base fiyata sabitler; beden-bazlı fiyat farkları kaybolur. Batch 5 yalnızca yedeğin altına düşenleri indeks-bazlı geri yükler — eşit indeks varsayımına dayanır (variant sırası değişirse yanlış eşleşir).
- **Kapsam dışı silme.** README notu: bu çalışma sırasında uygulamadan silinen fiyatsız "Neo" kite, fiyat senkronunun PARÇASI DEĞİLDİR — karıştırılmamalı.
- Bu fiyatlar **perakende (end-customer)** fiyatlardır, maliyet (`cost_price`) değildir. Cüzdan/satış muhasebesi için bkz. [[Finances_Wallet]].
