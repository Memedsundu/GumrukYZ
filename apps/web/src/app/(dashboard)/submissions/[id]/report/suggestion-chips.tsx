'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, MessageCircleQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Suggestion, SuggestionsResult } from '@/lib/review-suggestions/types'

interface SuggestionChipsProps {
  submissionId: string
  /**
   * Where a clicked chip's prompt should go. When the contextual "Ask GümrükYZ
   * about this file" assistant exists, pass a handler that opens it with the
   * prompt. Until then, chips fall back to copying the prompt to the clipboard.
   */
  onSelectPrompt?: (suggestion: Suggestion) => void
}

export function SuggestionChips({ submissionId, onSelectPrompt }: SuggestionChipsProps) {
  const [data, setData] = useState<SuggestionsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch(`/api/submissions/${submissionId}/suggestions`)
      .then((res) => (res.ok ? (res.json() as Promise<SuggestionsResult>) : null))
      .then((result) => {
        if (active) setData(result)
      })
      .catch(() => {
        if (active) setData(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [submissionId])

  if (loading) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="h-4 w-32 animate-pulse-soft rounded bg-surface-muted" />
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="h-7 w-40 animate-pulse-soft rounded-full bg-surface-muted" />
          <div className="h-7 w-32 animate-pulse-soft rounded-full bg-surface-muted" />
        </div>
      </section>
    )
  }

  if (!data || data.suggestions.length === 0) return null

  function handleClick(suggestion: Suggestion) {
    if (onSelectPrompt) {
      onSelectPrompt(suggestion)
      return
    }
    // No assistant wired yet → copy the prompt so the broker can use it.
    void navigator.clipboard?.writeText(suggestion.prompt_to_assistant).then(() => {
      setCopiedId(suggestion.id)
      window.setTimeout(() => setCopiedId((id) => (id === suggestion.id ? null : id)), 1500)
    })
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <MessageCircleQuestion className="size-4 text-brand-600" />
        GümrükYZ&apos;ye sor
      </div>
      {data.assistant_intro ? (
        <p className="mt-2 text-xs leading-5 text-ink-muted">{data.assistant_intro}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {data.suggestions.map((suggestion) => {
          const copied = copiedId === suggestion.id
          const interactive = Boolean(onSelectPrompt)
          return (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => handleClick(suggestion)}
              title={suggestion.prompt_to_assistant}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                copied
                  ? 'border-success-200 bg-success-50 text-success-700'
                  : 'border-line-strong bg-surface text-ink-soft hover:bg-surface-muted',
              )}
            >
              {copied ? (
                <Check className="size-3" />
              ) : interactive ? (
                <MessageCircleQuestion className="size-3 text-brand-600" />
              ) : (
                <Copy className="size-3 text-ink-subtle" />
              )}
              {copied ? 'Kopyalandı' : suggestion.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
