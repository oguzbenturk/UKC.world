-- Migration 260: Comprehensive bilingual (TR/EN) legal documents for the kitesurf school.
-- Replaces any existing terms/privacy/marketing rows with full KVKK-compliant content
-- tailored for a watersports / kitesurf academy operating in Turkey.
--
-- Idempotent: schema_migrations ledger ensures this only runs once per environment.
-- DELETE + INSERT pattern matches the existing 131_populate_legal_documents.sql style.

DELETE FROM legal_documents WHERE document_type IN ('terms', 'privacy', 'marketing');

-- ── Privacy Policy / KVKK Aydınlatma Metni ──────────────────────────────────
INSERT INTO legal_documents (document_type, version, content, is_active, created_at, updated_at)
VALUES (
  'privacy',
  '2026-05-18',
  $HTML$
<div class="legal-document">
  <h1>Gizlilik Politikası ve KVKK Aydınlatma Metni</h1>
  <p><strong>Yürürlük Tarihi:</strong> 18 Mayıs 2026</p>
  <p><strong>Son Güncelleme:</strong> 18 Mayıs 2026</p>

  <h2>1. Giriş</h2>
  <p>UKC. Duotone Pro Center ("Merkez", "biz", "bizim"), 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") ve ilgili mevzuat kapsamında kişisel verilerinizin korunmasına büyük önem verir. Bu aydınlatma metni; kitesurf, wing foil, foil, e-foil, windsurf ve diğer su sporları hizmetlerimizden faydalanan ziyaretçi, müşteri, öğrenci, kursiyer, eğitmen adayı ve web sitesi ziyaretçilerimize yönelik kişisel veri işleme faaliyetlerimizi açıklamaktadır.</p>

  <h2>2. Veri Sorumlusu</h2>
  <p>
    <strong>Veri Sorumlusu:</strong> UKC. Duotone Pro Center<br>
    <strong>E-posta:</strong> info@plannivo.com<br>
    <strong>Lokasyon:</strong> Urla / İzmir, Türkiye
  </p>

  <h2>3. İşlenen Kişisel Veri Kategorileri</h2>

  <h3>3.1 Tarafınızca Sağlanan Veriler</h3>
  <ul>
    <li><strong>Kimlik Bilgileri:</strong> Ad, soyad, doğum tarihi, uyruk, kimlik/pasaport numarası</li>
    <li><strong>İletişim Bilgileri:</strong> E-posta adresi, telefon numarası, adres</li>
    <li><strong>Acil Durum İletişim Bilgileri:</strong> Yakının adı ve telefon numarası</li>
    <li><strong>Ödeme Bilgileri:</strong> Kart bilgileri (PCI-DSS uyumlu ödeme sağlayıcısı tarafından güvenli olarak işlenir), fatura adresi</li>
    <li><strong>Sağlık Bilgileri (özel nitelikli):</strong> Su sporlarına katılım için açıklamak istediğiniz hastalık, alerji, kullanılan ilaç, yüzme becerisi (yalnızca açık rızanız ile, güvenlik amaçlı işlenir)</li>
    <li><strong>Sorumluluk Feragatnamesi:</strong> İmzaladığınız belgeler ve imzanız</li>
    <li><strong>Ders/Kiralama Geçmişi:</strong> Rezervasyonlar, seviye ilerleyişiniz, eğitmen notları</li>
    <li><strong>Görsel-İşitsel Veri:</strong> Açık rızanızla; ders sırasında çekilen fotoğraf/video kayıtları</li>
  </ul>

  <h3>3.2 Otomatik Olarak Toplanan Veriler</h3>
  <ul>
    <li><strong>Kullanım Verileri:</strong> IP adresi, tarayıcı türü, cihaz bilgisi, ziyaret edilen sayfalar, oturum süresi</li>
    <li><strong>Konum Verisi:</strong> IP adresine dayalı yaklaşık konum (şehir/ülke düzeyi)</li>
    <li><strong>Çerezler:</strong> Oturum çerezleri, tercih çerezleri, analitik çerezler (detay için "Çerez Politikası" başlığı)</li>
  </ul>

  <h2>4. Kişisel Verilerin İşlenme Amaçları ve Hukuki Sebepleri (KVKK m.5)</h2>

  <p>Kişisel verileriniz aşağıdaki hukuki sebeplere dayalı olarak işlenmektedir:</p>

  <h3>4.1 Açık Rızanıza Dayalı İşleme (KVKK m.5/1):</h3>
  <ul>
    <li>Pazarlama iletişimleri (e-posta, SMS, WhatsApp bültenleri, kampanya bildirimleri)</li>
    <li>Fotoğraf/video içeriklerin sosyal medya ve tanıtım materyallerinde kullanımı</li>
    <li>Özel nitelikli sağlık verilerinin işlenmesi</li>
    <li>Yurt dışına veri aktarımı (KVKK m.9)</li>
  </ul>

  <h3>4.2 Sözleşmenin Kurulması ve İfası İçin Zorunlu İşleme (KVKK m.5/2-c):</h3>
  <ul>
    <li>Ders/ekipman kiralama rezervasyonu ve hizmetin sunulması</li>
    <li>Ödeme süreçleri ve fatura/makbuz düzenleme</li>
    <li>Müşteri portal hesabı oluşturma ve yönetme</li>
    <li>Eğitim seviyenizin takibi ve ilerleme raporları</li>
  </ul>

  <h3>4.3 Hukuki Yükümlülüklerin Yerine Getirilmesi (KVKK m.5/2-ç):</h3>
  <ul>
    <li>Vergi mevzuatı kapsamında fatura ve mali kayıtlar (10 yıl saklama)</li>
    <li>Sorumluluk feragatnamesi ve güvenlik kayıtları (10 yıl saklama)</li>
    <li>Sigorta yükümlülükleri</li>
    <li>Resmi makamlardan gelen taleplerin karşılanması</li>
  </ul>

  <h3>4.4 Meşru Menfaat (KVKK m.5/2-f):</h3>
  <ul>
    <li>Hizmet kalitesinin iyileştirilmesi ve müşteri memnuniyetinin ölçülmesi</li>
    <li>Dolandırıcılık önleme ve hesap güvenliği</li>
    <li>İstatistiksel analiz ve operasyonel raporlama (anonimleştirilmiş)</li>
    <li>Tesis güvenliği için CCTV kayıtları (yalnızca giriş/çıkış ve depo alanları, 30 gün saklanır)</li>
  </ul>

  <h2>5. Kişisel Verilerin Aktarılması</h2>

  <p>Kişisel verileriniz aşağıdaki alıcı kategorilerine aktarılabilir:</p>

  <h3>5.1 Hizmet Sağlayıcılarımız:</h3>
  <ul>
    <li><strong>Ödeme kuruluşları:</strong> Iyzico, Banka POS sağlayıcıları (PCI-DSS uyumlu, şifreli aktarım)</li>
    <li><strong>Bulut altyapı sağlayıcıları:</strong> Sunucu ve veritabanı barındırma hizmetleri</li>
    <li><strong>E-posta ve SMS sağlayıcıları:</strong> Rezervasyon onayı ve iletişim için</li>
    <li><strong>Muhasebe ve mali müşavirlik:</strong> Yasal vergi yükümlülükleri kapsamında</li>
    <li><strong>Sigorta şirketleri:</strong> Kaza/yaralanma durumlarında talep değerlendirmesi</li>
  </ul>

  <h3>5.2 Yetkili Kamu Kurumları:</h3>
  <ul>
    <li>Gelir İdaresi Başkanlığı (vergi mevzuatı kapsamında)</li>
    <li>Adli/idari makamlar (yasal talep durumunda)</li>
    <li>Kişisel Verileri Koruma Kurumu (KVKK denetimleri kapsamında)</li>
  </ul>

  <p><strong>Kişisel verilerinizi pazarlama amacıyla üçüncü taraflara satmayız.</strong></p>

  <h2>6. Yurt Dışı Veri Aktarımı (KVKK m.9)</h2>
  <p>Bazı bulut hizmet sağlayıcılarımız (örneğin e-posta servisleri, analitik altyapı) yurt dışında bulunabilir. KVKK m.9 uyarınca yurt dışı aktarımlar için:</p>
  <ul>
    <li>Yeterli korumanın bulunduğu ülkelere aktarım yapılır, veya</li>
    <li>Standart sözleşmeli yükümlülükler ve taahhütnameler ile koruma sağlanır, veya</li>
    <li>Gerekli durumlarda açık rızanız alınır.</li>
  </ul>

  <h2>7. Kişisel Verilerin Saklama Süreleri</h2>
  <table style="width:100%; border-collapse: collapse; margin: 10px 0;">
    <tr style="background:#f0f9ff;"><th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Veri Kategorisi</th><th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Saklama Süresi</th></tr>
    <tr><td style="border:1px solid #cbd5e1; padding:8px;">Hesap bilgileri</td><td style="border:1px solid #cbd5e1; padding:8px;">Hesap kapatılana + 2 yıl</td></tr>
    <tr><td style="border:1px solid #cbd5e1; padding:8px;">Fatura, ödeme ve rezervasyon kayıtları</td><td style="border:1px solid #cbd5e1; padding:8px;">10 yıl (VUK)</td></tr>
    <tr><td style="border:1px solid #cbd5e1; padding:8px;">Sorumluluk feragatnameleri</td><td style="border:1px solid #cbd5e1; padding:8px;">10 yıl (zamanaşımı süresi)</td></tr>
    <tr><td style="border:1px solid #cbd5e1; padding:8px;">Pazarlama onayı</td><td style="border:1px solid #cbd5e1; padding:8px;">Onay geri alınana veya 3 yıl pasiflik</td></tr>
    <tr><td style="border:1px solid #cbd5e1; padding:8px;">CCTV kayıtları</td><td style="border:1px solid #cbd5e1; padding:8px;">30 gün</td></tr>
    <tr><td style="border:1px solid #cbd5e1; padding:8px;">Sunucu logları</td><td style="border:1px solid #cbd5e1; padding:8px;">12 ay</td></tr>
  </table>

  <h2>8. KVKK Madde 11 Kapsamındaki Haklarınız</h2>

  <p>KVKK m.11 uyarınca, veri sorumlusuna başvurarak aşağıdaki haklarınızı kullanabilirsiniz:</p>

  <ol>
    <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
    <li>Kişisel verileriniz işlenmişse buna ilişkin bilgi talep etme</li>
    <li>Kişisel verilerinizin işlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme</li>
    <li>Yurt içinde veya yurt dışında kişisel verilerinizin aktarıldığı üçüncü kişileri bilme</li>
    <li>Kişisel verilerinizin eksik veya yanlış işlenmiş olması hâlinde bunların düzeltilmesini isteme</li>
    <li>KVKK m.7'de öngörülen şartlar çerçevesinde kişisel verilerinizin silinmesini veya yok edilmesini isteme</li>
    <li>5 ve 6 numaralı haklar uyarınca yapılan işlemlerin, kişisel verilerinizin aktarıldığı üçüncü kişilere bildirilmesini isteme</li>
    <li>İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle kişinin aleyhine bir sonucun ortaya çıkmasına itiraz etme</li>
    <li>Kişisel verilerinizin kanuna aykırı olarak işlenmesi sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme</li>
  </ol>

  <h3>8.1 Başvuru Yöntemi</h3>
  <p>Yukarıdaki haklarınızı kullanmak için <strong>info@plannivo.com</strong> adresine, kimliğinizi doğrulayan belgelerle birlikte yazılı talepte bulunabilirsiniz. Başvurunuz en geç 30 gün içinde sonuçlandırılır ve sonuç tarafınıza yazılı veya elektronik olarak bildirilir.</p>

  <h3>8.2 Şikayet Hakkı</h3>
  <p>Başvurunuzun reddedilmesi, yetersiz bulunması veya süresinde cevap verilmemesi hâlinde Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz:<br>
    <strong>Web:</strong> <a href="https://www.kvkk.gov.tr" target="_blank" rel="noopener">www.kvkk.gov.tr</a></p>

  <h2>9. Veri Güvenliği Tedbirleri</h2>
  <p>Kişisel verilerinizi korumak için uygun teknik ve idari tedbirleri alıyoruz:</p>
  <ul>
    <li>SSL/TLS ile şifreli iletim (HTTPS)</li>
    <li>Veritabanı seviyesinde şifreleme ve erişim kontrolü</li>
    <li>Rol bazlı yetkilendirme (sadece görevi gerektiren personel erişebilir)</li>
    <li>İki faktörlü kimlik doğrulama (2FA) seçeneği</li>
    <li>Düzenli yedekleme ve felaket kurtarma planı</li>
    <li>Personel için gizlilik sözleşmeleri ve KVKK farkındalık eğitimi</li>
    <li>PCI-DSS uyumlu ödeme altyapısı (kart verileri bizde saklanmaz)</li>
    <li>Düzenli güvenlik denetimleri ve güncellemeler</li>
  </ul>

  <h2>10. Çerez Politikası</h2>
  <p>Web sitemiz aşağıdaki çerez türlerini kullanır:</p>
  <ul>
    <li><strong>Zorunlu çerezler:</strong> Oturum yönetimi, güvenlik (rıza gerekmez)</li>
    <li><strong>Tercih çerezleri:</strong> Dil seçimi, görüntüleme tercihleri</li>
    <li><strong>Analitik çerezler:</strong> Site kullanım istatistikleri (anonimleştirilmiş)</li>
    <li><strong>Pazarlama çerezleri:</strong> Yalnızca açık rızanız ile</li>
  </ul>
  <p>Çerez tercihlerinizi tarayıcı ayarlarından veya sitemiz üzerinden yönetebilirsiniz.</p>

  <h2>11. Reşit Olmayanlar</h2>
  <p>13 yaş altı çocuklardan bilerek kişisel veri toplamayız. 13-18 yaş arası katılımcılar için veli/vasi onayı zorunludur ve sorumluluk feragatnamesi ebeveyn tarafından imzalanmalıdır.</p>

  <h2>12. Politika Güncellemeleri</h2>
  <p>Bu politika, hizmet ve mevzuat değişikliklerine bağlı olarak güncellenebilir. Önemli değişiklikler e-posta veya site bildirimi ile duyurulur. Güncellemeleri takip etmek için bu sayfayı düzenli olarak ziyaret etmenizi öneririz.</p>

  <h2>13. İletişim</h2>
  <p>
    Kişisel verilerinize ilişkin her türlü soru, talep ve şikayetiniz için:<br>
    <strong>E-posta:</strong> info@plannivo.com<br>
    <strong>Veri Koruma Sorumlusu:</strong> dpo@plannivo.com
  </p>

  <hr>

  <h1>Privacy Policy (English Summary)</h1>
  <p><strong>Effective Date:</strong> May 18, 2026</p>

  <h3>Data Controller</h3>
  <p>UKC. Duotone Pro Center, Urla / İzmir, Turkey. Contact: info@plannivo.com</p>

  <h3>What we collect</h3>
  <p>Identity, contact, emergency contact, payment, optional health information (with consent), liability waiver, booking history, and optional photo/video content (with consent). Plus IP, browser, and cookies for site operation.</p>

  <h3>Why we process it</h3>
  <ul>
    <li><strong>Contract:</strong> Bookings, lessons, equipment rental, payments, account.</li>
    <li><strong>Legal obligation:</strong> Tax records, liability documentation, safety logs (10 years).</li>
    <li><strong>Legitimate interest:</strong> Service quality, fraud prevention, premises security (CCTV, 30 days).</li>
    <li><strong>Explicit consent:</strong> Marketing communications, social media content, special-category health data.</li>
  </ul>

  <h3>Sharing</h3>
  <p>Payment processors, cloud hosts, email/SMS providers, accounting firms, insurers, and authorities when legally required. <strong>We do not sell personal data.</strong></p>

  <h3>International transfers</h3>
  <p>Some providers operate outside Turkey. Transfers comply with KVKK Article 9 via adequacy decisions, standard contractual clauses, or explicit consent.</p>

  <h3>Your rights (KVKK Article 11 / GDPR equivalents)</h3>
  <p>Access, rectification, erasure, restriction, portability, objection, and complaint. Contact info@plannivo.com to exercise these rights — we respond within 30 days. You may also complain to the Turkish Personal Data Protection Authority at <a href="https://www.kvkk.gov.tr" target="_blank" rel="noopener">www.kvkk.gov.tr</a>.</p>

  <h3>Security</h3>
  <p>TLS, encrypted storage, role-based access, optional 2FA, PCI-DSS payment provider, employee NDAs, regular audits.</p>

  <h3>Children</h3>
  <p>No data collection from children under 13. Ages 13-18 require parental consent and waiver signature.</p>

  <h3>Contact</h3>
  <p>info@plannivo.com · dpo@plannivo.com</p>
</div>
$HTML$,
  true,
  NOW(),
  NOW()
);

