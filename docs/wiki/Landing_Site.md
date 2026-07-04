# Landing_Site

> **Özet:** `plannivo-landing/` ürünün herkese açık pazarlama sitesidir (`plannivo.com`) — ana React/Vite uygulamasından tamamen ayrı, build adımı olmayan, üç dosyalık bağımsız bir statik kod tabanıdır. 2026-07-04 "Sea-glass" yeniden tasarımı (4 paralel varyant arasından seçildi; adaylar `variants/` klasöründe): su-berraklığında premium SaaS estetiği — beyaz + çok hafif aqua zemin, petrol mürekkep `#073036`, tek turkuaz→azur gradyan (`#0BB5A6→#1E90E8`) yalnız vurucu kelimeler/CTA'larda; feTurbulence "caustic" su-ışığı örtüsü, hero'da yüzen cam enstrüman çipleri (wind/gusts/water), bento feature grid, 3D-tilt ürün çerçevesi. Yeni #promise bölümü: "Don't like something? We change it." — her müşteriye SINIRSIZ güncelleme sözü. Demo formu backend'siz `mailto:hello@plannivo.com` açar. Pazarlama anlatısı bilinçli olarak dürüsttür ve pitch'in kendisidir ("One customer. On purpose." / "Be the second."): 2025'te kuruldu, tek canlı müşteri Duotone Urla (UKC), tek canlı ödeme Iyzico.

> **Kütüphaneler:** Saf HTML5 + CSS3 (custom properties / variable fonts, SVG feTurbulence+SMIL) + vanilla JS (IntersectionObserver, pointer-tilt); Google Fonts (Bricolage Grotesque display, Hanken Grotesk body, JetBrains Mono); nginx static hosting. Build aracı YOK — framework YOK. `variants/` (seaglass/horizon/regatta/goldenhour) yalnız yerel karşılaştırma içindir — PRODUCTION'A YÜKLENMEZ.

> **Bağlantılar:** [[Outsider_Marketing]], [[Deployment_Infrastructure]], [[Tech_Stack]], [[Architecture_Overview]], [[Frontend_Shell]], [[Index]]

---

## Sorumluluk

