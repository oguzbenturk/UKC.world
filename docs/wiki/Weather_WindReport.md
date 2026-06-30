# Weather & Wind Report

> **Özet:** `/wind-report` halka açık rüzgar/hava sayfası: üstte UKC'nin **kendi canlı istasyonundan** anlık ölçüm "hero"su, altında 4 kite spot'u (Gülbahçe, Alaçatı, Pırlanta, Gökçeada) için Windguru tahmin kartları. Canlı hero, eski Windguru istasyon 539 yerine artık **Weather Underground PWS (IURLA24)** ile beslenir (feels-like / nem / çiy noktası / basınç / yağış / UV). İstasyon kimlik bilgileri yalnız backend env'de tutulur, istemciye sızmaz.
>
> **Kütüphaneler:** Express 5 (ESM), axios (upstream proxy), in-memory TTL cache, Open-Meteo / Windguru / Weather Underground API'leri, React 18, TanStack React Query, framer-motion, react-i18next.
>
> **Bağlantılar:** [[Backend_Server]], [[Frontend_Shell]], [[Outsider_Marketing]], [[Misc_Integrations]], [[Student_Portal]], [[Notifications_System]], [[Bookings_Calendar]]

---

## Sorumluluk

Rüzgar/hava ile ilgili üç ayrı yetenek:

1. **Wind Report** (`/wind-report`) — halka açık, kitesurf odaklı asıl sayfa. Canlı istasyon + çok-spot tahmini + kullanıcı kilosuna göre kanat (kite) boyutu önerisi.
2. **Live Station Proxy** — UKC'nin sahip olduğu meteoroloji istasyonunun anlık verisini upstream'den çekip, kimlik bilgisini gizleyerek ve 5 dk önbellekleyerek sunar. İki sağlayıcı: birincil **Weather Underground PWS** (`/api/weather/pws`), eski/yedek **Windguru station** (`/api/weather/live`).
3. **Eski Weather sayfası** (`WeatherPage.jsx`) — `FeaturesContext` üzerinden çalışan daha eski dashboard (güvenlik kılavuzları + booking uyarıları, kısmen mock veri). Wind Report tarafından işlevsel olarak değiştirilmiştir.

## Backend

### Rotalar — `backend/routes/weather.js` (`/api/weather`)

Tamamı **kimlik doğrulaması gerektirmez** (public; [[Outsider_Marketing]] ve misafir erişimi için):
- `GET /hourly?date=&lat=&lon=` — **Open-Meteo** forecast API'sinden saatlik rüzgar/sıcaklık (knot). `ForecastContext` ve `DailyView` (booking takvimi) bunu doğrudan `/api/weather/hourly` ile çağırır.
- `GET /spots` — kite spot listesi (ad/koordinat/`windguruSpotId`).
- `GET /pws` — **Weather Underground PWS** anlık ölçüm (cache 5 dk, `Cache-Control: max-age=300`). Canlı hero'nun birincil kaynağı.
- `GET /live` — **Windguru station** anlık ölçüm (cache 5 dk). Eski/yedek canlı kaynak.
- `GET /report/:spotId` ve `GET /report` — tek/tüm spot için Windguru **tahmin** (scrape).

### Servis katmanı — `backend/services/weather/`

- **`index.js`** — fasat; `listSpots`, `getSpotReport`, `getAllSpotReports`, `getUkcLive`, `getPwsLive` dışa açar. `getAllSpotReports` tüm spotları paralel çeker, hata olanı `{ spot, error }` ile sarar (biri patlarsa diğerleri görünür).
- **`wundergroundStation.js`** (`getPwsLive`) — `api.weather.com/v2/pws/observations/current` (units=m). WU km/h verir; UI knot bazlı olduğu için `kmhToKts` ile normalize edilir. Zengin alanlar: `feelsLikeC` (heatIndex/windChill seçimi), `humidityPct`, `dewpointC`, `pressureHpa`, `precipRateMm`, `precipAccumMm`, `uv`, `solarRadiation`. `windState()` ile aqua/green/yellow/red durumu hesaplanır. İstasyon veri vermezse "offline" hatası fırlatır.
- **`ukcStation.js`** (`getUkcLive`) — Windguru `wgsapi.php?q=station_data_current`. Bu istasyon zaten knot döndürür. `windAvgKts/windMaxKts/windMinKts`, sıcaklık, nem, basınç.
- **`windguruScraper.js`** — Windguru'nun halka açık **tahmin** sayfasındaki `<pre>` bloğunu regex ile ayrıştırır (lokasyon başlığı, model init, gün/saat satırları). Canlı veriyle karıştırılmamalı.
- **`spots.js`** — 4 spot tanımı (her biri `windguruSpotId` + koordinat + `water` tipi). Buradaki sıra Wind Report'taki kart sırasını belirler.
- **`cache.js`** — basit `Map` tabanlı TTL önbellek (`getCached`/`setCached`, varsayılan 30 dk).

