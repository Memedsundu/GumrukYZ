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
          Üretilme: {formatDate(payload.report.generatedAt)} | Akış: {payload.submission.tradeFlow}
        </Text>

        <View style={styles.statsRow}>
          <Stat label="Hata" value={payload.counts.errors} />
          <Stat label="Uyarı" value={payload.counts.warnings} />
          <Stat label="İnceleme Gerekli" value={payload.counts.reviewNeeded} />
          <Stat label="Geçti" value={payload.counts.passes} />
        </View>

        {payload.report.summaryText && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Özeti</Text>
            <View style={styles.summaryBox}>
              <Text>{payload.report.summaryText}</Text>
              <Text style={styles.sourceRef}>
                Not: Bu özet bilgilendirme amaçlıdır. Hukuki karar yerine geçmez.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kontrol Sonuçları</Text>
          {orderedResults.map((result) => (
            <View key={result.id} style={styles.ruleRow} wrap={false}>
              <View style={styles.ruleHeader}>
                <Text style={styles.ruleCode}>{result.ruleCode}</Text>
                <Text style={styles.result}>{result.resultLabel}</Text>
              </View>
              <Text>{result.displayMessage}</Text>
              {result.sourceRefsDisplay.length > 0 && result.result !== 'PASS' && (
                <Text style={styles.sourceRef}>
                  Kaynak: {result.sourceRefsDisplay.join(' | ')}
                </Text>
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
