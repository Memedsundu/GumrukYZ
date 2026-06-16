import { redirect } from 'next/navigation'

// The public welcome page now lives at `/`. Keep `/beta` as a redirect so any
// existing external links continue to work.
export default function BetaPage() {
  redirect('/')
}
