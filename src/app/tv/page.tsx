'use client'

import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { io, Socket } from 'socket.io-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PLAYER_COLORS, PlayerColor } from '@/lib/game-session-manager'
import { getEmulatorAdapter, destroyEmulatorAdapter } from '@/lib/emulator-adapter'
import { getInputRouter } from '@/lib/input-router'
import { getTVSessionManager, resetTVSessionManager, ConsoleType } from '@/lib/game-session-manager'
import { Wifi, WifiOff, Gamepad2, Play, Pause, Monitor, AlertCircle, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'
import { getWsUrl } from '@/lib/ws-url'
import { useWakeLock } from '@/hooks/use-wake-lock'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TVPlayer {
  id: number; connected: boolean; ready: boolean
  color: PlayerColor; name: string; latency: number
}

interface TVSession {
  roomCode: string
  status: 'idle' | 'rom-loaded' | 'playing'
  romName: string | null; romData: Uint8Array | null; consoleType: ConsoleType | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay queue — entering → visible → leaving → removed
// ─────────────────────────────────────────────────────────────────────────────

type OverlayPhase = 'entering' | 'visible' | 'leaving'
interface OverlayItem { id: string; player: TVPlayer; phase: OverlayPhase }
type OverlayAction =
  | { type: 'enqueue'; player: TVPlayer }
  | { type: 'transition'; id: string; phase: OverlayPhase }
  | { type: 'remove'; id: string }

function overlayReducer(state: OverlayItem[], action: OverlayAction): OverlayItem[] {
  switch (action.type) {
    case 'enqueue':    return [...state, { id: `${action.player.id}-${Date.now()}`, player: action.player, phase: 'entering' }]
    case 'transition': return state.map(o => o.id === action.id ? { ...o, phase: action.phase } : o)
    case 'remove':     return state.filter(o => o.id !== action.id)
    default:           return state
  }
}

const ENTER_MS = 400
const HOLD_MS  = 2500
const LEAVE_MS = 400

function OverlayManager({ overlays, dispatch }: { overlays: OverlayItem[]; dispatch: React.Dispatch<OverlayAction> }) {
  const key = overlays.map(o => `${o.id}:${o.phase}`).join(',')
  useEffect(() => {
    const timers = overlays.map(o => {
      if (o.phase === 'entering') return setTimeout(() => dispatch({ type: 'transition', id: o.id, phase: 'visible'  }), ENTER_MS)
      if (o.phase === 'visible')  return setTimeout(() => dispatch({ type: 'transition', id: o.id, phase: 'leaving'  }), HOLD_MS)
      if (o.phase === 'leaving')  return setTimeout(() => dispatch({ type: 'remove',     id: o.id                   }), LEAVE_MS)
      return null
    }).filter((t): t is NodeJS.Timeout => t !== null)
    return () => { timers.forEach(clearTimeout) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!overlays.length) return null
  return (
    <div style={{ position: 'fixed', top: 80, left: 0, right: 0, zIndex: 50, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '0 16px' }}>
      {overlays.map((o, i) => {
        const cs = PLAYER_COLORS[o.player.color]
        const out = o.phase !== 'visible'
        return (
          <div key={o.id} style={{
            transform: out ? 'translateY(-24px) scale(0.85)' : 'translateY(0) scale(1)',
            opacity: out ? 0 : 1,
            transition: `transform ${out ? LEAVE_MS : ENTER_MS}ms cubic-bezier(0.34,1.56,0.64,1), opacity ${out ? LEAVE_MS : ENTER_MS}ms ease`,
            marginTop: i > 0 ? 4 : 0,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              borderRadius: 20, padding: '12px 20px',
              background: `linear-gradient(135deg,${cs.primary}30,${cs.primary}15)`,
              border: `1.5px solid ${cs.primary}60`,
              boxShadow: `0 12px 40px ${cs.primary}35, 0 0 0 1px ${cs.primary}20`,
              backdropFilter: 'blur(16px)', minWidth: 280,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                backgroundColor: cs.primary, boxShadow: `0 0 20px ${cs.primary}80`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 22, color: '#fff', flexShrink: 0,
              }}>{o.player.id}</div>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#fff', fontWeight: 800, fontSize: 18, margin: 0, lineHeight: 1.2 }}>Player {o.player.id} Joined!</p>
                <p style={{ color: cs.text, fontSize: 13, margin: '3px 0 0' }}>Controller connected</p>
              </div>
              <Gamepad2 style={{ width: 20, height: 20, color: cs.text, flexShrink: 0 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Splash screen
// ─────────────────────────────────────────────────────────────────────────────

function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: '#000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: 'splashFade 0.5s ease 2s forwards',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        {/* Logo */}
        <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '3px solid rgba(168,85,247,0.3)',
            animation: 'pingRing 1.6s ease infinite',
          }} />
          <div style={{
            position: 'absolute', inset: 10, borderRadius: '50%',
            border: '2px solid rgba(168,85,247,0.2)',
          }} />
          <div style={{
            width: 88, height: 88, borderRadius: 24,
            background: 'radial-gradient(circle at 35% 35%, rgba(124,58,237,0.5), rgba(6,2,15,0.9))',
            border: '1.5px solid rgba(124,58,237,0.5)',
            boxShadow: '0 0 50px rgba(124,58,237,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Gamepad2 style={{ width: 44, height: 44, color: '#a78bfa' }} />
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 56, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>NOSTALGIA</h1>
          <p style={{
            fontSize: 16, fontWeight: 700, letterSpacing: '0.6em',
            background: 'linear-gradient(90deg, #a78bfa, #22d3ee)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            margin: '8px 0 0',
          }}>CONSOLE</p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%', backgroundColor: '#7c3aed',
              animation: `dotBounce 0.9s ease ${i * 0.15}s infinite`,
            }} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes splashFade { to { opacity: 0; pointer-events: none; } }
        @keyframes pingRing { 0% { transform: scale(1); opacity: 0.4; } 100% { transform: scale(1.4); opacity: 0; } }
        @keyframes dotBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Launch countdown
// ─────────────────────────────────────────────────────────────────────────────

function LaunchSequence({ romName, consoleType, onDone }: { romName: string; consoleType: string | null; onDone: () => void }) {
  const [count, setCount] = useState(3)
  const [phase, setPhase] = useState<'count' | 'go'>('count')

  useEffect(() => {
    if (count === 0) {
      setPhase('go')
      const t = setTimeout(onDone, 700)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCount(c => c - 1), 900)
    return () => clearTimeout(t)
  }, [count, onDone])

  const consoleLabel: Record<string, string> = {
    nes: 'Nintendo Entertainment System', snes: 'Super Nintendo',
    gba: 'Game Boy Advance', gb: 'Game Boy', gbc: 'Game Boy Color',
    genesis: 'Sega Genesis', sms: 'Sega Master System',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'radial-gradient(ellipse at center, #1a0a2e 0%, #000 70%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
    }}>
      <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: 13, fontWeight: 700, letterSpacing: '0.4em', textTransform: 'uppercase', margin: 0 }}>
        {consoleLabel[consoleType || ''] || 'Now Loading'}
      </p>
      <p style={{ color: '#fff', fontSize: 42, fontWeight: 900, margin: 0, letterSpacing: '-0.01em', textAlign: 'center', maxWidth: 700, padding: '0 32px' }}>
        {romName}
      </p>
      <div style={{
        fontSize: phase === 'go' ? 80 : 120,
        fontWeight: 900,
        color: phase === 'go' ? '#4ade80' : '#a78bfa',
        textShadow: phase === 'go' ? '0 0 80px #4ade8088' : '0 0 100px #a855f788',
        minWidth: '1.2ch', textAlign: 'center', lineHeight: 1,
        transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        fontFamily: 'system-ui,sans-serif',
      }}>
        {phase === 'go' ? 'GO!' : count}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[3, 2, 1].map(n => (
          <div key={n} style={{
            width: 10, height: 10, borderRadius: '50%',
            backgroundColor: count <= n ? '#7c3aed' : 'rgba(124,58,237,0.2)',
            transition: 'background-color 0.3s ease',
          }} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Menu
// ─────────────────────────────────────────────────────────────────────────────

interface QuickMenuProps {
  onResume: () => void; onSave: () => void; onLoad: () => void
  onReset: () => void; onMute: () => void; onExit: () => void; isMuted: boolean
}

function QuickMenu({ onResume, onSave, onLoad, onReset, onMute, onExit, isMuted }: QuickMenuProps) {
  const items = [
    { label: '▶  Resume',     action: onResume, accent: '#4ade80' },
    { label: '💾  Save State', action: onSave,   accent: null },
    { label: '📂  Load State', action: onLoad,   accent: null },
    { label: '🔄  Restart',   action: onReset,  accent: null },
    { label: isMuted ? '🔊  Unmute' : '🔇  Mute', action: onMute, accent: null },
    { label: '🚪  Exit Game', action: onExit,   accent: '#f87171' },
  ]
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80,
      background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 8 }}>Quick Menu</p>
      {items.map(({ label, action, accent }) => (
        <button key={label} onClick={action} style={{
          width: 320, padding: '14px 24px', borderRadius: 18,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
          color: accent || '#fff', fontWeight: 700, fontSize: 17, textAlign: 'left',
          cursor: 'pointer', transition: 'background 0.1s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}>
          {label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TV lobby — 10-foot UI
// ─────────────────────────────────────────────────────────────────────────────

const CONSOLE_NAMES: Record<string, string> = {
  nes: 'NES', snes: 'SNES', gba: 'GBA', gb: 'Game Boy', gbc: 'GBC',
  genesis: 'Genesis', sms: 'Master System',
}

function TVLobby({
  session, players, qrCodeUrl, isConnected,
}: {
  session: TVSession
  players: TVPlayer[]
  qrCodeUrl: string
  isConnected: boolean
}) {
  const [pulse, setPulse] = useState(false)
  const connectedPlayers = players.filter(p => p.connected)

  // Pulse the QR every 3s to draw attention
  useEffect(() => {
    const t = setInterval(() => { setPulse(true); setTimeout(() => setPulse(false), 600) }, 3000)
    return () => clearInterval(t)
  }, [])

  if (session.status === 'rom-loaded') {
    // Ready-up screen
    const allReady = connectedPlayers.length > 0 && connectedPlayers.every(p => p.ready)
    const readyCount = connectedPlayers.filter(p => p.ready).length

    return (
      <div style={{ textAlign: 'center', maxWidth: 900, width: '100%', padding: '0 32px' }}>
        {/* Console badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)',
          borderRadius: 999, padding: '6px 18px', marginBottom: 20,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#a78bfa', boxShadow: '0 0 8px #a855f7' }} />
          <span style={{ color: '#a78bfa', fontSize: 13, fontWeight: 700, letterSpacing: '0.2em' }}>
            {CONSOLE_NAMES[session.consoleType || ''] || session.consoleType?.toUpperCase()}
          </span>
        </div>

        <h2 style={{
          color: '#fff', fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 900,
          margin: '0 0 40px', letterSpacing: '-0.02em', lineHeight: 1.1,
        }}>{session.romName}</h2>

        {/* Player ready grid */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 40 }}>
          {connectedPlayers.length === 0 ? (
            <p style={{ color: '#4b5563', fontSize: 22 }}>Waiting for players to scan QR code…</p>
          ) : connectedPlayers.map(p => {
            const cs = PLAYER_COLORS[p.color]
            return (
              <div key={p.id} style={{
                width: 140, padding: '20px 16px',
                borderRadius: 24, textAlign: 'center',
                background: `${cs.primary}15`,
                border: `2px solid ${p.ready ? cs.primary : 'rgba(255,255,255,0.06)'}`,
                boxShadow: p.ready ? `0 0 30px ${cs.primary}40` : 'none',
                transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                transform: p.ready ? 'scale(1.06)' : 'scale(1)',
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  backgroundColor: cs.primary, boxShadow: p.ready ? `0 0 20px ${cs.primary}80` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 26, color: '#fff', margin: '0 auto 12px',
                  transition: 'box-shadow 0.3s',
                }}>{p.id}</div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: '0 0 6px' }}>Player {p.id}</p>
                <p style={{
                  fontSize: 12, fontWeight: 800, letterSpacing: '0.1em',
                  color: p.ready ? '#4ade80' : '#6b7280',
                }}>{p.ready ? '✓ READY' : 'WAITING'}</p>
              </div>
            )
          })}
        </div>

        {/* Status line */}
        <div style={{ fontSize: 20, color: '#6b7280' }}>
          {allReady
            ? <span style={{ color: '#4ade80', fontWeight: 700 }}>🎮 All ready — launching…</span>
            : connectedPlayers.length > 0
              ? `${readyCount} / ${connectedPlayers.length} ready`
              : null}
        </div>
      </div>
    )
  }

  // Idle — main lobby
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 32, maxWidth: 1100, width: '100%', padding: '0 32px', alignItems: 'stretch' }}>

      {/* Left — QR + room code */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 32, padding: '48px 40px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
        backdropFilter: 'blur(12px)',
      }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', margin: 0 }}>
          Scan to Play
        </p>

        {/* QR with animated ring */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            position: 'absolute', inset: -12, borderRadius: 28,
            border: '2px solid rgba(124,58,237,0.4)',
            transform: pulse ? 'scale(1.04)' : 'scale(1)',
            opacity: pulse ? 0 : 1,
            transition: 'transform 0.6s ease, opacity 0.6s ease',
          }} />
          <div style={{
            background: '#fff', borderRadius: 20, padding: 16,
            boxShadow: `0 0 ${pulse ? '40px' : '20px'} rgba(124,58,237,${pulse ? '0.5' : '0.2'})`,
            transition: 'box-shadow 0.6s ease',
          }}>
            {qrCodeUrl
              ? <img src={qrCodeUrl} alt="QR Code" style={{ width: 200, height: 200, display: 'block' }} />
              : <div style={{ width: 200, height: 200, background: '#f3f4f6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 32, height: 32, border: '3px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                </div>
            }
          </div>
        </div>

        {/* Room code */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#4b5563', fontSize: 13, margin: '0 0 8px' }}>or enter room code</p>
          <div style={{
            background: 'rgba(124,58,237,0.1)',
            border: '2px solid rgba(124,58,237,0.4)',
            borderRadius: 16, padding: '10px 28px',
            fontFamily: 'monospace',
          }}>
            <span style={{ color: '#fff', fontSize: 40, fontWeight: 900, letterSpacing: '0.3em' }}>
              {session.roomCode || '——'}
            </span>
          </div>
        </div>

        <p style={{ color: '#374151', fontSize: 13, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
          Point your phone camera at the QR code to connect
        </p>
      </div>

      {/* Right — players + status */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 32, padding: '48px 40px',
        display: 'flex', flexDirection: 'column', gap: 28,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', margin: 0 }}>
            Players
          </p>
          <span style={{
            background: isConnected ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)',
            border: `1px solid ${isConnected ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}`,
            color: isConnected ? '#4ade80' : '#fbbf24',
            borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {isConnected
              ? <><Wifi style={{ width: 12, height: 12 }} />Live</>
              : <><WifiOff style={{ width: 12, height: 12 }} />Reconnecting</>}
          </span>
        </div>

        {/* 2×2 player grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1 }}>
          {[1, 2, 3, 4].map(num => {
            const p = players.find(x => x.id === num)
            const colorKey = (['red', 'blue', 'green', 'yellow'] as PlayerColor[])[num - 1]
            const cs = PLAYER_COLORS[p?.color ?? colorKey]
            const connected = p?.connected ?? false

            return (
              <div key={num} style={{
                borderRadius: 20, padding: '20px 16px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                background: connected ? `${cs.primary}12` : 'rgba(255,255,255,0.02)',
                border: `2px ${connected ? 'solid' : 'dashed'} ${connected ? cs.primary : 'rgba(255,255,255,0.08)'}`,
                boxShadow: connected ? `0 0 24px ${cs.primary}25` : 'none',
                transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                transform: connected ? 'scale(1.02)' : 'scale(1)',
                opacity: connected ? 1 : 0.45,
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  backgroundColor: connected ? cs.primary : '#1f2937',
                  boxShadow: connected ? `0 0 16px ${cs.primary}70` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s ease',
                }}>
                  {connected
                    ? <span style={{ color: '#fff', fontSize: 22, fontWeight: 900 }}>{num}</span>
                    : <Gamepad2 style={{ width: 26, height: 26, color: '#374151' }} />}
                </div>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>P{num}</span>
                {connected && p && p.latency > 0 && (
                  <span style={{
                    fontSize: 11, color: p.latency < 60 ? '#4ade80' : p.latency < 120 ? '#fbbf24' : '#f87171',
                    fontFamily: 'monospace', fontWeight: 700,
                  }}>{p.latency}ms</span>
                )}
                {!connected && (
                  <span style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>Scan to join</span>
                )}
              </div>
            )
          })}
        </div>

        <p style={{ color: '#374151', fontSize: 14, textAlign: 'center', margin: 0 }}>
          Upload a ROM from your phone after connecting
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fullscreen helpers
// ─────────────────────────────────────────────────────────────────────────────

function fsRequest(el: Element): Promise<void> {
  if (el.requestFullscreen) return el.requestFullscreen()
  const w = el as any
  return w.webkitRequestFullscreen?.() ?? w.mozRequestFullScreen?.() ?? Promise.reject()
}
function fsExit(): Promise<void> {
  if (document.exitFullscreen) return document.exitFullscreen()
  const d = document as any
  return d.webkitExitFullscreen?.() ?? d.mozCancelFullScreen?.() ?? Promise.resolve()
}
function fsElement(): Element | null {
  const d = document as any
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? d.mozFullScreenElement ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// TV Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TVPage() {
  const [isConnected, setIsConnected]   = useState(false)
  const [showSplash, setShowSplash]     = useState(true)
  const [launchRomName, setLaunchRomName] = useState<string | null>(null)
  const [pendingLaunch, setPendingLaunch] = useState(false)
  const [session, setSession]           = useState<TVSession>({ roomCode: '', status: 'idle', romName: null, romData: null, consoleType: null })
  const [players, setPlayers]           = useState<TVPlayer[]>([])
  const [qrCodeUrl, setQrCodeUrl]       = useState('')
  const [isPaused, setIsPaused]         = useState(false)
  const [isMuted, setIsMuted]           = useState(false)
  const [emulatorError, setEmulatorError] = useState<string | null>(null)
  const [emulatorStatus, setEmulatorStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFsHint, setShowFsHint]     = useState(false)
  const [showQuickMenu, setShowQuickMenu] = useState(false)
  const [showDebug, setShowDebug]       = useState(false)
  const [debugInfo, setDebugInfo]       = useState({ lastInput: '', latency: 0 })
  const [overlays, dispatchOverlay]     = useReducer(overlayReducer, [])

  const sessionRef       = useRef(session)
  const emulatorReadyRef = useRef(false)
  const prevStatusRef    = useRef(session.status)
  const fsHintTimer      = useRef<NodeJS.Timeout | null>(null)
  const rafRef           = useRef<number | null>(null)
  const socketRef        = useRef<Socket | null>(null)

  useEffect(() => { setShowDebug(new URLSearchParams(window.location.search).has('debug')) }, [])
  useEffect(() => { sessionRef.current = session }, [session])

  useWakeLock(session.status === 'playing')

  // ── Fullscreen sync ──────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => {
      const inFs = !!fsElement()
      setIsFullscreen(inFs)
      if (!inFs && sessionRef.current.status === 'playing') {
        setShowFsHint(true)
        if (fsHintTimer.current) clearTimeout(fsHintTimer.current)
        fsHintTimer.current = setTimeout(() => setShowFsHint(false), 5000)
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
      if (fsHintTimer.current) clearTimeout(fsHintTimer.current)
    }
  }, [])

  const enterFullscreen = useCallback(async () => {
    const el = document.getElementById('ejs-container') ?? document.getElementById('game-container') ?? document.documentElement
    try { await fsRequest(el); setShowFsHint(false) } catch {
      setShowFsHint(true)
      if (fsHintTimer.current) clearTimeout(fsHintTimer.current)
      fsHintTimer.current = setTimeout(() => setShowFsHint(false), 5000)
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    fsElement() ? fsExit().catch(() => {}) : enterFullscreen()
  }, [enterFullscreen])

  const focusEmulator = useCallback(() => {
    const p = document.querySelector('.ejs_parent') as HTMLElement | null
    if (p) { p.focus(); p.click(); return }
    const c = document.querySelector('#ejs-container canvas') as HTMLElement | null
    if (c) { c.focus(); c.click(); return }
    const d = document.getElementById('ejs-container')
    d?.focus(); d?.click()
  }, [])

  const handleMuteToggle = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev
      try {
        const emu = (window as any).EJS_emulator
        if (emu && typeof emu.setVolume === 'function') emu.setVolume(next ? 0 : 1)
      } catch { /* best-effort */ }
      return next
    })
  }, [])

  const doExitGame = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    emulatorReadyRef.current = false
    destroyEmulatorAdapter()
    setEmulatorStatus('idle'); setEmulatorError(null); setIsPaused(false); setIsMuted(false)
    setSession(prev => ({ ...prev, status: 'idle', romName: null, romData: null, consoleType: null }))
    if (fsElement()) fsExit().catch(() => {})
  }, [])

  // ── Socket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const sock = io(getWsUrl(), {
      transports: ['websocket', 'polling'], forceNew: true,
      reconnection: true, reconnectionAttempts: Infinity,
      reconnectionDelay: 1000, reconnectionDelayMax: 5000, timeout: 10000,
    })

    sock.on('connect', () => { setIsConnected(true); sock.emit('tv:create-room') })
    sock.on('disconnect', () => setIsConnected(false))

    sock.on('tv:room-created', (data: { code: string }) => {
      getTVSessionManager().createSession(data.code)
      setSession(prev => ({ ...prev, roomCode: data.code }))
    })

    const COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow']

    sock.on('controller:connected', (data: { playerNumber: number }) => {
      getTVSessionManager().addPlayer(data.playerNumber)
      getInputRouter().registerPlayer(data.playerNumber)
      setPlayers(prev => {
        const existing = prev.find(p => p.id === data.playerNumber)
        if (existing) {
          const updated = { ...existing, connected: true }
          dispatchOverlay({ type: 'enqueue', player: updated })
          return prev.map(p => p.id === data.playerNumber ? updated : p)
        }
        const np: TVPlayer = { id: data.playerNumber, connected: true, ready: false, color: COLORS[(data.playerNumber - 1) % 4], name: `Player ${data.playerNumber}`, latency: 0 }
        dispatchOverlay({ type: 'enqueue', player: np })
        return [...prev, np]
      })
    })

    sock.on('controller:disconnected', (data: { playerNumber: number }) => {
      getTVSessionManager().removePlayer(data.playerNumber)
      getInputRouter().unregisterPlayer(data.playerNumber)
      setPlayers(prev => prev.map(p => p.id === data.playerNumber ? { ...p, connected: false } : p))
    })

    sock.on('controller:ready', (data: { playerNumber: number; ready: boolean }) => {
      getTVSessionManager().setPlayerReady(data.playerNumber, data.ready)
      setPlayers(prev => prev.map(p => p.id === data.playerNumber ? { ...p, ready: data.ready } : p))
    })

    sock.on('controller:latency', (data: { playerNumber: number; latency: number }) => {
      getTVSessionManager().updatePlayerLatency(data.playerNumber, data.latency)
      setPlayers(prev => prev.map(p => p.id === data.playerNumber ? { ...p, latency: data.latency } : p))
      setDebugInfo(prev => ({ ...prev, latency: data.latency }))
    })

    sock.on('tv:rom-uploaded', (data: { romData: ArrayBuffer; romName: string; consoleType: string; uploadedBy: number }) => {
      const romArray = new Uint8Array(data.romData)
      const ct = data.consoleType as ConsoleType
      const mgr = getTVSessionManager()
      if (!mgr.getSession()) mgr.createSession(sessionRef.current.roomCode || 'ROOM')
      mgr.loadROM({ name: data.romName, consoleType: ct, size: romArray.byteLength, data: romArray }, data.uploadedBy)
      setSession(prev => ({ ...prev, status: 'rom-loaded', romName: data.romName, romData: romArray, consoleType: ct }))
    })

    sock.on('tv:game-start', () => {
      getTVSessionManager().startGame()
      setSession(prev => ({ ...prev, status: 'playing' }))
    })

    sock.on('game:toggle-pause', () => {
      const a = getEmulatorAdapter()
      if (a.isPaused()) { a.resume(); setIsPaused(false); getTVSessionManager().resumeGame() }
      else              { a.pause();  setIsPaused(true);  getTVSessionManager().pauseGame()  }
    })

    sock.on('game:reset',             () => { getEmulatorAdapter().reset(); getTVSessionManager().resetGame() })
    sock.on('game:toggle-mute',       () => handleMuteToggle())
    sock.on('game:toggle-fullscreen', () => toggleFullscreen())
    sock.on('game:save-state',        () => getEmulatorAdapter().saveState())
    sock.on('game:load-state',        () => getEmulatorAdapter().loadState())
    sock.on('game:menu',              () => setShowQuickMenu(prev => !prev))

    sock.on('tv:nav', (data: { key: string }) => {
      const keyMap: Record<string, string> = {
        up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
        a: 'Enter', b: 'Escape', start: 'Escape',
      }
      const key = keyMap[data.key]
      if (!key) return
      const el = document.activeElement ?? document.body
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      el.dispatchEvent(new KeyboardEvent('keyup',   { key, bubbles: true }))
    })

    sock.on('game:exit', () => {
      doExitGame()
      getTVSessionManager().reset()
      sock.emit('tv:create-room')
    })

    sock.on('controller:input', (data: { playerId: number; buttonId: string; pressed: boolean; timestamp: number }) => {
      if (!emulatorReadyRef.current) return
      const ir = getInputRouter()
      if (!ir.getPlayer(data.playerId)) ir.registerPlayer(data.playerId)
      const ev = ir.processInput({
        playerId: data.playerId,
        buttonId: data.buttonId as Parameters<typeof ir.processInput>[0]['buttonId'],
        pressed: data.pressed,
      })
      getTVSessionManager().processInput({ playerId: ev.playerId, buttonId: ev.buttonId, pressed: ev.pressed })
      if (showDebug && ev.pressed) setDebugInfo(prev => ({ ...prev, lastInput: `P${ev.playerId} ${ev.buttonId}` }))
    })

    socketRef.current = sock
    return () => { sock.disconnect(); doExitGame(); resetTVSessionManager() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── QR code ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session.roomCode) return
    const url = `${window.location.origin}/controller?room=${session.roomCode}`
    QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: '#7c3aed', light: '#ffffff' } }).then(setQrCodeUrl)
  }, [session.roomCode])

  // ── Launch trigger ────────────────────────────────────────────────────────
  useEffect(() => {
    if (prevStatusRef.current !== 'playing' && session.status === 'playing' && session.romName) {
      setPendingLaunch(true)
      setLaunchRomName(session.romName)
    }
    prevStatusRef.current = session.status
  }, [session.status, session.romName])

  // ── Emulator init ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (session.status !== 'playing') return
    if (!session.romData || !session.romName || !session.consoleType) return
    if (emulatorReadyRef.current) return
    if (pendingLaunch) return

    const romData = session.romData, romName = session.romName, consoleType = session.consoleType

    const tryInit = () => {
      if (!document.getElementById('ejs-container')) { rafRef.current = requestAnimationFrame(tryInit); return }
      const adapter = getEmulatorAdapter('ejs-container')
      adapter.onReady(() => {
        emulatorReadyRef.current = true
        setEmulatorStatus('ready')
        let n = 0
        const t = setInterval(() => { focusEmulator(); if (++n >= 10) clearInterval(t) }, 300)
        enterFullscreen()
      })
      adapter.onError(msg => { setEmulatorError(msg); setEmulatorStatus('error') })
      setEmulatorStatus('loading')
      adapter.loadROM(romData, romName, consoleType)
    }

    rafRef.current = requestAnimationFrame(tryInit)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [session.status, session.romData, session.romName, session.consoleType, pendingLaunch, focusEmulator, enterFullscreen])

  const handleLocalPause = useCallback(() => {
    const a = getEmulatorAdapter()
    if (a.isPaused()) { a.resume(); setIsPaused(false); getTVSessionManager().resumeGame() }
    else              { a.pause();  setIsPaused(true);  getTVSessionManager().pauseGame()  }
  }, [])

  // ── Playing — fullscreen emulator ────────────────────────────────────────
  if (session.status === 'playing') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', fontFamily: 'system-ui,sans-serif' }}>
        <OverlayManager overlays={overlays} dispatch={dispatchOverlay} />

        {pendingLaunch && launchRomName && (
          <LaunchSequence romName={launchRomName} consoleType={session.consoleType} onDone={() => setPendingLaunch(false)} />
        )}

        {showQuickMenu && (
          <QuickMenu
            onResume={() => { setShowQuickMenu(false); focusEmulator() }}
            onSave={() => { getEmulatorAdapter().saveState(); setShowQuickMenu(false) }}
            onLoad={() => { getEmulatorAdapter().loadState(); setShowQuickMenu(false) }}
            onReset={() => { getEmulatorAdapter().reset(); setShowQuickMenu(false) }}
            onMute={() => { handleMuteToggle(); setShowQuickMenu(false) }}
            onExit={() => { setShowQuickMenu(false); doExitGame(); getTVSessionManager().reset(); socketRef.current?.emit('tv:create-room') }}
            isMuted={isMuted}
          />
        )}

        <div id="game-container" style={{ position: 'absolute', inset: 0 }}
          onClick={() => { focusEmulator(); if (!fsElement()) enterFullscreen() }}>
          <div id="ejs-container" style={{ width: '100%', height: '100%', outline: 'none' }} tabIndex={0} />
        </div>

        {emulatorStatus === 'loading' && !pendingLaunch && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, border: '4px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ color: '#fff', fontSize: 20, fontWeight: 600, margin: 0 }}>Loading {session.romName}…</p>
            </div>
          </div>
        )}

        {emulatorError && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 32px' }}>
              <AlertCircle style={{ width: 56, height: 56, color: '#f87171', margin: '0 auto 16px', display: 'block' }} />
              <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Emulator Error</p>
              <p style={{ color: '#6b7280', fontSize: 12, fontFamily: 'monospace', background: '#111', borderRadius: 8, padding: 12, textAlign: 'left', wordBreak: 'break-all', margin: '0 0 20px' }}>{emulatorError}</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <Button onClick={() => { setEmulatorError(null); setEmulatorStatus('idle'); emulatorReadyRef.current = false; destroyEmulatorAdapter() }}
                  style={{ background: '#7c3aed', color: '#fff', border: 'none' }}>
                  <RefreshCw style={{ width: 16, height: 16, marginRight: 8 }} />Retry
                </Button>
                <Button onClick={doExitGame} variant="secondary">Exit</Button>
              </div>
            </div>
          </div>
        )}

        {isPaused && emulatorStatus === 'ready' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ textAlign: 'center' }}>
              <Pause style={{ width: 80, height: 80, color: 'rgba(255,255,255,0.8)', display: 'block', margin: '0 auto 12px' }} />
              <p style={{ color: '#fff', fontSize: 52, fontWeight: 900, letterSpacing: '0.15em', margin: 0 }}>PAUSED</p>
            </div>
          </div>
        )}

        {isMuted && (
          <div style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(0,0,0,0.7)', borderRadius: 12, padding: '6px 14px', color: '#fff', fontSize: 14, fontWeight: 700, pointerEvents: 'none' }}>
            🔇 Muted
          </div>
        )}

        {showFsHint && (
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(168,85,247,0.4)',
            borderRadius: 20, padding: '10px 20px', cursor: 'pointer',
            backdropFilter: 'blur(12px)',
          }} onClick={enterFullscreen}>
            <Monitor style={{ width: 16, height: 16, color: '#a78bfa' }} />
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Tap to enter fullscreen</span>
          </div>
        )}

        {/* Escape-hatch controls — only visible on hover */}
        <div style={{
          position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: 8,
          opacity: 0, transition: 'opacity 0.3s',
        }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>
          <Button onClick={handleLocalPause} variant="secondary" size="sm" style={{ background: 'rgba(0,0,0,0.7)' }} disabled={emulatorStatus !== 'ready'}>
            {isPaused ? <Play style={{ width: 16, height: 16 }} /> : <Pause style={{ width: 16, height: 16 }} />}
          </Button>
          <Button onClick={toggleFullscreen} variant="secondary" size="sm" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <Monitor style={{ width: 16, height: 16 }} />
          </Button>
          <Button onClick={doExitGame} variant="secondary" size="sm" style={{ background: 'rgba(0,0,0,0.7)', color: '#f87171' }}>
            ✕ Exit
          </Button>
        </div>

        {showDebug && (
          <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.8)', borderRadius: 12, padding: 12, fontFamily: 'monospace', fontSize: 12, color: '#4ade80', pointerEvents: 'none', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: '#86efac' }}>[Debug]</div>
            <div>Status: {emulatorStatus}</div>
            <div>FS: {isFullscreen ? 'yes' : 'no'}</div>
            <div>Muted: {isMuted ? 'yes' : 'no'}</div>
            <div>Last: {debugInfo.lastInput || '—'}</div>
            <div>Latency: {debugInfo.latency}ms</div>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse at 30% 20%, rgba(124,58,237,0.18) 0%, transparent 55%), radial-gradient(ellipse at 70% 80%, rgba(6,182,212,0.12) 0%, transparent 55%), #08060f',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui,sans-serif',
      position: 'relative', overflow: 'hidden',
    }}>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <OverlayManager overlays={overlays} dispatch={dispatchOverlay} />

      {/* Ambient orbs */}
      <div style={{ position: 'absolute', top: '10%', left: '5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '15%', right: '8%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 40px', flexShrink: 0,
        background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.04)',
        backdropFilter: 'blur(12px)', position: 'relative', zIndex: 10,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: 'radial-gradient(circle at 35% 35%, rgba(124,58,237,0.6), rgba(6,2,15,0.9))',
            border: '1px solid rgba(124,58,237,0.4)',
            boxShadow: '0 0 20px rgba(124,58,237,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Gamepad2 style={{ width: 22, height: 22, color: '#a78bfa' }} />
          </div>
          <div>
            <span style={{ color: '#fff', fontSize: 22, fontWeight: 900, letterSpacing: '-0.01em' }}>NOSTALGIA</span>
            <span style={{
              fontSize: 22, fontWeight: 700, marginLeft: 8,
              background: 'linear-gradient(90deg, #a78bfa, #22d3ee)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>CONSOLE</span>
          </div>
        </div>

        {/* Room code pill */}
        {session.roomCode && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            background: 'rgba(124,58,237,0.08)',
            border: '2px solid rgba(124,58,237,0.35)',
            borderRadius: 20, padding: '10px 28px',
          }}>
            <span style={{ color: '#6b7280', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em' }}>ROOM</span>
            <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: 36, fontWeight: 900, letterSpacing: '0.35em' }}>
              {session.roomCode}
            </span>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: isConnected ? 'rgba(74,222,128,0.12)' : 'rgba(251,191,36,0.12)',
              border: `1px solid ${isConnected ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}`,
              borderRadius: 999, padding: '4px 12px',
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                backgroundColor: isConnected ? '#4ade80' : '#fbbf24',
                boxShadow: isConnected ? '0 0 6px #4ade80' : '0 0 6px #fbbf24',
                animation: isConnected ? 'livePulse 2s ease infinite' : 'none',
              }} />
              <span style={{ color: isConnected ? '#4ade80' : '#fbbf24', fontSize: 12, fontWeight: 700 }}>
                {isConnected ? 'LIVE' : 'RECONNECTING'}
              </span>
            </div>
          </div>
        )}

        {/* Connected players (mini) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {players.filter(p => p.connected).map(p => {
            const cs = PLAYER_COLORS[p.color]
            return (
              <div key={p.id} style={{
                width: 38, height: 38, borderRadius: '50%',
                backgroundColor: cs.primary,
                boxShadow: `0 0 12px ${cs.primary}70`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 15, color: '#fff',
                animation: 'playerPop 0.4s cubic-bezier(0.34,1.56,0.64,1)',
              }}>{p.id}</div>
            )
          })}
          {players.filter(p => p.connected).length === 0 && (
            <span style={{ color: '#374151', fontSize: 14 }}>No players yet</span>
          )}
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0', position: 'relative', zIndex: 1 }}>
        {!session.roomCode ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, border: '4px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: '#9ca3af', fontSize: 22, margin: 0 }}>Creating room…</p>
          </div>
        ) : (
          <TVLobby session={session} players={players} qrCodeUrl={qrCodeUrl} isConnected={isConnected} />
        )}
      </main>

      <style>{`
        @keyframes spin       { to { transform: rotate(360deg); } }
        @keyframes livePulse  { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes playerPop  { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  )
}
