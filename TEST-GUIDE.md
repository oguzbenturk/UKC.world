# Plannivo — Bugün Yapılanlar İçin Local Test Rehberi

**Tarih:** 2026-05-30
**Kapsam:** Bu seansta yapılan tüm değişiklikler (Phase 2 + 3). v0.1.286 production'dan sonra yapılan iş.

> Bu rehberi sırasıyla takip et. Her bölüm bağımsız test edilebilir. Bir bölüm başarısız olursa not düş ve devam et — son bölümde tek tek geri dön.

---

## 0. Ön hazırlık (1 kez yap)

```bash
# 1. Docker DB ayağa kalkmış olsun
npm run db:dev:up

# 2. (İsteğe bağlı) prod datasını yerele sync et
npm run db:sync

# 3. Dev server'ı başlat (frontend + backend birlikte)
npm run dev
```

Frontend → http://localhost:3000
Backend → http://localhost:4000
DB → localhost:5432

**Dev hesapları** ([memory'den](C:\Users\Oguz\.claude\projects\d--UKC-world\memory\project_dev_credentials.md)):

| Rol | Email | Şifre |
|---|---|---|
| Admin | `admin@plannivo.com` | `admin123` |
| Manager | `ozibenturk@gmail.com` | `WHMgux86` |
| Student | `test123@gmail.com` | `testtest` |

**⚠️ Receptionist hesabı yok** — testlerin yarısı receptionist gerektiriyor. İki seçenek:
- Yöntem A: Admin olarak login ol → bir kullanıcı oluştur (rol = "receptionist") → şifre belirle → o hesapla test et
- Yöntem B: DB'de mevcut bir hesabı `receptionist`'e çevir:
  ```sql
  UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'receptionist')
  WHERE email = 'YOURTESTEMAIL@plannivo.com';
  ```

> Aşağıdaki testlerde "frontdesk" derken `receptionist` ya da `front_desk` ROL'ündeki kullanıcıyı kastediyorum.

---

## 1. Aktivasyon Dialog (Yeni Öğrenci Oluşturma) — #6, #7

**Test 1.1 — Activate Now (mail GELMEMELİ)**
1. Admin/manager/receptionist olarak login ol.
2. FAB (+ ikonu) veya Müşteri sayfası → "Add Customer".
3. Form'u doldur (Ad, Soyad, email, telefon, şifre **8+ karakter**, rol = student).
4. "Create" → Modal açılır: "How should this account be activated?"
5. **"Activate now"** seç.
6. ✅ Müşteri yaratıldı toast'u gelmeli.
7. ✅ Müşterinin email kutusuna **HİÇ MAIL GİTMEMELİ** (önceden "set your password" maili gidiyordu, artık hayır).
8. DB kontrolü:
   ```sql
   SELECT email, email_verified, email_verified_at FROM users
   ORDER BY created_at DESC LIMIT 1;
   ```
   → `email_verified = true`, `email_verified_at = NOW()`.

**Test 1.2 — Send Activation Email**
1. Yeni müşteri için aynı form.
2. Modal'da **"Send activation email"** seç.
3. ✅ "User created" toast'u + müşterinin email kutusuna **verify maili** gitmeli.
4. DB:
   ```sql
   SELECT email, email_verified, email_verification_sent_at FROM users
   ORDER BY created_at DESC LIMIT 1;
   ```
   → `email_verified = false`, `sent_at = NOW()`.

**Test 1.3 — Cancel**
1. Form'u doldur, "Create" → Modal'da **"Cancel"**.
2. ✅ Hiçbir kayıt oluşmamalı, form açık kalmalı.

**Test 1.4 — Edit modunda dialog GELMEMELİ**
1. Mevcut bir müşterinin "Edit" → kaydet.
2. ✅ Hiçbir aktivasyon dialog'u açılmamalı, direkt kaydetmeli.

**Test 1.5 — Şifre minimum 8 karakter**
1. Form'da şifreye "abc" yaz.
2. ✅ "Password must be at least 8 characters" hatası gelmeli, submit edilemeyecek.

---

## 2. Frontdesk Rol Yetkileri — B, C

**Test 2.1 — Receptionist müşteri oluşturabilmeli (önceden 403 alıyordu)**
1. Receptionist hesabıyla login ol.
2. FAB → New Customer → form doldur → kaydet.
3. ✅ Başarılı oluşturma.

**Test 2.2 — Receptionist sadece student/outsider/trusted_customer rolleri görüyor**
1. Receptionist olarak müşteri ekleme formunu aç.
2. Role dropdown'a tıkla.
3. ✅ Sadece `student`, `outsider`, `trusted_customer` görünmeli. `admin`, `manager`, `instructor` görünmemeli.
4. Karşılaştır: admin olarak aç → tüm roller görünmeli.

**Test 2.3 — Customer profile financial history (önceden gizliydi)**
1. Receptionist olarak bir customer profile aç (Müşteriler sayfasından bir müşteriye tıkla).
2. ✅ "Financial" tab'i görünmeli.
3. ✅ "Wallet" bölümü ve transaction tablosu görünmeli.
4. ✅ "Reset Wallet" butonu **görünmemeli** (sadece admin/manager/owner görüyor — kasıtlı kısıtlama).

**Test 2.4 — Inventory edit/silme**
1. Receptionist olarak Inventory sayfasına git.
2. ✅ Add Equipment butonu görünmeli, edit/delete butonları aktif.

**Test 2.5 — Repairs / Spare Parts / Services**
1. Receptionist olarak:
   - Repairs sayfası → admin görünüm açılmalı.
   - Spare Parts Orders → erişebilmeli.
   - Services → delete butonları gözükmeli.

**Test 2.6 — FrontDesk Dashboard welcome header**
1. Receptionist OLARAK dashboard'a git.
2. ✅ "Welcome back, X" header **görünmemeli** (önceden sadece `front_desk`'te gizleniyordu, şimdi `receptionist`'te de).

---

## 3. Shop Discount — Müşteri Profilinde — E, #4, #5

**Test 3.1 — Customer profile Shop tab açılışı**
1. Admin/receptionist olarak bir müşteri profili aç.
2. "Shop" tab'ine tıkla.
3. ✅ Geçmiş shop orders listelenmeli.
4. Eğer hiç sipariş yoksa, önce QuickShopSale ile bir tane yarat (Test 3.3).

**Test 3.2 — View Details çalışsın (önceden 403 veriyordu)**
1. Shop tab'inde bir siparişin satırına tıkla VEYA göz ikonuna bas.
2. ✅ Detay modalı açılmalı (ürünler, total, status).

**Test 3.3 — Discount butonu**
1. Shop tab'indeki bir order satırının Actions kolonunda **"Discount"** butonu olmalı.
2. Tıkla → ApplyDiscountModal açılır.
3. %20 gir, reason "Loyalty" yaz, kaydet.
4. ✅ Total kolonu strike-through orijinal fiyat + yeşil indirimli fiyat şeklinde değişmeli.
5. DB kontrolü:
   ```sql
   SELECT * FROM discounts WHERE entity_type='shop_order' ORDER BY created_at DESC LIMIT 1;
   ```
   → row eklenmiş.

**Test 3.4 — QuickShopSaleModal'da Discount %**
1. Dashboard → "Quick Shop Sale" butonu.
2. Customer seç, ürün seç (en az 1 adet stoğu olan), miktar = 1.
3. **Discount (%)** alanına 10 yaz.
4. Total bölümünde önce orijinal fiyat strike-through, altında %10 düşmüş hali görünmeli.
5. "Complete Sale" → ✅ Toast gelir.
6. Müşteri profilinde shop tab → yeni sipariş %10 indirimli görünmeli.

---

## 4. Membership / Storage Satışları Finansal Geçmişe Düşmeli — G, #13

**Test 4.1 — Admin membership satışı**
1. Sidebar → Calendars → Members.
2. Sağ üstte (varsa) "Assign Membership" butonu — yoksa Dashboard → "Quick Membership".
3. Customer seç, offering seç, payment_method = "cash" (veya wallet), kaydet.
4. Müşteri profili → Financial tab.
5. ✅ Yeni `-€X` debit satırı görünmeli. Description: "Membership purchase: ..." veya "Storage purchase: ...".

**Test 4.2 — Storage satışı (varsa)**
1. Aynı akış ama offering = bir storage tipi (kategorisi 'storage').
2. ✅ Financial tab → satır description "Storage purchase: ... (unit #N)" şeklinde.
3. DB:
   ```sql
   SELECT description, amount, related_entity_type FROM wallet_transactions
   WHERE related_entity_type = 'member_purchase' ORDER BY transaction_date DESC LIMIT 5;
   ```

**Test 4.3 — Wallet payment edilirse balance düşmeli**
1. Customer'ın wallet'i 100 € olsun.
2. Admin Quick Membership → payment_method = "wallet", 50 € üyelik.
3. ✅ Wallet balance 50 € olmalı.
4. Financial tab → debit satır + balance after column 50.

---

## 5. Cüzdan Eksi Bakiye Override — F, B1

**Test 5.1 — Müşteri-yüzlü checkbox YOK**
1. Customer hesabıyla (öğrenci) ders rezerve etmeye git.
2. Confirmation step'e gel.
3. ✅ "Allow Negative Balance" checkbox **görünmemeli** (kaldırıldı — güvenlik açığı).

**Test 5.2 — Frontdesk bakiyesi olmayan müşteriye booking**
1. Bir müşterinin wallet'ini 0'la (admin → Reset Wallet ya da test verisi).
2. Receptionist olarak o müşteri için ders rezervasyonu yap (50 €'luk).
3. ✅ Rezervasyon tamamlanmalı (önceden "Insufficient wallet balance" hatası alırdı).
4. Müşterinin wallet'i artık -€50 olmalı.

**Test 5.3 — Frontdesk rental**
1. Aynı müşteri için bir ekipman rental'i (örn. 30 €).
2. Receptionist olarak Rental başlat → bakiye yetersiz.
3. ✅ Rental tamamlanmalı (önceden front_desk/receptionist override yapamıyordu, sadece admin/manager/owner yapabiliyordu).

**Test 5.4 — Frontdesk shop quick-sale**
1. Quick Shop Sale → ürün seç → wallet payment → ödeme tutarı > müşteri bakiyesi.
2. Receptionist olarak "Complete Sale".
3. ✅ Sale tamamlanmalı.

**Test 5.5 — Audit log**
Her overdraft sonrası DB'yi kontrol et:
```sql
SELECT wallet_user_id, actor_user_id, action, details, created_at
FROM wallet_audit_logs
WHERE action = 'wallet.negative_balance_override'
ORDER BY created_at DESC LIMIT 10;
```
✅ Her overdraft için bir row düşmeli, details JSONB içinde `transactionType`, `currency`, `shortfall`, `relatedEntityType` (booking/rental/shop_order).

---

## 6. BookingDetailModal Start Time Edit — #10

**Test 6.1 — Mevcut booking'i edit ederken start time görünmeli**
1. Calendar → bir booking'e tıkla → modal açılır.
2. "Edit" moduna gir.
3. ✅ "Start time" alanı görünmeli, **booking'in mevcut saatiyle** (HH:MM) doluyken.

**Test 6.2 — Start time boşken kayıt reddedilmeli**
1. Start time alanını manuel temizle.
2. "Save" → ✅ Hata mesajı: "Start time is required (HH:MM)". Save bloklanmalı.

**Test 6.3 — Saat değiştir + kaydet**
1. Start time'ı değiştir (örn. 14:30).
2. Save.
3. ✅ Başarılı kayıt toast'u.
4. Modal'ı kapat aç → yeni saat görünsün.
5. DB kontrolü:
   ```sql
   SELECT id, start_hour FROM bookings WHERE id = '<bookingId>';
   ```
   → `start_hour = 14.5` (NUMERIC, decimal format).
6. Calendar yenile → booking yeni saatte görünmeli.

**Test 6.4 — Frontdesk bookings edit edebilmeli**
1. Receptionist olarak da aynı flow.
2. ✅ Edit + save işlemeli (önceden 403'tü).

---

## 7. Calendar 30-dakikalık Drag-and-Drop — #11

**Test 7.1 — Daily view satırları yarım saatlik**
1. Sidebar → Calendars → Daily.
2. ✅ Time column'da satırlar `09:00`, `09:30`, `10:00`, `10:30`... olarak listelenmeli.

**Test 7.2 — Booking görseli doğru yükseklikte**
1. 1 saatlik bir booking olan günü aç.
2. ✅ Booking blok'u görsel olarak **2 satır yüksekliğinde** (her satır 30 dk).

**Test 7.3 — Drag-and-drop yarım saatlik snap**
1. Bir booking'i farklı bir saate sürükle (örn. 09:00 → 11:30).
2. ✅ Drop hedefi 11:30 olarak snap olmalı (08:00, 08:30, 09:00, ... gibi 30-dk'lık adımlarda).
3. Drop sonrası onay → ✅ booking yeni saate taşındı.
4. DB:
   ```sql
   SELECT start_hour FROM bookings WHERE id = '<bookingId>';
   ```
   → `11.5` görmeli.

**Test 7.4 — "Now" çizgisi doğru yerde**
1. Current zaman 14:45 ise, "now" line'ı yaklaşık `14:45`'in pixel pozisyonunda olmalı (slot başlangıçlarıyla doğru hizalanmalı).

---

## 8. Calendar > Members Edit + Discount — #12

**Test 8.1 — Members sayfası açılışı**
1. Sidebar → Calendars → Members.
2. ✅ Member purchases listesi görünür.
3. Her satır için Actions kolonunda **3 buton**: View (göz), Edit (kalem), Discount (% işareti).

**Test 8.2 — Edit modalı**
1. Bir satırda "Edit" butonuna bas.
2. ✅ Modal açılır: status (active/pending/expired/cancelled), payment_status, expires_at, notes.
3. status'u "expired" yap, kaydet.
4. ✅ Toast: "Membership updated". Liste yenilenip status değişmeli.

**Test 8.3 — Discount uygula**
1. Bir satıra "Discount" → ApplyDiscountModal açılır.
2. %15 indirim, kaydet.
3. ✅ Toast: discount uygulandı. Modal kapanmalı.
4. DB:
   ```sql
   SELECT * FROM discounts WHERE entity_type='member_purchase' ORDER BY created_at DESC LIMIT 1;
   ```
   → row eklenmiş.

**Test 8.4 — Frontdesk de yapabilmeli**
1. Receptionist olarak aynı işlemler.
2. ✅ Edit + Discount işlemeli.

---

## 9. Ürün CRUD + Subcategory — #2, #3

**Test 9.1 — Frontdesk ürün silmesi**
1. Receptionist olarak Products / Shop Products sayfası.
2. Bir ürünün delete butonuna bas → onayla.
3. ✅ "Product deleted" mesajı (önceden 403'tü).

**Test 9.2 — NewProductDrawer subcategory ekleme**
1. Receptionist olarak yeni ürün oluşturmaya başla → category seç → subcategory dropdown.
2. Yeni subcategory yaz (örn. "Test Sub"), enter veya "Add" tıkla.
3. ✅ Subcategory listede görünmeli, kaydedilebilmeli (önceden 403'tü).

---

## 10. Self-Registration (Public) — #8

**Test 10.1 — Yeni kullanıcı kendi kaydolurken verify mail almalı**
1. Logout.
2. `/register` sayfasına git.
3. Yeni email + şifre + adı/soyadı ile kaydol.
4. ✅ "Check your email to verify" mesajı.
5. Email kutusu → verify link.
6. Link'e tıkla → ✅ "Your email has been verified" sayfası.
7. Login dene → ✅ giriş yapabilmeli.

**Test 10.2 — Resend cooldown (admin)**
1. Admin olarak unverified bir kullanıcının profilinde "Resend verification email" tıkla.
2. 2 dakikadan önce tekrar tıkla.
3. ✅ 429 hatası "Please wait Xs before resending" (önceden cooldown sadece client'taydı).

---

## 11. Smoke Test — Genel Bakış

Aşağıdakileri her rolde bir kez yap:

- [ ] Admin login → tüm modüller açılıyor mu
- [ ] Manager login → admin-equivalent ekranlar açılıyor mu
- [ ] Receptionist login → erişimleri Test 2 ile aynı mı
- [ ] Student login → sadece kendi rezervasyonlarını / wallet'ini görebiliyor mu
- [ ] Console'da kırmızı hata var mı (browser DevTools → Console)
- [ ] Network sekmesinde 500 / 403 / 404 anomalileri var mı

---

## 12. Bilinen sınırlamalar (test bunlarda fail eder, normal)

- **#10 step 900 (15 dk)**: `<input type="time">` browser'ın varsayılan step'iyle çalışıyor. 30-dk'lık step istersen söyle, ayarlarız.
- **Wallet quick-sale multi-currency**: Müşterinin TRY bakiyesi varsa ama EUR'su yoksa, quick-sale EUR'da overdraft yapar. Multi-currency rewrite ertelendi (B3 deferred).
- **FOR UPDATE locks**: Eş zamanlı iki rental / quick-sale aynı bakiyeyi okuyabilir. DB trigger (`wallet_guard_non_negative_balance`) ikinciyi reddeder, dolayısıyla veri tutarlılığı korunuyor ama hata mesajı garip görünebilir.
- **language field**: UserForm'da gösteriliyor ama DB'de kolon olmadığı için kaydedilmiyor — bir migration eklemediğin sürece olmayacak.

---

## Bug bulursan ne yap?

Her bug için şunu ver:
1. Hangi test'in hangi adımı?
2. Beklenen sonuç vs gerçek sonuç
3. Browser console hatası (varsa)
4. Backend log (varsa — terminal'deki dev:backend çıktısı)

Birlikte düzeltiriz. Sonra `npm run push-all` ile production'a çıkarız.
