export type RuleDisplayMetadata = {
  category: string
  turkishTitle: string
  operationalExplanation: string
  recommendedAction: string
  blocking: boolean
}

const DEFAULT_METADATA: RuleDisplayMetadata = {
  category: 'Genel kontrol',
  turkishTitle: 'Gümrük kontrolü',
  operationalExplanation: 'Belge veya beyan verisi otomatik kontrol edildi.',
  recommendedAction: 'Kaynak alanları kontrol edin; gerekiyorsa belgeyi düzeltip analizi tekrar çalıştırın.',
  blocking: false,
}

// Exported for the rule parity check (scripts/check-rule-parity.ts).
export const RULE_METADATA: Record<string, RuleDisplayMetadata> = {
  'QUAL-001': {
    category: 'Belge kalitesi',
    turkishTitle: 'Boş çıkarma',
    operationalExplanation: 'Yüklenen belgeden veri çıkarılamadı (tüm alanlar boş geldi).',
    recommendedAction: 'Daha yüksek çözünürlüklü/seçilebilir metin içeren bir PDF yükleyin veya farklı formatta deneyin.',
    blocking: false,
  },
  'QUAL-002': {
    category: 'Belge kalitesi',
    turkishTitle: 'Belge türü/dosya adı uyumsuz',
    operationalExplanation: 'Belge yüklenen türe ait alanları içermiyor veya dosya adı farklı bir belge türü izlenimi veriyor.',
    recommendedAction: 'Belge türünü, dosya adını ve çıkarılan alanları doğrulayın; gerekirse doğru belgeyle tekrar yükleyin.',
    blocking: false,
  },
  'QUAL-003': {
    category: 'Belge kalitesi',
    turkishTitle: 'Yinelenen belge',
    operationalExplanation: 'Aynı iş numarasıyla (örn. fatura numarası) birden fazla belge yüklenmiş.',
    recommendedAction: 'Yinelenen yüklemeleri silin veya farklı belgeler olduklarını doğrulayın.',
    blocking: false,
  },
  'OCR-001': {
    category: 'Belge okuma',
    turkishTitle: 'Düşük okuma güveni',
    operationalExplanation: 'Belge kalitesi veya OCR sonucu otomatik kontroller için yeterince güvenilir olmayabilir.',
    recommendedAction: 'Belgenin okunabilir kopyasını yükleyin veya ilgili alanları manuel doğrulayın.',
    blocking: false,
  },
  'PRES-001': {
    category: 'Belge varlığı',
    turkishTitle: 'Fatura varlığı',
    operationalExplanation: 'Fatura, kıymet ve taraf bilgilerinin ana kaynağıdır.',
    recommendedAction: 'Dosyaya ilgili faturayı ekleyin veya belge türünü fatura olarak doğrulayın.',
    blocking: true,
  },
  'PRES-002': {
    category: 'Belge varlığı',
    turkishTitle: 'Çeki listesi varlığı',
    operationalExplanation: 'Çeki listesi kap, ağırlık ve paket bilgilerini doğrulamak için kullanılır.',
    recommendedAction: 'İthalat dosyasında çeki listesini ekleyin veya yoksa gerekçeyi not edin.',
    blocking: false,
  },
  'PRES-003': {
    category: 'Belge varlığı',
    turkishTitle: 'Taşıma belgesi varlığı',
    operationalExplanation: 'Taşıma belgesi rota, alıcı/gönderici ve teslim bilgilerini destekler.',
    recommendedAction: 'CMR, konşimento, AWB veya ilgili taşıma belgesini ekleyin.',
    blocking: false,
  },
  'PRES-004': {
    category: 'Menşe',
    turkishTitle: 'Tercihli menşe belgesi',
    operationalExplanation: 'Tercihli rejim iddiası varsa menşe/ATR/EUR.1 belgesi gerekir.',
    recommendedAction: 'Tercih iddiasını doğrulayın; gerekli menşe belgesini ekleyin.',
    blocking: false,
  },
  'PRES-005': {
    category: 'Beyanname',
    turkishTitle: 'Tek beyanname kontrolü',
    operationalExplanation: 'Aynı dosyada birden fazla beyanname çıktısı sonuçları karıştırabilir.',
    recommendedAction: 'Dosyaya ait doğru beyanname çıktısını bırakın, diğerini yoksayın.',
    blocking: false,
  },
  'INV-001': {
    category: 'Fatura',
    turkishTitle: 'Fatura numarası',
    operationalExplanation: 'Fatura numarası belge eşleştirme ve denetim izi için gereklidir.',
    recommendedAction: 'Fatura numarasını doğrulayın veya okunabilir faturayı tekrar yükleyin.',
    blocking: true,
  },
  'INV-002': {
    category: 'Fatura',
    turkishTitle: 'Fatura tarihi',
    operationalExplanation: 'Fatura tarihi beyan ve sevkiyat zamanlamasıyla tutarlı olmalıdır.',
    recommendedAction: 'Fatura tarihini kontrol edin; yanlış okunduysa belgeyi tekrar işleyin.',
    blocking: true,
  },
  'INV-003': {
    category: 'Taraflar',
    turkishTitle: 'Satıcı ve alıcı bilgisi',
    operationalExplanation: 'Taraf bilgileri müşteri eşleştirme ve yön kontrolü için kullanılır.',
    recommendedAction: 'Satıcı ve alıcı alanlarını belgeden doğrulayın.',
    blocking: true,
  },
  'INV-004': {
    category: 'Kıymet',
    turkishTitle: 'Fatura para birimi',
    operationalExplanation: 'Para birimi kıymet karşılaştırmalarının doğru yapılmasını sağlar.',
    recommendedAction: 'Para birimini ISO kodu olarak doğrulayın.',
    blocking: true,
  },
  'INV-005': {
    category: 'Kıymet',
    turkishTitle: 'Fatura toplam tutarı',
    operationalExplanation: 'Toplam tutar beyan kıymeti ve kalem toplamlarıyla karşılaştırılır.',
    recommendedAction: 'Toplam tutarı ve bedelsiz/proforma durumunu kontrol edin.',
    blocking: true,
  },
  'INV-006': {
    category: 'Teslim şekli',
    turkishTitle: 'Incoterm doğruluğu',
    operationalExplanation: 'Incoterm navlun/sigorta ve teslim sorumluluğunu etkileyebilir.',
    recommendedAction: 'Fatura üzerindeki teslim şeklini Incoterms 2020 koduyla doğrulayın.',
    blocking: false,
  },
  'PL-001': {
    category: 'Çeki listesi',
    turkishTitle: 'Kap sayısı',
    operationalExplanation: 'Kap sayısı çeki listesi satırları, beyanname ve taşıma bilgileriyle uyumlu olmalıdır.',
    recommendedAction: 'Toplam kap sayısını satır ambalaj adetleri, çeki listesi özeti ve beyannameyle karşılaştırın.',
    blocking: true,
  },
  'PL-002': {
    category: 'Çeki listesi',
    turkishTitle: 'Brüt ağırlık',
    operationalExplanation: 'Brüt/net ağırlık toplamları çeki listesi satırları ve toplam alanlarıyla tutarlı olmalıdır.',
    recommendedAction: 'Satır ağırlık toplamlarını çeki listesi toplam brüt/net ağırlık alanları ve beyannameyle doğrulayın.',
    blocking: false,
  },
  'GTIP-001': {
    category: 'GTİP',
    turkishTitle: 'GTİP formatı',
    operationalExplanation: 'GTİP/HS kodu sayısal ve beklenen uzunlukta olmalıdır.',
    recommendedAction: 'GTİP kodunu beyannamedeki resmi kodla karşılaştırın.',
    blocking: true,
  },
  'GTIP-002': {
    category: 'GTİP',
    turkishTitle: 'Eşya tanımı',
    operationalExplanation: 'Eşya tanımı GTİP yorumunun ana girdisidir.',
    recommendedAction: 'Beyanname kalem tanımını ve faturadaki açıklamayı doğrulayın.',
    blocking: true,
  },
  'GTIP-003': {
    category: 'GTİP',
    turkishTitle: 'GTİP belge tutarlılığı',
    operationalExplanation: 'Fatura ve beyanname GTİP kodları aynı eşya sınıflandırmasını göstermelidir.',
    recommendedAction: 'Kodların 8/10/12 haneli kırılımlarını ve eşya tanımını uzmanla doğrulayın.',
    blocking: false,
  },
  'DECL-001': {
    category: 'Beyanname',
    turkishTitle: 'Rejim kodu',
    operationalExplanation: 'Rejim kodu işlemin ithalat/ihracat niteliğini belirler.',
    recommendedAction: 'Rejim kodunu beyanname ve işlem yönüyle karşılaştırın.',
    blocking: true,
  },
  'DECL-002': {
    category: 'Menşe',
    turkishTitle: 'Menşe ülke',
    operationalExplanation: 'Menşe bilgisi tarife, tercih ve ürün kontrol yorumunu etkiler.',
    recommendedAction: 'Menşe ülkeyi ISO kodu veya ülke adı olarak doğrulayın.',
    blocking: true,
  },
  'DECL-003': {
    category: 'Taraflar',
    turkishTitle: 'Vergi kimlik bilgisi',
    operationalExplanation: 'İthalatçı/ihracatçı vergi bilgisi beyan tarafını doğrular.',
    recommendedAction: 'Beyanname taraf vergi numarasını müşteri ve fatura bilgisiyle karşılaştırın.',
    blocking: true,
  },
  'DECL-004': {
    category: 'Beyanname',
    turkishTitle: 'Beyanname tarihi',
    operationalExplanation: 'Gelecek tarihli beyanname otomatik işlem için risklidir.',
    recommendedAction: 'Beyanname tarihini kaynak belgeden kontrol edin.',
    blocking: true,
  },
  'DECL-005': {
    category: 'Beyanname',
    turkishTitle: 'Gümrük idaresi',
    operationalExplanation: 'Gümrük idaresi kodu dosyanın işlem yerini gösterir.',
    recommendedAction: 'Gümrük idaresi kodunu beyannameden doğrulayın.',
    blocking: false,
  },
  'BL-001': {
    category: 'Taşıma',
    turkishTitle: 'Taşıma belge numarası',
    operationalExplanation: 'Taşıma belge numarası sevkiyat takibi için gereklidir.',
    recommendedAction: 'CMR/konşimento/AWB numarasını taşıma belgesinden doğrulayın.',
    blocking: true,
  },
  'BL-002': {
    category: 'Taşıma',
    turkishTitle: 'Yükleme ve varış bilgisi',
    operationalExplanation: 'Rota bilgisi işlem yönünü ve lojistik tutarlılığı destekler.',
    recommendedAction: 'Yükleme ve varış alanlarını taşıma belgesinden kontrol edin.',
    blocking: true,
  },
  'BL-003': {
    category: 'Taşıma',
    turkishTitle: 'Taşıma alıcısı',
    operationalExplanation: 'Taşıma belgesi alıcısı fatura alıcısıyla uyumlu görünmelidir.',
    recommendedAction: 'Consignee/alıcı bilgisini fatura alıcısı ile karşılaştırın.',
    blocking: false,
  },
  'COO-001': {
    category: 'Menşe',
    turkishTitle: 'Menşe belgesi ülke uyumu',
    operationalExplanation: 'Menşe belgesi ve fatura aynı menşe bilgisini desteklemelidir.',
    recommendedAction: 'Menşe belgesi ülkesini fatura menşesiyle karşılaştırın.',
    blocking: true,
  },
  'COO-002': {
    category: 'Menşe',
    turkishTitle: 'Menşe belge tarihi',
    operationalExplanation: 'Menşe belgesi tarihi fatura süreciyle tutarlı olmalıdır.',
    recommendedAction: 'Menşe belgesi tarihini fatura tarihiyle kontrol edin.',
    blocking: false,
  },
  'COO-003': {
    category: 'Menşe',
    turkishTitle: 'Düzenleyen makam',
    operationalExplanation: 'Menşe belgesinde düzenleyen makam izlenebilir olmalıdır.',
    recommendedAction: 'Düzenleyen makam alanını menşe belgesinden doğrulayın.',
    blocking: true,
  },
  'VAL-001': {
    category: 'Kıymet',
    turkishTitle: 'Birim fiyat',
    operationalExplanation: 'Birim fiyatlar fatura kalem hesaplarının temelidir.',
    recommendedAction: 'Eksik veya sıfır fiyatlı kalemleri ve bedelsiz işlem açıklamasını kontrol edin.',
    blocking: true,
  },
  'VAL-002': {
    category: 'Kıymet',
    turkishTitle: 'Kalem toplam hesabı',
    operationalExplanation: 'Kalem toplamı miktar ve birim fiyatla hesaplanabilir olmalıdır.',
    recommendedAction: 'Hatalı kalemlerde miktar, birim fiyat ve toplamı karşılaştırın.',
    blocking: true,
  },
  'VAL-003': {
    category: 'Kıymet',
    turkishTitle: 'Fatura toplam hesabı',
    operationalExplanation: 'Fatura toplamı kalem toplamlarıyla uyumlu olmalıdır.',
    recommendedAction: 'Fatura toplamı, iskonto, navlun veya ek masraf alanlarını kontrol edin.',
    blocking: true,
  },
  'CROSS-001': {
    category: 'Kıymet',
    turkishTitle: 'Fatura-beyan kıymet uyumu',
    operationalExplanation: 'Fatura toplamı ve beyan kıymeti tolerans içinde uyumlu olmalıdır.',
    recommendedAction: 'Bedelsiz/proforma/statistik kıymet farkını ve navlun/sigorta dahilini kontrol edin.',
    blocking: true,
  },
  'CROSS-002': {
    category: 'Ağırlık',
    turkishTitle: 'Brüt ağırlık uyumu',
    operationalExplanation: 'Çeki listesi ve beyanname brüt ağırlıkları uyumlu olmalıdır.',
    recommendedAction: 'Ağırlık birimini ve yuvarlama farklarını kontrol edin.',
    blocking: true,
  },
  'CROSS-003': {
    category: 'Teslim şekli',
    turkishTitle: 'Incoterm belge uyumu',
    operationalExplanation: 'Fatura ve yükleme talimatı aynı teslim şeklini göstermelidir.',
    recommendedAction: 'Teslim şekli ve teslim yerini iki belgeden doğrulayın.',
    blocking: false,
  },
  'CROSS-004': {
    category: 'Miktar',
    turkishTitle: 'Fatura-çeki miktar uyumu',
    operationalExplanation: 'Fatura kalem miktarı ve çeki listesi miktarı aynı birimle karşılaştırılmalıdır.',
    recommendedAction: 'Miktar birimlerini, kap adedi ile ürün adedinin karışıp karışmadığını kontrol edin.',
    blocking: true,
  },
  'CROSS-005': {
    category: 'Taraflar',
    turkishTitle: 'Satıcı-gönderici uyumu',
    operationalExplanation: 'Fatura satıcısı ve yükleme talimatı göndericisi aynı tarafı göstermelidir.',
    recommendedAction: 'Satıcı, gönderici ve adres alanlarını karşılaştırın.',
    blocking: false,
  },
  'CROSS-006': {
    category: 'Ağırlık',
    turkishTitle: 'Net ağırlık uyumu',
    operationalExplanation: 'Fatura ve çeki listesi net ağırlıkları uyumlu olmalıdır.',
    recommendedAction: 'Net ağırlık, birim ve ambalaj hariç/dahil ayrımını kontrol edin.',
    blocking: true,
  },
  'CROSS-007': {
    category: 'Kıymet',
    turkishTitle: 'Para birimi uyumu',
    operationalExplanation: 'Fatura ve beyanname para birimi aynı olmalıdır veya kur dönüşümü açıklanmalıdır.',
    recommendedAction: 'Para birimini ve varsa beyanname kur dönüşümünü kontrol edin.',
    blocking: true,
  },
  'CROSS-008': {
    category: 'Paketleme',
    turkishTitle: 'Kap sayısı uyumu',
    operationalExplanation: 'Çeki listesi ve beyanname kap sayıları uyumlu olmalıdır.',
    recommendedAction: 'Kap türü, palet/koli ayrımı ve beyan kap sayısını kontrol edin.',
    blocking: true,
  },
  'CROSS-009': {
    category: 'Ticaret akışı',
    turkishTitle: 'İthalat/ihracat yönü doğrulaması',
    operationalExplanation: 'Beyan edilen ticaret akışı taraf ve güzergah verisiyle örtüşmelidir.',
    recommendedAction: 'Satıcı/alıcı ülkelerini ve sevkiyat rotasını ticaret akışıyla karşılaştırın.',
    blocking: false,
  },
  'EXP-001': {
    category: 'İhracat',
    turkishTitle: 'İhracat fatura numarası',
    operationalExplanation: 'İhracat faturası izlenebilir bir numara taşımalıdır.',
    recommendedAction: 'Fatura numarasını doğrulayın.',
    blocking: true,
  },
  'EXP-002': {
    category: 'İhracat',
    turkishTitle: 'İhracatçı bilgisi',
    operationalExplanation: 'Faturada satıcı/ihracatçı açık olmalıdır.',
    recommendedAction: 'İhracatçı adını ve vergi bilgisini doğrulayın.',
    blocking: true,
  },
  'EXP-003': {
    category: 'İhracat',
    turkishTitle: 'İhracat rejim kodu',
    operationalExplanation: 'Rejim kodu ihracat yönüyle tutarlı olmalıdır.',
    recommendedAction: 'Rejim kodunu beyanname ve işlem yönüyle kontrol edin.',
    blocking: false,
  },
  'EXP-004': {
    category: 'İhracat',
    turkishTitle: 'İhracat menşe bilgisi',
    operationalExplanation: 'Menşe bilgisi tercihli işlem ve alıcı ülke kontrollerinde kullanılabilir.',
    recommendedAction: 'Faturada menşe bilgisini ve varsa tercih belgesini doğrulayın.',
    blocking: false,
  },
  'EXP-005': {
    category: 'İhracat',
    turkishTitle: 'Geçici ihracat destek belgesi',
    operationalExplanation: 'Geçici ihracatta takip ve geri dönüş için ek sevkiyat belgesi gerekir.',
    recommendedAction: 'Yükleme talimatı ve geçici ihracat gerekçesini dosyada doğrulayın.',
    blocking: false,
  },
}

export function getRuleDisplayMetadata(ruleCode: string): RuleDisplayMetadata {
  return RULE_METADATA[ruleCode] ?? {
    ...DEFAULT_METADATA,
    turkishTitle: `${ruleCode} kontrolü`,
  }
}

export function recommendedActionForRuleResult(ruleCode: string, result: string): string {
  if (result === 'PASS') return 'İşlem gerekmez; kontrol geçti.'
  if (result === 'SKIP') return 'Kontrol atlandı; veri veya kural koşullarını inceleyin.'
  return getRuleDisplayMetadata(ruleCode).recommendedAction
}
