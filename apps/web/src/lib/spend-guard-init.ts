import { setGlobalProviderCircuitCheck } from '@gumrukyz/ai'
import { getHourlySpend, getSpendLimits, isSpendGuardEnabled } from './spend-guard'

let registered = false

/** Wire global spend circuit into provider retry (fail fast instead of amplifying spend). */
export function registerSpendCircuitForProviders(): void {
  if (registered) return
  registered = true

  setGlobalProviderCircuitCheck(async () => {
    if (!isSpendGuardEnabled()) return false
    const limits = getSpendLimits()
    if (limits.globalUsdPerHour <= 0) return false
    const { globalSpendUsd } = await getHourlySpend()
    return globalSpendUsd >= limits.globalUsdPerHour
  })
}

registerSpendCircuitForProviders()
