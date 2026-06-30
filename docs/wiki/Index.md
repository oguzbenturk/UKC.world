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

> Son INGEST: 2026-06-30 · **32 düğüm** + bu index · Tüm wiki-linkleri çözülüyor (sarkan node linki yok). Kapsam: tüm frontend feature'ları, ~73 route, ~90 servis, bağımsız çalışan scriptler/cron, test paketi, paylaşılan katman ve ayrı alt-projeler (landing sitesi, catalog-sync) dahil — "eksiksiz beyin".

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
