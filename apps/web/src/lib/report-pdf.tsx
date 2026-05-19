import { existsSync } from 'fs'
import path from 'path'
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import type { ReportPayload } from './report-data'

let fontsRegistered = false

function fontPath(filename: string) {
  const packagePath = path.join(
    'node_modules',
    '@fontsource',
    'noto-sans',
    'files',
    filename,
  )
  const candidates = [
    path.join(process.cwd(), packagePath),
    path.join(process.cwd(), 'apps', 'web', packagePath),
  ]

  const resolved = candidates.find((candidate) => existsSync(candidate))
  if (!resolved) {
    throw new Error(`Report PDF font file not found: ${filename}`)
  }

  return resolved
}

function registerFonts() {
  if (fontsRegistered) return

  Font.register({
    family: 'Noto Sans',
    fonts: [
      {
        src: fontPath('noto-sans-latin-ext-400-normal.woff'),
        fontWeight: 400,
      },
      {
        src: fontPath('noto-sans-latin-ext-700-normal.woff'),
        fontWeight: 700,
      },
    ],
  })

  fontsRegistered = true
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: 'Noto Sans',
    fontSize: 10,
    color: '#111827',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 6,
  },
  muted: {
    color: '#6b7280',
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  },
  summaryBox: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  statBox: {
    flexGrow: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statNumber: {
    fontSize: 16,
    fontWeight: 700,
  },
  ruleRow: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ruleCode: {
    fontSize: 9,
    color: '#6b7280',
    fontWeight: 700,
  },
  result: {
    fontSize: 9,
    fontWeight: 700,
  },
  sourceRef: {
    marginTop: 3,
    color: '#6b7280',
    fontSize: 8,
  },
  legalRef: {
    marginTop: 5,
    padding: 6,
    backgroundColor: '#f8fafc',
    color: '#334155',
    fontSize: 8,
  },
  legalTitle: {
    fontWeight: 700,
  },
  expertRow: {
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  expertMeta: {
    color: '#4f46e5',
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 3,
  },
})

export async function renderReportPdf(payload: ReportPayload): Promise<Buffer> {
  registerFonts()
  return renderToBuffer(<ReportPdfDocument payload={payload} />)
}

