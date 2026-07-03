# Landing_Site

> **Özet:** `plannivo-landing/` ürünün herkese açık pazarlama sitesidir (`plannivo.com`) — ana React/Vite uygulamasından tamamen ayrı, build adımı olmayan, üç dosyalık bağımsız bir statik kod tabanıdır. 2026-07-03 "Gale warning" yeniden tasarımı: gün ışığı spor-poster estetiği (beyaz/gök/lacivert + tek şok aksan kite-turuncusu `#FF4D12`), ultra-geniş Archivo 900 poster başlıklar, animasyonlu rüzgar-akım (streamline) SVG hero'su, kinetik ink marquee bandı. Demo formu backend'siz `mailto:hello@plannivo.com` açar (lead artık sessizce kaybolmuyor). Pazarlama anlatısı bilinçli olarak dürüsttür ve artık pitch'in kendisidir ("One customer. On purpose." / "Be the second."): 2025'te kuruldu, tek canlı müşteri Duotone Urla (UKC), tek canlı ödeme Iyzico.

> **Kütüphaneler:** Saf HTML5 + CSS3 (custom properties / variable fonts) + vanilla JS (IntersectionObserver, requestAnimationFrame); Google Fonts (Archivo variable — wdth 62..125 / wght 100..900, JetBrains Mono); nginx static hosting. Build aracı YOK — framework YOK.

> **Bağlantılar:** [[Outsider_Marketing]], [[Deployment_Infrastructure]], [[Tech_Stack]], [[Architecture_Overview]], [[Frontend_Shell]], [[Index]]

---

## Sorumluluk

