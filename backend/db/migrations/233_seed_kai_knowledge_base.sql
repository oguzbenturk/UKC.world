-- Seed knowledge base with real service/pricing data from Plannivo
-- This data is injected into Kai's system prompt to reduce tool calls

INSERT INTO kai_knowledge_base (category, title, content, applicable_roles, sort_order) VALUES
('Dersler', 'Kitesurfing Dersleri', 'Kitesurfing ders tipleri ve fiyatlar (tum dersler 1 saat):
- Private Lesson: 95 EUR (1 ogrenci, 1 egitmen)
- Semi-Private Lesson: 65 EUR/kisi (2 ogrenci, 2 ucurtma)
- Group Lesson: 56 EUR/kisi (2 ogrenci, 1 ucurtma, sadece beginner)
- Boat Lesson: 120 EUR (motorbot esliginde, daha hizli ilerleme)
- Premium Lesson: 135 EUR (en tecrubeli egitmenler)
- Advanced Lesson: 95 EUR (temel bilen, gelistirmek isteyen)
- Supervision Session: 70 EUR (serbest surus + uzman gozetimi)
- Kite Foiling Lesson: 95 EUR (deneyimli kiter''lar icin foil dersi)
Tum derslere ekipman dahildir.', '{outsider,student,instructor,admin,manager}', 1),

('Dersler', 'Wing Foil Dersleri', 'Wing Foil ders tipleri ve fiyatlar (tum dersler 1 saat):
- Private Wing Foil Lesson: 95 EUR (1 ogrenci)
- Semi-Private Wing Foil: 65 EUR/kisi (2 ogrenci)
- Group Wing Foil: 56 EUR/kisi (2 ogrenci, sadece beginner)
- Advanced Wing Foil: 95 EUR (foil start, jibe, tack calismasi)
Tum derslere ekipman dahildir.', '{outsider,student,instructor,admin,manager}', 2),

('Dersler', 'E-Foil Dersi', 'E-Foil Lesson: 135 EUR/saat
Ruzgarsiz gunlerde bile yapilabilir. Elektrikli foil ile su ustunde ucus deneyimi. Tum seviyelere uygundur.', '{outsider,student,instructor,admin,manager}', 3),

('Ekipman Kiralama', 'Kite Ekipman Kiralama', 'Kite full-set kiralama (ucurtma, board, bar, harness, guvenlik ekipmani dahil):
Standard Duotone: 45 EUR/1s, 70 EUR/4s, 90 EUR/8s, 460 EUR/hafta
SLS Duotone: 48 EUR/1s, 78 EUR/4s, 100 EUR/8s, 600 EUR/hafta
D/LAB Duotone: 58 EUR/1s, 90 EUR/4s, 130 EUR/8s
Sadece Board: Twintip 30 EUR/8s | SLS Twintip 38 EUR/8s, 190 EUR/hafta
Tum boyutlar mevcut, duzenli bakim yapilir.', '{outsider,student,instructor,admin,manager}', 1),

('Ekipman Kiralama', 'Wing Foil Ekipman Kiralama', 'Wing Foil full-set kiralama (wing, foil board, foil set, leash, guvenlik ekipmani dahil):
Standard: 45 EUR/1s, 70 EUR/4s, 90 EUR/8s, 460 EUR/hafta
SLS: 48 EUR/1s, 78 EUR/4s, 100 EUR/8s, 600 EUR/hafta
D/LAB: 58 EUR/1s, 90 EUR/4s, 130 EUR/8s
Tum boyutlar mevcut, duzenli bakim yapilir.', '{outsider,student,instructor,admin,manager}', 2),

('Konaklama', 'Otel Odalari', 'Otel konaklama secenekleri (2 kisi kapasiteli):
- Standard Room: 115 EUR/gece — Tesisin merkezinde, temiz ve konforlu
- Sea View Room: 140 EUR/gece — Deniz manzarali, dogal isikli
- Sea View Terrasse: 150 EUR/gece — Ozel teras, kesintisiz deniz manzarasi
Check-in: 14:00 | Check-out: 11:00', '{outsider,student,instructor,admin,manager}', 1),

('Konaklama', 'Ozel Studyolar', 'Bagimsiz studyo konaklama (2 kisi kapasiteli):
- Studio 3 (Private Garden): 90 EUR/gece — Ozel bahceli, sakin studyo
- Bag Evi 1+1 (Private Pool): 100 EUR/gece — Ozel havuz ve bahce, sahile yakin
  Cift kisi: 70 EUR/kisi/gece | Haftalik cift kisi: 420 EUR/kisi', '{outsider,student,instructor,admin,manager}', 2),

('Plaj & Uyelik', 'Beach Pass Secenekleri', 'Plaj erisim paslari:
- Beach Day Pass: 12 EUR (gunluk plaj erisimi)
- Beach Week Pass: 72 EUR (7 gun)
- Beach Monthly Pass: 200 EUR (30 gun)
- Beach Season Pass: 400 EUR (tum sezon, oncelikli alan)
Tum paslar: lansman alani, plaj tesisleri ve okul bolgesi erisimi icerir.', '{outsider,student,instructor,admin,manager}', 1),

('Plaj & Uyelik', 'Depolama Secenekleri', 'Ekipman depolama + plaj erisimi paketleri:
- Storage + Beach Gun: 17 EUR
- Storage + Beach Hafta: 100 EUR (7 gun)
- Storage + Beach Ay: 330 EUR (isimli depolama alani)
- Storage + Beach Sezon: 550 EUR (oncelikli erisim)
- Winter Storage: 200 EUR (kuru, guvenli, sezon disi depolama)
Guvenli depolama alani, ekipmaniniz her zaman hazir.', '{outsider,student,instructor,admin,manager}', 2),

('Genel Bilgi', 'Konum & Iletisim', 'UKC (Urla Kite Club) — Urla, Izmir, Turkiye
Ege kiyisinda, Urla''da yer alan ruzgar sporlari merkezi.
Disiplinler: Kitesurfing, Wing Foil, E-Foil
Ekipman: Duotone (Standard, SLS, D/LAB serileri)
Web: ukc.world', '{outsider,student,instructor,admin,manager}', 1),

('Genel Bilgi', 'Ders Politikalari', '- Dersler ruzgar ve hava kosullarina baglidir
- Ruzgar yetersizse ders ertelenebilir veya iptal edilebilir (ucret alinmaz)
- Ogrenci gelmezse veya gec iptal ederse ucret iade edilmez
- Tum derslere ekipman dahildir, ekstra ucret yoktur
- Ders suresi 1 saattir (setup/brief dahil)
- Beginner group dersler max 2 kisi ile yapilir', '{outsider,student,instructor,admin,manager}', 2)

ON CONFLICT DO NOTHING;
