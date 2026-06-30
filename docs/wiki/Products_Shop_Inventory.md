# Products, Shop & Inventory

> **Özet:** Akademinin perakende mağazasını yönetir — ürünler (renk×beden varyant matrisi), sipariş/checkout (cüzdan/kart/nakit/havale + Iyzico), satış-sonrası satır fiyatı düzenleme, vendor (xtremspor/ION/Duotone) kataloğu senkronizasyonu ve ön-tarafta uçuş-anı (on-the-fly) WebP görsel yeniden boyutlandırma. Ayrıca akademinin kendi ders/kiralama ekipman envanteri (`equipment`) ve yedek parça siparişleri (`spare_parts_orders`) için ayrı, daha basit kayıt tabloları içerir.
>
> **Kütüphaneler:** Express 5 (ESM), PostgreSQL (`pg`, JSONB varyantlar), Decimal.js (para), `sharp` (WebP resizer), Ant Design + React Query (frontend), Iyzico gateway, axios (vendor feed).
>
> **Bağlantılar:** [[Finances_Wallet]], [[Payments_Currency]], [[Outsider_Marketing]], [[Warranty_Repairs]], [[Student_Portal]], [[Database]], [[Memberships]], [[Backend_Server]], [[Operations_Scripts]], [[Catalog_Sync]], [[Forms_Waivers_Compliance]], [[Chat_Community_Events]]

---

## Sorumluluk

Bu modül iki farklı "stok" dünyasını kapsar; **karıştırılmamalıdır**:

1. **Perakende mağaza (`products`)** — müşteriye satılan ürünler (kite, harness, wetsuit, aksesuar). Renk×beden varyantları, fiyat, indirim, sipariş, ödeme ve gelir buradan akar. Mağaza herkese açık (misafir göz atabilir).
2. **Akademi ekipmanı (`equipment`)** — akademinin sahip olduğu, derslerde/kiralamada kullanılan envanter (seri no, durum, servis tarihi). Satılmaz; [[Bookings_Calendar]] ve [[Accommodation_Rentals]] tarafından rezerve edilir.
3. **Yedek parça (`spare_parts_orders`)** — tedarikçiye verilen iç sipariş takibi (pending→ordered→received). Finansal değil, sadece operasyonel bir liste.

`services` tablosu (dersler/kiralamalar) ile `products` tablosu **tamamen ayrıdır** — bkz. [[Lessons_Services_Packages]].

## Backend

### Rotalar
- `backend/routes/products.js` — ürün CRUD + mağaza listeleme. Misafir göz atması için `GET /`, `GET /:id`, `GET /shop/by-category`, `GET /categories`, `GET /subcategories` **auth'suz** ama `publicApiLimiter` (15 dk / 100 istek) ile sınırlı. Yazma uçları `authorizeRoles(['admin','manager','front_desk','receptionist'])`. Stok güncelleme `PATCH /:id/stock`, düşük stok `GET /inventory/low-stock`. Vendor senkronizasyonu `POST /vendors/sync`. Öneri (recommendation) uçları `GET/POST/DELETE /:id/recommendation`.
- `backend/routes/shopOrders.js` — sipariş/checkout (`POST /`), kullanıcının siparişleri (`GET /my-orders`), admin tüm siparişler (`GET /admin/all`), durum güncelleme (`PATCH /:id/status` — iptal=stok iadesi, refund=cüzdana iade), **satır fiyatı düzenleme** (`PATCH /:orderId/items/:itemId/price`).
- `backend/routes/spareParts.js` — `spare_parts_orders` üstünde basit CRUD (`/api/spare-parts`), sadece `authenticateJWT`.
- `backend/routes/equipment.js` — akademi ekipmanı CRUD. Liste/detay auth'suz + 30dk cache; oluştur/güncelle `admin`+`manager`, **silme sadece `admin`** ve rezervasyonda/kiralamada kullanılıyorsa engellenir.
- `backend/routes/media.js` — `GET /api/media/img?src=&w=` uçuş-anı görsel yeniden boyutlandırıcı (aşağıda).
- `backend/routes/upload.js` — `/api/upload` altında **multer** tabanlı genel dosya/görsel/doküman/ses yükleme uçları. Ürün/paket/konaklama/ekipman kart görselleri (`POST /image`, `POST /images` çoklu max 20, `POST /equipment-image`, `POST /service-image`), form markalama (`/form-background`, `/form-logo`), tamir fotoğrafı (`/repair-image`), banka/cüzdan dekontu (`/wallet-deposit`), sohbet medyası (`/chat-image`, `/chat-file`, `/voice-message`) ve **auth'suz herkese açık** form gönderimi yüklemeleri (`/form-submission`, `/form-submission-multiple`) bu rotada toplanır. Her yükleyici `backend/utils/uploadValidation.js`'teki `validateMimeAndExtension` ile **MIME+uzantı doğrulaması** yapar (sadece izin verilen JPEG/PNG/GIF/WebP, PDF/DOC, ses tipleri), `handleMulterError` sarıcısı boyut/MIME reddini SPA'ya temiz JSON 400/413 olarak döner ve dosya adı `Date.now()+uuid` ile çarpışmaya karşı benzersizleştirilir. Görsel uçları yüklemeden sonra `optimizeUploadedFile`/`optimizeUploadedFiles` (sharp→WebP downscale) çağırır. Herkese açık form uçları kimlik istemez ama `formSubmissionRateLimit` (oran sınırı) + `X-Form-Upload-Token` (`FORM_UPLOAD_TOKEN`) ile korunur. Bkz. [[Forms_Waivers_Compliance]], [[Chat_Community_Events]], [[Warranty_Repairs]].

