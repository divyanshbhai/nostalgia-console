'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { io, Socket } from 'socket.io-client'
import { getWsUrl } from '@/lib/ws-url'
import { useSearchParams } from 'next/navigation'
import { PLAYER_COLORS, PlayerColor, ConsoleType } from '@/lib/game-session-manager'
import { getProfileForConsole, NES_PROFILE, ControllerProfile } from '@/lib/controller-profiles'
import { validateROM, getEmulatorConsoleType, getSupportedExtensions } from '@/lib/rom-validator'
import { useWakeLock } from '@/hooks/use-wake-lock'
import { Wifi, WifiOff, Gamepad2, Upload, Play, Check, X, Zap, RefreshCw, Maximize, Minimize, Volume2, VolumeX, RotateCcw, Save, FolderOpen, Menu, AlertCircle } from 'lucide-react'

type Step = 'connect' | 'connecting' | 'lobby' | 'playing'
interface Player { id: number; color: PlayerColor; ready: boolean; latency: number }

const RESET_TIMEOUT = 8000
// ─────────────────────────────────────────────────────────────────────────────
// Haptics
// ─────────────────────────────────────────────────────────────────────────────

const haptic = {
  light:  () => navigator.vibrate?.(8),
  medium: () => navigator.vibrate?.(20),
  heavy:  () => navigator.vibrate?.(40),
  confirm:() => navigator.vibrate?.([10, 40, 20]),
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitive button components — all inline styles for zero class conflicts
// ─────────────────────────────────────────────────────────────────────────────

function GameButton({ id, label, color, size, onPress }: {
  id: string; label: string; color: string; size: 'sm' | 'md' | 'lg'
  onPress: (id: string, pressed: boolean) => void
}) {
  const [pressed, setPressed] = useState(false)
  const dim = { sm: 48, md: 60, lg: 72 }[size]

  const down = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); setPressed(true); haptic.medium(); onPress(id, true)
  }, [id, onPress])
  const up = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); setPressed(false); onPress(id, false)
  }, [id, onPress])

  return (
    <button
      onTouchStart={down} onTouchEnd={up} onTouchCancel={up}
      onMouseDown={down} onMouseUp={up}
      onMouseLeave={() => { if (pressed) { setPressed(false); onPress(id, false) } }}
      style={{
        width: dim, height: dim, borderRadius: '50%',
        backgroundColor: pressed ? '#fff' : color,
        color: pressed ? color : '#fff',
        fontSize: size === 'lg' ? 20 : size === 'md' ? 16 : 13,
        fontWeight: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: pressed ? 'scale(0.87)' : 'scale(1)',
        boxShadow: pressed ? `0 0 0 3px ${color}55,0 2px 4px rgba(0,0,0,0.4)` : `0 4px 14px rgba(0,0,0,0.55),0 0 0 1.5px ${color}30`,
        transition: 'transform 75ms ease,box-shadow 75ms ease,background-color 55ms ease',
        touchAction: 'none', WebkitTapHighlightColor: 'transparent', flexShrink: 0,
        userSelect: 'none',
      }}>
      {label}
    </button>
  )
}

function DPad({ onPress, size }: { onPress: (id: string, p: boolean) => void; size: number }) {
  const [active, setActive] = useState<Set<string>>(new Set())
  const btnSize = Math.round(size * 0.3)
  const dirs = [
    { id: 'dpad_up',    label: '▲', style: { top: 0, left: '50%', transform: 'translateX(-50%)' } },
    { id: 'dpad_down',  label: '▼', style: { bottom: 0, left: '50%', transform: 'translateX(-50%)' } },
    { id: 'dpad_left',  label: '◀', style: { left: 0, top: '50%', transform: 'translateY(-50%)' } },
    { id: 'dpad_right', label: '▶', style: { right: 0, top: '50%', transform: 'translateY(-50%)' } },
  ]
  const press = (id: string, down: boolean) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    setActive(prev => { const n = new Set(prev); down ? n.add(id) : n.delete(id); return n })
    if (down) haptic.light()
    onPress(id, down)
  }
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, touchAction: 'none' }}>
      {dirs.map(({ id, label, style: { transform: baseTransform, ...restStyle } }) => {
        const on = active.has(id)
        return (
          <button key={id} style={{
            position: 'absolute', width: btnSize, height: btnSize, borderRadius: 10,
            backgroundColor: on ? '#e2e8f0' : '#374151',
            color: on ? '#1f2937' : '#d1d5db',
            boxShadow: on ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : '0 3px 8px rgba(0,0,0,0.5)',
            transition: 'transform 55ms,background-color 55ms',
            touchAction: 'none', WebkitTapHighlightColor: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700,
            ...restStyle,
            transform: (on ? 'scale(0.9) ' : '') + (baseTransform || ''),
          }}
            onTouchStart={press(id, true)} onTouchEnd={press(id, false)} onTouchCancel={press(id, false)}
            onMouseDown={press(id, true)} onMouseUp={press(id, false)}
            onMouseLeave={e => { if (active.has(id)) press(id, false)(e) }}>
            {label}
          </button>
        )
      })}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: Math.round(size * 0.28), height: Math.round(size * 0.28),
        borderRadius: '50%', backgroundColor: '#111827', pointerEvents: 'none',
      }} />
    </div>
  )
}

