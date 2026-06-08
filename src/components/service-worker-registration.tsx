'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') {
      console.log('[SW] Skipping registration in development')
      return
    }
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('[SW] Registered, scope:', reg.scope))
        .catch((err) => console.warn('[SW] Registration failed:', err))
    })
  }, [])

  return null
}