### Servisler
- `backend/services/shopOrderPriceService.js` — `updateShopOrderItemPrice()`. Satış sonrası satır fiyatını **katalog fiyatına dokunmadan** düzenler: girilen fiyatı sipariş para birimine çevirir (Decimal), `unit_price`/`total_price` günceller (ilk düzenlemede `original_unit_price` saklar), sipariş `subtotal`/`total_amount` yeniden türetir, katmanlı % indirimini yeni tutara göre yeniden hesaplar (`computeDiscountAmount`), yönetici komisyonunu yeniden hesaplar ve `settleWallet=true` ise **fiyat farkını cüzdana işler** (artış→`payment` borç, azalış→`shop_order_refund` alacak). 0 fiyatla satılan ürün, fiyatı girildiği an gerçek finansal geçmişe kavuşur.
- `backend/services/vendorProductSyncService.js` — harici vendor kataloglarını (`VENDOR_CATALOGS`: ION, Duotone…) `products` tablosuna `ON CONFLICT (sku) DO UPDATE` ile upsert eder; `dryRun` desteği var. `supplier_info` JSONB'sine vendor/sourceUrl/lastSyncedAt yazar. (xtremspor EUR fiyat senkronu ayrıca LOCAL'de yapıldı — bkz. MEMORY `xtremspor_price_sync`.)
- `backend/services/recommendationService.js` — `recommended_products` tablosu üzerinden role-göre (student/instructor/all) öne çıkan ürün önerileri; öncelik (priority) sıralı.

## Frontend