function ShoulderBtn({ id, label, onPress, side }: { id: string; label: string; onPress: (id: string, p: boolean) => void; side: 'L' | 'R' }) {
  const [pressed, setPressed] = useState(false)
  const r = side === 'L' ? '12px 4px 8px 16px' : '4px 12px 16px 8px'
  const down = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(true); haptic.medium(); onPress(id, true) }
  const up   = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(false); onPress(id, false) }
  return (
    <button style={{
      flex: 1, height: 42, borderRadius: r,
      backgroundColor: pressed ? '#6b7280' : '#374151', color: '#e5e7eb',
      fontSize: 15, fontWeight: 800,
      transform: pressed ? 'translateY(2px)' : 'none',
      boxShadow: pressed ? 'none' : '0 3px 0 #1f2937',
      transition: 'transform 55ms,box-shadow 55ms',
      touchAction: 'none', WebkitTapHighlightColor: 'transparent',
    }}
      onTouchStart={down} onTouchEnd={up} onTouchCancel={up}
      onMouseDown={down} onMouseUp={up} onMouseLeave={e => { if (pressed) up(e) }}>
      {label}
    </button>
  )
}

function PillBtn({ id, label, onPress }: { id: string; label: string; onPress: (id: string, p: boolean) => void }) {
  const [pressed, setPressed] = useState(false)
  const down = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(true); haptic.heavy(); onPress(id, true) }
  const up   = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(false); onPress(id, false) }
  return (
    <button style={{
      padding: '0 20px', height: 32, borderRadius: 999,
      backgroundColor: pressed ? '#9ca3af' : '#374151', color: '#f9fafb',
      fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
      transform: pressed ? 'scale(0.93)' : 'scale(1)',
      boxShadow: pressed ? 'inset 0 1px 3px rgba(0,0,0,0.4)' : '0 2px 6px rgba(0,0,0,0.4)',
      transition: 'transform 55ms',
      touchAction: 'none', WebkitTapHighlightColor: 'transparent', minWidth: 72,
    }}
      onTouchStart={down} onTouchEnd={up} onTouchCancel={up}
      onMouseDown={down} onMouseUp={up} onMouseLeave={e => { if (pressed) up(e) }}>
      {label}
    </button>
  )
}

// Action button — for the system action bar (Pause/Reset/Mute/Fullscreen/Exit)
function ActionBtn({ id, icon, label, onPress, color = '#374151', activeColor, active = false, danger = false }: {
  id: string; icon: React.ReactNode; label: string
  onPress: (id: string) => void
  color?: string; activeColor?: string; active?: boolean; danger?: boolean
}) {
  const [pressed, setPressed] = useState(false)
  const bg = danger ? (pressed ? '#ef4444' : '#3f1515') : active ? (activeColor ?? color) : (pressed ? '#6b7280' : color)
  const down = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(true); haptic.heavy() }
  const up   = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(false); onPress(id) }
  return (
    <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}
      onTouchStart={down} onTouchEnd={up} onTouchCancel={(e) => { e.preventDefault(); setPressed(false) }}
      onMouseDown={down} onMouseUp={up} onMouseLeave={e => { if (pressed) { setPressed(false) } }}>
      <div style={{
        width: 46, height: 46, borderRadius: '50%', backgroundColor: bg,
        border: danger ? '2px solid #ef444433' : active ? `2px solid ${activeColor ?? color}88` : '2px solid #4b556330',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: pressed ? 'scale(0.88)' : 'scale(1)',
        boxShadow: pressed ? 'none' : active ? `0 0 14px ${activeColor ?? color}60` : '0 3px 8px rgba(0,0,0,0.5)',
        transition: 'transform 60ms,background-color 60ms,box-shadow 60ms',
      }}>
        {icon}
      </div>
      <span style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}>{label}</span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Face button diamond — works for 2-btn (NES) and 4-btn (SNES/GBA)
