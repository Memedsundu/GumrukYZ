'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BillingInterval,
  TenantPlan,
  TenantSubscriptionStatus,
} from '@gumrukyz/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface InitialState {
  planCode: string
  status: string
  billingInterval: string
  trialEndsAt: string | null
  graceUntil: string | null
  customNotes: string
}

/** Convert an ISO string to a value usable by <input type="datetime-local">. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

function toIsoOrNull(local: string): string | null {
  if (!local) return null
  return new Date(local).toISOString()
}

const PLAN_OPTIONS = Object.values(TenantPlan)
const STATUS_OPTIONS = Object.values(TenantSubscriptionStatus)
const INTERVAL_OPTIONS = Object.values(BillingInterval)

export function SubscriptionForm({
  tenantId,
  initial,
}: {
  tenantId: string
  initial: InitialState
}) {
  const router = useRouter()
  const [planCode, setPlanCode] = useState(initial.planCode)
  const [status, setStatus] = useState(initial.status)
  const [billingInterval, setBillingInterval] = useState(initial.billingInterval)
  const [trialEndsAt, setTrialEndsAt] = useState(toLocalInput(initial.trialEndsAt))
  const [graceUntil, setGraceUntil] = useState(toLocalInput(initial.graceUntil))
  const [customNotes, setCustomNotes] = useState(initial.customNotes)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planCode,
          status,
          billingInterval,
          trialEndsAt: toIsoOrNull(trialEndsAt),
          graceUntil: toIsoOrNull(graceUntil),
          customNotes: customNotes.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Güncelleme başarısız')
      }
      setMessage({ kind: 'ok', text: 'Abonelik güncellendi.' })
      router.refresh()
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Hata' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paket">
          <Select value={planCode} onChange={setPlanCode} options={PLAN_OPTIONS} />
        </Field>
        <Field label="Durum">
          <Select value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </Field>
        <Field label="Faturalama">
          <Select value={billingInterval} onChange={setBillingInterval} options={INTERVAL_OPTIONS} />
        </Field>
        <Field label="Deneme bitişi">
          <Input
            type="datetime-local"
            value={trialEndsAt}
            onChange={(e) => setTrialEndsAt(e.target.value)}
          />
        </Field>
        <Field label="Grace bitişi">
          <Input
            type="datetime-local"
            value={graceUntil}
            onChange={(e) => setGraceUntil(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Not">
        <Textarea
          value={customNotes}
          onChange={(e) => setCustomNotes(e.target.value)}
          rows={3}
          placeholder="Manuel abonelik notu (ör. teklif no, ödeme durumu)"
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          Kaydet
        </Button>
        {message ? (
          <span className={message.kind === 'ok' ? 'text-sm text-success-700' : 'text-sm text-danger-700'}>
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}
