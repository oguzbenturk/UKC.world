# Plannivo Platformu Özeti (Müşteri Versiyonu)

Bu doküman, Plannivo’nun tüm kabiliyet haritasını karar vericiler için sonuç ve fayda diliyle özetler; teknik mimari yerine gerçek iş akışlarına ve getirilerine odaklanır.

## 1. Neden Plannivo?
- **Tek Komuta Merkezi:** Dağınık Excel dosyaları, rezervasyon araçları ve mesajlaşma uygulamalarını tek ekranda (satış, operasyon, müşteri hizmetleri) toplayın.
- **Su Sporları & Aktivite Okullarına Özel:** Ders, kiralama, ekipman ve konaklama süreçleri hazır şablonlarla gelir; kod yazmadan yapılandırırsınız.
- **Kurumsal Güvenilirlik:** Docker tabanlı dağıtım, PostgreSQL veritabanı ve Redis cache yapısı yoğun sezonda bile performansı stabil tutar.
- **Uyumluluk Yerleşik:** GDPR araçları, audit log’lar ve onay yönetimi hukuki riski azaltır.

## 2. Temel Yolculuklar & Kazanımlar
| Yolculuk | Plannivo Olmadan Yaşanan Sorun | Plannivo Sağladığı Fayda |
| --- | --- | --- |
| **Müşteri Onboard** | Manuel veri girişi, dağınık onay takibi | Yönlendirmeli formlar, otomatik senkronize tercihler, GDPR uyumlu veri çıktısı |
| **Rezervasyon & Planlama** | Çifte rezervasyon riski, eğitmenler için görünürlük yok | Ortak takvim, adım adım rezervasyon sihirbazı, eğitmen panelleri |
| **Ekipman & Kiralama** | Kağıt sözleşmeler, kaçan bakım kayıtları | Dijital sözleşmeler, envanter anlık görüntüsü, otomatik hatırlatmalar |
| **Finans & Raporlama** | Ayrı Excel dosyaları, geciken mutabakat | Canlı gelir kartları, lokasyona özel finans ayarları, otomatik mutabakat işleri |
| **Öğrenci Portalı** | Müşteri tüm bilgi için e-posta zincirine mahkum | Program, ödeme, waiver ve aile yönetimi için self-servis portal |
| **İletişim** | Parçalı bildirimler, manuel takip | Rol/senaryo bazlı hedeflenen gerçek zamanlı bildirimler + popup yöneticisi |

## 3. Öne Çıkan Özellikler
### Operasyon Paketi
- **Executive Dashboard:** Role duyarlı KPI’lar, eğitmen sıralamaları, CSV/PDF raporları.
- **Eğitmen Çalışma Alanı:** Günlük ajanda, öğrenci analitiği, yavaş bağlantılar için fallback görünümü.
- **Rezervasyon Takvimi & Sihirbazı:** Modern takvim arayüzü, hızlı düzenleme, silinen rezervasyon arşivi.
- **Ekipman & Kiralama:** Her ekipman için yaşam döngüsü takibi, rezervasyonla ilişkilendirme, bakım pencereleri.

### Müşteri & Öğrenci Deneyimi
- **CRM & Profiller:** Paketler, belgeler ve geçmiş dahil tekil müşteri kaydı.
- **Öğrenci Portalı:** Mobil öncelikli tasarım; programlar, kurs ilerlemeleri, ödemeler, destek ve aile erişimi.
- **Waiver & Uyumluluk:** Dijital waiver yönetimi ve birkaç tıkla veri ihracı/anonimleştirme.

### Finansal Zeka
- **Finans Dashboard:** Gelir vs rezervasyon değeri, eğitmen kullanımı, dönüşüm oranları.
- **Cüzdan & Paketler:** Çok para birimli bakiyeler ve hediye paketleri için geleceğe dönük mimari.
- **Otomatik Mutabakat:** Arka planda çalışan servis farkları yakalayıp temiz bir defter tutmanızı sağlar.

### Etkileşim & Destek
- **Bildirim Merkezi:** Filtrelenebilir uyarı geçmişi, Socket.IO gerçek zamanlı köprüyle entegre.
- **Popup Yöneticisi:** İlk giriş, upsell veya politika hatırlatma senaryoları için davranışsal popup’lar.
- **Yardım & AI Asistan:** Bilgi tabanı + AI prompt paneli sayesinde ekip sorunları daha hızlı çözer.

## 4. Güvenlik & Uyumluluk Hikayesi
- **Rol Bazlı Erişim:** Admin, manager, instructor, student, customer seviyelerinde rota koruması.
- **Onay Süreci:** Dahili modal, pazarlama tercihleri ve hukuki şartların onayını garanti eder.
- **GDPR Aracı:** Self-servis veri indir/sil + resmi talepler için CLI; audit log’lar delil olarak saklanır.
- **SSL & Altyapı:** Otomatik sertifika yönetimi ve güçlendirilmiş Nginx kurulumuyla veriler daima şifreli.

## 5. Yayın & Ölçeklenebilirlik
- **Docker-Öncelikli:** Laptop’tan üretime aynı stack; `push-all` script’i deterministik deploy sağlar.
- **Gözlemlenebilirlik:** Health check’ler, Prometheus uyumlu metrikler, ağ durumu banner’ları.
- **Genişleyebilir Mimari:** Feature flag’ler, modüler rotalar ve tipli servisler yeni modüllerin riskini düşürür.

## 6. Tipik Uygulama Takvimi
1. **1. Hafta:** Ortam kurulumu, SSL temini, domain yönlendirmesi.
2. **2. Hafta:** Veri importu (müşteri, ekipman, paket) + marka uyarlamaları.
3. **3. Hafta:** Personel onboarding’i, dashboard ayarları, bildirim şablonları.
4. **4. Hafta:** Öğrenci portalı lansmanı, waiver taşınması, KPI kalibrasyonu.
5. **Go-Live Sonrası:** Çeyreklik analitik optimizasyonu, sezon kampanya şablonları, opsiyonel cüzdan çıkışı.

## 7. Müşterinin Teslim Aldıkları
- Özel domain + SSL ile canlıya hazır Plannivo ortamı.
- Operasyon, finans, analitik ve uyumluluk için rehber doküman paketi.
- Admin, eğitmen ve müşteri destek ekipleri için eğitim planı.
- 30 gün içinde uptime, güvenlik yamaları ve GDPR desteğini kapsayan SLA.

---
**Karar Özeti:** Plannivo sadece bir rezervasyon aracı değil; aktivite okulları için uçtan uca bir işletim sistemidir. Müşteriler ilk günden itibaren akışkan operasyon, veriye dayalı büyüme ve uyumluluk huzuru elde eder.