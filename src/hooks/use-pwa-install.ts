'use client'

import { useState, useEffect, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false)
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
      setCanInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = useCallback(async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    const result = await promptEvent.userChoice
    if (result.outcome === 'accepted') setCanInstall(false)
    setPromptEvent(null)
  }, [promptEvent])

  return { canInstall, install }
}