-- ── Terms of Service / Hizmet Koşulları ─────────────────────────────────────
INSERT INTO legal_documents (document_type, version, content, is_active, created_at, updated_at)
VALUES (
  'terms',
  '2026-05-18',
  $HTML$
<div class="legal-document">
  <h1>Hizmet Koşulları</h1>
  <p><strong>Yürürlük Tarihi:</strong> 18 Mayıs 2026</p>

  <h2>1. Taraflar ve Tanımlar</h2>
  <p>Bu Hizmet Koşulları ("Koşullar"), UKC. Duotone Pro Center ("Merkez", "biz") ile hizmetlerimizden faydalanan müşterilerimiz ("Müşteri", "siz") arasındaki ilişkiyi düzenler. Rezervasyon yaparak, hesap oluşturarak veya hizmetlerimizi kullanarak bu Koşulları kabul etmiş sayılırsınız.</p>

  <h2>2. Hizmetlerimiz</h2>
  <p>Merkez aşağıdaki hizmetleri sunmaktadır:</p>
  <ul>
    <li>Kitesurf, wing foil, foil, e-foil ve windsurf dersleri (başlangıç → ileri seviye)</li>
    <li>Ekipman kiralama (kite, board, wetsuit, harness, kask, can yeleği)</li>
    <li>Plaj tesisleri, depo ve duş/değişim alanı kullanımı</li>
    <li>Online rezervasyon ve ödeme platformu</li>
    <li>Hava ve su koşulları takibi, kamp ve etkinlikler</li>
    <li>Pro shop / ekipman satışı</li>
    <li>Konaklama hizmetleri (varsa)</li>
  </ul>

  <h2>3. Hesap Oluşturma</h2>
  <p><strong>3.1 Yaş Şartı:</strong> Hesap oluşturmak için 18 yaşını doldurmuş olmanız gerekir. 13-18 yaş arası kursiyerler veli/vasi onayı ile katılabilir.</p>
  <p><strong>3.2 Bilgi Doğruluğu:</strong> Doğru ve güncel bilgi vermeyi ve hesap şifrenizi gizli tutmayı kabul edersiniz.</p>
  <p><strong>3.3 Hesap Sorumluluğu:</strong> Hesabınız altında gerçekleşen tüm işlemlerden siz sorumlusunuz.</p>

  <h2>4. Rezervasyon ve Ödeme</h2>
  <p><strong>4.1 Rezervasyon Onayı:</strong> Rezervasyon, tam ödeme alınmasıyla kesinleşir. E-posta ile onay alırsınız.</p>
  <p><strong>4.2 Fiyatlar:</strong> Aksi belirtilmedikçe Türk Lirası (TRY) cinsindendir ve KDV dahildir.</p>
  <p><strong>4.3 Ödeme Yöntemleri:</strong> Kredi/banka kartı (Iyzico altyapısı), havale/EFT, nakit (yerinde).</p>

  <h2>5. İptal ve İade Politikası</h2>
  <ul>
    <li><strong>Ders başlangıcına 48 saatten fazla varken:</strong> %100 iade veya ücretsiz tarih değişikliği</li>
    <li><strong>24-48 saat kala:</strong> %50 iade veya tarih değişikliği</li>
    <li><strong>24 saatten az kala:</strong> İade yapılmaz; tarih değişikliği uygunluğa göre değerlendirilir</li>
    <li><strong>Hava koşulları nedeniyle Merkez kaynaklı iptal:</strong> %100 iade veya tarih değişikliği</li>
    <li><strong>Müşterinin gelmemesi (no-show):</strong> İade yapılmaz</li>
  </ul>
  <p>Tıbbi mazeret durumlarında doktor raporu ibraz ederek tarih değişikliği talep edilebilir.</p>

  <h2>6. Güvenlik Şartları</h2>
  <p><strong>6.1 Sorumluluk Feragatnamesi:</strong> Tüm katılımcılar, ilk dersten önce Merkez'de fiziki olarak sorumluluk feragatnamesini imzalamak zorundadır. Bu zorunluluk güvenlik ve hukuki nedenlerden ötürü taviz verilmez.</p>
  <p><strong>6.2 Sağlık Beyanı:</strong> Güvenli katılımınızı etkileyebilecek tıbbi durumları (kalp rahatsızlığı, epilepsi, hamilelik, son cerrahi operasyon, kullanılan ilaçlar vb.) önceden bildirmeniz zorunludur.</p>
  <p><strong>6.3 Yüzme Yeterliliği:</strong> Tüm katılımcılar temel yüzme becerisine sahip olmalıdır.</p>
  <p><strong>6.4 Güvenlik Ekipmanı:</strong> Eğitmen tarafından sağlanan kask, can yeleği, harness gibi güvenlik ekipmanlarını kullanmayı kabul edersiniz.</p>
  <p><strong>6.5 Eğitmen Otoritesi:</strong> Eğitmen ve Merkez personelinin güvenlik talimatlarına uymak zorundasınız. Uyumsuzluk durumunda hizmet, iade yapılmaksızın sonlandırılabilir.</p>
  <p><strong>6.6 Hava Koşulları:</strong> Eğitmen ve Merkez, hava ve deniz koşullarının riskli olduğu durumlarda dersi iptal etme veya erteleme hakkını saklı tutar — güvenliğiniz önceliğimizdir.</p>

  <h2>7. Ekipman Kiralama</h2>
  <p><strong>7.1 Durum Kontrolü:</strong> Ekipman teslim alınırken birlikte kontrol edilir. Görünür hasar varsa hemen bildirilmelidir.</p>
  <p><strong>7.2 Hasar ve Kayıp Sorumluluğu:</strong> Kullanım hatası, ihmal veya kasıt nedeniyle oluşan hasar/kayıptan kiracı sorumludur. Replasman bedeli güncel piyasa fiyatı üzerinden tahsil edilir. Normal aşınma kapsam dışıdır.</p>
  <p><strong>7.3 İade:</strong> Ekipman temiz ve hasarsız olarak belirtilen sürede iade edilmelidir. Geç iade ek ücrete tabidir.</p>
  <p><strong>7.4 Depozito:</strong> Bazı premium ekipmanlar için depozito talep edilebilir; sorunsuz iade sonrası iade edilir.</p>

  <h2>8. Davranış Kuralları</h2>
  <p>Aşağıdaki kurallara uymayı kabul edersiniz:</p>
  <ul>
    <li>Personel, eğitmen ve diğer katılımcılara saygılı davranmak</li>
    <li>Tehlikeli, pervasız veya başkalarını riske atan davranışlardan kaçınmak</li>
    <li>Alkol veya uyuşturucu madde etkisi altında hizmet almamak</li>
    <li>Çevreyi korumak (atık bırakmamak, deniz canlılarına zarar vermemek)</li>
    <li>Türkiye Cumhuriyeti yasalarına ve yerel düzenlemelere uymak</li>
    <li>Diğer müşterilerin kişisel alanına ve mahremiyetine saygı göstermek</li>
  </ul>
  <p>Bu kurallara uyulmaması hâlinde, iade yapılmaksızın hizmet sonlandırılabilir.</p>

  <h2>9. Fotoğraf ve Video</h2>
  <p>Merkez içinde diğer kişilerin onayı olmadan fotoğraf/video çekilmemesi gerekir. Merkez tarafından çekilen tanıtım amaçlı görüntülerde yer almak istemiyorsanız, ders öncesi eğitmene bildirmeniz yeterlidir.</p>

  <h2>10. Fikri Mülkiyet</h2>
  <p>Web sitesi, mobil uygulama, eğitim materyalleri, logolar ve içerikler dahil tüm fikri mülkiyet hakları UKC. Duotone Pro Center'a aittir. Yazılı izin olmaksızın kullanılamaz.</p>

  <h2>11. Sorumluluk Sınırlandırması</h2>
  <p>Türk hukukunun izin verdiği azami ölçüde, Merkez aşağıdakilerden sorumlu tutulamaz:</p>
  <ul>
    <li>Sorumluluk feragatnamesi kapsamında imza altına alınan riskler</li>
    <li>Kişisel eşyaların kaybı, hasarı veya çalınması (Merkez kasası kullanılmadığı sürece)</li>
    <li>Doğal afet, kötü hava koşulları, force majeure (mücbir sebep)</li>
    <li>Hizmet kesintileri veya teknik aksaklıklar</li>
    <li>Üçüncü taraf hizmet sağlayıcılarından kaynaklanan sorunlar (ödeme sistemleri, e-posta vb.)</li>
  </ul>
  <p>Bu sınırlandırma, kasıt veya ağır ihmali kapsamaz ve tüketici haklarınız saklıdır.</p>

  <h2>12. Tazminat</h2>
  <p>Bu Koşulları ihlal etmeniz veya hizmetlerimizi yasalara aykırı kullanmanız nedeniyle Merkez'in maruz kaldığı her türlü zarar, dava ve gideri tazmin etmeyi kabul edersiniz.</p>

  <h2>13. Uygulanacak Hukuk ve Yetkili Mahkeme</h2>
  <p>Bu Koşullar Türkiye Cumhuriyeti yasalarına tabidir. Doğacak uyuşmazlıklarda <strong>İzmir Mahkemeleri ve İcra Daireleri</strong> yetkilidir. Tüketici uyuşmazlıkları için ilgili Tüketici Hakem Heyeti'ne başvuru hakkınız saklıdır.</p>

  <h2>14. Değişiklikler</h2>
  <p>Bu Koşulları zaman zaman güncelleyebiliriz. Önemli değişiklikler en az 14 gün önceden e-posta veya site duyurusu ile bildirilir. Güncel sürüm her zaman web sitemizde yayınlanır.</p>

  <h2>15. İletişim</h2>
  <p>
    <strong>UKC. Duotone Pro Center</strong><br>
    E-posta: info@plannivo.com<br>
    Web: <a href="https://plannivo.com" target="_blank" rel="noopener">plannivo.com</a>
  </p>

  <hr>

  <h1>Terms of Service (English Summary)</h1>
  <p><strong>Effective Date:</strong> May 18, 2026</p>

  <h3>Services</h3>
  <p>Kitesurf, wing foil, foil, e-foil and windsurf lessons; equipment rental; beach facilities; online booking; pro shop; optional accommodation.</p>

  <h3>Account</h3>
  <p>Must be 18+ to create an account. Ages 13-18 require parental consent. You're responsible for keeping your password safe.</p>

  <h3>Bookings & Payment</h3>
  <p>Bookings confirmed on full payment. Prices in TRY, VAT included. Payment via card (Iyzico), bank transfer, or cash on site.</p>

  <h3>Cancellation</h3>
  <ul>
    <li>>48h before: 100% refund or free reschedule</li>
    <li>24-48h before: 50% refund or reschedule</li>
    <li>&lt;24h: No refund; reschedule subject to availability</li>
    <li>Weather cancellation by center: 100% refund or reschedule</li>
    <li>No-show: No refund</li>
  </ul>

  <h3>Safety</h3>
  <p>In-person liability waiver mandatory before first lesson. Disclose health conditions. Basic swimming ability required. Safety gear must be worn. Follow instructor and center staff instructions. Center may cancel/postpone for unsafe weather.</p>

  <h3>Equipment Rental</h3>
  <p>Renter liable for damage/loss from misuse, negligence, or willful damage at replacement cost. Normal wear excluded. Return clean, undamaged, on time.</p>

  <h3>Code of Conduct</h3>
  <p>Be respectful, no reckless behavior, no service under influence of alcohol/drugs, respect environment, comply with Turkish law.</p>

  <h3>Liability</h3>
  <p>Center not liable for waivered risks, personal property loss, force majeure, third-party service issues. Does not cover willful misconduct or gross negligence; consumer rights preserved.</p>

  <h3>Governing Law</h3>
  <p>Turkish law. Disputes: İzmir courts. Consumer arbitration board rights preserved.</p>

  <h3>Contact</h3>
  <p>info@plannivo.com · plannivo.com</p>
</div>
$HTML$,
  true,
  NOW(),
  NOW()
);

