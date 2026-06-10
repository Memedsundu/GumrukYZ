import * as React from 'react'
import {
  Award,
  Boxes,
  ClipboardList,
  File,
  FileBadge,
  FileQuestion,
  Globe,
  Plane,
  ReceiptText,
  Ship,
  Stamp,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { docTypeLabel } from '@/lib/report-format'

/**
 * Identity tints only — never severity colors. Chips say what a document IS,
 * badges say how a check WENT; the two palettes must not collide.
 */
type ChipTone = 'brand' | 'accent' | 'neutral'

const toneClasses: Record<ChipTone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  accent: 'bg-accent-50 text-accent-600',
  neutral: 'bg-surface-muted text-ink-muted',
}

const DOC_TYPE_VISUALS: Record<string, { icon: LucideIcon; tone: ChipTone }> = {
  INVOICE: { icon: ReceiptText, tone: 'brand' },
  PACKING_LIST: { icon: Boxes, tone: 'accent' },
  LOADING_INSTRUCTION: { icon: ClipboardList, tone: 'accent' },
  TRANSPORT_DOC: { icon: Truck, tone: 'neutral' },
  BILL_OF_LADING: { icon: Ship, tone: 'neutral' },
  AIRWAY_BILL: { icon: Plane, tone: 'neutral' },
  DECLARATION_OUTPUT: { icon: Stamp, tone: 'brand' },
  ORIGIN_DOC: { icon: Globe, tone: 'brand' },
  CERTIFICATE_OF_ORIGIN: { icon: Award, tone: 'accent' },
  PERMIT_DOC: { icon: FileBadge, tone: 'brand' },
  UNCLASSIFIED: { icon: FileQuestion, tone: 'neutral' },
  OTHER: { icon: File, tone: 'neutral' },
}

export interface DocTypeChipProps {
  docType: string
  /** Custom label override; defaults to the Turkish docTypeLabel(). */
  label?: string
  showLabel?: boolean
  className?: string
}

export function DocTypeChip({ docType, label, showLabel = true, className }: DocTypeChipProps) {
  const visual = DOC_TYPE_VISUALS[docType] ?? DOC_TYPE_VISUALS.OTHER
  const Icon = visual.icon
  const text = label ?? docTypeLabel(docType)
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
        toneClasses[visual.tone],
        className,
      )}
      title={showLabel ? undefined : text}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {showLabel ? <span className="truncate">{text}</span> : <span className="sr-only">{text}</span>}
    </span>
  )
}