Bu modül, ana uygulamadan (`src/` React + Vite) **kasıtlı olarak izole** edilmiş bir pazarlama sitesidir. Amacı `plannivo.com` kök alan adında çalışıp ürünü (müşteriye özel bir merkez değil, **Plannivo'nun kendisini**) tanıtmak ve demo talebi toplamaktır. Ana uygulamadan ayrımlar:

- **Ayrı kod tabanı:** `plannivo-landing/` klasörü; Vite, React, npm bağımlılığı, `package.json` veya transpile adımı **yoktur**. Üç dosya doğrudan tarayıcıya servis edilir.
- **Ayrı alan adı:** `plannivo.com` / `www.plannivo.com` → landing; `ukc.plannivo.com` → ana uygulama (bkz. `infrastructure/nginx.conf`).
- Bu yüzden ana uygulamanın herkese açık pazarlama sayfalarından ([[Outsider_Marketing]] — `src/features/outsider/`, React Router içinde) farklıdır; o sayfalar uygulamanın bir parçasıyken bu site tamamen statiktir.

## Dosya Yapısı

`plannivo-landing/` altında (kaynaklar):

- `plannivo-landing/index.html` — tek sayfalık tüm içerik (semantik HTML, build adımsız). Bölümler: sticky masthead/nav, hero ("SPREADSHEETS DON'T SURVIVE SALTWATER." + windfield SVG), marquee bandı, #problem (junk-list vs "One surface" paneli), #product (mock dashboard), #platform (feature grid + creed), #proof ("One customer. On purpose." + UKC canlı kart / davet kartı), #demo ("BE THE SECOND." + form), footer.
- `plannivo-landing/styles.css` — tüm stiller; `:root` içinde design token'ları, variable-font ayarları, responsive media query'ler, reveal/`prefers-reduced-motion` kuralları.
- `plannivo-landing/script.js` — IIFE içinde progressive enhancement: scroll-reveal, count-up, demo form, smooth scroll.
- `plannivo-landing/README.md` — local preview, deploy, design token tablosu ve "demo form gerçek backend'e nasıl bağlanır" notu.
- `plannivo-landing/.well-known/pki-validation/6BA651621922CB34EA1521D24DEF1DA2.txt` — SSL sertifika doğrulama dosyası (ZeroSSL/CA domain validation; bkz. [[Deployment_Infrastructure]] SSL renewal).

## Design Tokens (CSS Custom Properties)

`styles.css` içindeki `:root` paleti "Gale warning" temasını kodlar — parlak gün, sert rüzgar (2026-07-03 redesign):

| Token | Değer | Kullanım |
|---|---|---|
| `--white` | `#FFFFFF` | Sayfa arka planı |
| `--foam` | `#F1F7FC` | Tonlu bölümler (`.chapter-tint`), kartlar |
| `--sky` | `#CFE9FB` | Açık gök dolguları, takvim mock blokları |
| `--ink` | `#0A2337` | Birincil metin, marquee bandı, panel zeminleri |
| `--signal` | `#FF4D12` | Kite-turuncusu — YALNIZCA CTA'lar ve vurucu kelimeler |
| `--surf` | `#0C7BD6` | Linkler, rüzgar çizgileri, sparkline |
| `--line` | `#D9E5EE` | Kenarlıklar, ayraçlar |

Ayrıca `--ink-80..--ink-15` opaklık kademeleri; tipografi `--sans` (Archivo variable) + `--mono` (JetBrains Mono). Poster başlıklar `.mega`/`.h2` `font-weight:900` + `font-stretch:115–118%` (Archivo wdth ekseni) + uppercase. İmza cihazları: `--punch` (6px 6px 0 sert poster gölgesi), `--cut` (buton/tag uçlarında hız-kesiği clip-path paralelkenar), hero+closer'da animasyonlu `.windfield` streamline SVG'si, `#FF4D12` çerçeveli ink marquee. CLAUDE.md "light theme" kuralıyla uyumlu — zemin tamamen aydınlık; ink yalnızca bant/panel aksanı.

## Frontend Davranışı (`script.js`)

Tamamen **progressive enhancement** — içerik JS olmadan da görünür. Tek bir IIFE `'use strict'` içinde:

- **JS gate:** `document.documentElement.classList.add('js-ready')` — reveal animasyonları yalnızca `.js-ready .reveal` seçicisiyle aktifleşir, böylece JS yoksa içerik gizlenmez.
- **Scroll-reveal:** `IntersectionObserver` (`threshold: 0.12`, `rootMargin: '0px 0px -40px 0px'`) görünür olan `.reveal` elemanlarına `.is-visible` ekler ve `unobserve` eder. Stagger gecikmesi CSS değişkeni `--d` ile (HTML'de `style="--d:120ms"` gibi) verilir.
- **Count-up:** `[data-count]` elemanları için `requestAnimationFrame` + `easeOutExpo` ile sayı animasyonu (`threshold: 0.5`). NOT: mevcut HTML'de `data-count` özniteliği kullanılmıyor — kod gelecekteki sayısal kullanım için hazır bekliyor (eski ticker 2026-07-03'te marquee ile değiştirildi; marquee saf CSS animasyondur, JS gerektirmez).
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

- **Bu site ana uygulamanın `push-all` deploy akışına dahil DEĞİLDİR.** Ayrı kod tabanı olduğundan `dist/` build'ine girmez; nginx onu `/usr/share/nginx/plannivo-landing`'den ayrı servis eder. Güncelleme bu klasöre dosya yüklemeyi gerektirir.
- **Demo formu mailto ile çalışır (backend yok):** submit, ziyaretçinin e-posta istemcisini `hello@plannivo.com`'a önceden doldurulmuş taslakla açar (2026-07-03). Ziyaretçi taslağı göndermezse lead yine kaybolur — gerçek lead endpoint'i hâlâ TODO. README'de açıkça belirtilmiş.
- **`data-count` kodu ölü:** `animateCount`/`tickerObserver` mantığı mevcut HTML'de tetiklenmez (ticker'da `data-count` yok). Sayısal ticker eklenirse otomatik çalışır; aksi halde gereksiz koddur.
- **Dürüstlük anlatısını koruyun:** İçerik bilinçli olarak tek müşteri / 2025 / sadece Iyzico anlatısına sadıktır. Yeni müşteri veya canlı ödeme sağlayıcı eklenmedikçe sayıları şişirmeyin (MEMORY honesty-remake kuralı).
- **SSL doğrulama dosyası:** `.well-known/pki-validation/...txt` ZeroSSL 90 günlük manuel yenileme döngüsünün parçasıdır; CA değişirse içeriği güncellenmeli (bkz. [[Deployment_Infrastructure]] SSL renewal notu).
- **Karıştırmayın:** [[Outsider_Marketing]] (uygulama içi `src/features/outsider/` — Academy/Rental/Guest landing sayfaları, React Router) ayrı bir şeydir; bu node yalnızca `plannivo.com` kök statik sitesini kapsar.
