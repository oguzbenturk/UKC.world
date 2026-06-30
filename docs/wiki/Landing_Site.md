# Landing_Site

> **Özet:** `plannivo-landing/` ürünün herkese açık pazarlama sitesidir (`plannivo.com`) — ana React/Vite uygulamasından tamamen ayrı, build adımı olmayan, üç dosyalık bağımsız bir statik kod tabanıdır. İçerik denizci-editöryel bir estetikle CSS design token'ları üzerine kurulu olup, IntersectionObserver ile scroll-reveal animasyonu ve sahte (mock) bir demo lead formu içerir. Pazarlama anlatısı bilinçli olarak dürüsttür: 2025'te kuruldu, tek canlı müşteri Duotone Urla (UKC), tek canlı ödeme Iyzico.

> **Kütüphaneler:** Saf HTML5 + CSS3 (custom properties / variable fonts) + vanilla JS (IntersectionObserver, requestAnimationFrame); Google Fonts (Fraunces, Instrument Sans, JetBrains Mono); nginx static hosting. Build aracı YOK — framework YOK.

> **Bağlantılar:** [[Outsider_Marketing]], [[Deployment_Infrastructure]], [[Tech_Stack]], [[Architecture_Overview]], [[Frontend_Shell]], [[Index]]

---

## Sorumluluk

