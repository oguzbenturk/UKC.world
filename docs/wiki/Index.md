# Index — Plannivo Bilgi Grafiği

> **Özet:** Bu dosya, Plannivo (UKC.world) kod tabanının Obsidian formatındaki mimari hafızasının **ana haritasıdır**. Her düğüm bir iş alanını veya platform katmanını anlatır; düğümler Obsidian wiki-linkleriyle birbirine bağlıdır. Yeni bir özellik/plan istendiğinde önce buradan ilgili düğüme git (QUERY), kodu baştan taramak yerine.
>
> **Kütüphaneler:** React 18 + Vite (frontend), Express 5 ESM (backend), PostgreSQL, Redis, Socket.io, Iyzico, Docker — ayrıntı: [[Tech_Stack]].
>
> **Bağlantılar:** [[Architecture_Overview]], [[Tech_Stack]], [[Backend_Server]], [[Frontend_Shell]], [[Database]]

---

## Bu Wiki Nasıl Kullanılır?

Kurallar `wiki_schema.md`'de tanımlıdır. İki operasyon vardır:

- **INGEST** — Kodu (veya son değişiklikleri) tara, mimariyi anla, `/docs/wiki` içine bağlı düğümler yaz ve bu `[[Index]]`'i güncelle.
- **QUERY** — Yeni bir mimari plan/özellik istendiğinde, **önce buraya gel**, ilgili düğümleri oku, sonra plan çıkar.

