import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/ui/brand-mark'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { RiskScore } from '@/components/ui/risk-score'
import { SAMPLE_REPORT, type SampleResult } from '@/lib/sample-report'

const RESULT_META: Record<SampleResult, { tone: BadgeTone; label: string }> = {
  FAIL: { tone: 'danger', label: 'Hata' },
  WARN: { tone: 'warning', label: 'Uyarı' },
  REVIEW_NEEDED: { tone: 'info', label: 'İnceleme gerekli' },
  PASS: { tone: 'success', label: 'Uygun' },
}

export default function SampleReportPage() {
  const { reference, tradeFlow, generatedAt, counts, findings } = SAMPLE_REPORT

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark size="md" />
        </Link>
        <Button asChild>
          <Link href="/sign-up">
            14 gün ücretsiz dene
            <ArrowRight />
          </Link>
        </Button>
      </header>

      <div className="mx-auto w-full max-w-5xl px-6 pb-16">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
          <ArrowLeft className="size-4" /> Ana sayfa
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">Örnek risk raporu</h1>
          <Badge tone="neutral">Sentetik veri · gerçek belge içermez</Badge>
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          {reference} · {tradeFlow} · {generatedAt}
        </p>

        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <RiskScore errors={counts.errors} warnings={counts.warnings} reviews={counts.reviewNeeded} />
            <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Hata" value={counts.errors} tone="text-danger-700" />
              <Stat label="Uyarı" value={counts.warnings} tone="text-warning-700" />
              <Stat label="İnceleme" value={counts.reviewNeeded} tone="text-brand-700" />
              <Stat label="Uygun" value={counts.passes} tone="text-success-700" />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 space-y-4">
          {findings.map((finding) => {
            const meta = RESULT_META[finding.result]
            return (
              <Card key={finding.code}>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <Badge tone="neutral">{finding.category}</Badge>
                    <span className="font-mono text-xs text-ink-subtle">{finding.code}</span>
                  </div>
                  <h2 className="font-semibold text-ink">{finding.title}</h2>
                  <p className="text-sm text-ink-muted">{finding.message}</p>
                  <p className="text-sm">
                    <span className="font-medium text-ink-soft">Öneri: </span>
                    <span className="text-ink-muted">{finding.action}</span>
                  </p>
                  {finding.citation ? (
                    <div className="rounded-lg border border-line bg-surface-muted/60 p-3 text-xs text-ink-muted">
                      <span className="font-medium text-ink-soft">{finding.citation.label}</span>
                      <p className="mt-1">{finding.citation.excerpt}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="mt-10 rounded-2xl border border-brand-500 bg-brand-50 p-6 text-center">
          <h2 className="font-display text-xl font-semibold text-ink">
            Kendi dosyalarınızda deneyin
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            14 gün ücretsiz Firma denemesi — kredi kartı gerekmez.
          </p>
          <Button asChild size="lg" className="mt-4">
            <Link href="/sign-up">
              Ücretsiz başlayın
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </main>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted/50 p-3 text-center">
      <p className={`font-display text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  )
}
