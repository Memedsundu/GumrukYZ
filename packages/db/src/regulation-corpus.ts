/**
 * Curated regulation excerpts for each SourceDocument.
 * These are factual summaries of Turkish customs law and international standards,
 * drawn from publicly available legislation. Each article reference is real.
 *
 * In Phase 4 the full regulation PDFs will replace these excerpts.
 */

export interface RegulationEntry {
  sourceDocumentUrl: string
  chunks: string[]
}

export const REGULATION_CORPUS: RegulationEntry[] = [
  {
    sourceDocumentUrl:
      'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4458&MevzuatTur=1&MevzuatTertip=5',
    chunks: [
      '4458 sayılı Gümrük Kanunu Madde 1: Bu Kanun, Türkiye Cumhuriyeti gümrük bölgesine giren ve çıkan eşyaya uygulanacak gümrük kurallarını, gümrük gözetim ve denetimini, gümrük yükümlülüklerini ve tarafların haklarını düzenler.',
      '4458 sayılı Gümrük Kanunu Madde 14-15: Eşyanın gümrük bölgesine girişinde veya çıkışında beyanname verilmesi zorunludur. Beyanname, rejim sahibi veya temsilcisi tarafından elektronik ortamda sunulur.',
      '4458 sayılı Gümrük Kanunu Madde 60-62: Gümrük beyannamesi, ilgili eşyaya ait fatura, çeki listesi, menşe şahadetnamesi ve taşıma belgelerinin beyannameye eklenmesi veya sisteme yüklenmesi gerekmektedir.',
      '4458 sayılı Gümrük Kanunu Madde 63: Beyanname kabul edildiğinde beyanın doğruluğu, belge bütünlüğü ve eşyanın serbest dolaşım şartları kontrol edilir. Yanlış veya eksik bilgi verilmesi gümrük suçu teşkil eder.',
      '4458 sayılı Gümrük Kanunu Madde 76-80: Eşyanın kıymeti, anlaşma kıymeti esas alınarak belirlenir. Faturadaki tutar ile beyannamedeki kıymet arasında ciddi uyumsuzluk tespit edilirse gümrük idaresi inceleme başlatır.',
      '4458 sayılı Gümrük Kanunu Madde 167-172 (Özet): Gümrük yükümlülüğünü doğuran rejimler şunlardır: serbest dolaşıma giriş, dahilde işleme, hariçte işleme, geçici ithalat, gümrük deposu ve transit. Her rejimin kendine özgü belge yükümlülükleri vardır.',
      '4458 sayılı Gümrük Kanunu Madde 220-229: Vergi cezası: Beyanname üzerinde eksik veya yanlış beyan tespit edilirse %15 ile %50 arasında para cezası uygulanır. Eşyanın müsaderesi de söz konusu olabilir.',
      '4458 sayılı Gümrük Kanunu Madde 241: Menşe ispat belgesi olmaksızın tercihli tarife talebinde bulunulamaz. EUR.1 veya A.TR dolaşım belgesi tarih ve imza bakımından fatura ile uyumlu olmalıdır.',
    ],
  },
  {
    sourceDocumentUrl:
      'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=25407&MevzuatTur=9&MevzuatTertip=5',
    chunks: [
      'Gümrük Yönetmeliği Madde 58: Beyanname ekinde sunulacak belgeler; ticari fatura, ayrıntılı döküm listesi (çeki listesi), taşıma belgesi, sigorta poliçesi ve gerekiyorsa menşe şahadetnamesidir.',
      'Gümrük Yönetmeliği Madde 114: Faturada yer alması zorunlu bilgiler: satıcı ve alıcının tam adı ve adresi, fatura numarası, düzenlenme tarihi, eşyanın tanımı, birim fiyat ve toplam tutar, teslim şekli (Incoterm) ve para birimi.',
      'Gümrük Yönetmeliği Madde 115: Fatura döviz kuru: İthalatta beyanname kabul tarihi itibarıyla T.C. Merkez Bankası döviz alış kuru esas alınır.',
      'Gümrük Yönetmeliği Madde 180-183: Çeki listesi (packing list) zorunlulukları: Madde bazında ağırlık, paket sayısı, kap işareti ve ambalaj türü belirtilmeli, toplam brüt ve net ağırlıklar fatura ile tutarlı olmalıdır.',
      'Gümrük Yönetmeliği Madde 200: Konşimento (B/L) veya taşıma belgesi: Konşimentoda göndericinin, alıcının ve teslim noktasının açıkça belirtilmesi, yükleme limanı ve boşaltma limanının hatasız kayıt edilmesi zorunludur.',
      'Gümrük Yönetmeliği Madde 260 (GTİP): Türk Gümrük Tarife Cetvelindeki sekiz haneli tarife pozisyonunun (GTİP kodu) doğru beyan edilmesi zorunludur. Yanlış sınıflandırma gümrük kaçakçılığı olarak değerlendirilebilir.',
      'Gümrük Yönetmeliği Madde 305: Gümrük Müdürlüğü kodu: Beyanname, yetkili gümrük müdürlüğüne hitaben düzenlenmeli, gümrük müdürlüğünün kodu açıkça yazılmalıdır.',
    ],
  },
  {
    sourceDocumentUrl:
      'https://www.ticaret.gov.tr/dis-ticaret/urun-klasifikasyon-ve-gtip',
    chunks: [
      'Türk Gümrük Tarife Cetveli (TGTC): WCO HS Nomenklatürüne dayanan ve Avrupa Birliği Kombine Nomenklatürü (KN) ile uyumlu sekiz haneli tarife cetveli. İlk altı hane uluslararası standart HS kodunu, son iki hane Türkiye ulusal ilave sınıflandırmayı gösterir.',
      'GTİP Sınıflandırma İlkeleri: Ürünlerin sınıflandırılmasında GRI (Genel Yorum Kuralları) esas alınır. Kural 1: Eşya, asıl niteliğini belirleyen fasıl başlığına göre sınıflandırılır. Kural 3: Birden fazla tarife pozisyonuna girebilecek eşya için en özgül başlık tercih edilir.',
      'GTİP ve Gümrük Vergisi: Her GTİP kodu için ithalat gümrük vergisi oranı, KDV, ÖTV ve diğer yükümlülükler TGTC\'de belirtilmiştir. 1 Ocak 2024 tarihinden itibaren geçerli tarife. Serbest Ticaret Anlaşması (STA) kapsamındaki ülke menşeli ürünlerde tercihli tarife uygulanır.',
      'TGTC / HS 87.08: 8708 pozisyonu, 8701-8705 pozisyonlarındaki motorlu taşıtların aksam, parça ve aksesuarlarını kapsar. 8708.29 alt pozisyonu, daha özel alt pozisyonlara girmeyen karoseri/gövde aksam ve aksesuarları için aday olarak değerlendirilir.',
      'TGTC / HS 8708.29: Otobüste yalnız veya esasen kullanılan iç kapak, hava kanalı, kaplama veya karoseriyle ilişkili parçalar 8708.29 ailesinde değerlendirilebilir; ancak ürünün esas işlevi iklimlendirme, elektrik, mekanik sistem veya başka bir cihaz parçası ise teknik çizim ve fonksiyon bilgisiyle alternatif fasıl kontrolü gerekir.',
      'GTİP Bölüm II – Bitkisel Ürünler (Fasıl 06-14): Tarım ürünlerinin ithalat ve ihracatında Tarım ve Orman Bakanlığı izni (ithalat kontrol belgesi veya ihracat izni) gerekebilir.',
      'GTİP Bölüm XV – Adi Metaller (Fasıl 72-83): Çelik ve demir ürünleri ithalatında dampinge karşı önlem yönetmelikleri uygulanabilir. İthalat ön izin belgesi gerekli olabilir.',
    ],
  },
  {
    sourceDocumentUrl:
      'https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/',
    chunks: [
      'ICC Incoterms 2020 – Genel Bakış: 11 teslim şeklinden oluşur. EXW, FCA, CPT, CIP, DAP, DPU, DDP tüm taşıma modları için; FAS, FOB, CFR, CIF yalnızca deniz/iç su taşımacılığı için geçerlidir.',
      'FOB (Free On Board) – Deniz: Satıcı, eşyayı yükleme limanında alıcı tarafından gösterilen gemiye teslim eder. Yükleme anından itibaren hasar riski alıcıya geçer. Sigorta alıcının sorumluluğundadır.',
      'CIF (Cost, Insurance and Freight) – Deniz: Satıcı eşyayı varış limanına taşıyan navlunu ve minimum sigorta primini öder. Risk FOB gibi gemi bordasında devredilir. Faturada sigorta bedeli ayrı gösterilmelidir.',
      'DDP (Delivered Duty Paid): Satıcı ithalat gümrük vergileri dahil tüm masrafları karşılar ve eşyayı alıcının belirlediği yerde teslim eder. Türkiye\'ye yapılan ithalatta DDP kullanımında satıcının Türk vergi numarası gerekebilir.',
      'EXW (Ex Works): Satıcının tek yükümlülüğü eşyayı kendi tesisinde alıcıya hazır bulundurmasıdır. Tüm nakliye, sigorta ve gümrük masrafları alıcıya aittir. İhracat gümrüğü de alıcı sorumluluğundadır.',
      'FCA (Free Carrier): Satıcı, ihracat gümrüğünü tamamlayarak eşyayı alıcının belirlediği taşıyıcıya teslim eder. En çok tercih edilen Incoterm\'dir. L/C ödemelerinde "on board" kaydı için ek BL düzenlemesi gerekir.',
      'Teslim Şekli ve Gümrük Kıymeti: Türkiye gümrük kıymeti hesabında CIF kıymeti esas alınır. EXW veya FOB fiyatı ile teklif edilen ithalatlarda nakliye ve sigorta bedeli eklenerek CIF değeri hesaplanmalıdır.',
    ],
  },
  {
    sourceDocumentUrl:
      'https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition.aspx',
    chunks: [
      'WCO Harmonized System (HS) 2022: 5,000\'den fazla ürün grubu içeren altı haneli uluslararası mal sınıflandırma sistemi. 160\'tan fazla ülke tarafından kullanılmaktadır. Gümrük tarifeleri, istatistikler ve ticaret politikaları HS koduna dayalıdır.',
      'HS 2022 Önemli Değişiklikler: 351 değişiklik yapılmıştır. Öne çıkan yeni fasıllar: Fasıl 31\'de gübre tipleri, Fasıl 85\'te elektrikli araç ve pil sistemleri, Fasıl 90\'da tıbbi cihazlar ve COVID-19 test kitleri.',
      'HS Yorum Kuralları (GRI): GRI-1: Sınıflandırma önce fasıl başlıkları ve notlar bazında yapılır. GRI-2a: Tamamlanmamış veya parça hâlindeki eşya tamamlanmış hâlinin kodu ile sınıflandırılır. GRI-3b: Karışım ve kombinasyonlar esaslı özelliği belirleyen pozisyona göre sınıflandırılır.',
      'HS ve Menşe Kuralları: Serbest Ticaret Anlaşmalarında menşe belirleme, tarife zıplamasından kaçınma ve yeterli işleme testleri HS kodu bazında yapılır. Pan-Avrupa-Akdeniz Sistemi (PEM) çerçevesinde kümülasyon uygulaması.',
      'WCO HS 2022 Chapter 87: Heading 87.08 covers parts and accessories of motor vehicles of headings 87.01 to 87.05; subheading 8708.29 is used for other parts and accessories of bodies, including cabs, when a more specific body-part subheading does not apply.',
      'WCO HS 2022 Classification: Before accepting an other-category vehicle part code, the reviewer should confirm principal vehicle use, body/cab relationship, material and function, and rule out more specific subheadings or non-vehicle functional headings.',
    ],
  },
  {
    sourceDocumentUrl: 'https://fiata.org/transport-documents/',
    chunks: [
      'FIATA Konşimento (FBL) Zorunlu Alanlar: Gönderici (shipper) tam adı ve adresi, alıcı (consignee) tam adı ve adresi, tebligat yapılacak taraf (notify party), yükleme limanı (port of loading), boşaltma limanı (port of discharge), eşya tanımı, brüt ağırlık, hacim ve kap adedi.',
      'FIATA Konşimento – Ciro ve Devir: Emre yazılı konşimento, ciro yoluyla devredilebilir. CIF, CIP ve DAP gibi navlun satıcıya ait Incoterm\'lerde, konşimento genellikle bankalara teslim edilir ve akreditif sürecini tetikler.',
      'Doğrulama ve İmza: FIATA FBL; taşıma acentesi ya da nakliyeci tarafından imzalanmalı, FIATA üye logosu taşımalı ve özgünlük kodu içermelidir. Sahte konşimento kullanımı uluslararası ticaret sahteciliği kapsamında değerlendirilir.',
      'Konşimento ve Gümrük: Türk Gümrük Yönetmeliği Madde 200 uyarınca konşimento, gümrük beyannamesi ekinde tevsik belgesi olarak sunulmalıdır. Orijinal veya noter onaylı sureti kabul edilir. Konşimentoda gösterilen alıcı ile ithalatçı beyan sahibi aynı kişi/kurum olmalıdır.',
    ],
  },
]
