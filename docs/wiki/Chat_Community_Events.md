# Chat, Community & Events

> **Özet:** Üç ilişkili topluluk modülü: (1) Socket.io üzerinde çalışan gerçek zamanlı sohbet — özellikle her sayfada görünen yüzen admin↔üye DM widget'ı; (2) `/community/team` halka açık eğitmen vitrini; (3) etkinlik (parti / dalış / yoga / yarışma) yönetimi + üye kayıtları. Sohbet mesajları GDPR gereği 5 günde otomatik silinir; etkinlikler hem yönetim tablosu hem de halka açık kart ızgarası olarak sunulur.
>
> **Kütüphaneler:** Socket.io (server + `socket.io-client`), Express 5 (ESM), PostgreSQL (full-text `tsvector` + `node-cron` temizlik), React 18, TanStack React Query, Ant Design, dayjs, Heroicons.
>
> **Bağlantılar:** [[Notifications_System]], [[Backend_Server]], [[Frontend_Shell]], [[Authentication_Authorization]], [[Student_Portal]], [[Instructors_Payroll]], [[Outsider_Marketing]], [[Database]]

---

## Sorumluluk

Bu düğüm üç ayrı ama "topluluk" çatısı altında toplanan özelliği kapsar:

1. **Live Chat** — kullanıcılar arası 1:1 (direct), grup ve kanal (channel) sohbetleri. Esas ürün, sayfanın sağ-alt köşesinde duran **yüzen sohbet widget'ı** (FloatingChatWidget): üyeler personelle (admin/manager/eğitmen/resepsiyon) DM açar, gelen mesaj köşede "balon" olarak belirir.
2. **Community Team** (`/community/team`) — merkezin eğitmen kadrosunu gösteren halka açık, koyu temalı vitrin sayfası.
3. **Events** — yönetimin oluşturduğu özel etkinlikler (parti, dalış gezisi, yoga, workshop, yarışma, gezi) ve kullanıcıların bunlara kaydolması.

`/chat` adresindeki tam sayfa sohbet (`ChatPage.jsx`) **devre dışıdır** — sadece "feature unavailable" mesajı gösterir; tüm sohbet akışı yüzen widget üzerinden yürür.

## Backend

### Sohbet rotaları — `backend/routes/chat.js` (`/api/chat`)

Tüm uçlar `authenticateJWT` ister. `STAFF_CHAT_ROLES = [admin, manager, super_admin, instructor, receptionist, freelancer]` kapsamı belirler.