-- ── Marketing Communication Preferences ─────────────────────────────────────
INSERT INTO legal_documents (document_type, version, content, is_active, created_at, updated_at)
VALUES (
  'marketing',
  '2026-05-18',
  $HTML$
<div class="legal-document">
  <h2>Pazarlama İletişim Tercihleri</h2>

  <p>UKC. Duotone Pro Center olarak; yeni dersler, etkinlikler, kamp duyuruları, hava koşulu güncellemeleri ve özel kampanyalar hakkında sizi haberdar etmek istiyoruz. Aşağıdaki kanallar ve içerikler için tercihinizi belirleyebilirsiniz — her zaman dilediğiniz an profil ayarlarınızdan değiştirebilirsiniz.</p>

  <h3>📧 E-posta İletişimi</h3>
  <ul>
    <li>Yeni ders dönemleri ve kamp duyuruları</li>
    <li>Mevsimsel kampanyalar ve erken rezervasyon indirimleri</li>
    <li>Rüzgar ve hava koşulu tahminleri (haftalık)</li>
    <li>Topluluk haberleri ve yarışma duyuruları</li>
    <li>Pro shop ürün lansmanları</li>
    <li>Eğitim ipuçları ve teknik makaleler</li>
  </ul>

  <h3>📱 SMS İletişimi</h3>
  <ul>
    <li>Son dakika ders/kiralama fırsatları</li>
    <li>Acil hava durumu değişiklikleri ve iptal duyuruları</li>
    <li>Zaman duyarlı kampanyalar (örn. flash sale)</li>
    <li>Güvenlik uyarıları</li>
  </ul>

  <h3>💬 WhatsApp</h3>
  <ul>
    <li>Concierge tarzı kişiselleştirilmiş müşteri desteği</li>
    <li>Hızlı rezervasyon ve danışmanlık</li>
    <li>Ziyaret sürenizde gerçek zamanlı güncellemeler</li>
    <li>Konaklama ve seyahat önerileri</li>
    <li>Topluluk grupları ve etkinlik davetleri</li>
  </ul>

  <h3>✅ Kontrolünüz Tamamen Sizde</h3>
  <ul>
    <li>Her kanal için ayrı onay/iptal seçeneği</li>
    <li>Tercihlerinizi profil sayfanızdan istediğiniz an güncelleyebilirsiniz</li>
    <li>E-postaları tek tıkla iptal edebilirsiniz</li>
    <li>SMS için "DUR" yazıp 4046 numarasına göndererek listeden çıkabilirsiniz</li>
    <li>WhatsApp üzerinden istediğiniz an "Bildirimleri durdur" yazabilirsiniz</li>
  </ul>

  <h3>📌 Önemli Bilgiler</h3>
  <p><strong>İşlemsel mesajlar:</strong> Pazarlama onayınızı geri çekseniz bile, rezervasyon onayları, ödeme makbuzları, güvenlik uyarıları ve hesap bildirimleri gibi hizmetin sağlanması için zorunlu mesajlar tarafınıza iletilmeye devam eder.</p>

  <p><strong>Sıklık:</strong> E-posta bültenlerini ayda 2-4 kez gönderiyoruz; SMS yalnızca acil veya zaman duyarlı durumlar için kullanılır.</p>

  <p><strong>Veri Koruması:</strong> İletişim bilgileriniz yalnızca onayladığınız kanallar için kullanılır. Verilerinizi pazarlama amacıyla üçüncü taraflara aktarmayız.</p>

  <h3>📜 KVKK Uyumu</h3>
  <p>6698 sayılı KVKK kapsamında, iletişim verileriniz pazarlama amacıyla yalnızca açık rızanız ile işlenir. Onayınızı dilediğiniz an, hizmet kullanım hakkınızı etkilemeksizin geri çekebilirsiniz.</p>

  <p>Tercihlerinizi güncellemek veya rızanızı geri çekmek için: <strong>info@plannivo.com</strong></p>

  <hr>

  <h3>Marketing Communication Preferences (English)</h3>
  <p>Opt in or out independently for email, SMS, and WhatsApp. Change preferences anytime from your profile. Unsubscribe link in every email; reply STOP to opt out of SMS. Transactional messages (booking confirmations, safety alerts) continue regardless of marketing preferences. We never sell your contact info. Under KVKK, marketing consent can be withdrawn anytime without affecting your service access. Contact: info@plannivo.com</p>
</div>
$HTML$,
  true,
  NOW(),
  NOW()
);
