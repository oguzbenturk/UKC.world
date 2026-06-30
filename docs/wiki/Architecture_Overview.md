# Architecture Overview

> **Özet:** Plannivo, kitesurf/su sporları akademileri için uçtan uca bir iş yönetim platformudur; React 18 SPA (frontend) ile Express 5 REST API'sinin (backend) PostgreSQL üzerinde çalıştığı, Redis + Socket.io ile zenginleştirilmiş, Docker ile dağıtılan tek bir monorepo'dur. Mimari **özellik-dilimli (feature-sliced)**: her iş alanı kendi frontend `feature` klasörü + backend route + service üçlüsüyle dikey bir dilim oluşturur. Bu düğüm, sistemin kuşbakışı haritası ve tüm alan düğümlerine açılan ana kapıdır.
>
> **Kütüphaneler:** React 18, Vite, Express 5 (ESM), PostgreSQL (pg), Redis (ioredis), Socket.io, Decimal.js, Iyzico, Docker.
>
> **Bağlantılar:** [[Index]], [[Tech_Stack]], [[Frontend_Shell]], [[Backend_Server]], [[Database]], [[Authentication_Authorization]], [[Deployment_Infrastructure]], [[Finances_Wallet]], [[Notifications_System]], [[Payments_Currency]]

---

## Sorumluluk

Bu düğüm tekil bir modülü değil, **sistemin bütününü** anlatır: katmanlar nasıl dizilir, bir istek uçtan uca nasıl akar, iş alanları nasıl bölünür ve hangi kurallar tüm kod tabanını yatay olarak keser. Belirli bir modüle inmek için ilgili düğümün wiki-linkini izle.

---

## Sistem Topolojisi

```
[Tarayıcı / React SPA]
        │  HTTPS
        ▼
[Host nginx — TLS termination]         (production; bkz. [[Deployment_Infrastructure]])
        │  /api, /uploads proxy
        ▼
[Express 5 API]  ──────►  [PostgreSQL]   (kalıcı durum; bkz. [[Database]])
   │   │   │       ──────►  [Redis]        (oturum, cache, rate-limit)
   │   │   └─────── Socket.io ◄──► [Tarayıcı]  (gerçek zamanlı; bkz. [[Chat_Community_Events]])
   │   └─────────── Iyzico    (ödeme; bkz. [[Payments_Currency]])
   └─────────────── Nodemailer/Resend, Telegram (bildirim; bkz. [[Notifications_System]])
```

Geliştirmede (dev) host nginx yoktur; **Vite dev sunucusu** `/api` ve `/uploads` isteklerini `localhost:4000`'e proxy'ler (`vite.config.js`). Üretimde tüm yığın 5 Docker servisidir (frontend, backend, postgres, redis, nginx).

---

## İstek Yaşam Döngüsü (Backend)

Bir API isteği `backend/server.js` içindeki middleware zincirinden geçer (bkz. [[Backend_Server]]):

