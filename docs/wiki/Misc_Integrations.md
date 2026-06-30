# Misc Integrations

> **Özet:** Bu düğüm, ana iş alanlarına girmeyen yardımcı entegrasyonları toplar: paylaşılan-hesap Spotify müzik kontrolü, public "Quick Links" hızlı kayıt/rezervasyon linkleri, n8n tabanlı Kai AI asistanı (sohbet + araç-çağıran agent API'si), yardım merkezi, site-içi popup yönetimi ve istemci-taraflı rüzgar forecast ayarları. Çoğu, dış servislerle (Spotify, n8n, Windguru/Open-Meteo) env-gizli secret'lar üzerinden konuşur.
>
> **Kütüphaneler:** Spotify Web API (OAuth2), n8n (webhook), React 18, Ant Design, PostgreSQL, localStorage.
>
> **Bağlantılar:** [[Frontend_Shell]], [[Backend_Server]], [[Authentication_Authorization]], [[Customers_CRM]], [[Dashboard_Metrics_Admin]], [[Weather_WindReport]], [[Notifications_System]], [[Forms_Waivers_Compliance]], [[Testing_QA]], [[Operations_Scripts]]

---

## Sorumluluk

Tek bir iş alanına ait olmayan, ama platformu çevreleyen "yan" entegrasyonların evi. Her biri bağımsızdır; ortak nokta dış servis/araç entegrasyonu olmalarıdır.

---

## Spotify / Müzik

- **Dosyalar:** `backend/routes/spotify.js`, `backend/services/spotifyService.js`, `src/features/settings/pages/SpotifyCallback.jsx`, `src/features/settings/components/MusicSettings.jsx`.
- **Singleton model:** Aynı anda yalnızca **TEK** Spotify token saklanır (`spotify_tokens` tablosu) — kullanıcı-başı hesap yoktur; paylaşılan akademi hesabı. `spotify_user_id` NULL kalırsa satır silinip yeniden bağlanma istenir.
- **Development Mode kapısı:** `fetchSpotifyProfile()` hesabın Spotify Developer Dashboard allowlist'inde olup olmadığını kontrol eder; değilse 403 ("Add it under 'Users and Access'…"). Bkz. ilgili MEMORY notu (singleton + allowlist).
- **OAuth:** `GET /spotify/auth-url` (state) → Spotify authorize → `POST /spotify/callback` (public; code→token, `/me` profili). `SpotifyCallback.jsx` popup'tan `window.opener`'a mesaj atıp kapanır veya `/settings?tab=music`'e gider.
- **Çalma kontrolü:** now-playing, play/pause/next/previous, volume, seek, devices, transfer, playlists, play-playlist.
- **Zamanlama:** `spotify_schedules` (playlist_uri, scheduled_time HH:MM, repeat_mode once/daily/weekdays/weekends); istemci 30sn aralıkla `shouldRunSchedule()` ile tetikler.
- **Env:** `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`.

---

## Quick Links (Hızlı Kayıt/Rezervasyon)

- **Dosyalar:** `backend/routes/quickLinks.js`, `backend/services/quickLinksService.js`, `src/features/quicklinks/pages/PublicQuickBooking.jsx` + admin UI (`QuickLinksPage`, `CreateLinkModal`, `ShareLinkModal`, `RegistrationsTab`).
- **Admin (manager+):** link CRUD, istatistik, kayıtlar; `POST /registrations/:id/create-account` bir kaydı `outsider` kullanıcıya çevirir (geçici parola + cüzdan açar → bkz. [[Customers_CRM]], [[Authentication_Authorization]]).
- **Public (auth yok):** `GET /api/quick-links/public/:code` (meta), `POST /.../register` (form gönderimi; active + süre + `use_count < max_uses` doğrular, `use_count++`, `dispatchToStaff()` ile personele bildirim → bkz. [[Notifications_System]]). Rota: `/quick/:linkCode` (bkz. [[Frontend_Shell]]).
- **Tablolar:** `quick_links` (link_code, link_type registration/service/form, service_type, form_template_id, max_uses, custom_fields JSON), `quick_link_registrations` (ad/iletişim, status pending/confirmed, user_id). Form tipli linkler `form_templates` ile bağlanır (bkz. [[Forms_Waivers_Compliance]]).
- **PublicQuickBooking:** 3 adımlı form (About You → Contact + ülke kodu → Preferences), service_type'a göre marka rengi/ikon.

---

## Kai AI Asistanı (n8n)

- **Dosyalar:** `backend/routes/assistant.js` (sohbet), `backend/routes/agent.js` (araç API), `backend/middlewares/authenticateAgent.js`, `src/features/help/components/AIAssistantPanel.jsx`.
- **`POST /assistant`** — opsiyonel auth (misafir veya JWT). Rate limit 5/dk misafir, 20/dk authenticated. İsteği n8n webhook'una iletir (`N8N_ASSISTANT_WEBHOOK_URL`, `X-Plannivo-Secret: N8N_ASSISTANT_SECRET`); rol normalize edilir (customer→student, super_admin→admin); 30sn timeout → 504.
- **`/api/agent/*`** — n8n'in geri-çağıran araç API'si. Üç katmanlı güvenlik: (1) `X-Kai-Agent-Secret` (`KAI_AGENT_SECRET`), (2) `verifyAgentIdentity` DB'den rolü yeniden doğrular (header spoof önler), (3) `requireRole()`. Okuma uçları (me/earnings, customers, bookings, schedule, finance/summary, notes) ve yazma uçları (create customer/booking, add note, notify) rol-kapsamlıdır — örn. öğrenci yalnızca kendi paketinden kendine booking açabilir, cüzdan düşümü `recordTransaction()` ile (bkz. [[Bookings_Calendar]], [[Finances_Wallet]]).
- **Period stringleri:** today/week/month/last_30_days/ytd/next_week… veya açık `startDate`+`endDate`.
- **KAI Logs:** Konuşma denetim izi `/settings?tab=kai-logs` (bkz. [[Dashboard_Metrics_Admin]]); tablolar `kai_notes`, `kai_student_docs`.
- **Env:** `N8N_ASSISTANT_WEBHOOK_URL`, `N8N_ASSISTANT_SECRET`, `KAI_AGENT_SECRET`. Bkz. ilgili MEMORY (Kai n8n 2.x).

### Kai Workflow-Sync Scriptleri

Kai'nin "beyni" — sohbet sistem promptu, model ayarı ve n8n'in geri-çağırdığı **toolHttpRequest** araç tanımları — bir n8n workflow JSON dosyasında (`kai-optimized.json`, kök dizinde) tutulur ve canlı n8n örneğine (`https://n8n.plannivo.com/api/v1`) HTTP API ile push edilir. Docker rebuild gerekmez; senkronizasyon hızlıdır. API anahtarı `.deploy.secrets.json` → `n8nApiKey` (+ kayıtlı `n8nWorkflowId`) içinden okunur; `X-N8N-API-KEY` header'ı ile kimlik doğrulanır.

- **`scripts/sync-n8n-workflow.js`** (ESM; `npm run sync:n8n`) — `kai-optimized.json`'dan yalnızca n8n PUT API'sinin kabul ettiği alanları (`name`, `nodes`, `connections`, `settings`, opsiyonel `staticData`) alıp mevcut workflow'u günceller. `--create` bayrağıyla ilk kez yeni workflow oluşturur ve dönen ID'yi `.deploy.secrets.json`'a yazar. ID kayıtlı değilse `name`'e göre workflow'u arar; bulamazsa otomatik oluşturur. Sistem promptu zaten jsCode düğümünde gömülüdür.
- **`sync-kai-workflow.cjs`** (kök; CommonJS) — aynı PUT senkronizasyonunu yapar ama ek olarak n8n'in 15sn'ye kadar hazır olmasını bekler (5×3sn retry), push sonrası workflow'u **deactivate → 1sn bekle → activate** ederek n8n'in önbelleğe aldığı eski durumu temizler ("Kai is ready"). `push-all` deploy akışında Kai'yi tazelemek için kullanılır.
- **`convert-kai-workflow.cjs`** (kök; CommonJS) — `kai-optimized.json`'u n8n **1.x → 2.x** parametre formatına dönüştürür (tek seferlik/migrasyon aracı). Eski `headerParameters/queryParameters/bodyParameters` dizilerini yeni `specifyHeaders/Query/Body: "keypair"` + `parametersHeaders/Query/Body.values` yapısına çevirir; URL içindeki `{{ $fromAI('id','desc','type') }}` çağrılarını `{id}` placeholder'larına ve `placeholderDefinitions.values` girdilerine ayrıştırır; açıklamasında "(optional)/optional/leave empty" geçen parametreleri `modelOptional`, diğerlerini `modelRequired` işaretler. Yazmadan önce `kai-optimized.backup.json` yedeği alır ve dönüşüm sonunda eski-format kalıntısı kalıp kalmadığını doğrular. Bkz. ilgili MEMORY (Kai n8n 2.x). Detaylı script envanteri için bkz. [[Operations_Scripts]].

### Kai-Eval Harness (AI Değerlendirme)

`scripts/kai-eval/` Kai asistanını otomatik test eden bir simülasyon + skorlama harness'ıdır: tanımlı test senaryolarını yerel `POST /api/assistant` uçuna gönderir, yanıtları beklenen/yasaklı anahtar kelimelere göre puanlar ve raporlar. Yerel backend çalışıyor olmalı (`npm run dev:backend`); `backend/.env` → `JWT_SECRET` ile rol-başına test token üretilir.

- **`test-cases.json`** — rol-bazlı (outsider/student/instructor/manager/admin) senaryo dizisi. Her senaryo: `id`, `role`, `userId`, `input`, `expectedKeywords`, `notExpected` (yasaklı), `language`, opsiyonel `securityTest`/`policyTest` bayrakları. (JSON dosyasında `// ...` yorumlarına izin verilir; çalıştırıcılar yorumları regex ile siler.)
- **`run-eval.js`** (`node scripts/kai-eval/run-eval.js [--role=admin] [--id=admin-001]`) — her senaryoyu rol JWT'siyle (`roleMap`: student→customer, admin→super_admin vb.; outsider/guest token'sız) gönderir, latency ölçer, eksik/yasaklı kelimeleri kontrol eder. Rate-limit'i aşmamak için varsayılan 1500ms gecikme (`KAI_EVAL_DELAY`). Sonucu `results/eval-<timestamp>.json` olarak özet (total/passed/failed/errored/passRate/avgLatencyMs + her senaryonun ayrıntısı) halinde kaydeder.
- **`simulate.js`** — `run-eval` ile aynı çağrıları yapar ama **insan incelemesi** için tasarlanmıştır: tam soru/cevap (Q/A) konuşmasını renkli terminalde rol başlıklarıyla yazdırır, pass/fail + eksik/yasaklı kelimeleri gösterir. Misafir 5/60sn rate-limit'i için 13sn gecikme + 429'da 65sn back-off ile bir kez retry yapar. Transkripti `results/sim-<timestamp>.json`'a kaydeder.
- **`report.js`** (`node scripts/kai-eval/report.js [--all]`) — `results/` altındaki son iki `eval-*.json` koşusunu karşılaştırarak iyileşen/gerileyen/hâlâ başarısız senaryoları ve geçiş oranı + latency değişimini gösterir; `--all` ile tüm koşuların özet tablosunu basar.

