'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircleQuestion, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

interface AssistantChatProps {
  open: boolean
  onClose: () => void
  messages: ChatMessage[]
  sending: boolean
  error: string | null
  onSend: (text: string) => void
}

export function AssistantChat({ open, onClose, messages, sending, error, onSend }: AssistantChatProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open])

  function submit() {
    const text = input.trim()
    if (!text || sending) return
    onSend(text)
    setInput('')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="GümrükYZ'ye sor">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-pop">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <MessageCircleQuestion className="size-4 text-brand-600" />
            GümrükYZ&apos;ye sor
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !sending ? (
            <div className="rounded-xl bg-surface-muted/60 p-4 text-sm text-ink-muted">
              Bu dosya hakkında bir soru yazın ya da rapordaki öneri butonlarından birini seçin. Yanıtlar yalnızca bu
              dosyanın analizine dayanır ve bağlayıcı hukuki karar yerine geçmez.
            </div>
          ) : null}

          {messages.map((message, index) => (
            <div
              key={index}
              className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6',
                  message.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'border border-line bg-surface-muted/60 text-ink',
                )}
              >
                {message.content}
              </div>
            </div>
          ))}

          {sending ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface-muted/60 px-3.5 py-2.5 text-sm text-ink-muted">
                <Loader2 className="size-4 animate-spin" />
                Yanıt hazırlanıyor…
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</div>
          ) : null}
        </div>

        <div className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={2}
              placeholder="Bu dosya hakkında bir soru yazın…"
              className="min-h-[44px] flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <button
              type="button"
              onClick={submit}
              disabled={sending || input.trim().length === 0}
              aria-label="Gönder"
              className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-subtle">
            Enter ile gönder · Shift+Enter ile satır atla
          </p>
        </div>
      </div>
    </div>
  )
}
