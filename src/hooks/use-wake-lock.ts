'use client'

import { useEffect, useRef } from 'react'

// Requests the Screen Wake Lock API to prevent phone sleep during gameplay.
// Falls back gracefully on browsers that don't support it (older Android).
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) {
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
      return
    }

    if (!('wakeLock' in navigator)) return

    let released = false

    const acquire = () => {
      if (released) return
      navigator.wakeLock.request('screen').then(lock => {
        lockRef.current = lock
        // Re-acquire if the lock is released by the system (e.g. tab hidden then shown)
        lock.addEventListener('release', () => {
          if (!released) acquire()
        })
      }).catch(() => { /* permission denied or unsupported — silent */ })
    }

    acquire()

    // Re-acquire when tab becomes visible again
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      released = true
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active])
}