Bu modül, ana uygulamadan (`src/` React + Vite) **kasıtlı olarak izole** edilmiş bir pazarlama sitesidir. Amacı `plannivo.com` kök alan adında çalışıp ürünü (müşteriye özel bir merkez değil, **Plannivo'nun kendisini**) tanıtmak ve demo talebi toplamaktır. Ana uygulamadan ayrımlar:

- **Ayrı kod tabanı:** `plannivo-landing/` klasörü; Vite, React, npm bağımlılığı, `package.json` veya transpile adımı **yoktur**. Üç dosya doğrudan tarayıcıya servis edilir.
- **Ayrı alan adı:** `plannivo.com` / `www.plannivo.com` → landing; `ukc.plannivo.com` → ana uygulama (bkz. `infrastructure/nginx.conf`).
- Bu yüzden ana uygulamanın herkese açık pazarlama sayfalarından ([[Outsider_Marketing]] — `src/features/outsider/`, React Router içinde) farklıdır; o sayfalar uygulamanın bir parçasıyken bu site tamamen statiktir.

## Dosya Yapısı

`plannivo-landing/` altında (kaynaklar):

- `plannivo-landing/index.html` — tek sayfalık tüm içerik (semantik HTML, build adımsız). Bölümler: sticky masthead/nav, hero ("Spreadsheets don't survive saltwater." + caustics/windfield SVG + cam enstrüman çipleri), marquee bandı, #problem (junk-list vs "One surface" paneli), #product (3D-tilt mock dashboard — takvim mock'u 2026-07-04'te kaldırıldı, yerinde `.prod-video` VİDEO SLOTU: gerçek uygulama filmi `tour.mp4` bekliyor; ekleme talimatı README + HTML yorumu), #platform (bento feature grid + creed), #proof ("One customer. On purpose." + UKC canlı kart / davet kartı), #promise (buzlu cam "Don't like something? We change it." sınırsız güncelleme sözü), #demo ("Be the second." + form), footer. Baş kısımda paylaşılan `<svg><defs>` bloğu (`#fCaustics`, sparkline/marka gradyanları). Motion katmanı (2026-07-04): develop-blur başlık girişleri (`.reveal-develop`), yavaş kayan gradyan kelimeler (`.grad` gradDrift), kendini çizen sparkline'lar (pathLength=1 + dashoffset), count-up mock istatistikleri (`[data-count]`), suda salınan ürün çerçevesi (floaty), promise camında ışık süpürmesi, sonar canlı-noktalar, junk-list kaskadı, chip girişleri, marquee kenar maskesi — hepsi prefers-reduced-motion'da kapalı.
- `plannivo-landing/variants/` — 2026-07-04 tasarım turunun 4 adayı (`seaglass.html` = ana sayfaya terfi etti, `horizon.html`, `regatta.html`, `goldenhour.html`); her biri kendi içinde tam sayfa (inline CSS/JS). Yalnız yerel karşılaştırma — deploy edilmez.
- `plannivo-landing/styles.css` — tüm stiller; `:root` içinde design token'ları, variable-font ayarları, responsive media query'ler, reveal/`prefers-reduced-motion` kuralları.
- `plannivo-landing/script.js` — IIFE içinde progressive enhancement: scroll-reveal, count-up, demo form, smooth scroll.
- `plannivo-landing/README.md` — local preview, deploy, design token tablosu ve "demo form gerçek backend'e nasıl bağlanır" notu.
- `plannivo-landing/.well-known/pki-validation/6BA651621922CB34EA1521D24DEF1DA2.txt` — SSL sertifika doğrulama dosyası (ZeroSSL/CA domain validation; bkz. [[Deployment_Infrastructure]] SSL renewal).

## Design Tokens (CSS Custom Properties)

`styles.css` içindeki `:root` paleti "Sea-glass" temasını kodlar — su-berraklığında premium (2026-07-04 redesign):

| Token | Değer | Kullanım |
|---|---|---|
| `--white` | `#FFFFFF` | Sayfa arka planı |
| `--aqua` / `--aqua-2` | `#F7FCFC` / `#EFF9FA` | Çok hafif aqua tonlu bölümler |
| `--ink` | `#073036` | Petrol/teal-siyah metin |
| `--turq` → `--azure` | `#0BB5A6` → `#1E90E8` | `--grad` gradyanı — YALNIZCA vurucu kelimeler (`.grad` text-clip), CTA'lar, ince çizgiler |
| `--glass` / `--glass-brd` | `rgba(255,255,255,.72)` / `rgba(7,48,54,.09)` | Buzlu cam kartlar (backdrop-blur) |
| `--shadow-1/2` | katmanlı yumuşak gölgeler | Kart/ürün derinliği |

Ayrıca `--ink-80..--ink-35` opaklık kademeleri; tipografi `--display` (Bricolage Grotesque), `--sans` (Hanken Grotesk), `--mono` (JetBrains Mono). İmza cihazları: `#fCaustics` feTurbulence filtresi (SMIL baseFrequency morph ile parıldayan su-ışığı ağı — hero, promise cam kartı ve closer arkasında), hero'da yüzen cam enstrüman çipleri (wind 18kn / gusts 24kn / water 21°C, "representative" dürüstlükle), bento feature grid (mini sparkline'lı), pointer-takipli 3D-tilt ürün çerçevesi, `.windfield` ince rüzgar çizgileri. CLAUDE.md "light theme" kuralıyla uyumlu — zemin tamamen aydınlık; koyu petrol yalnız "One surface" paneli aksanı.

## Frontend Davranışı (`script.js`)

Tamamen **progressive enhancement** — içerik JS olmadan da görünür. Tek bir IIFE `'use strict'` içinde:

- **JS gate:** `document.documentElement.classList.add('js-ready')` — reveal animasyonları yalnızca `.js-ready .reveal` seçicisiyle aktifleşir, böylece JS yoksa içerik gizlenmez.
- **Scroll-reveal:** `IntersectionObserver` (`threshold: 0.12`, `rootMargin: '0px 0px -40px 0px'`) görünür olan `.reveal` elemanlarına `.is-visible` ekler ve `unobserve` eder. Stagger gecikmesi CSS değişkeni `--d` ile (HTML'de `style="--d:120ms"` gibi) verilir.
- **3D tilt:** `.product-float` içinde `[data-tilt]` ürün çerçevesi pointer konumuna göre hafif `rotateX/rotateY` alır — yalnız `pointer: fine` + reduced-motion kapalıyken. Reduced-motion ayrıca tüm SMIL `<animate>` düğümlerini DOM'dan söker (caustic parıltısı durur). Marquee saf CSS animasyondur, JS gerektirmez. (Eski count-up kodu 2026-07-04 seaglass portunda kaldırıldı.)
- **Demo formu:** `#demo-form` submit edildiğinde `e.preventDefault()`, butonu disable edip "Opening…" gösterir ve `mailto:hello@plannivo.com`'u konu ("Demo request — {akademi}") + gövde (akademi/iletişim) önceden doldurulmuş olarak açar, ardından `.is-sent` class'ı ekler. Backend hâlâ YOK ama lead artık ziyaretçinin e-posta istemcisi üzerinden ulaşabiliyor — gerçek endpoint gelince `fetch()` ile değiştirilmeli.
- **Smooth scroll:** Tüm `a[href^="#"]` bağlantıları için `scrollIntoView({behavior:'smooth'})`.

## İçerik / Pazarlama Anlatısı (Ground Truth)

Site MEMORY'deki "landing page honesty remake" (2026-06-16) kararına sadık kalır; 2026-07-03 redesign dürüstlüğü **pitch'in kendisine** çevirdi — uydurma logo duvarı veya sahte müşteri sayısı yoktur:

- **Hero:** "SPREADSHEETS DON'T SURVIVE SALTWATER." + "we run our own school on it, live, every day" — canlı kanıt çipi `ukc.plannivo.com`'a bağlanır.
- **Founded 2025 / live since 2025** — proof bölümü ve UKC kartında.
- **Tek canlı müşteri:** Duotone Pro Center Urla (UKC), `ukc.plannivo.com`'a canlı link. Proof başlığı: "One customer. On purpose." — logo duvarı yerine login gösterme anlatısı.
- **Tek canlı ödeme:** Iyzico (kart ödemeleri) — marquee ve "Money" feature kartında (bkz. [[Payments_Currency]]).
- **Dürüstlük rozetleri:** ürün mock'unun altında `.product-caption` "Illustrative dashboard — a representative view, not live customer data."; davet kartı (`.cust-invite`) dashed kenarlık + "Open slot" rozetiyle "An invitation, not a logo wall" — canlı müşteriyle karıştırılamaz. Closer: "BE THE SECOND."
- Disiplinler: Kite · Wing · Foil. Konumlama: "Built inside a Duotone pro center, not adapted from a yoga-studio tool." Mock dashboard `ukc.plannivo.com/dashboard`, `v0.1.333 · live` etiketi taşır.

## Deploy / Servis (nginx)

`infrastructure/nginx.conf` içinde landing iki blokla servis edilir (bkz. [[Deployment_Infrastructure]]):

- **HTTP (port 8080)** — `server_name plannivo.com www.plannivo.com`: ACME challenge + `pki-validation` (SSL doğrulama) alias'ları servis edilir, geri kalanı `return 301 https://plannivo.com$request_uri` ile HTTPS'e yönlendirilir.
- **HTTPS (port 8443 ssl)** — `root /usr/share/nginx/plannivo-landing; index index.html;`. Kritik kural: `location / { try_files $uri $uri/ /index.html; }` (SPA-vari fallback). Statik varlıklar (`js|css|png|...|woff2`) için `expires 1y` + `Cache-Control: immutable`. gzip açık; `security-headers.conf` include edilir.
- Ana uygulama (`ukc.plannivo.com`) ayrı server bloklarında React build'ini + `/api`, `/uploads` proxy'lerini servis eder — landing ile karışmaz.

README'deki alternatif deploy: üç dosyayı herhangi bir statik host'a (Netlify, Vercel, S3, nginx) yükle, `plannivo.com` DNS'ini oraya yönlendir. Local preview: `npx serve .` → `http://localhost:3000` veya `index.html`'i doğrudan aç.

## Veri Modeli

Yok. Tamamen statik — veritabanı, API çağrısı veya kalıcı durum yoktur. Demo formu hiçbir yere veri göndermez (sahte gecikme). Gerçek lead toplama için backend entegrasyonu **henüz yapılmamıştır**.

## Dikkat / Tuzaklar

- **Bu site 2026-07 itibarıyla `push-all` akışına DAHİLDİR:** `scripts/push-all.js` `plannivo-landing/` klasörünü tarball olarak `/root/plannivo/plannivo-landing`'e yükler (exclude: `README.md`, `variants`) ve nginx oradan servis eder. `variants/` klasörü bilinçli olarak deploy DIŞI tutulur — production'a asla çıkmaz.
- **Demo formu mailto ile çalışır (backend yok):** submit, ziyaretçinin e-posta istemcisini `hello@plannivo.com`'a önceden doldurulmuş taslakla açar (2026-07-03). Ziyaretçi taslağı göndermezse lead yine kaybolur — gerçek lead endpoint'i hâlâ TODO. README'de açıkça belirtilmiş.
- **`data-count` kodu ölü:** `animateCount`/`tickerObserver` mantığı mevcut HTML'de tetiklenmez (ticker'da `data-count` yok). Sayısal ticker eklenirse otomatik çalışır; aksi halde gereksiz koddur.
- **Dürüstlük anlatısını koruyun:** İçerik bilinçli olarak tek müşteri / 2025 / sadece Iyzico anlatısına sadıktır. Yeni müşteri veya canlı ödeme sağlayıcı eklenmedikçe sayıları şişirmeyin (MEMORY honesty-remake kuralı).
- **SSL doğrulama dosyası:** `.well-known/pki-validation/...txt` ZeroSSL 90 günlük manuel yenileme döngüsünün parçasıdır; CA değişirse içeriği güncellenmeli (bkz. [[Deployment_Infrastructure]] SSL renewal notu).
- **Karıştırmayın:** [[Outsider_Marketing]] (uygulama içi `src/features/outsider/` — Academy/Rental/Guest landing sayfaları, React Router) ayrı bir şeydir; bu node yalnızca `plannivo.com` kök statik sitesini kapsar.