**Thundering-herd koruması:** hem PWS hem Windguru istasyon fetcher'ları `let inflight` ile eşzamanlı soğuk-cache çağrılarını **tek** upstream isteğine bindirir; upstream yavaş/çökükse 10sn'lik bağlantı yığılması olmaz.

### Gizli kimlik bilgileri (env)

- `WUNDERGROUND_STATION_ID` (vars. `IURLA24`, gizli değil) + `WUNDERGROUND_API_KEY` (**gizli, zorunlu**).
- `UKC_WINDGURU_STATION_ID` (vars. `539`) + `UKC_WINDGURU_STATION_PASSWORD` (**gizli, zorunlu**).
- `WEATHER_LAT` / `WEATHER_LON` — `/hourly` için varsayılan koordinat.

Kod, parolanın **asla hardcode edilmemesini** açıkça uyarır (git geçmişine sızar). MEMORY notu: eski `urlakite` Windguru kullanıcı adı public repo'ya kaçmıştı → kullanıcının rotasyonu gerekiyordu.

## Frontend

### Wind Report — `src/features/wind-report/`

- **`pages/WindReportPage.jsx`** — animasyonlu rüzgar-akışı arkaplanı (SVG), canlı `<PwsLiveStation />` hero'su, kilo seçici (`WeightPickerBar`, kullanıcı profilindeki `weight`'ten başlar) ve `useAllReports` ile çekilen spot kartları ızgarası.
- **`components/PwsLiveStation.jsx`** — büyük anlık rüzgar sayısı + durum çipi (aqua/green/yellow/red palet, WCAG AA), yön oku (rüzgarın estiği yöne döner), ve WU'nun tüm ölçtüğü alanlar (gust, dir, temp, feels-like, humidity, dewpoint, pressure, precip, UV). İstasyon kapalıyken zarifçe "Live station offline — showing forecast below." gösterir, alttaki tahmini bozmaz. Footer'da `wunderground.com/dashboard/pws/<stationId>` linki.
- **`hooks/usePwsLive.js`** — `GET /weather/pws`; `staleTime` 5 dk, `refetchInterval` 15 dk + focus'ta yenile (WU'yu hırpalamadan "live" kalır). Eski karşılığı `useUkcLive.js` (`/weather/live`) ve `components/UkcLiveStation.jsx` hâlâ kodda durur ama sayfada PWS kullanılır.
- **`services/windReportService.js`** — `fetchSpots`, `fetchAllReports`, `fetchUkcLive`, `fetchPwsLive` ince istemciler.
- Yardımcı bileşen/util'ler: `SpotCard`, `HourCell`/`HourDetail`, `DayStrip`, `KiteRecommendation`/`SessionVerdict`, `utils/kiteSize.js` (kilo→kanat boyutu), `windBands.js`, `verdict.js`.

### Diğer rüzgar tüketicileri

- **`src/features/forecast/`** — `ForecastContext` `/api/weather/hourly`'i çağırır; booking takviminde (`DailyView.jsx`) günlük rüzgar şeridi için kullanılır (bkz. [[Bookings_Calendar]]).
- **`src/features/weather/pages/WeatherPage.jsx`** — eski dashboard; `FeaturesContext.refreshWeather()` ile beslenir, güvenlik kılavuzları (rüzgar/gust eşikleri) ve booking-hava uyumu uyarıları içerir (kısmen mock). Yeni canlı hero değil.

## Veri Modeli