Kai-eval, asistanın rol-kapsamlı doğruluğu ve güvenlik/politika sınırlarını (header spoof, yetki dışı veri sızıntısı) regresyon-test eder; genel test stratejisi için bkz. [[Testing_QA]].

---

## Help / Support

- **Dosya:** `src/features/help/pages/HelpSupport.jsx` (public `/help`).
- Statik yardım bölümleri (Getting Started, Bookings, Customers, Services, Finances, Pop-ups, Settings, FAQ, Contact) + hızlı aksiyon butonları + sağ kenarda gömülü `AIAssistantPanel` + sürüm notları/iletişim.

---

## Popups (Site-içi Duyuru)

- **Dosya:** `src/features/popups/components/PopupFormIntegration.jsx`.
- 5 sekmeli yapılandırma: **General** (hedef kitle all/new/returning/students/instructors/admin, sıklık once/session/daily/always, sayfalar), **Content** (başlık/gövde/buton/hero görsel), **Design** (tema, konum, animasyon, renkler), **Templates**, **Targeting** (cihaz, dil, tetikleyici immediate/delay/scroll/exit-intent).

### Popup Şablonları (Templates sekmesi)

- **Dosya:** `src/features/popups/components/PopupTemplates.jsx`.
- **Templates** sekmesinin içeriği; bileşen dosya-içinde gömülü 8 hazır şablonu kategoriye göre gruplanmış kartlar halinde sunar. Sabit `templates` dizisindeki her şablonun `id`, `name`, `description`, `category` (Onboarding / Marketing / Engagement / System / Lead Generation), bir `preview` görsel yolu ve tam bir `config` nesnesi (`general` + `content` + `design`) vardır — yani şablon, popup yapılandırmasının üç bölümünü (hedef kitle/sıklık, başlık/gövde/butonlar/hero, tema/konum/animasyon/renk) hazır olarak taşır.
- **Mantık:** `categories = [...new Set(templates.map(t => t.category))]` ile kategoriler türetilir; her kategori için kartlar `Row/Col` (xs 24 / sm 12 / lg 8) gridinde dizilir. Kartta önizleme ikonu (`EyeOutlined`) + "Use Template" butonu (`SelectOutlined`) bulunur; tıklamada `onSelectTemplate(template.config)` üst forma (`PopupFormIntegration`) seçilen yapılandırmayı geri verir ve diğer sekmeler önceden doldurulur. Kart altındaki rozetler `config.general.targetAudience` (alt-çizgi boşlukla değiştirilir) ve `config.design.theme` değerlerini gösterir.
- **Yerelleştirme:** Şablon ad/açıklamaları İngilizce sabittir; yalnızca sayfa başlık/buton metinleri `useTranslation(['manager'])` (`manager:popups.*`) ile çevrilir. (Örnek `config` içerikleri jenerik/yer-tutucudur — `example.com` URL'leri ve "10,000+ users" gibi placeholder metinler içerir.)

---

## Forecast Ayarları

- **Dosyalar:** `src/features/forecast/components/ForecastSettings.jsx`, `contexts/ForecastContext.jsx`, `hooks/useForecast.js`, `utils/windClasses.js`.
- Rüzgar birimi (knot/kmh/mph/Beaufort), veri kaynağı (Windguru / Open-Meteo), Windguru spot URL'leri, takvim overlay/ok/gust seçenekleri, güncelleme aralığı.
- **Saklama:** `localStorage` (henüz backend'e bağlı değil); değişimde `window` üzerinde `forecastSettingsChanged` event'i yayar. Canlı hava verisi için bkz. [[Weather_WindReport]].

---

## Dikkat / Tuzaklar

- **Spotify tek hesaptır** — kişi-başı bağlama beklenmez; "bağlanamıyor" hatası genelde Developer Dashboard allowlist (Development Mode 25 kullanıcı sınırı) kaynaklıdır.
- **Kai agent header spoof koruması:** `X-Requesting-User-Role` header'ına güvenilmez; `verifyAgentIdentity` rolü DB'den teyit eder.
- **Quick Links `use_count` yarışı:** kayıt artışı transaction içinde; `max_uses` aşımı doğrulanır.
- **Forecast ayarları kalıcı değil** — yalnızca tarayıcıda; cihaz değişince kaybolur (backend entegrasyonu bekliyor).
