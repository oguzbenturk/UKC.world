-- Clean up duplicate KB seeds (keep oldest row per title)
DELETE FROM kai_knowledge_base a
USING kai_knowledge_base b
WHERE a.id > b.id
  AND a.title = b.title
  AND a.category = b.category;

-- Add/refresh lesson durations & equipment info
DELETE FROM kai_knowledge_base
WHERE title IN ('Ders Süreleri', 'Foil Dersleri');

INSERT INTO kai_knowledge_base (category, title, content, sort_order) VALUES
('Dersler', 'Ders Süreleri ve Öğrenme Bilgisi',
'Ortalama öğrenme süreleri (kişiden kişiye değişir):

**Kitesurfing:** 8-12 saat ders (günde 2 saat, önceden rezervasyonla)
**Wing Foil:** 4-6 saat ders — bu süreden sonra öğrenci kendi başına pratik yapabilir (günde 2 saat)
**Foil (Kite Foiling):** 4-6 saat — Kitesurf tecrübesi ZORUNLUDUR
**E-Foil:** Tecrübe gerekmez, tüm seviyelere uygun. Wing Foil ve Foil öğrenmeye hazırlık olarak çok faydalıdır.

**Ekipman:** Tüm derslerimizde kullanılacak ekipmanlar DPC-Urla tarafından karşılanır, EKSTRA ÜCRET alınmaz.',
1),

('Dersler', 'Foil Dersleri',
'Foil (Kite Foiling) dersleri için daha önceden Kitesurf tecrübesi olmak GEREKİR. Ortalama ders saati: 4-6 saat. Fiyat: 95 EUR/saat. Ekipman dahildir.',
5);

-- Ensure all knowledge rows are marked updated so cache refreshes
UPDATE kai_knowledge_base SET updated_at = NOW() WHERE is_active = true;
