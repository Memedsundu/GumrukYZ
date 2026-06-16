import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'
import React from 'react'
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import type { ReportPayload } from './report-data'

let fontsRegistered = false
const REPORT_FONT_FAMILY = 'Mizan Sans'
const FONT_PACKAGE = 'pdfjs-dist'
const FONT_FILES_DIR = path.join('node_modules', FONT_PACKAGE, 'standard_fonts')

function fontPath(filename: string) {
  const directPath = path.join(process.cwd(), FONT_FILES_DIR, filename)
  if (existsSync(directPath)) return directPath

  const pnpmPath = resolvePnpmFontPath(filename)
  if (pnpmPath) return pnpmPath

  throw new Error(`Report PDF font file not found: ${filename}`)
}

function resolvePnpmFontPath(filename: string): string | null {
  let current = process.cwd()

  for (let depth = 0; depth < 6; depth += 1) {
    const pnpmModulesDir = path.join(current, 'node_modules', '.pnpm')
    if (existsSync(pnpmModulesDir)) {
      const packageDir = readdirSync(pnpmModulesDir).find((entry) => entry.startsWith('pdfjs-dist@'))
      if (packageDir) {
        const candidate = path.join(pnpmModulesDir, packageDir, 'node_modules', FONT_PACKAGE, 'standard_fonts', filename)
        if (existsSync(candidate)) return candidate
      }
    }

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}

function registerFonts() {
  if (fontsRegistered) return

  Font.register({
    family: REPORT_FONT_FAMILY,
    fonts: [
      {
        src: fontPath('LiberationSans-Regular.ttf'),
        fontWeight: 400,
      },
      {
        src: fontPath('LiberationSans-Bold.ttf'),
        fontWeight: 700,
      },
    ],
  })

  fontsRegistered = true
}

const logoPath = path.join(process.cwd(), 'public/brand/mizan-logo.png')
const logoBuffer = readFileSync(logoPath)
const LOGO_HEIGHT = 24
const LOGO_ASPECT = 640 / 183

/** Mirrors the Mizan web design tokens in globals.css — keep the two in sync. */
const COLORS = {
  ink: '#232934',
  inkMuted: '#667085',
  line: '#e6dfd2',
  surfaceMuted: '#f4f0e6',
  brand: '#006b5f',
  brand50: '#e6f4f1',
  brand100: '#c9e9e2',
  brand700: '#00584e',
  success50: '#e7f5ee',
  success200: '#97d5b7',
  success700: '#0c5f45',
  warning50: '#fbf3e0',
  warning200: '#efce83',
  warning700: '#9a6500',
  danger50: '#fceae8',
  danger200: '#f1aba3',
  danger700: '#a81d13',
  ai600: '#006b5f',
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: REPORT_FONT_FAMILY,
    fontSize: 10,
    color: COLORS.ink,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.brand,
  },
  brandLogo: {
    height: LOGO_HEIGHT,
    width: LOGO_HEIGHT * LOGO_ASPECT,
  },
  brandTag: {
    fontSize: 8,
    color: COLORS.inkMuted,
    marginLeft: 'auto',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 6,
  },
  muted: {
    color: COLORS.inkMuted,
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
    borderColor: COLORS.brand100,
    backgroundColor: COLORS.brand50,
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
    borderColor: COLORS.line,
  },
  statNumber: {
    fontSize: 16,
    fontWeight: 700,
  },
  ruleRow: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ruleCode: {
    fontSize: 9,
    color: COLORS.inkMuted,
    fontWeight: 700,
  },
  result: {
    fontSize: 9,
    fontWeight: 700,
  },
  sourceRef: {
    marginTop: 3,
    color: COLORS.inkMuted,
    fontSize: 8,
  },
  legalRef: {
    marginTop: 5,
    padding: 6,
    backgroundColor: COLORS.surfaceMuted,
    color: COLORS.inkMuted,
    fontSize: 8,
  },
  legalTitle: {
    fontWeight: 700,
  },
  expertRow: {
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  expertMeta: {
    color: COLORS.ai600,
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 3,
  },
})

const STAT_TONES: Record<string, { border: string; background: string; number: string }> = {
  danger: { border: COLORS.danger200, background: COLORS.danger50, number: COLORS.danger700 },
  warning: { border: COLORS.warning200, background: COLORS.warning50, number: COLORS.warning700 },
  brand: { border: COLORS.brand100, background: COLORS.brand50, number: COLORS.brand700 },
  success: { border: COLORS.success200, background: COLORS.success50, number: COLORS.success700 },
}

function BrandHeader() {
  return (
    <View style={styles.brandRow}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- decorative brand logo in PDF output */}
      <Image src={logoBuffer} style={styles.brandLogo} />
      <Text style={styles.brandTag}>Akıllı Gümrük Kontrol Sistemi</Text>
    </View>
  )
}

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
    <Document title={`Mizan Risk Raporu - ${payload.submission.title}`}>
      <Page size="A4" style={styles.page}>
        <BrandHeader />
        <Text style={styles.title}>Risk Raporu</Text>
        <Text style={styles.muted}>{payload.submission.title}</Text>
        <Text style={styles.muted}>
          Üretilme: {formatDate(payload.report.generatedAt)} | Akış: {tradeFlowLabel(payload.submission.tradeFlow)}
        </Text>

        <View style={styles.statsRow}>
          <Stat label="Hata" value={payload.counts.errors} tone="danger" />
          <Stat label="Uyarı" value={payload.counts.warnings} tone="warning" />
          <Stat label="İnceleme Gerekli" value={payload.counts.reviewNeeded} tone="brand" />
          <Stat label="Geçti" value={payload.counts.passes} tone="success" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Belge kapsamı</Text>
          <View style={styles.summaryBox}>
            <Text>{payload.documentCoverage.limitationNotice}</Text>
            <Text style={styles.sourceRef}>
              Mevcut belgeler: {payload.documentCoverage.presentLabels.join(', ') || '—'}
            </Text>
            {payload.documentCoverage.missingExpectedLabels.length > 0 && (
              <Text style={styles.sourceRef}>
                Eksik beklenen belgeler: {payload.documentCoverage.missingExpectedLabels.join(', ')}
              </Text>
            )}
            {payload.documentCoverage.missingConditionalLabels.length > 0 && (
              <Text style={styles.sourceRef}>
                Koşullu eksik belgeler: {payload.documentCoverage.missingConditionalLabels.join(', ')}
              </Text>
            )}
          </View>
        </View>

        {payload.report.summaryText && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dosya Özeti</Text>
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
            <Text style={styles.sectionTitle}>Uzman İncelemesi</Text>
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
                {finding.gtipCandidates.length > 0 && (
                  <View style={styles.legalRef}>
                    <Text style={styles.legalTitle}>GTİP aday yorumu</Text>
                    {finding.gtipCandidates.map((candidate) => (
                      <Text key={candidate.code}>
                        {candidate.code} (%{Math.round(candidate.confidence * 100)}): {candidate.rationale}
                        {candidate.requiredEvidence.length > 0
                          ? ` Gerekli kanıt: ${candidate.requiredEvidence.join(', ')}`
                          : ''}
                      </Text>
                    ))}
                  </View>
                )}
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
                  <Text style={styles.legalTitle}>Otomatik Risk Kontrolü</Text>
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

function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof STAT_TONES }) {
  const colors = STAT_TONES[tone]
  return (
    <View style={[styles.statBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.statNumber, { color: colors.number }]}>{value}</Text>
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
    NOT_RUN: 'Çalıştırılmadı',
    LEGAL_CONTEXT_INCOMPLETE: 'Mevzuat bağlamı eksik',
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
