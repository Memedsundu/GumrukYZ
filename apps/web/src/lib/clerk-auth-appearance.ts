/** Shared Clerk styling for sign-in / sign-up auth shells. */
export const authClerkAppearance = {
  layout: {
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none',
    card: 'w-full gap-6 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8',
    header: 'gap-1 text-center',
    headerTitle: 'font-display text-xl font-semibold tracking-tight text-ink',
    headerSubtitle: 'text-sm text-ink-muted',
    socialButtons: 'flex flex-col gap-2',
    socialButtonsBlockButton:
      'h-10 rounded-lg border border-line bg-surface font-medium text-ink shadow-none hover:bg-surface-muted',
    dividerRow: 'my-2',
    dividerLine: 'bg-line',
    dividerText: 'px-3 text-xs text-ink-subtle',
    form: 'gap-4',
    formFieldRow: 'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-4',
    formFieldLabelRow: 'flex min-h-5 flex-wrap items-center gap-x-1.5',
    formFieldLabel: 'text-sm font-medium text-ink',
    formFieldHintText: 'text-xs font-normal text-ink-subtle',
    formFieldInput:
      'rounded-lg border-line bg-surface text-ink shadow-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
    formButtonPrimary:
      'h-10 rounded-lg bg-ink font-medium normal-case shadow-none hover:bg-ink-soft',
    footer: 'bg-transparent',
    footerAction: 'justify-center py-0',
    footerActionText: 'text-ink-muted',
    footerActionLink: 'font-medium text-brand-700 hover:text-brand-600',
  },
}
