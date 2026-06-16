'use client'

import { useEffect, useRef, useState } from 'react'

export function useSmoothProgressPercent(serverPercent: number | undefined, enabled: boolean): number {
  const [animatedPercent, setAnimatedPercent] = useState(serverPercent ?? 14)
  const serverRef = useRef(serverPercent ?? 14)

  useEffect(() => {
    if (serverPercent == null) return
    serverRef.current = Math.max(serverRef.current, serverPercent)
  }, [serverPercent])

  useEffect(() => {
    if (!enabled) return

    const intervalId = window.setInterval(() => {
      setAnimatedPercent((current) => {
        const target = serverRef.current
        if (current >= target) {
          const softCap = Math.min(99, target + 3)
          if (current >= softCap) return current
          return Math.min(softCap, current + 1)
        }
        return Math.min(target, current + 1)
      })
    }, 2000)

    return () => window.clearInterval(intervalId)
  }, [enabled])

  return Math.max(animatedPercent, serverPercent ?? 0)
}