1. **helmet** + **CORS** (`middlewares/security.js` — `allowedHeaders` içinde `X-CSRF-Token`)
2. **Rate limit** — `authRateLimit` (auth uçları, sıkı) / `apiRateLimit` (genel)
3. **Body parse** + XSS sanitizasyonu
4. **CSRF** (`csrfMiddleware`, double-submit cookie; `CSRF_EXEMPT_PREFIXES` public POST'ları muaf tutar)
5. **authenticateJWT** — token doğrulama, Redis `blacklist:<jti>` + `session_revoked_after:<uid>` kontrolü (bkz. [[Authentication_Authorization]])
6. **Route handler** → **Service** → **`db.js` (pg Pool, parametreli SQL)**
7. Finansal yan etki varsa **`walletService`** defter kaydı atomik transaction içinde yazılır (bkz. [[Finances_Wallet]])

Yetkilendirme iki katmanlıdır: JWT'ye gömülü **rol adı** + `roles.permissions` (JSONB) **granüler izinler** — böylece custom roller de korunur.

---

## Katmanlar

| Katman | Konum | Sorumluluk |
|--------|-------|-----------|
| Frontend özellikleri | `src/features/<alan>/` | Sayfalar, bileşenler, alan-özel mantık (35+ modül) |
| Frontend paylaşımı | `src/shared/`, `src/routes/`, `src/components/` | Routing, context, api client, nav — bkz. [[Frontend_Shell]] |
| Backend rotalar | `backend/routes/` | HTTP yüzeyi (~70 router), doğrulama, yetki |
| Backend servisler | `backend/services/` | İş mantığı (~90 servis), SQL, finansal kurallar |
| Veri | `backend/db/migrations/` | Şema (authoritative klasör) — bkz. [[Database]] |

**Akış yönü:** `route → service → db`. Rotalar ince, servisler kalın; ORM yoktur, SQL elle yazılır.

---

## Alan Haritası (Dikey Dilimler)

**Operasyon çekirdeği**
- [[Bookings_Calendar]] — ders/grup rezervasyonları, takvimler (sistemin kalbi)
- [[Lessons_Services_Packages]] — hizmet katalogu, ders paketleri, FIFO saat tüketimi
- [[Accommodation_Rentals]] — konaklama (stay) + ekipman kiralama
- [[Memberships]] — VIP/sezonluk üyelikler, depo (storage box)
- [[Products_Shop_Inventory]] — mağaza, varyantlar, envanter, ekipman, yedek parça

**Finans**
- [[Finances_Wallet]] — cüzdan defteri, indirimler, finans sayfaları, giderler
- [[Payments_Currency]] — Iyzico ödeme, çoklu para birimi, kur
- [[Instructors_Payroll]] — eğitmen/müdür komisyonları, maaş

**İnsanlar**
- [[Customers_CRM]] — müşteri yönetimi, aile grupları, ilişkiler
- [[Student_Portal]] — müşteri/öğrenci self-service portalı
- [[Authentication_Authorization]] — kimlik, rol, oturum

**Müşteri-yüzü & büyüme**
- [[Outsider_Marketing]] — public landing sayfaları, mağaza vitrini, pazarlama, voucher
- [[Proposals_Quotes]] — Teklif Hazırla (PDF teklif)
- [[Warranty_Repairs]] — UKC.Care garanti + tamir talepleri
- [[Forms_Waivers_Compliance]] — form builder, waiver imza, KVKK/GDPR

**Platform & yatay servisler**
- [[Backend_Server]] · [[Database]] · [[Frontend_Shell]] · [[Deployment_Infrastructure]]
- [[Notifications_System]] — in-app/email/telegram/realtime bildirim
- [[Dashboard_Metrics_Admin]] — gösterge panelleri, metrikler, ayarlar, audit
- [[Chat_Community_Events]] — sohbet, topluluk, etkinlikler
- [[Weather_WindReport]] — rüzgar/hava raporu
- [[Misc_Integrations]] — Spotify, Quick Links, Kai AI asistanı, help

**Operasyon, test & paylaşılan katman** (domain dışı, ama "çalışan her şey")
- [[Operations_Scripts]] — bağımsız çalışan ~90 script (veri-tamiri, backfill, deploy/SSL teşhisi, prod audit)
- [[Testing_QA]] — test piramidi (Vitest/Jest/Playwright) + finansal bütünlük denetleyici
- [[Shared_Backend_Utilities]] — domain-ötesi paylaşılan yardımcılar & enum tek-kaynağı
- [[Landing_Site]] — ayrı statik pazarlama sitesi (`plannivo-landing/`)
- [[Catalog_Sync]] — xtremspor shop fiyat senkron araç seti (`catalog-sync/`)

---

## Yatay Kesen Kavramlar (Cross-cutting)

- **Para = Decimal.js.** Hem frontend hem backend; float ile para hesabı yasak. Tüm hareketler `wallet_transactions` defterine yazılır; `wallet_balances` yalnızca **cache**'tir (SUM completed'den yeniden hesaplanabilir). Bkz. [[Finances_Wallet]].
- **İndirimler ayrı tabloda.** `discounts` tablosu; ham fiyat sütunları **asla** mutasyona uğratılmaz. Net tutar `getActiveDiscountAmount`/`discountSumLateral` ile çıkarılır.
- **Çoklu para birimi.** EUR taban; TRY/USD kur ile dönüştürülür (`exchangeRateService`). Bkz. [[Payments_Currency]].
- **Rol & izin.** JWT rol adı + JSONB izinler; rol değişince Redis ile oturum iptali. Custom roller `ProtectedRoute` ve `navConfig`'de özel ele alınır.
- **Bildirim.** Birleşik dispatcher in-app + email (Resend teslimat takibi) + telegram + socket. Bkz. [[Notifications_System]].
- **Audit & soft-delete.** `audit_logs` (7 yıl saklama), soft-delete servisleri; silinen kayıtlar geri alınabilir.

---

## Dağıtım

`npm run dev` ile local (frontend Vite :3000, backend Nodemon :4000, local Docker Postgres/Redis); `npm run push-all` ile production'a env-swap → version bump → commit/push → SSH ile sunucu rebuild. **Local dev asla production DB'ye yazmaz** (`localhost:5432/plannivo_dev`). Ayrıntı: [[Deployment_Infrastructure]].

---

## Dikkat / Tuzaklar (Repo Geneli)

- **Authoritative migration klasörü** `backend/db/migrations/`'tir — `backend/migrations/` DEĞİL (bkz. [[Database]]).
- **`customer_packages.status` enum'ında `'completed'` YOK** — `'used_up'` kullanılır; yanlışı PUT /bookings/:id 500 döngüsüne yol açar (bkz. [[Lessons_Services_Packages]]).
- **Frontend↔Backend ayna mantığı:** `accommodationPricing.js` ↔ `accommodationPricingService.js` senkron kalmalı (bkz. [[Accommodation_Rentals]]).
- **Karışık UI kütüphaneleri** (antd + MUI + Headless + Tailwind) — yeni bileşende mevcut sayfanın stilini takip et (bkz. [[Tech_Stack]]).
- **ESM her yerde** (`type: module`); `require` yok.