function ReportPdfDocument({ payload }: { payload: ReportPayload }) {
  const orderedResults = [
    ...payload.ruleResults.filter((result) => result.result === 'FAIL'),
    ...payload.ruleResults.filter((result) => result.result === 'WARN'),
    ...payload.ruleResults.filter((result) => result.result === 'REVIEW_NEEDED'),
    ...payload.ruleResults.filter((result) => result.result === 'PASS'),
  ]

  return (
    <Document title={`GümrükYZ Risk Raporu - ${payload.submission.title}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>GümrükYZ Risk Raporu</Text>
        <Text style={styles.muted}>{payload.submission.title}</Text>
        <Text style={styles.muted}>
          Üretilme: {formatDate(payload.report.generatedAt)} | Akış: {tradeFlowLabel(payload.submission.tradeFlow)}
        </Text>

        <View style={styles.statsRow}>
          <Stat label="Hata" value={payload.counts.errors} />
          <Stat label="Uyarı" value={payload.counts.warnings} />
          <Stat label="İnceleme Gerekli" value={payload.counts.reviewNeeded} />
          <Stat label="Geçti" value={payload.counts.passes} />
        </View>

        {payload.report.summaryText && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Yapay zeka özeti</Text>
            <View style={styles.summaryBox}>
              <Text>{payload.report.summaryText}</Text>
              <Text style={styles.sourceRef}>
                Not: Bu özet bilgilendirme amaçlıdır. Hukuki karar yerine geçmez.
              </Text>
            </View>
          </View>
        )}

        {payload.actionSummary.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Aksiyon Özeti</Text>
            {payload.actionSummary.map((item) => (
              <View key={`${item.ruleCode}-${item.result}`} style={styles.ruleRow} wrap={false}>
                <Text style={styles.ruleCode}>{item.ruleCode} | {item.title} | {ruleResultLabel(item.result)}</Text>
                <Text>{item.description}</Text>
                <Text style={styles.sourceRef}>Ne yapmalı? {item.action}</Text>
              </View>
            ))}
          </View>
        )}

        {payload.expertReview && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Yapay zeka uzman incelemesi</Text>
            {payload.expertReview.summary && (
              <View style={styles.summaryBox}>
                <Text>{payload.expertReview.summary}</Text>
                <Text style={styles.sourceRef}>
                  Genel risk: {riskLevelLabel(payload.expertReview.overallRisk)} | Durum: {legalContextStatusLabel(payload.expertReview.legalContextStatus)}
                </Text>
              </View>
            )}
            {payload.expertReview.findings.map((finding) => (
              <View key={finding.id} style={styles.expertRow} wrap={false}>
                <Text style={styles.expertMeta}>
                  {expertAreaLabel(finding.area)} | {ruleResultLabel(finding.severity)} | Güven %{Math.round(finding.confidence * 100)}
                </Text>
                <Text style={styles.legalTitle}>{finding.title}</Text>
                <Text>{finding.explanation}</Text>
                <Text style={styles.sourceRef}>Öneri: {finding.recommendation}</Text>
                {finding.citations.length > 0 && (
                  <View style={styles.legalRef}>
                    <Text style={styles.legalTitle}>Mevzuat dayanağı</Text>
                    {finding.citations.map((citation) => (
                      <Text key={citation.id}>
                        {citation.sourceTitle}
                        {citation.articleLabel ? ` - ${citation.articleLabel}` : ''}: {citation.excerpt}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kontrol Sonuçları</Text>
          {orderedResults.map((result) => (
            <View key={result.id} style={styles.ruleRow} wrap={false}>
              <View style={styles.ruleHeader}>
                <Text style={styles.ruleCode}>
                  {result.ruleCode} | {result.metadata.category}
                </Text>
                <Text style={styles.result}>{result.resultLabel}</Text>
              </View>
              <Text style={styles.legalTitle}>{result.metadata.turkishTitle}</Text>
              <Text style={styles.sourceRef}>{result.metadata.operationalExplanation}</Text>
              <Text>{result.displayMessage}</Text>
              <Text style={styles.sourceRef}>Ne yapmalı? {result.recommendedAction}</Text>
              {result.sourceRefsDisplay.length > 0 && result.result !== 'PASS' && (
                <Text style={styles.sourceRef}>
                  Kaynak: {result.sourceRefsDisplay.join(' | ')}
                </Text>
              )}
              {result.legalCitations.length > 0 && result.result !== 'PASS' && (
                <View style={styles.legalRef}>
                  <Text style={styles.legalTitle}>Mevzuat dayanağı</Text>
                  {result.legalCitations.map((citation) => (
                    <Text key={citation.id}>
                      {citation.sourceTitle}
                      {citation.articleLabel ? ` - ${citation.articleLabel}` : ''}: {citation.excerpt}
                    </Text>
                  ))}
                </View>
              )}
              {result.aiValidations.length > 0 && (
                <View style={styles.legalRef}>
                  <Text style={styles.legalTitle}>Yapay zeka kural kontrolü</Text>
                  {result.aiValidations.map((validation) => (
                    <Text key={validation.id}>
                      {aiRuleValidationLabel(validation.status)} (%{Math.round(validation.confidence * 100)}): {validation.explanation} Öneri: {validation.recommendation}
                    </Text>
                  ))}
                </View>
              )}
              {result.overrides.length > 0 && (
                <Text style={styles.sourceRef}>
                  Geçersiz kılındı: {result.overrides[0]?.reason}
                </Text>
              )}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.statNumber}>{value}</Text>
    </View>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function aiRuleValidationLabel(status: string): string {
  const map: Record<string, string> = {
    LIKELY_CORRECT: 'Sonuç makul',
    POTENTIAL_FALSE_POSITIVE: 'Yanlış pozitif olabilir',
    POTENTIAL_FALSE_NEGATIVE: 'Kaçan risk olabilir',
    NEEDS_HUMAN_REVIEW: 'Manuel inceleme gerekir',
  }
  return map[status] ?? status
}

function tradeFlowLabel(tradeFlow: string): string {
  if (tradeFlow === 'IMPORT') return 'İthalat'
  if (tradeFlow === 'EXPORT') return 'İhracat'
  return 'Henüz doğrulanmadı'
}

function ruleResultLabel(result: string): string {
  const map: Record<string, string> = {
    FAIL: 'Hata',
    WARN: 'Uyarı',
    REVIEW_NEEDED: 'İnceleme gerekli',
    PASS: 'Geçti',
    SKIP: 'Atlandı',
  }
  return map[result] ?? result
}

function riskLevelLabel(risk: string | null | undefined): string {
  const map: Record<string, string> = {
    LOW: 'Düşük',
    MEDIUM: 'Orta',
    HIGH: 'Yüksek',
    CRITICAL: 'Kritik',
  }
  return risk ? map[risk] ?? risk : 'Bilinmiyor'
}

function legalContextStatusLabel(status: string): string {
  const map: Record<string, string> = {
    READY: 'Hazır',
    MISSING_REQUIRED_SOURCE: 'Zorunlu kaynak eksik',
    EMPTY_CONTEXT: 'Mevzuat bağlamı boş',
    DISABLED: 'Devre dışı',
  }
  return map[status] ?? status
}

function expertAreaLabel(area: string): string {
  const map: Record<string, string> = {
    GTIP_PLAUSIBILITY: 'GTİP yorumu',
    PERMIT_PRODUCT_CONTROL: 'İzin / ürün kontrolü',
    REGIME_CHOICE: 'Rejim seçimi',
    VALUATION: 'Kıymet',
    ORIGIN_PREFERENTIAL: 'Menşe / tercihli rejim',
    INCOTERM: 'Incoterms',
    DOCUMENT_CONSISTENCY: 'Belge tutarlılığı',
    LEGAL_CONTEXT: 'Mevzuat kapsamı',
  }
  return map[area] ?? area
}