Bu modül **DB tablosu kullanmaz** — tüm veri dış API'lerden (Open-Meteo, Windguru, Weather Underground) gerçek zamanlı çekilir ve sadece bellek içinde (`cache.js`) önbelleklenir. Spot tanımları statik koddadır (`spots.js`). Normalleştirilmiş canlı-okuma çıktısı (örn. `windAvgKts`, `state`, `directionDeg`, `feelsLikeC`, `fetchedAt`, `cached`) backend'de türetilir.

## Akış / İş Mantığı

**Canlı hero (uçtan uca):** `WindReportPage` → `usePwsLive` → `GET /api/weather/pws` → `getPwsLive()` cache'e bakar; yoksa `inflight` ile tek istek açar → `api.weather.com` PWS observations → km/h knota çevrilir, feels-like seçilir, `windState` durumu hesaplanır → 5 dk cache'lenip dönülür → React Query 15 dk'da bir tazeler. İstasyon offline ise hata fırlar, bileşen forecast'ı bozmadan "offline" durumuna düşer.

**Spot tahmini:** `getAllSpotReports` her spot için Windguru `<pre>` tahminini paralel scrape eder; kart üzerinde saatlik rüzgar + kullanıcı kilosuna göre kanat önerisi/verdict hesaplanır.

## Dikkat / Tuzaklar

- **İki "Windguru" var, karıştırma:** `windguruScraper.js` halka açık **tahmin** sayfasını scrape eder; `ukcStation.js` ise UKC'nin **kendi istasyonunun** anlık verisini API'den çeker. Farklı uçlar, farklı amaç.
- **Canlı hero artık WU/PWS.** `UkcLiveStation` + `useUkcLive` (Windguru 539) kodda kalsa da sayfada **PwsLiveStation** kullanılır; canlı sayıyı değiştireceksen PWS yolunu düzenle (MEMORY: Windguru→Weather Underground geçişi, DEPLOYED v0.1.326).
- **İstasyon "OFFLINE" olabilir.** WU/Windguru son okuma yoksa boş döner; UI bunu offline gösterir. MEMORY notu: istasyon, kullanıcı WU konsolunu yönlendirene kadar offline kalabilir.
- **Kimlik bilgileri yalnız env'de.** API key/parola koda yazılmaz; eksikse fetcher anlamlı hata fırlatır (`WUNDERGROUND_API_KEY is not set ...`). Public repo sızıntısı geçmişte yaşandı — rotasyona dikkat.
- **Birim normalizasyonu:** WU km/h, Open-Meteo `wind_speed_unit=kn`, Windguru istasyonu knot döndürür. Tüm UI **knot** bazlıdır; yeni kaynak eklerken çeviriyi unutma.
- Tüm `/api/weather/*` uçları **public** — kimlik doğrulaması beklemeyin; rota zaten anonim erişime açıktır (`AppRoutes` yorumu bunu teyit eder).

### TTL önbellek yardımcısı — `backend/services/weather/cache.js`

Süreç ömrü boyunca yaşayan **modül düzeyinde bir `Map`** üzerine kurulu basit in-memory TTL store (DB/Redis yok, restart'ta sıfırlanır). Dışa açtığı üç fonksiyon:
- `getCached(key)` — kayıt yoksa veya `Date.now() > entry.expires` (süresi geçmiş) ise `null` döner ve süresi dolan girdiyi `store.delete(key)` ile temizler (lazy expiry).
- `setCached(key, value, ttlMs = DEFAULT_TTL_MS)` — `{ value, expires: Date.now() + ttlMs }` olarak saklar. Varsayılan TTL **30 dk** (`DEFAULT_TTL_MS = 30 * 60 * 1000`); çağıran kendi `ttlMs`'ini geçebilir.
- `clearCache()` — tüm store'u boşaltır (`store.clear()`).

Bu yardımcı, üç fetcher'ın da ortak önbellek katmanıdır: `wundergroundStation.js` (`getPwsLive`), `ukcStation.js` (`getUkcLive`) ve `windguruScraper.js` (tahmin scrape) hepsi `import { getCached, setCached } from './cache.js'` ile aynı store'u kullanır; her biri kendi `CACHE_KEY`/`cacheKey` ve `TTL_MS`'ini belirleyip soğuk-cache'te upstream'e gider, sonucu `setCached` ile yazar. (`cache.js`'in kendi varsayılanı 30 dk olsa da istasyon fetcher'ları daha kısa TTL geçerek `Cache-Control: max-age=300` ile uyumlu ~5 dk taze tutar.)