> Son INGEST: 2026-10-07 (eğitmen kazanç sayfası + **ödeme talepleri**: migration 292 `instructor_payout_requests`, `instructorPayoutService` (NET dönem kazancı, FIFO paid/pending, TRY→EUR, CSV ekstre), `/api/instructors/me/earnings-*` + `/me/payout-requests`, admin/müdür `/api/finances/payout-requests` (öde = ortak `recordInstructorPayment` tek transaction'da, reddet = gerekçe zorunlu), `/finance/payout-requests` sayfası + nav rozeti, admin+müdüre in-app/Telegram (EN/TR) bildirim + `payout_request:updated` socket: [[Instructors_Payroll]], [[Notifications_System]]) · aynı gün (test paketi yeşil + deploy öncesi kapı `npm run test:ci` (backend Jest `--runInBand` + frontend Vitest; lokal-olmayan DB'de backend testleri reddedilir; Jest pg havuzu küçültüldü; 6 gerçek hata düzeltildi — feedback UUID sahiplik/`lesson_date`, voucher `/campaigns` rota sırası, groupBookings gövdesiz `req.body`, accommodation ROLLBACK, permissionService, roleUpgradeService: [[Testing_QA]]) · aynı gün (`users.avatar_url` kolonu YOK — `teamSettingsService` (takım ayarları kaydı 500), `instructorSkills` (hizmete uygun eğitmen listesi), `userRelationshipsService` artık `profile_image_url AS avatar_url`; `/finances/summary` `total_revenue` Decimal.js toplamı: [[Instructors_Payroll]], [[Finances_Wallet]]) · aynı gün (iki gizli hata: online kart (iyzico) mağaza siparişi callback'te hiç onaylanmıyordu — `pending_payment` ↔ `pending` uyuşmazlığı; artık atomik sahiplenme + voucher bir kez + başarısız ödemede `failed` + stok iadesi [[Payments_Currency]], [[Products_Shop_Inventory]]; finans raporları bitiş gününü 00:00'da kesiyordu (`transaction_date <= $2::date`) → `/summary`, P&L, revenue-analytics, cash-mode vb. artık `< $2::date + 1 gün` [[Finances_Wallet]]) · aynı gün (açık kalanlar: ortak `REFUND_TYPES`'a `rental_refund` eklendi + `/overview` artık `/summary` gibi `transaction_date` ile [[Finances_Wallet]]; düzeltme öncesi mağaza voucher kullanımları migration 291 ile geriye dolduruldu, iyzico shop callback `pending_payment` uyuşmazlığı bulgusu [[Products_Shop_Inventory]]) · aynı gün (güvenlik + hata turu: kullanıcı gizli kolonları API/socket yanıtlarında sızıyordu → `sanitizeUser(s)` her yolda [[Authentication_Authorization]]; `users.role` kolonu olmayan 4 sorgu (personel+voucher rezervasyonu 400, iyzico outsider→student yükseltmesi) [[Bookings_Calendar]]; mağaza voucher kullanımı kaydedilmiyordu [[Products_Shop_Inventory]]; `/finances/overview` işaret/kur/float hataları [[Finances_Wallet]]; frontend healthcheck IPv6 [[Deployment_Infrastructure]]) · aynı gün (negatif cüzdana iade kredisi "Insufficient wallet balance" ile 500 veriyordu — `recordTransaction` guard'ı + overdraft tabanı artık yalnız bakiyeyi aşağı çeken satırı reddeder, kredi/sıfır-delta her zaman geçer; regresyon testi `wallet-negative-balance-credit.test.js`: [[Finances_Wallet]]) · önceki 2026-09-09 (partial paket+cash dersin checkout süre reprice'ı — eski cash leg indirim-net, yeni cash leg brüt okunuyordu → 1.5h→2h checkout'ta +€60 yerine +€47,50 brüt/+€35 net; indirim rebase'i partial'da ders değeri yerine cash leg'e bağlandı (€42,55 hayalet indirim); `getEntityNetCharges({excludeDiscounts})`; checkout diyaloğunda süre-farkı uyarısı; Maria Mordovira verisi personel silme/yeniden-açma ile zaten temiz, onarım gerekmedi: [[Bookings_Calendar]], [[Finances_Wallet]]) · önceki 2026-09-06 (mağaza sipariş sayfası — `Order` hücresi ürün küçük resmi + adı (yoksa yer tutucu) üstte, sipariş no · tarih altta; `Customer` tam ad + telefon; `Items` sütunu kaldırıldı; **ardından sayfa yeniden tasarımı:** Instructors-tarzı başlık barı + sayaç çipleri, düşük-stok şeridi, hap durum sekmeleri, filtre barı içinde View seçici, hap durum/ödeme rozetleri, yeni `components/orders/{OrderManagementUi.jsx,orderPresentation.js}`, `ShopOrdersPage` artık tam sayfa; **ardından ödeme etiketi düzeltmesi:** cüzdana yazılan (`wallet`+`completed`) sipariş "Paid" değil **"On account"**, altında müşteri bakiyesinden "Owes €X"/"Settled" (`GET /admin/all` → `customer_balances`; staff bakiye uçlarında `api:shop:orders:*` cache düşürme); test `OrderManagement.test.jsx` 15 senaryo: [[Products_Shop_Inventory]], [[Finances_Wallet]]) · aynı gün (paket cascade-silmesi yetim `package_price_adjustment` bırakıyordu — `forceDeleteCustomerPackage({ cancelLinkedCharges })` paketin kalan purchase/adjustment satırlarını iptal eder, iade yolu dokunulmadı; onarım scripti `repair-orphaned-package-price-adjustments.mjs` + prod runner; Mercan KS23 −279.49 → +0.51: [[Finances_Wallet]], [[Lessons_Services_Packages]], [[Operations_Scripts]]) · önceki 2026-09-05 (taban para birimi oranı 1.0'a sabitlendi — migration 290 + CHECK kısıtı, elle kur girişi audit'li ve oto-güncellemeyi kapatır, cron cache düşürme, Add Balance ↔ TRY/EUR önizleme + `currencyPreview.js`; **devamı:** "euro kuru" `CustomerRateCard`'da elle düzenlenir (1 EUR = ? TRY → TRY satırı), taban satırında yönlendirme ipucu; deploy'un Redis'i temizlememesi → açılışta `api:*` flush: [[Payments_Currency]], [[Backend_Server]]) · önceki 2026-09-03 (envanter sayfası — fasetli filtreler (tip/beden/alt-tür/marka/kondisyon/durum, URL'de), kanonik beden anahtarı, kompakt beyaz başlık + sekmeler, tek-tık bakım durumu, CSV: [[Products_Shop_Inventory]]) · önceki 2026-09-02 (v0.1.381 — grup indirimi katılımcı-başına bölünmesi + silinen rezervasyonda hayalet alacak + üyelik gün-sayımı tarih normalizasyonu: [[Bookings_Calendar]], [[Finances_Wallet]], [[Memberships]], [[Operations_Scripts]]) · önceki 2026-08-30 (banka-havalesi alacak modeli — [[Finances_Wallet]] + 5 domain düğümü) · önceki tam tarama 2026-06-30 · **32 düğüm** + bu index · Tüm wiki-linkleri çözülüyor (sarkan node linki yok). Kapsam: tüm frontend feature'ları, ~73 route, ~90 servis, bağımsız çalışan scriptler/cron, test paketi, paylaşılan katman ve ayrı alt-projeler (landing sitesi, catalog-sync) dahil — "eksiksiz beyin".

---

## 🧭 Başlangıç Noktaları

- [[Architecture_Overview]] — **Buradan başla.** Sistemin kuşbakışı haritası, istek yaşam döngüsü, katmanlar, alan haritası ve repo-geneli tuzaklar.
- [[Tech_Stack]] — Tüm teknoloji ve kütüphanelerin referans tablosu (frontend/backend/test/dağıtım).

---

## 🏗️ Platform & Altyapı

- [[Backend_Server]] — Express bootstrap, ~70 router mount sırası, middleware zinciri, cron işleri.
- [[Database]] — PostgreSQL şema haritası, ~283 migration, ana tablo aileleri (authoritative klasör: `backend/db/migrations/`).
- [[Frontend_Shell]] — React kabuğu, lazy routing, `ProtectedRoute`, paylaşılan context/api-client/nav.
- [[Authentication_Authorization]] — Login, JWT + JSONB izinler, refresh token, 2FA, oturum iptali.
- [[Notifications_System]] — Birleşik dispatcher: in-app + email (Resend takip) + Telegram + realtime socket.
- [[Deployment_Infrastructure]] — Docker compose (5+ servis), `push-all` akışı, nginx/TLS, local DB izolasyonu.

---

## 🏄 Operasyon Çekirdeği

- [[Bookings_Calendar]] — Ders/grup rezervasyonları, takvimler, `PUT /bookings/:id` atomik finansal cascade. *(Sistemin kalbi.)*
- [[Lessons_Services_Packages]] — Hizmet katalogu, ders paketleri, FIFO saat tüketimi, üye %50 fiyatlama.
- [[Accommodation_Rentals]] — Konaklama (stay) + ekipman kiralama; per-guest occupancy pricing.
- [[Memberships]] — VIP/sezonluk üyelikler, depo (storage box), beach-fee komisyonu.
- [[Products_Shop_Inventory]] — Mağaza ürünleri + varyantlar, envanter, akademi ekipmanı, yedek parça.

---

## 💰 Finans

- [[Finances_Wallet]] — Cüzdan defteri (`wallet_transactions`), indirimler (ayrı tablo), finans sayfaları, giderler. *(En bağlı düğüm.)*
- [[Payments_Currency]] — Iyzico ödeme ağ geçidi, çoklu para birimi, kur servisi.
- [[Instructors_Payroll]] — Eğitmen/müdür komisyonları, kısmi ders değeri, maaş/payroll.

---

## 👥 İnsanlar

- [[Customers_CRM]] — Müşteri yönetimi, sunucu-taraflı liste/arama, küresel çekmece, aile grupları.
- [[Student_Portal]] — Müşteri/öğrenci self-service portalı (feature-flag'li), filtreli cüzdan görünümü.

---

## 🌐 Müşteri-Yüzü & Büyüme

- [[Outsider_Marketing]] — Public landing sayfaları, mağaza vitrini, pazarlama, voucher, GTM analytics.
- [[Proposals_Quotes]] — Teklif Hazırla: çok-dilli PDF teklif, public `/teklif/:code`.
- [[Warranty_Repairs]] — UKC.Care garanti (public form + kod-takip) + tamir talepleri.
- [[Forms_Waivers_Compliance]] — Form builder, waiver dijital imza, KVKK/GDPR, yasal belgeler.

---

## ⚙️ Platform Servisleri & Yardımcılar

- [[Dashboard_Metrics_Admin]] — Rol-bazlı gösterge panelleri, Prometheus metrikleri, ayar merkezi, audit log.
- [[Chat_Community_Events]] — Gerçek zamanlı DM widget, topluluk team page, etkinlikler.
- [[Weather_WindReport]] — `/wind-report`, canlı PWS (Weather Underground) + Windguru fallback.
- [[Misc_Integrations]] — Spotify (singleton), Quick Links, Kai AI asistanı (n8n), help, popups, forecast.

---

## 🛠️ Operasyon, Test & Paylaşılan Katman

Uygulama domain'lerinin dışında kalan ama "çalışan her şey" kapsamına giren katmanlar:

- [[Operations_Scripts]] — `backend/scripts/` + `scripts/` altındaki ~90 bağımsız script: incident veri-tamiri, backfill, import/reset, deploy-killer teşhisi, SSL, prod audit, bakım.
- [[Testing_QA]] — Test piramidi (Vitest/Jest/Playwright), ~271 dosyalık paket, master test koşucusu + finansal bütünlük denetleyici (`check-integrity`).
- [[Shared_Backend_Utilities]] — Domain-ötesi paylaşılan yardımcılar & sabitler: `paymentSplit`, `financialValidation`, `sanitizeUser`, `errorCodes`, `constants/transactions` enum tek-kaynağı.
- [[Landing_Site]] — `plannivo-landing/`: ana uygulamadan ayrı, build-adımsız statik pazarlama sitesi.
- [[Catalog_Sync]] — `catalog-sync/`: xtremspor TRY→EUR tek-seferlik manuel shop fiyat senkron araç seti.

---

## 🔗 Merkez (God) Düğümler

Grafikteki en çok bağlanan düğümler — bir değişiklik bunlara dokunuyorsa dikkatli ol:

| Düğüm | Gelen Link | Rolü |
|-------|-----------:|------|
| [[Finances_Wallet]] | 57 | Tüm para hareketlerinin defteri |
| [[Notifications_System]] | 41 | Tüm bildirim kanalları |
| [[Authentication_Authorization]] | 40 | Kimlik & yetki |
| [[Database]] | 39 | Kalıcı durum |
| [[Bookings_Calendar]] | 35 | Operasyonun kalbi |
| [[Customers_CRM]] | 33 | Müşteri verisi |
| [[Backend_Server]] | 32 | API çatısı |
| [[Payments_Currency]] | 31 | Ödeme & para birimi |

---

## ⚠️ Repo-Geneli Altın Kurallar

1. **Para = Decimal.js** — float ile para hesabı yasak ([[Finances_Wallet]], [[Tech_Stack]]).
2. **İndirimler ayrı `discounts` tablosunda** — ham fiyat sütunları mutasyona uğratılmaz.
3. **`customer_packages.status` = `'used_up'`**, `'completed'` değil ([[Lessons_Services_Packages]]).
4. **Authoritative migration klasörü** `backend/db/migrations/` ([[Database]]).
5. **Frontend↔Backend ayna dosyalar** senkron kalmalı ([[Accommodation_Rentals]]).
6. **Local dev asla production DB'ye yazmaz** ([[Deployment_Infrastructure]]).