- **Ürün yönetimi:** `src/features/products/pages/Products.jsx` (liste/grid), `components/ProductForm.jsx` (kategori-bağlamlı alan görünürlüğü — `CATEGORY_FIELD_CONFIG`), `components/VariantMatrix.jsx` (renk×beden stok ızgarası), `components/VariantTable.jsx`, `components/ProductCard.jsx`. Saf matris↔`variants[]` dönüşümü `utils/variantMatrix.js` (React'siz, test edilebilir).
- **Mağaza yönetim kabuğu:** `src/features/services/pages/ShopManagement.jsx` — `Products` + `OrderManagement` sekmelerini birleştirir. Sipariş listesi `src/features/services/pages/ShopOrdersPage.jsx`.
- **Müşteri/dashboard mağaza:** `src/features/dashboard/pages/Shop.jsx` — herkese açık vitrin (kategori/alt-kategori/fiyat filtreleri, `ShopFiltersContext`, sepet `CartContext`). Kart bileşeni `src/features/dashboard/components/ProductCard.jsx`.
- **Envanter (ekipman):** `src/features/inventory/pages/InventoryPage.jsx` ve `src/features/equipment/*` (`pages/Equipment.jsx`, `components/EquipmentList/Detail/Form.jsx`) — akademi ekipmanı. `Equipment.jsx` list↔detail↔form arası geçişli bir CRUD kabuğudur (ekleme/düzenleme sadece manager/owner/admin'e açıktır); `useData()`'dan gelen `equipment` dizisi üzerinde çalışır ve `EquipmentForm` görselini `/api/upload/equipment-image` ucuna yükler. Bu ekipman **yaşam döngüsü** (seri no, durum, son-servis tarihi, uygunluk) doğrudan `equipment` envanter tablosunu besler ve perakende `products` stoğundan tamamen ayrıdır — kayıtlar satılmaz, yalnızca [[Bookings_Calendar]] ve [[Accommodation_Rentals]] tarafından `booking_equipment`/`rental_equipment` üzerinden rezerve edilerek tüketilir.
- API katmanı `@/shared/services/productApi`.

## Veri Modeli

- **`products`** (migration `212`, PK = **UUID**): `name, sku (UNIQUE), category, subcategory, brand, price, cost_price, original_price, currency, stock_quantity, min_stock_level, low_stock_threshold, weight, dimensions(JSONB), image_url, images(JSONB), status('active'|'inactive'|'discontinued'), is_featured, is_visible (migration 277), tags(JSONB), supplier_info(JSONB), variants(JSONB), colors(JSONB), gender, sizes, source_url`. CHECK'ler: stok≥0, price≥0, cost_price≥0. `currency` → `currency_settings` FK.
- **`product_variants`** kavramsal olarak `products.variants` **JSONB dizisi** içinde tutulur (ayrı tablo değil). Her eleman iki adlandırmayı birden taşır: `{ color, label, size, quantity, stock, price, price_final, cost_price }` — `label+quantity` backend stok düşümü için, `size+stock` vitrin uygunluğu için.
- **`product_categories` / `product_subcategories`** — özelleştirilebilir kategori/alt-kategori sözlüğü (built-in korunur, custom silinebilir = `is_active=false`).
- **`shop_orders`** (migration `123`, PK = **SERIAL/INTEGER**): `order_number (ORD-YYYYMMDD-XXXX, trigger ile)`, `user_id`, `status`, `payment_method`, `payment_status`, `subtotal, discount_amount, total_amount, currency`, `voucher_id/code`, `wallet_deduction_data(JSONB)`, `deposit_percent/amount`, `gateway_token`, zaman damgaları. `shop_order_items`: `unit_price, total_price, original_unit_price, selected_size, selected_color, selected_variant(JSONB)`. `shop_order_status_history` audit izi.
- **`equipment`**: `name, type, size, brand, model, serial_number(UNIQUE), purchase_date/price, condition, last_serviced_date, availability, location, notes, image_url`. `booking_equipment`/`rental_equipment` ile rezervasyona bağlanır.
- **`spare_parts_orders`**: `part_name, quantity, supplier, status(pending|ordered|received|cancelled), notes, ordered_at, received_at`.
- **`recommended_products`**: `(product_id, recommended_for_role) UNIQUE`, `priority, is_featured, metadata(JSONB)`.

## Akış / İş Mantığı

### Checkout (`POST /shopOrders`)
1. Her satır için ürünü kilitler, **stok kontrolü** yapar, `resolveVariantUnitPrice` ile **seçilen varyantın** fiyatını çözer (taban değil), `subtotal` toplar.
2. Voucher varsa `voucherService.validateVoucher` (shop bağlamı) ile indirim/`wallet_credit` uygular.
3. Ödeme yöntemine göre cüzdandan EUR-eşdeğeri çoklu-para düşüm planı (`calculateWalletDeduction` — önce EUR, sonra diğer kurlar; bkz. [[Payments_Currency]]). Kart/hibrit'te cüzdan düşümü **Iyzico callback'ine kadar ertelenir** (`wallet_deduction_data` JSONB'de saklanır). Nakit auto-confirm (ödeme teslimde), havale `waiting_payment` (admin makbuz onayı + `bank_transfer_receipts`).
4. `shop_order_items` insert + üst-seviye `stock_quantity` düşümü + `adjustVariantStock` ile **renk×beden varyant stoğu** düşümü.
5. COMMIT sonrası: `shop_customer` etiketi, admin'lere socket+bildirim, düşük-stok uyarısı, ödeme tamamsa fire-and-forget yönetici komisyonu (`recordShopCommission`).

### İptal / İade (`PATCH /:id/status`)
- **cancelled** (önceki≠cancelled): üst stok + varyant stoğu iade edilir (`adjustVariantStock restore:true`).
- **refunded** (payment=completed): `getEntityNetCharges({shopOrderId})` ile **gerçekte hangi para biriminde tahsil edildiyse** o para biriminde cüzdana iade (hibritte TRY/USD olabilir); ledger'da kayıt yoksa legacy EUR toplamına düşer. Idempotent `idempotencyKey` ile.

### Görsel optimizasyonu (`media.js`)
- `GET /api/media/img?src=/uploads/...&w=400` — `sharp` ile width-bucket'lı (`64..1600`) WebP üretir, diske cache'ler (sha1 anahtarı). Public mount; path-traversal koruması; `sharp` yoksa veya hata olursa **orijinale 302 redirect** (asla crash etmez). Prod backfill 3.2GB→906MB (bkz. MEMORY `shop_image_optimization`).
- **Disk backfill:** `backend/scripts/optimize-existing-uploads.js` — yazma-tarafı optimizasyonundan ÖNCE yüklenmiş ~3GB eski görseli (`images`, `service-images`, `form-backgrounds`, `form-logos` dizinleri) **yerinde** küçültür. Kritik fark: dosya **adı VE formatı değişmez** (DB referansları `products.image_url`/`images` JSONB, konaklama/avatar yollarına dokunulmaz) — sadece en uzun kenar `--max-dim`'e indirilir, metadata strip edilir, aynı formatta yeniden kodlanır. Varsayılan **DRY-RUN** (`--commit` ile yazar), dosya-başı try/catch, atomik temp+rename, yalnızca `--min-save`%'den fazla kazanç varsa yeniden yazar, animasyonlu/raster-olmayanları atlar, idempotent. Prod'da `docker compose exec backend node scripts/optimize-existing-uploads.js [--commit]` ile uploads volume'una karşı çalışır. WebP'ye çevirme DB-genelinde referans yeniden yazımı gerektirdiği için bilerek hariç tutulmuştur. Bkz. [[Operations_Scripts]] ve [[Catalog_Sync]].

## Dikkat / Tuzaklar

- **`resolveVariantUnitPrice` — varyant fiyatı, taban değil:** `products.price` (taban) `ProductForm`'da en ucuz varyanttan türetilir; bu yüzden checkout/FAB satışında seçilen `(size,color)` varyantının fiyatı çözülmezse **her beden en ucuza satılırdı**. Hem `shopOrders.js POST /` hem FAB satış yolu bunu kullanır (`unit_price` = varyant fiyatı, yoksa tabana düşer). Bkz. MEMORY `shop_discount_pricing_rental_delete_fixes` (#4).
- **`is_visible` istemciye güvenilmez kapı (migration 277):** Gizli ürünler **yalnız** ayrıcalıklı role (admin/manager/super_admin/receptionist/front_desk) döner; misafir/müşteri hangi parametreyi gönderirse göndersin `is_visible=true` zorlanır. `optionalAuth` token'ı sızdırmadan çözer; ayrıcalık **auth principal'dan** (`callerCanSeeHidden`), spoof edilebilir query param'dan **değil**. Cache anahtarı `:vis-priv/pub` ile bölünür (yoksa gizli ürün cache'ten sızar). `GET /:id` gizli ürüne 403 değil **404** döner (varlığını bile doğrulamamak için).
- **Beden-only (size-only) varyant tuzağı:** `ProductForm`/`VariantMatrix` renk yokken boş matris zorlayabilir → kayıt sırasında veri kaybı. `variantsAreSizeOnly` kapısı ve `legacyBySize` uyarısı (renk'siz eski stok cell'e konamaz, kullanıcıya yeniden-gir uyarısı) bunu yönetir. Stok eşleştirme renk YOKSA/varyantta renk YOKSA beden etiketine düşer. Bkz. MEMORY `product_edit_zero_stock_matrix`.
- **Fiyat asla düşmez kuralı:** Owner kuralı — fiyat orijinalin altına inmez; taban+varyantlar `GREATEST(current, original)` ile zeminlenir. Bkz. MEMORY `feedback_shop_prices_never_reduce`.
- **Satış-sonrası fiyat düzenleme cüzdanı oynatır:** `updateShopOrderItemPrice` `settleWallet=true` ise fark için **yeni** tx postalar (asla reversal değil — bakiye `SUM(available_delta WHERE completed)`'tan doğru türetilir). `shop_order` borç = shop geliri sayılır, `shop_order_refund` alacak gelirden hariç tutulur. Katalog `products.price` **asla** yazılmaz.
- **İndirimler ayrı tabloda:** Satır % indirimleri `discounts` tablosunda; `o.total_amount`'ı **mutasyona uğratmaz**, okuma anında `discountSumLateral` ile çıkarılır (`total_after_discount`). `o.total_amount` voucher indiriminden net ama discounts-tablosu indiriminden gross'tur. Bkz. [[Finances_Wallet]] ve MEMORY `discount_separate_table`.
- **İki ayrı PK tipi:** `products.id` = **UUID**, `shop_orders.id` = **SERIAL/INTEGER**. Bu yüzden cüzdan tx'leri sipariş id'sini `metadata.orderId`'de tutar (UUID `related_entity_id` kolonuna sığmadığı için) — finans birleştirmelerinde `COALESCE(related_entity_id::text, metadata->>'orderId')` deseni şarttır.
- **`equipment` ≠ `products`:** Ekipman silme rezervasyon/kiralama varsa engellenir (400) ve sadece `admin` yapabilir. Bu envanter satılmaz; sadece [[Bookings_Calendar]]/[[Accommodation_Rentals]] tüketir.
- **Cache:** Ürün mutasyonları `clearShopCache()` + `cacheInvalidationMiddleware(['api:GET:/api/products*'])` çağırır; `shop/by-category` ek 60sn bellek-içi cache kullanır. Düzenleme sonrası vitrin yenilenmezse cache şüphelenin.
