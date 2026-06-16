/**
 * Trigger.dev v3 scheduled task that releases usage reservations stranded by
 * crashed or abandoned processing jobs (Phase 2 reconciliation).
 */
import { schedules, logger } from '@trigger.dev/sdk/v3'
import { reconcileStuckReservations } from '@/lib/entitlements'

export const reconcileReservationsTask = schedules.task({
  id: 'reconcile-reservations',
  // Every 30 minutes.
  cron: '*/30 * * * *',
  maxDuration: 120,
  run: async () => {
    const reconciled = await reconcileStuckReservations()
    logger.info('Reconciled stuck reservations', { reconciled })
    return { reconciled }
  },
})