- `GET /conversations` — kullanıcının konuşmaları + okunmamış sayıları (`unread_count`).
- `GET /channels/available`, `POST /channels/:id/join` — herkese açık kanallara katılım.
- `POST /conversations/direct` — DM al-veya-oluştur. **Kapsam kuralı:** üye sadece personelle başlatabilir; personel herkesle (yanıtlamak gating'e tabi değil, yalnız oluşturma).
- `POST /conversations/group` ve `/conversations/channel` — `authorizeRoles([ADMIN, MANAGER])`. Kanal oluşturulurken **tüm kullanıcılar** otomatik üye yapılır.
- `DELETE /conversations/:id` — admin/manager veya oluşturan; **direct konuşmalar silinemez**.
- `GET /conversations/:id/messages` (sayfalı, `before` imleci), `POST /conversations/:id/messages` (rate-limit: dakikada 20 mesaj), `POST /conversations/:id/read`.
- `GET /search` — full-text arama; admin/manager **global**, diğerleri konuşma-kapsamlı (`search_messages()` SQL fonksiyonu / `search_vector`).
- `GET /admin/stats`, `POST /admin/cleanup` — temizlik istatistik/tetik.
- `GET /health` — retention "5 days", realtime "socket.io" bayraklarını döner.

### Sohbet iş mantığı — `backend/services/chatService.js`

Konuşma CRUD, katılımcı yönetimi (`role_in_conversation`: owner/admin/member), soft-leave (`left_at`), `markAsRead` (`last_read_at = NOW()`). Mesaj gönderildikten sonra rota `getParticipantIds()` ile aktif katılımcıları çeker ve `socketService.emitChatMessage(...)` ile **her birinin kişisel odasına** yayar.

### Socket.io — `backend/services/socketService.js`

Singleton. JWT ile `authenticate` (SEC-017: token server-side doğrulanır, client verisine güvenilmez). Bağlanan kullanıcı şu odalara girer: `role:<role>`, `user:<id>`, `general`. Kanal aboneliği `isChannelAllowed()` ile rol-hiyerarşisine göre yetkilendirilir (SEC-018).

**Fan-out / "bubble-up" mantığı (kritik):** `emitChatMessage(conversationId, recipientUserIds, message)` mesajı her katılımcının `user:<id>` odasına gönderir — böylece alıcı sohbet penceresini açmamış olsa bile mesajı **canlı** alır ve köşede balon görür. `emitChatRead(...)` okundu bilgisini diğer taraflara iletir. Konuşma-odası (`conversation:<id>`) typing göstergeleri için kullanılır (`chat:typing` / `chat:user_typing`).

### Mesaj temizliği — `backend/services/messageCleanupService.js`

GDPR veri-minimizasyonu: mesajlar **5 gün** sonra silinir. `node-cron` her gün 03:00 (Europe/Istanbul) `cleanup_expired_messages()` SQL fonksiyonunu çağırır, içerik+ek dosyalarını siler; ayın 1'i 04:00'te yetim dosya (`chat-images/`, `chat-files/`, `voice-messages/`) temizliği yapar.

### Etkinlik rotaları — `backend/routes/events.js` (`/api/events`)

- `GET /public` (önbellekli 120s, misafir dahil herkes) ve `GET /` (`authorizeRoles([admin, manager, developer])`) — her ikisi de `registration_count` LEFT JOIN ile döner.
- `POST /`, `PUT /:eventId`, `DELETE /:eventId` — yönetim (delete = soft, `deleted_at`). `express-validator` ile alan doğrulaması.
- `POST /:eventId/register`, `DELETE /:eventId/register` — **kullanıcının kendi** kaydı (kapasite kontrolü + `ON CONFLICT` upsert; iptal = `status='cancelled'`).
- `POST /:eventId/registrations` (admin başkası adına kaydeder), `DELETE /:eventId/registrations/:userId`, `GET /:eventId/registrations`.
- `GET /:eventId/my-registration`, `GET /my-events` — kullanıcının kayıt geçmişi (öğrenci portalı için).

### Topluluk / Takım

`/community/team` ayrı bir backend rotası kullanmaz; halka açık `GET /api/instructors` ucundan beslenir (sunucu sıralamayı yapar: featured → display_order → name).

## Frontend

### Yüzen sohbet widget'ı — `src/features/chat/`

- `App.jsx` kökünde `<ChatWidgetProvider>` sarmalar ve `<FloatingChatWidget />` mount edilir (her sayfada).
- **`context/ChatWidgetProvider.jsx`** — beynin tamamı. `realTimeService` (paylaşılan, zaten kimlik-doğrulanmış app socket'i) üzerinden `chat:message_sent` / `chat:message_read` dinler. `ingestMessage()` mesajı React Query cache'lerine **id ile tekilleştirerek** katlar (gönderen kendi mesajını socket'ten geri alır → çift sayım önlenir). Açık+görünür sekme okundu sayılır; arka plandaki sekmeye gelen mesaj okunmamış kalır. `conversationsQuery` 60s yedek `refetchInterval` ile kaçan socket olaylarına karşı koruma sağlar; socket yeniden bağlanınca (`authenticated`) liste re-senkronize edilir.
- **`components/FloatingChatWidget.jsx`** — sağ-alt köşe launcher'ı (okunmamış rozeti), açılır panel (konuşma listesi ↔ tek thread), ve panel kapalıyken gelen mesaj için **otomatik kaybolan önizleme balonu** (6 sn). Köşe konumu diğer FAB'lerle (`GlobalFAB` / `StudentQuickActions`) çakışmasın diye role göre `right-24` / `right-6` ayarlanır. Hiç konuşma yoksa launcher görünmez.
- `services/chatApi.js` — REST istemci (mesaj/görsel/dosya/ses gönderimi, arama, katılımcı yönetimi).
- `hooks/useChat.js` — bağımsız `socket.io-client` bağlantısı kuran düşük-seviye hook (typing, join/leave, read-receipt event abonelikleri). Widget esas akışta `realTimeService`'i kullanır; bu hook tam sayfa sohbet için tasarlanmıştı.

### Topluluk takımı — `src/features/community/pages/TeamPage.jsx`

Koyu temalı ([[Outsider_Marketing]] deneyim sayfalarıyla uyumlu) eğitmen kartları ızgarası. `GET /instructors`'tan çeker, dil bayrakları (`LANGUAGE_FLAGS`) ve `InstructorDetailDrawer` ile detay açar. Duotone Pro Center Urla logosu işlenir.

### Etkinlikler — `src/features/events/pages/EventsPage.jsx`

`isAdmin` (`admin/manager/developer`) ayrımıyla **iki yüz**:
- **Halka açık görünüm** — açık temalı kart ızgarası; her etkinlik tipi için renk/emoji teması (`EVENT_TYPE_THEMES`), kapasite çubuğu, GOING/SOLD OUT/PAST rozetleri. Kullanıcı kartı tıklayınca **katıl / iptal** modalı (`selfRegisterMutation` → `POST /events/:id/register`). `/events/my-events` ile kayıtlı etkinlikler işaretlenir.
- **Yönetim görünümü** — istatistikler, arama+tip filtresi, AntD tablo, oluştur/düzenle Drawer'ı (kapak görseli yükleme), kayıt yönetimi Drawer'ı (katılımcı ekle/çıkar).

`src/features/calendars/pages/EventsCalendar.jsx` — `/calendars/events` altında ikinci, takvim-odaklı yönetim arabirimi (aynı `/events` API'sini kullanır; `CalendarViewSwitcher` ile liste/takvim). `EventsPage`'in admin tablosuyla işlevsel olarak örtüşür.

## Veri Modeli

**Sohbet (not: kod tabanı `conversations`/`messages`/`conversation_participants` tablolarını kullanır):**
- `conversations` — `id`, `type` ('direct'|'group'|'channel'), `name`, `created_by`, `created_at`, `updated_at`.
- `conversation_participants` — `conversation_id`, `user_id`, `role_in_conversation`, `joined_at`, `left_at`, `last_read_at`. `(conversation_id, user_id)` benzersiz.
- `messages` — `id`, `conversation_id`, `sender_id`, `message_type` ('text'|'image'|'file'|'voice'|'system'), `content`, `attachment_*`, `voice_*`, `created_at`, `edited_at`, `deleted_at`, `deleted_by_expiration`, `search_vector` (tsvector).

**Etkinlikler:**
- `events` — `id`, `name`, `event_type`, `start_at`, `end_at`, `location`, `description`, `status` ('scheduled'|'cancelled'), `capacity`, `price`, `currency`, `image_url`, `created_by`, `deleted_at`.
- `event_registrations` — `event_id`, `user_id`, `status` ('registered'|'cancelled'), `registered_at`. `(event_id, user_id)` benzersiz (upsert).

## Akış / İş Mantığı

**Üye → personel DM (uçtan uca):** Üye bir personeli seçer → `openConversationWith(otherUserId)` → `POST /conversations/direct` (kapsam: hedef personel mi?) → konuşma açılır. Personel mesaj yazar → `POST /conversations/:id/messages` → `chatService.sendMessage` DB'ye yazar → rota `getParticipantIds()` → `socketService.emitChatMessage()` her katılımcının `user:<id>` odasına yayar → üyenin tarayıcısında `ChatWidgetProvider` `ingestMessage` ile cache'i günceller, okunmamış rozeti artar ve köşede önizleme balonu belirir. Üye balona tıklayınca thread açılır, `markAsRead` çağrılır, karşı tarafa okundu (`chat:message_read`) gider.

**Etkinlik kaydı:** Kullanıcı halka açık kartta "Confirm & Join" → kapasite kontrolü → `event_registrations` upsert → `events`/`my-events` query'leri invalidate. Yönetim kayıt Drawer'ından elle ekleme/çıkarma yapabilir.

## Dikkat / Tuzaklar

- **`/chat` tam sayfa ÖLÜDÜR.** Gerçek sohbet sadece `FloatingChatWidget` üzerinden çalışır; `ChatPage.jsx`'i kullanılabilir sanma.
- **Çift-mesaj tuzağı:** gönderen kendi mesajını socket'ten geri alır; `appendMessageToThread` / `applyMessageToConversations` **id ile tekilleştirir** — bu mantık bozulursa mesajlar iki kez görünür (bkz. MEMORY: live-chat widget send fan-out + dup-listener fix).
- **Socket re-auth penceresi:** backend yalnız `user:<id>` odasına teslim eder ve bu oda ancak socket (yeniden) kimlik-doğruladıktan sonra geçerlidir; kaçan mesajlar `authenticated` event'i + 60s `refetchInterval` ile telafi edilir.
- **Kanal = herkes.** `createGroupOrChannel('channel', ...)` tüm kullanıcıları (silinmemiş) otomatik ekler — büyük kullanıcı tabanında dikkatli olun.
- **Mesajlar 5 günde uçar.** `messageCleanupService` cron'u içeriği geri dönüşsüz siler (GDPR); arama/geçmiş bu pencereyle sınırlıdır.
- **Etkinliklerde iki yönetim arabirimi** (`EventsPage` admin tablosu + `EventsCalendar`) aynı API'yi paylaşır; değişiklik yaparken ikisini de gözden geçirin.
- Etkinlik fiyatı tahsil mantığı sayfada "academy tarafından toplanır" notuyla gösterilir — kayıt anında [[Finances_Wallet]] hareketine bağlı **değildir**.