Bu modül, ana uygulamadan (`src/` React + Vite) **kasıtlı olarak izole** edilmiş bir pazarlama sitesidir. Amacı `plannivo.com` kök alan adında çalışıp ürünü (müşteriye özel bir merkez değil, **Plannivo'nun kendisini**) tanıtmak ve demo talebi toplamaktır. Ana uygulamadan ayrımlar:

- **Ayrı kod tabanı:** `plannivo-landing/` klasörü; Vite, React, npm bağımlılığı, `package.json` veya transpile adımı **yoktur**. Üç dosya doğrudan tarayıcıya servis edilir.
- **Ayrı alan adı:** `plannivo.com` / `www.plannivo.com` → landing; `ukc.plannivo.com` → ana uygulama (bkz. `infrastructure/nginx.conf`).
- Bu yüzden ana uygulamanın herkese açık pazarlama sayfalarından ([[Outsider_Marketing]] — `src/features/outsider/`, React Router içinde) farklıdır; o sayfalar uygulamanın bir parçasıyken bu site tamamen statiktir.

## Dosya Yapısı

`plannivo-landing/` altında (kaynaklar):

- `plannivo-landing/index.html` — tek sayfalık tüm içerik (semantik HTML, build adımsız). Bölümler: masthead/nav, hero, ticker, 02 Platform, 03 Product (mock dashboard), 04 Why, 05 Customers, 06 Demo (form), footer.
- `plannivo-landing/styles.css` — tüm stiller; `:root` içinde design token'ları, variable-font ayarları, responsive media query'ler, reveal/`prefers-reduced-motion` kuralları.
- `plannivo-landing/script.js` — IIFE içinde progressive enhancement: scroll-reveal, count-up, demo form, smooth scroll.
- `plannivo-landing/README.md` — local preview, deploy, design token tablosu ve "demo form gerçek backend'e nasıl bağlanır" notu.
- `plannivo-landing/.well-known/pki-validation/6BA651621922CB34EA1521D24DEF1DA2.txt` — SSL sertifika doğrulama dosyası (ZeroSSL/CA domain validation; bkz. [[Deployment_Infrastructure]] SSL renewal).

## Design Tokens (CSS Custom Properties)

`styles.css` içindeki `:root` paleti "su üzerinde erken sabah" temasını kodlar. README'deki anahtar token'lar:

| Token | Değer | Kullanım |
|---|---|---|
| `--bone` | `#F0EADD` | Sayfa arka planı (sıcak krem) |
| `--paper` / `--paper-soft` | `#F5F0E3` / `#F8F4EA` | Kartlar, ticker, ürün yüzeyi |
| `--ink` | `#141E28` | Birincil metin (derin denizci-siyah) |
| `--seafoam` | `#557872` | Marka aksanı, CTA'lar (mat teal) |
| `--clay` | `#B9876D` | Sıcak vurgu (mat terracotta) |
| `--line` | `#D8CEB6` | Kenarlık ve ayraçlar (sıcak ufuk çizgisi) |
| `--sand` | `#E5DCC8` | Takvim mock'unda nötr aksan |

Ayrıca `--ink-80..--ink-10` opaklık kademeleri; tipografi token'ları `--serif` (Fraunces), `--sans` (Instrument Sans), `--mono` (JetBrains Mono). Fraunces variable-font ekseni (`opsz`, `SOFT`, `wght`) başlık/italik vurgular için `font-variation-settings` ile ince ayarlanır. CLAUDE.md "light theme" kuralıyla uyumlu — palet tamamen aydınlıktır.

Görsel doku: `body::before` içinde inline SVG `feTurbulence` ile data-URI kağıt greni (`mix-blend-mode: multiply`); arka planda çoklu `radial-gradient` ile yumuşak su efektleri.

## Frontend Davranışı (`script.js`)

Tamamen **progressive enhancement** — içerik JS olmadan da görünür. Tek bir IIFE `'use strict'` içinde:

- **JS gate:** `document.documentElement.classList.add('js-ready')` — reveal animasyonları yalnızca `.js-ready .reveal` seçicisiyle aktifleşir, böylece JS yoksa içerik gizlenmez.
- **Scroll-reveal:** `IntersectionObserver` (`threshold: 0.12`, `rootMargin: '0px 0px -40px 0px'`) görünür olan `.reveal` elemanlarına `.is-visible` ekler ve `unobserve` eder. Stagger gecikmesi CSS değişkeni `--d` ile (HTML'de `style="--d:120ms"` gibi) verilir.
- **Count-up:** `[data-count]` elemanları için `requestAnimationFrame` + `easeOutExpo` ile sayı animasyonu (`threshold: 0.5`). NOT: mevcut HTML'de `data-count` özniteliği kullanılmıyor (ticker statik metin: "2025", "One academy" vb.) — kod gelecekteki sayısal ticker için hazır bekliyor.
- **Demo formu:** `#demo-form` submit edildiğinde `e.preventDefault()`, butonu disable edip "Sending…" gösterir, **sahte** `await new Promise(r => setTimeout(r, 900))` gecikmesiyle `.is-sent` class'ı ekler (CSS başarı mesajını gösterir). Gerçek backend YOK — README'deki notla `fetch()` ile değiştirilmesi gerekir.
- **Smooth scroll:** Tüm `a[href^="#"]` bağlantıları için `scrollIntoView({behavior:'smooth'})`.

## İçerik / Pazarlama Anlatısı (Ground Truth)

Site MEMORY'deki "landing page honesty remake" (2026-06-16) kararıyla **kasıtlı olarak abartısız** yazılmıştır — uydurma logo duvarı veya sahte müşteri sayısı yoktur:

- **Founded 2025 / live since 2025** — ticker ve "05 Customers" bölümünde.
- **Tek canlı müşteri:** Duotone Pro Center Urla (UKC), `ukc.plannivo.com`'a canlı link. "One academy, run for real since 2025."
- **Tek canlı ödeme:** Iyzico (kart ödemeleri) — "03 Finance & payroll: Iyzico card payments, cash-at-centre" (bkz. [[Payments_Currency]]).
- **Dürüstlük rozetleri:** ürün mock'unun altında `.product-caption` "Illustrative dashboard — a representative view, not live customer data."; davet kartı (`.cust-invite`) dashed seafoam dokusuyla "An invitation, not a logo wall" — canlı müşteriyle karıştırılamaz.
- Disiplinler: Kite · Wing · Foil. Konumlama: "built from the inside of a Duotone pro center, not adapted from a yoga-studio tool." Mock dashboard `ukc.plannivo.com/dashboard`, `v0.1.315 · live` etiketi taşır.

## Deploy / Servis (nginx)

`infrastructure/nginx.conf` içinde landing iki blokla servis edilir (bkz. [[Deployment_Infrastructure]]):

- **HTTP (port 8080)** — `server_name plannivo.com www.plannivo.com`: ACME challenge + `pki-validation` (SSL doğrulama) alias'ları servis edilir, geri kalanı `return 301 https://plannivo.com$request_uri` ile HTTPS'e yönlendirilir.
- **HTTPS (port 8443 ssl)** — `root /usr/share/nginx/plannivo-landing; index index.html;`. Kritik kural: `location / { try_files $uri $uri/ /index.html; }` (SPA-vari fallback). Statik varlıklar (`js|css|png|...|woff2`) için `expires 1y` + `Cache-Control: immutable`. gzip açık; `security-headers.conf` include edilir.
- Ana uygulama (`ukc.plannivo.com`) ayrı server bloklarında React build'ini + `/api`, `/uploads` proxy'lerini servis eder — landing ile karışmaz.

README'deki alternatif deploy: üç dosyayı herhangi bir statik host'a (Netlify, Vercel, S3, nginx) yükle, `plannivo.com` DNS'ini oraya yönlendir. Local preview: `npx serve .` → `http://localhost:3000` veya `index.html`'i doğrudan aç.

## Veri Modeli

Yok. Tamamen statik — veritabanı, API çağrısı veya kalıcı durum yoktur. Demo formu hiçbir yere veri göndermez (sahte gecikme). Gerçek lead toplama için backend entegrasyonu **henüz yapılmamıştır**.

## Dikkat / Tuzaklar

- **Bu site ana uygulamanın `push-all` deploy akışına dahil DEĞİLDİR.** Ayrı kod tabanı olduğundan `dist/` build'ine girmez; nginx onu `/usr/share/nginx/plannivo-landing`'den ayrı servis eder. Güncelleme bu klasöre dosya yüklemeyi gerektirir.
- **Demo formu fonksiyonel değil:** submit sadece UI'da başarı gösterir; hiçbir e-posta/lead kaydedilmez. Gerçek dünyada lead kaçırma riski — backend bağlanana kadar form yanıltıcı olabilir. README'de açıkça belirtilmiş.
- **`data-count` kodu ölü:** `animateCount`/`tickerObserver` mantığı mevcut HTML'de tetiklenmez (ticker'da `data-count` yok). Sayısal ticker eklenirse otomatik çalışır; aksi halde gereksiz koddur.
- **Dürüstlük anlatısını koruyun:** İçerik bilinçli olarak tek müşteri / 2025 / sadece Iyzico anlatısına sadıktır. Yeni müşteri veya canlı ödeme sağlayıcı eklenmedikçe sayıları şişirmeyin (MEMORY honesty-remake kuralı).
- **SSL doğrulama dosyası:** `.well-known/pki-validation/...txt` ZeroSSL 90 günlük manuel yenileme döngüsünün parçasıdır; CA değişirse içeriği güncellenmeli (bkz. [[Deployment_Infrastructure]] SSL renewal notu).
- **Karıştırmayın:** [[Outsider_Marketing]] (uygulama içi `src/features/outsider/` — Academy/Rental/Guest landing sayfaları, React Router) ayrı bir şeydir; bu node yalnızca `plannivo.com` kök statik sitesini kapsar.