// ─────────────────────────────────────────────────────────────────────────────

function FaceCluster({ profile, onPress, btnSize }: { profile: ControllerProfile; onPress: (id: string, p: boolean) => void; btnSize: 'sm' | 'md' | 'lg' }) {
  const { buttons } = profile
  if (buttons.length < 4) {
    return (
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
        {buttons.map(b => <GameButton key={b.id} id={b.id} label={b.label} color={b.color} size={btnSize} onPress={onPress} />)}
      </div>
    )
  }
  const grid = btnSize === 'sm' ? 128 : 152
  const map: Record<string, string> = { y: '0 1', x: '1 0', b: '1 2', a: '2 1' }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: 'repeat(3,1fr)', width: grid, height: grid, gap: 4, flexShrink: 0 }}>
      {buttons.map(b => {
        const [col, row] = (map[b.id] || '1 1').split(' ')
        return (
          <div key={b.id} style={{ gridColumn: `${parseInt(col)+1}`, gridRow: `${parseInt(row)+1}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GameButton id={b.id} label={b.label} color={b.color} size={btnSize} onPress={onPress} />
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main controller component
// ─────────────────────────────────────────────────────────────────────────────

function ControllerInner() {
  const searchParams = useSearchParams()

  const [socket, setSocket]             = useState<Socket | null>(null)
  const [isConnected, setIsConnected]   = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [step, setStep]                 = useState<Step>('connect')
  const [roomCode, setRoomCode]         = useState('')
  const [joinError, setJoinError]       = useState<string | null>(null)
  const [player, setPlayer]             = useState<Player | null>(null)
  const [romName, setRomName]           = useState<string | null>(null)
  const [consoleType, setConsoleType]   = useState<ConsoleType | null>(null)
  const [gameStatus, setGameStatus]     = useState<'idle' | 'ready' | 'playing' | 'paused'>('idle')
  const [latency, setLatency]           = useState(0)
  const [isLandscape, setIsLandscape]   = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted, setIsMuted]           = useState(false)
  const [viewportH, setViewportH]       = useState(0)
  const [romError, setRomError]         = useState<{ error: string; suggestion: string } | null>(null)
  const [isUploading, setIsUploading]   = useState(false)
  const [uploadStage, setUploadStage]   = useState<'reading' | 'validating' | 'sending' | 'ready' | null>(null)

  const fileInputRef     = useRef<HTMLInputElement>(null)
  const pingRef          = useRef<NodeJS.Timeout | null>(null)
  const resetTimerRef    = useRef<NodeJS.Timeout | null>(null)
  const playerRef        = useRef<Player | null>(null)
  const roomCodeRef      = useRef('')
  const stepRef          = useRef<Step>('connect')
  const gameStatusRef    = useRef<'idle' | 'ready' | 'playing' | 'paused'>('idle')
  const socketRef        = useRef<Socket | null>(null)

  useEffect(() => { playerRef.current    = player    }, [player])
  useEffect(() => { roomCodeRef.current  = roomCode  }, [roomCode])
  useEffect(() => { stepRef.current      = step      }, [step])
  useEffect(() => { gameStatusRef.current = gameStatus }, [gameStatus])
  useEffect(() => { socketRef.current    = socket    }, [socket])

  // Wake lock — keep screen on while playing
  useWakeLock(step === 'playing')

  // Orientation + viewport height (for safe-area)
  useEffect(() => {
    const update = () => {
      setIsLandscape(window.innerWidth > window.innerHeight)
      setViewportH(window.innerHeight)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Fullscreen state sync
  useEffect(() => {
    const onChange = () => {
      const d = document as any
      setIsFullscreen(!!(d.fullscreenElement ?? d.webkitFullscreenElement))
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  const stopPing = useCallback(() => { if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null } }, [])
  const startPing = useCallback((sock: Socket) => {
    stopPing()
    pingRef.current = setInterval(() => sock.emit('ping:measure', { timestamp: Date.now() }), 2000)
  }, [stopPing])

  const cancelReset = useCallback(() => { if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null } }, [])
  const scheduleReset = useCallback(() => {
    cancelReset()
    resetTimerRef.current = setTimeout(() => {
      setStep('connect'); setPlayer(null); setRomName(null); setGameStatus('idle'); setIsReconnecting(false); stopPing()
    }, RESET_TIMEOUT)
  }, [cancelReset, stopPing])

  // URL room code
  useEffect(() => {
    const r = searchParams.get('room')
    if (r?.length === 6) setRoomCode(r)
  }, [searchParams])

  // Socket
  useEffect(() => {
    const sock = io(getWsUrl(), {
      transports: ['websocket', 'polling'], forceNew: true,
      reconnection: true, reconnectionAttempts: Infinity,
      reconnectionDelay: 1000, reconnectionDelayMax: 5000, timeout: 10000,
    })

    sock.on('connect', () => {
      setIsConnected(true); setIsReconnecting(false); cancelReset()
      const urlCode = searchParams.get('room')
      const code = roomCodeRef.current || urlCode || ''
      if (stepRef.current !== 'connect' && code) {
        sock.emit('controller:join', { code })
      } else if (urlCode?.length === 6 && stepRef.current === 'connect') {
        setStep('connecting'); sock.emit('controller:join', { code: urlCode })
      }
    })

    sock.on('disconnect', () => {
      setIsConnected(false)
      if (stepRef.current !== 'connect') { setIsReconnecting(true); scheduleReset() }
      stopPing()
    })

    sock.on('controller:joined', (data: { playerNumber: number; roomCode: string; color: PlayerColor }) => {
      setPlayer({ id: data.playerNumber, color: data.color, ready: false, latency: 0 })
      setRoomCode(data.roomCode); setIsReconnecting(false); cancelReset()
      setStep(gameStatusRef.current === 'playing' ? 'playing' : 'lobby')
      startPing(sock)
    })

    sock.on('controller:join-failed', (data: { error: string }) => {
      if (stepRef.current === 'connecting') {
        setJoinError(data.error === 'Room not found' ? 'Room not found. Check the code on your TV.' : data.error)
        setStep('connect')
      }
    })

    sock.on('tv:disconnected', () => {
      cancelReset(); setStep('connect'); setPlayer(null); setRomName(null)
      setGameStatus('idle'); setIsReconnecting(false); stopPing()
    })

    sock.on('tv:rom-loaded', (data: { romName: string; consoleType: ConsoleType }) => {
      setRomName(data.romName); setConsoleType(data.consoleType); setGameStatus('ready')
    })

    sock.on('tv:game-started', () => { setGameStatus('playing'); setStep('playing') })
    sock.on('tv:game-paused',  () => setGameStatus('paused'))
    sock.on('tv:game-resumed', () => setGameStatus('playing'))

    sock.on('tv:game-exited', () => {
      setGameStatus('idle'); setRomName(null); setConsoleType(null)
      setIsMuted(false); setStep('lobby')
    })

    sock.on('pong:measure', (data: { timestamp: number }) => {
      const ms = Date.now() - data.timestamp
      setLatency(ms)
      if (playerRef.current) sock.emit('controller:latency', { playerNumber: playerRef.current.id, latency: ms })
    })

    setSocket(sock)
    return () => { stopPing(); cancelReset(); sock.disconnect() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Actions ────────────────────────────────────────────────────────────────

  const joinRoom = useCallback((code: string) => {
    const s = socketRef.current
    if (s && isConnected && code.length === 6) {
      setStep('connecting'); s.emit('controller:join', { code })
    }
  }, [isConnected])

  const uploadROM = useCallback(async (file: File) => {
    const s = socketRef.current
    if (!s || !playerRef.current) return

    setRomError(null)
    setIsUploading(true)
    setUploadStage('reading')

    try {
      // Stage 1: read file
      const buf = await file.arrayBuffer()

      // Stage 2: validate
      setUploadStage('validating')
      const result = await validateROM(file)
      if (!result.valid) {
        setRomError({ error: result.error!, suggestion: result.suggestion! })
        haptic.heavy()
        return
      }

      // Stage 3: send to TV
      setUploadStage('sending')
      const ct = getEmulatorConsoleType(result.consoleType!) as ConsoleType
      const name = file.name.replace(/\.[^/.]+$/, '')
      s.emit('controller:upload-rom', { romData: buf, romName: name, consoleType: ct, uploadedBy: playerRef.current.id })

      // Stage 4: ready
      setUploadStage('ready')
      setRomName(name); setConsoleType(ct); setGameStatus('ready')
      haptic.confirm()
      await new Promise(r => setTimeout(r, 600))
    } finally {
      setIsUploading(false)
      setUploadStage(null)
    }
  }, [])

  const setReady = useCallback((r: boolean) => {
    const s = socketRef.current; const p = playerRef.current
    if (!s || !p) return
    s.emit('controller:ready', { playerId: p.id, ready: r })
    setPlayer(prev => prev ? { ...prev, ready: r } : null)
  }, [])

  const startGame = useCallback(() => {
    const s = socketRef.current; if (!s) return
    haptic.confirm(); s.emit('controller:start-game')
  }, [])

  // Raw game input
  const sendInput = useCallback((buttonId: string, pressed: boolean) => {
    const s = socketRef.current; const p = playerRef.current
    if (!s || !p || gameStatusRef.current !== 'playing') return
    s.emit('controller:input', { playerId: p.id, buttonId, pressed, timestamp: Date.now() })
  }, [])

  // System actions — one-shot on press only
  const doAction = useCallback((id: string) => {
    const s = socketRef.current; if (!s) return
    switch (id) {
      case 'pause':      s.emit('controller:pause');             break
      case 'reset':      s.emit('controller:reset');             break
      case 'mute':       s.emit('controller:mute'); setIsMuted(m => !m); break
      case 'fullscreen': s.emit('controller:toggle-fullscreen'); break
      case 'save':       s.emit('controller:save-state');        break
      case 'load':       s.emit('controller:load-state');        break
      case 'menu':       s.emit('controller:menu');              break
      case 'exit':       s.emit('controller:exit-game');         break
    }
  }, [])

  // ── Reconnect banner ───────────────────────────────────────────────────────

  const ReconnectBanner = () => isReconnecting ? (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99,
      backgroundColor: '#f59e0b', color: '#000',
      padding: '8px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <RefreshCw style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
      Reconnecting — session held for 8s
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  ) : null

  // ── Connect screen ─────────────────────────────────────────────────────────

  if (step === 'connect' || step === 'connecting') {
    return (
      <div style={{
        minHeight: '100dvh', background: 'linear-gradient(180deg,#030712,#111827)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        paddingTop: 'max(16px,env(safe-area-inset-top))',
        paddingBottom: 'max(16px,env(safe-area-inset-bottom))',
        fontFamily: 'system-ui,sans-serif',
      }}>
        <ReconnectBanner />
        <div style={{
          background: 'rgba(17,24,39,0.85)', border: '1px solid rgba(6,182,212,0.18)',
          borderRadius: 24, padding: 32, maxWidth: 360, width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 72, height: 72, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.18)',
              borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <Gamepad2 style={{ width: 36, height: 36, color: '#22d3ee' }} />
            </div>
            <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 900, margin: 0 }}>NOSTALGIA CONSOLE</h1>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '6px 0 0' }}>Enter the room code shown on your TV</p>
          </div>

          {/* Join error */}
          {joinError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '10px 14px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15 }}>⚠️</span>
              <p style={{ color: '#fca5a5', fontSize: 13, fontWeight: 600, margin: 0 }}>{joinError}</p>
              <button onClick={() => setJoinError(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', marginLeft: 'auto', padding: 0, flexShrink: 0 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
            {[0,1,2,3,4,5].map(i => (
              <input key={i} id={`rc-${i}`} type="text" maxLength={6} inputMode="numeric"
                style={{
                  width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 900,
                  background: '#1f2937',
                  border: `2px solid ${joinError ? 'rgba(239,68,68,0.5)' : '#374151'}`,
                  borderRadius: 12,
                  color: '#fff', outline: 'none', transition: 'border-color 0.15s',
                }}
                value={roomCode[i] || ''}
                onFocus={e => { setJoinError(null); e.target.style.borderColor = '#22d3ee' }}
                onBlur={e => (e.target.style.borderColor = joinError ? 'rgba(239,68,68,0.5)' : '#374151')}
                onPaste={e => {
                  e.preventDefault()
                  const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
                  if (digits.length === 6) {
                    setRoomCode(digits)
                    setJoinError(null)
                    ;(document.getElementById(`rc-5`) as HTMLInputElement)?.focus()
                  }
                }}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '')
                  if (val.length > 1) {
                    const digits = val.slice(0,6).split('')
                    const nc = roomCode.padEnd(6,' ').split('')
                    digits.forEach((d,idx) => { if (i+idx < 6) nc[i+idx] = d })
                    setRoomCode(nc.join('').trimEnd().slice(0,6))
                    ;(document.getElementById(`rc-${Math.min(i+digits.length,5)}`) as HTMLInputElement)?.focus()
                    return
                  }
                  const nc = roomCode.padEnd(6,' ').split('')
                  nc[i] = val || ' '
                  setRoomCode(nc.join('').trimEnd())
                  if (val && i < 5) (document.getElementById(`rc-${i+1}`) as HTMLInputElement)?.focus()
                }}
                onKeyDown={e => {
                  if (e.key === 'Backspace' && !roomCode[i] && i > 0)
                    (document.getElementById(`rc-${i-1}`) as HTMLInputElement)?.focus()
                  if (e.key === 'Enter' && roomCode.replace(/ /g,'').length === 6)
                    joinRoom(roomCode.replace(/ /g,''))
                }}
              />
            ))}
          </div>

          <button
            onClick={() => joinRoom(roomCode.replace(/ /g,''))}
            disabled={!isConnected || roomCode.replace(/ /g,'').length !== 6 || step === 'connecting'}
            style={{
              width: '100%', height: 52, background: isConnected ? '#0e7490' : '#374151',
              color: '#fff', fontSize: 17, fontWeight: 800, borderRadius: 16,
              border: 'none', cursor: isConnected ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: (!isConnected || roomCode.replace(/ /g,'').length !== 6) ? 0.4 : 1,
              transition: 'opacity 0.2s',
            }}>
            {step === 'connecting'
              ? <><div style={{ width: 18, height: 18, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />Connecting...</>
              : <><Wifi style={{ width: 18, height: 18 }} />Connect</>}
          </button>

          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
            {isConnected
              ? <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Wifi style={{ width: 12, height: 12 }} />Server Online</span>
              : <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><WifiOff style={{ width: 12, height: 12 }} />Connecting to server...</span>}
          </div>
        </div>
      </div>
    )
  }

  // ── Lobby screen ───────────────────────────────────────────────────────────

  if (step === 'lobby') {
    const cs = PLAYER_COLORS[player?.color || 'red']
    return (
      <div style={{
        minHeight: '100dvh', background: 'linear-gradient(180deg,#030712,#111827)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
        fontFamily: 'system-ui,sans-serif',
      }}>
        <ReconnectBanner />

        {/* Player header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', backgroundColor: cs.primary,
              boxShadow: `0 0 14px ${cs.primary}60`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 17, color: '#fff',
            }}>{player?.id ?? '?'}</div>
            <div>
              <p style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: 0 }}>Player {player?.id}</p>
              <p style={{ color: '#6b7280', fontSize: 11, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Zap style={{ width: 10, height: 10 }} />{latency}ms
              </p>
            </div>
          </div>
          <div style={{ color: '#22d3ee', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 8, padding: '4px 12px', fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>
            {roomCode}
          </div>
        </div>

        <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* ROM section */}
          {!romName ? (
            <>
              {romError && (
                <div style={{
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12,
                }}>
                  <AlertCircle style={{ width: 20, height: 20, color: '#f87171', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ color: '#fca5a5', fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>{romError.error}</p>
                    <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>{romError.suggestion}</p>
                  </div>
                  <button onClick={() => setRomError(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                    <X style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              )}

              {/* Validation stage indicator */}
              {isUploading && uploadStage && (
                <div style={{
                  background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)',
                  borderRadius: 16, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(
                      [
                        { key: 'reading',   label: 'Reading file…',      color: '#22d3ee' },
                        { key: 'validating',label: 'Detecting console…', color: '#a78bfa' },
                        { key: 'sending',   label: 'Sending to TV…',     color: '#4ade80' },
                        { key: 'ready',     label: 'Ready to launch!',   color: '#f59e0b' },
                      ] as { key: string; label: string; color: string }[]
                    ).map(({ key, label, color }) => {
                      const stages = ['reading', 'validating', 'sending', 'ready']
                      const stageIdx = stages.indexOf(uploadStage!)
                      const thisIdx  = stages.indexOf(key)
                      const done     = thisIdx < stageIdx
                      const active   = thisIdx === stageIdx
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: done ? `${color}30` : active ? `${color}18` : 'rgba(255,255,255,0.04)',
                            border: `1.5px solid ${done || active ? color : 'rgba(255,255,255,0.08)'}`,
                          }}>
                            {done
                              ? <span style={{ color, fontSize: 11 }}>✓</span>
                              : active
                                ? <div style={{ width: 8, height: 8, border: `2px solid ${color}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                : null}
                          </div>
                          <span style={{
                            fontSize: 13, fontWeight: active ? 700 : 500,
                            color: done ? '#6b7280' : active ? '#fff' : '#374151',
                          }}>{label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div
                onClick={() => !isUploading && fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${romError ? '#ef4444' : '#374151'}`, borderRadius: 20, padding: 32,
                  textAlign: 'center', cursor: isUploading ? 'default' : 'pointer',
                  transition: 'border-color 0.2s', opacity: isUploading ? 0.4 : 1,
                }}
                onTouchStart={e => { if (!isUploading) e.currentTarget.style.borderColor = '#22d3ee' }}
                onTouchEnd={e => (e.currentTarget.style.borderColor = romError ? '#ef4444' : '#374151')}>
                <Upload style={{ width: 44, height: 44, color: '#6b7280', margin: '0 auto 12px', display: 'block' }} />
                <p style={{ color: '#fff', fontSize: 17, fontWeight: 700, margin: '0 0 6px' }}>Upload ROM</p>
                <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>NES · SNES · GBA · GB · GBC · Genesis · SMS</p>
                <input ref={fileInputRef} type="file" accept={getSupportedExtensions()} style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { uploadROM(f); e.target.value = '' } }} />
              </div>
            </>
          ) : (
            <div style={{
              background: 'rgba(31,41,55,0.7)', border: '1px solid rgba(74,222,128,0.2)',
              borderRadius: 20, padding: 16, display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ width: 48, height: 48, background: 'rgba(74,222,128,0.12)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Check style={{ width: 22, height: 22, color: '#4ade80' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: '#fff', fontWeight: 800, fontSize: 15, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{romName}</p>
                <p style={{ color: '#9ca3af', fontSize: 12, margin: '3px 0 0' }}>{{ nes:'NES', snes:'SNES', gba:'GBA', gb:'Game Boy', gbc:'Game Boy Color', genesis:'Genesis', sms:'Master System' }[consoleType || 'nes'] ?? consoleType?.toUpperCase()}</p>
              </div>
              <button onClick={() => { setRomName(null); setGameStatus('idle') }}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>
          )}

          {romName && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => setReady(!player?.ready)}
                style={{
                  width: '100%', height: 54, borderRadius: 18,
                  backgroundColor: player?.ready ? '#15803d' : '#0e7490',
                  color: '#fff', fontSize: 18, fontWeight: 800, border: 'none', cursor: 'pointer',
                  boxShadow: player?.ready ? '0 0 24px rgba(22,163,74,0.35)' : '0 0 20px rgba(8,145,178,0.25)',
                  transition: 'transform 0.1s', transform: 'scale(1)',
                }}>
                {player?.ready ? '✓  Ready!' : 'Press Ready'}
              </button>

              {player?.ready && (
                <button
                  onClick={startGame}
                  style={{
                    width: '100%', height: 54, borderRadius: 18,
                    backgroundColor: '#7c3aed', color: '#fff', fontSize: 18, fontWeight: 800, border: 'none', cursor: 'pointer',
                    boxShadow: '0 0 28px rgba(124,58,237,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  <Play style={{ width: 20, height: 20 }} />Start Game
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Playing — full controller OS ───────────────────────────────────────────

  if (step === 'playing') {
    const profile      = consoleType ? getProfileForConsole(consoleType) : NES_PROFILE
    const cs           = PLAYER_COLORS[player?.color || 'red']
    const hasShoulders = profile.systemButtons.some(b => b.id === 'l' || b.id === 'r')
    const systemBtns   = profile.systemButtons.filter(b => b.id !== 'l' && b.id !== 'r')

    const dpadSize  = isLandscape ? 140 : 168
    const btnSize: 'sm' | 'md' = isLandscape ? 'sm' : 'md'

    return (
      <div style={{
        position: 'fixed', inset: 0,
        backgroundColor: profile.theme.background,
        display: 'flex', flexDirection: 'column',
        paddingTop:    'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft:   'env(safe-area-inset-left)',
        paddingRight:  'env(safe-area-inset-right)',
        touchAction: 'none', userSelect: 'none',
        fontFamily: 'system-ui,sans-serif',
        height: viewportH || '100dvh',
      }}>
        <ReconnectBanner />

        {/* Status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 16px', backgroundColor: 'rgba(0,0,0,0.35)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: cs.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: '#fff', flexShrink: 0 }}>
              {player?.id}
            </div>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{romName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {gameStatus === 'paused' && <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 800 }}>PAUSED</span>}
            {isMuted && <span style={{ color: '#9ca3af', fontSize: 11 }}>🔇</span>}
            <span style={{ color: '#4ade80', fontSize: 11, fontFamily: 'monospace' }}>{latency}ms</span>
          </div>
        </div>

        {/* Shoulder buttons */}
        {hasShoulders && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 12px 0', flexShrink: 0 }}>
            <ShoulderBtn id="l" label="L" onPress={sendInput} side="L" />
            <ShoulderBtn id="r" label="R" onPress={sendInput} side="R" />
          </div>
        )}

        {isLandscape ? (
          /* ── Landscape layout ── */
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', gap: 12, minHeight: 0 }}>
            <DPad onPress={sendInput} size={dpadSize} />

            {/* Center column */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              {/* Start / Select */}
              <div style={{ display: 'flex', gap: 10 }}>
                {systemBtns.map(b => <PillBtn key={b.id} id={b.id} label={b.label} onPress={sendInput} />)}
              </div>
              {/* Action row */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                <ActionBtn id="pause" icon={gameStatus === 'paused' ? <Play style={{width:18,height:18,color:'#fff'}} /> : <span style={{fontSize:17}}>⏸</span>} label={gameStatus === 'paused' ? 'Resume' : 'Pause'} onPress={doAction} active={gameStatus === 'paused'} activeColor="#f59e0b" />
                <ActionBtn id="reset" icon={<RotateCcw style={{width:17,height:17,color:'#fff'}} />} label="Reset" onPress={doAction} />
                <ActionBtn id="save" icon={<Save style={{width:17,height:17,color:'#fff'}} />} label="Save" onPress={doAction} />
                <ActionBtn id="load" icon={<FolderOpen style={{width:17,height:17,color:'#fff'}} />} label="Load" onPress={doAction} />
                <ActionBtn id="mute" icon={isMuted ? <VolumeX style={{width:17,height:17,color:'#fff'}} /> : <Volume2 style={{width:17,height:17,color:'#fff'}} />} label={isMuted ? 'Unmute' : 'Mute'} onPress={doAction} active={isMuted} activeColor="#6b7280" />
                <ActionBtn id="fullscreen" icon={isFullscreen ? <Minimize style={{width:17,height:17,color:'#a78bfa'}} /> : <Maximize style={{width:17,height:17,color:'#a78bfa'}} />} label={isFullscreen ? 'Exit FS' : 'Full'} onPress={doAction} color="#1e1b4b" activeColor="#7c3aed" />
                <ActionBtn id="menu" icon={<Menu style={{width:17,height:17,color:'#fff'}} />} label="Menu" onPress={doAction} />
                <ActionBtn id="exit" icon={<X style={{width:18,height:18,color:'#fff'}} />} label="Exit" onPress={doAction} danger />
              </div>
            </div>

            <FaceCluster profile={profile} onPress={sendInput} btnSize={btnSize} />
          </div>
        ) : (
          /* ── Portrait layout ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 16px 4px', gap: 0, minHeight: 0 }}>
            {/* Main controls row */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 0 }}>
              <DPad onPress={sendInput} size={dpadSize} />
              <FaceCluster profile={profile} onPress={sendInput} btnSize={btnSize} />
            </div>

            {/* Start / Select */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, padding: '8px 0 4px' }}>
              {systemBtns.map(b => <PillBtn key={b.id} id={b.id} label={b.label} onPress={sendInput} />)}
            </div>

            {/* Action bar — 2 rows on portrait so buttons never overlap */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0 2px', alignItems: 'center' }}>
              {/* Row 1: game controls */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
                <ActionBtn id="pause" icon={gameStatus === 'paused' ? <Play style={{width:18,height:18,color:'#fff'}} /> : <span style={{fontSize:18}}>⏸</span>} label={gameStatus === 'paused' ? 'Resume' : 'Pause'} onPress={doAction} active={gameStatus === 'paused'} activeColor="#f59e0b" />
                <ActionBtn id="reset" icon={<RotateCcw style={{width:17,height:17,color:'#fff'}} />} label="Reset" onPress={doAction} />
                <ActionBtn id="save" icon={<Save style={{width:17,height:17,color:'#fff'}} />} label="Save" onPress={doAction} />
                <ActionBtn id="load" icon={<FolderOpen style={{width:17,height:17,color:'#fff'}} />} label="Load" onPress={doAction} />
              </div>
              {/* Row 2: system controls */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
                <ActionBtn id="mute" icon={isMuted ? <VolumeX style={{width:17,height:17,color:'#fff'}} /> : <Volume2 style={{width:17,height:17,color:'#fff'}} />} label={isMuted ? 'Unmute' : 'Mute'} onPress={doAction} active={isMuted} activeColor="#6b7280" />
                <ActionBtn id="fullscreen" icon={isFullscreen ? <Minimize style={{width:17,height:17,color:'#a78bfa'}} /> : <Maximize style={{width:17,height:17,color:'#a78bfa'}} />} label={isFullscreen ? 'Exit FS' : 'Full'} onPress={doAction} color="#1e1b4b" activeColor="#7c3aed" />
                <ActionBtn id="menu" icon={<Menu style={{width:17,height:17,color:'#fff'}} />} label="Menu" onPress={doAction} />
                <ActionBtn id="exit" icon={<X style={{width:18,height:18,color:'#fff'}} />} label="Exit" onPress={doAction} danger />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}

export default function ControllerPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', backgroundColor: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #22d3ee', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <ControllerInner />
    </Suspense>
  )
}
