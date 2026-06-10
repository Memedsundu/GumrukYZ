import * as React from 'react'

/**
 * Customs-themed line-art scenes. Strokes inherit currentColor (set
 * text-ink-subtle or similar on a wrapper); accent fills use design tokens so
 * every scene stays 2-color: one stroke, one tint. Decorative only — always
 * paired with text, never placed over data surfaces.
 */

type IllustrationProps = {
  className?: string
  width?: number
}

const strokeProps = {
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
}

/** Empty dossier shelf: folder + shipping container — for empty lists. */
export function EmptyDossierIllustration({ className, width = 180 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 140" width={width} className={className} aria-hidden>
      {/* container */}
      <rect x="116" y="58" width="64" height="40" rx="3" fill="var(--color-brand-100)" stroke="none" />
      <rect x="116" y="58" width="64" height="40" rx="3" {...strokeProps} />
      <path d="M126 58v40M138 58v40M150 58v40M162 58v40M174 58v40" {...strokeProps} strokeWidth={1} />
      {/* folder */}
      <path d="M22 52h28l8 9h46a6 6 0 0 1 6 6v25a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6V58a6 6 0 0 1 6-6Z" fill="var(--color-surface)" stroke="none" />
      <path d="M22 52h28l8 9h46a6 6 0 0 1 6 6v25a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6V58a6 6 0 0 1 6-6Z" {...strokeProps} />
      <path d="M16 70h94" {...strokeProps} strokeWidth={1} />
      {/* ground line */}
      <path d="M10 104h180" {...strokeProps} strokeDasharray="3 5" strokeWidth={1} />
      {/* gulls */}
      <path d="M58 30c2-3 5-3 7 0M70 24c2-3 5-3 7 0" {...strokeProps} strokeWidth={1.2} />
    </svg>
  )
}

/** Document stack with rising sheet — for upload surfaces. */
export function UploadDocsIllustration({ className, width = 180 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 140" width={width} className={className} aria-hidden>
      {/* back sheets */}
      <rect x="64" y="46" width="58" height="72" rx="4" transform="rotate(-5 93 82)" fill="var(--color-surface)" stroke="none" />
      <rect x="64" y="46" width="58" height="72" rx="4" transform="rotate(-5 93 82)" {...strokeProps} strokeWidth={1.2} />
      {/* front sheet, accent */}
      <rect x="78" y="38" width="58" height="74" rx="4" fill="var(--color-accent-100)" stroke="none" />
      <rect x="78" y="38" width="58" height="74" rx="4" {...strokeProps} />
      <path d="M88 54h38M88 64h38M88 74h24" {...strokeProps} strokeWidth={1.2} />
      {/* up arrow */}
      <path d="M158 92V58m0 0-11 11m11-11 11 11" {...strokeProps} strokeWidth={2} />
      {/* ground */}
      <path d="M40 122h120" {...strokeProps} strokeDasharray="3 5" strokeWidth={1} />
    </svg>
  )
}

/** Stamp ring with check — the "all clear" reward. */
export function AllClearIllustration({ className, width = 150 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 160 140" width={width} className={className} aria-hidden>
      <circle cx="80" cy="70" r="42" fill="var(--color-success-100)" stroke="none" />
      <circle cx="80" cy="70" r="42" {...strokeProps} />
      <circle cx="80" cy="70" r="34" {...strokeProps} strokeDasharray="2 4" strokeWidth={1.2} />
      <path
        d="M64 71 L76 83 L98 57"
        stroke="var(--color-success-600)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray="50"
        className="animate-check-draw"
        style={{ ['--check-length' as string]: '50' }}
      />
      {/* stamp handle hint */}
      <path d="M70 18h20M76 18v8M84 18v8" {...strokeProps} strokeWidth={1.2} />
    </svg>
  )
}

/** Checkpoint barrier — for 403 / access denied. */
export function AccessDeniedIllustration({ className, width = 180 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 140" width={width} className={className} aria-hidden>
      {/* post */}
      <rect x="38" y="44" width="10" height="68" rx="2" fill="var(--color-surface)" stroke="none" />
      <rect x="38" y="44" width="10" height="68" rx="2" {...strokeProps} />
      {/* barrier arm with warning segments */}
      <g transform="rotate(-12 48 56)">
        <rect x="48" y="50" width="116" height="12" rx="6" fill="var(--color-surface)" stroke="none" />
        <path d="M62 50l-8 12M86 50l-8 12M110 50l-8 12M134 50l-8 12M158 50l-8 12" stroke="var(--color-warning-200)" strokeWidth={7} />
        <rect x="48" y="50" width="116" height="12" rx="6" {...strokeProps} />
      </g>
      {/* booth */}
      <rect x="140" y="76" width="38" height="36" rx="3" fill="var(--color-brand-100)" stroke="none" />
      <rect x="140" y="76" width="38" height="36" rx="3" {...strokeProps} />
      <rect x="150" y="84" width="18" height="12" rx="1.5" {...strokeProps} strokeWidth={1.2} />
      {/* ground */}
      <path d="M14 112h172" {...strokeProps} strokeDasharray="3 5" strokeWidth={1} />
    </svg>
  )
}

/** Dashed trade route with port pin — for onboarding / first-run. */
export function RouteMapIllustration({ className, width = 180 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 140" width={width} className={className} aria-hidden>
      <path d="M24 108C58 96 52 56 92 60s44 34 84 18" {...strokeProps} strokeDasharray="5 6" />
      {/* origin dot */}
      <circle cx="24" cy="108" r="5" fill="var(--color-surface)" stroke="none" />
      <circle cx="24" cy="108" r="5" {...strokeProps} />
      {/* destination pin */}
      <path d="M176 60c0 9-12 22-12 22s-12-13-12-22a12 12 0 0 1 24 0Z" fill="var(--color-brand-100)" stroke="none" />
      <path d="M176 60c0 9-12 22-12 22s-12-13-12-22a12 12 0 0 1 24 0Z" {...strokeProps} />
      <circle cx="164" cy="59" r="4" {...strokeProps} />
      {/* tiny vessel on route */}
      <path d="M84 52l6 8h-14l4-8h4ZM76 60h22l-4 7H82l-6-7Z" fill="var(--color-accent-100)" stroke="none" />
      <path d="M76 60h22l-4 7H82l-6-7ZM88 60v-9M88 51l8 9" {...strokeProps} strokeWidth={1.2} />
    </svg>
  )
}

/** Statute book spine — for admin regulation sources. */
export function StatuteBookIllustration({ className, width = 150 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 160 140" width={width} className={className} aria-hidden>
      <path d="M44 36a8 8 0 0 1 8-8h60v84H52a8 8 0 0 0-8 8V36Z" fill="var(--color-brand-100)" stroke="none" />
      <path d="M44 36a8 8 0 0 1 8-8h60v84H52a8 8 0 0 0-8 8V36Z" {...strokeProps} />
      <path d="M44 120a8 8 0 0 1 8-8h60v12H52a8 8 0 0 1-8-8v4Z" fill="var(--color-surface)" stroke="none" />
      <path d="M112 112v12H52a8 8 0 0 1-8-8" {...strokeProps} />
      <path d="M60 48h36M60 58h36M60 68h22" {...strokeProps} strokeWidth={1.2} />
      {/* bookmark */}
      <path d="M96 28v26l-6-6-6 6V28" fill="var(--color-accent-100)" stroke="none" />
      <path d="M96 28v26l-6-6-6 6V28" {...strokeProps} strokeWidth={1.2} />
    </svg>
  )
}
