'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { io, Socket } from 'socket.io-client'
import { getWsUrl } from '@/lib/ws-url'
import { useSearchParams } from 'next/navigation'
import { PLAYER_COLORS, PlayerColor, ConsoleType } from '@/lib/game-session-manager'
import { getProfileForConsole, NES_PROFILE } from '@/lib/controller-profiles'
import { validateROM, getEmulatorConsoleType, getSupportedExtensions } from '@/lib/rom-validator'
import { useWakeLock } from '@/hooks/use-wake-lock'
import { Wifi, WifiOff, Gamepad2, Upload, Play, Check, X, Zap, RefreshCw, AlertCircle } from 'lucide-react'

type Step = 'connect' | 'connecting' | 'lobby' | 'playing'
interface Player { id: number; color: PlayerColor; ready: boolean; latency: number }

const RESET_TIMEOUT = 60000

const haptic = {
  light:   () => navigator.vibrate?.(8),
  medium:  () => navigator.vibrate?.(20),
  heavy:   () => navigator.vibrate?.(40),
  confirm: () => navigator.vibrate?.([10, 40, 20]),
}

// ── Shoulder Button ────────────────────────────────────────────────────────────
function ShoulderBtn({ id, label, onPress, side }: { id: string; label: string; onPress: (id: string, p: boolean) => void; side: 'L' | 'R' }) {
  const [pressed, setPressed] = useState(false)
  const r = side === 'L' ? '0 0 18px 26px' : '0 0 26px 18px'
  const down = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(true); haptic.medium(); onPress(id, true) }
  const up   = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(false); onPress(id, false) }
  return (
    <button
      style={{ flex: 1, height: '100%', borderRadius: r, backgroundColor: pressed ? '#6b7280' : '#374151', color: '#e5e7eb', fontSize: 22, fontWeight: 900, transform: pressed ? 'translateY(2px)' : 'none', boxShadow: pressed ? 'none' : '0 4px 0 #1f2937', transition: 'transform 55ms,box-shadow 55ms', touchAction: 'none', WebkitTapHighlightColor: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.05em' }}
      onTouchStart={down} onTouchEnd={up} onTouchCancel={up} onMouseDown={down} onMouseUp={up} onMouseLeave={e => { if (pressed) up(e) }}>
      {label}
    </button>
  )
}

// ── D-Pad ──────────────────────────────────────────────────────────────────────
function DPad({ onPress, size }: { onPress: (id: string, p: boolean) => void; size: number }) {
  const [active, setActive] = useState<Set<string>>(new Set())
  const seg = Math.round(size / 3)
  const dirs = [
    { id: 'dpad_up',    label: '▲', style: { top: 0, left: seg, width: seg, height: seg } },
    { id: 'dpad_down',  label: '▼', style: { bottom: 0, left: seg, width: seg, height: seg } },
    { id: 'dpad_left',  label: '◀', style: { left: 0, top: seg, width: seg, height: seg } },
    { id: 'dpad_right', label: '▶', style: { right: 0, top: seg, width: seg, height: seg } },
  ]
  const press = (id: string, down: boolean) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    setActive(prev => { const n = new Set(prev); down ? n.add(id) : n.delete(id); return n })
    if (down) haptic.light()
    onPress(id, down)
  }
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, touchAction: 'none' }}>
      {dirs.map(({ id, label, style: pos }) => {
        const on = active.has(id)
        return (
          <button key={id} style={{ position: 'absolute', borderRadius: 14, backgroundColor: on ? '#d1d5db' : '#374151', color: on ? '#111827' : '#d1d5db', boxShadow: on ? 'inset 0 2px 4px rgba(0,0,0,0.35)' : '0 4px 10px rgba(0,0,0,0.6)', transition: 'transform 55ms,background-color 55ms', touchAction: 'none', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(seg * 0.42), fontWeight: 700, border: 'none', cursor: 'pointer', transform: on ? 'scale(0.9)' : 'scale(1)', ...pos }}
            onTouchStart={press(id, true)} onTouchEnd={press(id, false)} onTouchCancel={press(id, false)}
            onMouseDown={press(id, true)} onMouseUp={press(id, false)}
            onMouseLeave={e => { if (active.has(id)) press(id, false)(e) }}>
            {label}
          </button>
        )
      })}
      {/* center fill */}
      <div style={{ position: 'absolute', top: seg, left: seg, width: seg, height: seg, backgroundColor: '#1f2937', pointerEvents: 'none' }} />
    </div>
  )
}

// ── Face Button ────────────────────────────────────────────────────────────────
function FaceBtn({ id, label, color, size, onPress }: { id: string; label: string; color: string; size: number; onPress: (id: string, p: boolean) => void }) {
  const [pressed, setPressed] = useState(false)
  const down = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(true); haptic.medium(); onPress(id, true) }
  const up   = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(false); onPress(id, false) }
  return (
    <button
      onTouchStart={down} onTouchEnd={up} onTouchCancel={up} onMouseDown={down} onMouseUp={up}
      onMouseLeave={() => { if (pressed) { setPressed(false); onPress(id, false) } }}
      style={{ width: size, height: size, borderRadius: '50%', backgroundColor: pressed ? '#fff' : color, color: pressed ? color : '#fff', fontSize: Math.round(size * 0.3), fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: pressed ? 'scale(0.88)' : 'scale(1)', boxShadow: pressed ? `0 0 0 4px ${color}66, 0 2px 4px rgba(0,0,0,0.4)` : `0 6px 20px rgba(0,0,0,0.65), 0 0 0 2px ${color}50`, transition: 'transform 75ms,box-shadow 75ms,background-color 55ms', touchAction: 'none', WebkitTapHighlightColor: 'transparent', flexShrink: 0, userSelect: 'none', border: 'none', cursor: 'pointer' }}>
      {label}
    </button>
  )
}

// ── Pill Button (Select/Start) ─────────────────────────────────────────────────
function PillBtn({ id, label, onPress, width, height }: { id: string; label: string; onPress: (id: string, p: boolean) => void; width: number; height: number }) {
  const [pressed, setPressed] = useState(false)
  const down = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(true); haptic.heavy(); onPress(id, true) }
  const up   = (e: React.TouchEvent | React.MouseEvent) => { e.preventDefault(); setPressed(false); onPress(id, false) }
  return (
    <button style={{ width, height, borderRadius: 999, backgroundColor: pressed ? '#9ca3af' : '#374151', color: '#f9fafb', fontSize: Math.round(height * 0.38), fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', transform: pressed ? 'scale(0.93)' : 'scale(1)', boxShadow: pressed ? 'inset 0 1px 3px rgba(0,0,0,0.4)' : '0 3px 8px rgba(0,0,0,0.4)', transition: 'transform 55ms', touchAction: 'none', WebkitTapHighlightColor: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      onTouchStart={down} onTouchEnd={up} onTouchCancel={up} onMouseDown={down} onMouseUp={up} onMouseLeave={e => { if (pressed) up(e) }}>
      {label}
    </button>
  )
}

// ── Per-console face cluster layouts ──────────────────────────────────────────
// Returns positions as fractions of clusterSize (0..1)
type FaceLayout = { id: string; label: string; color: string; fx: number; fy: number }[]

function getFaceLayout(consoleType: string | null): FaceLayout {
  switch (consoleType) {
    case 'snes':
      return [
        { id: 'y', label: 'Y', color: '#22c55e', fx: 0,   fy: 0.5 },   // left
        { id: 'x', label: 'X', color: '#22d3ee', fx: 0.5, fy: 0   },   // top
        { id: 'b', label: 'B', color: '#facc15', fx: 0.5, fy: 1   },   // bottom
        { id: 'a', label: 'A', color: '#ef4444', fx: 1,   fy: 0.5 },   // right
      ]
    case 'genesis':
      return [
        { id: 'a', label: 'A', color: '#22c55e', fx: 0,   fy: 0.5 },
        { id: 'b', label: 'B', color: '#3b82f6', fx: 0.5, fy: 0.5 },
        { id: 'x', label: 'C', color: '#ef4444', fx: 1,   fy: 0.5 },
      ]
    case 'sms':
      return [
        { id: 'b', label: '1', color: '#3b82f6', fx: 0, fy: 0.5 },
        { id: 'a', label: '2', color: '#ef4444', fx: 1, fy: 0.5 },
      ]
    case 'gb':
    case 'gbc':
      return [
        { id: 'b', label: 'B', color: '#a855f7', fx: 0, fy: 0.5 },
        { id: 'a', label: 'A', color: '#ef4444', fx: 1, fy: 0.5 },
      ]
    case 'gba':
      return [
        { id: 'b', label: 'B', color: '#a855f7', fx: 0,   fy: 0.5 },
        { id: 'a', label: 'A', color: '#ef4444', fx: 1,   fy: 0.5 },
      ]
    case 'nes':
    default:
      return [
        { id: 'b', label: 'B', color: '#ef4444', fx: 0, fy: 0.5 },
        { id: 'a', label: 'A', color: '#22c55e', fx: 1, fy: 0.5 },
      ]
  }
}

// ── Menu Drawer ───────────────────────────────────────────────────────────────
function MenuDrawer({ open, onClose, gameStatus, isMuted, isFullscreen, doAction }: {
  open: boolean; onClose: () => void
  gameStatus: string; isMuted: boolean; isFullscreen: boolean
  doAction: (id: string) => void
}) {
  if (!open) return null
  const items = [
    { id: 'pause',      icon: gameStatus === 'paused' ? '▶' : '⏸', label: gameStatus === 'paused' ? 'Resume' : 'Pause',     color: '#f59e0b' },
    { id: 'save',       icon: '💾',  label: 'Save State',  color: '#22d3ee' },
    { id: 'load',       icon: '📂',  label: 'Load State',  color: '#22d3ee' },
    { id: 'reset',      icon: '🔄',  label: 'Restart',     color: '#a78bfa' },
    { id: 'mute',       icon: isMuted ? '🔊' : '🔇', label: isMuted ? 'Unmute' : 'Mute', color: '#6b7280' },
    { id: 'fullscreen', icon: '⛶',   label: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen', color: '#a78bfa' },
    { id: 'exit',       icon: '🚪',  label: 'Exit Game',   color: '#f87171' },
  ]
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 88, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 89, background: '#111827', borderTop: '1px solid rgba(255,255,255,0.08)', borderRadius: '24px 24px 0 0', padding: '12px 0 env(safe-area-inset-bottom,16px)', animation: 'slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <div style={{ width: 48, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.15)', margin: '0 auto 16px' }} />
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', textAlign: 'center', margin: '0 0 12px' }}>Game Menu</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 16px 8px' }}>
          {items.map(({ id, icon, label }) => (
            <button key={id} onClick={() => { doAction(id); onClose() }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: id === 'exit' ? '#f87171' : '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}
              onTouchStart={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
              onTouchEnd={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}>
              <span style={{ fontSize: 22 }}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </>
  )
}

// ── Playing Screen ─────────────────────────────────────────────────────────────
function PlayingScreen({ consoleType, player, romName, gameStatus, latency, isMuted, isFullscreen, sendInput, doAction }: {
  consoleType: ConsoleType | null; player: Player | null; romName: string | null
  gameStatus: string; latency: number; isMuted: boolean; isFullscreen: boolean
  sendInput: (id: string, p: boolean) => void
  doAction: (id: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dims, setDims] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const update = () => setDims({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const cs = PLAYER_COLORS[player?.color || 'red']
  const profile = consoleType ? getProfileForConsole(consoleType) : NES_PROFILE
  const hasShoulders = profile.systemButtons.some(b => b.id === 'l' || b.id === 'r')
  const systemBtns = profile.systemButtons.filter(b => b.id !== 'l' && b.id !== 'r')
  const faceLayout = getFaceLayout(consoleType)

  const { w, h } = dims
  if (!w || !h) return null

  const isLandscape = w > h

  // Status bar height
  const statusH = Math.round(h * 0.055)
  // Shoulder bar height
  const shoulderH = hasShoulders ? Math.round(h * 0.1) : 0
  // Remaining height for main area
  const mainH = h - statusH - shoulderH
  // Pill row height
  const pillH = Math.round(mainH * 0.2)
  // Control area height
  const ctrlH = mainH - pillH

  // Sizes
  const dpadSize = Math.min(Math.round(Math.min(w * 0.44, ctrlH * 0.88)), 240)
  const btnCount = faceLayout.length
  // For 4-button diamond cluster, size fits in a square; for 2-3 buttons, inline row
  const isDiamond = btnCount === 4
  const isRow3 = btnCount === 3
  const faceAreaSize = isDiamond
    ? Math.min(Math.round(Math.min(w * 0.44, ctrlH * 0.88)), 240)
    : Math.min(Math.round(Math.min(w * 0.44, ctrlH * 0.7)), 200)
  const btnSize = isDiamond
    ? Math.round(faceAreaSize * 0.34)
    : isRow3
      ? Math.round(faceAreaSize * 0.28)
      : Math.round(faceAreaSize * 0.38)
  const pillW = Math.round(w * 0.32)
  const pillHeight = Math.round(pillH * 0.48)

  // Landscape overrides
  const lDpadSize = Math.min(Math.round(h * 0.6), 200)
  const lBtnSize  = isDiamond ? Math.round(lDpadSize * 0.34) : Math.round(lDpadSize * 0.36)
  const lPillW = Math.round(h * 0.28)
  const lPillH = Math.round(h * 0.1)

  // ── Render face cluster ──────────────────────────────────────────────────────
  const renderFace = (areaSize: number, bSize: number) => {
    if (isDiamond) {
      return (
        <div style={{ position: 'relative', width: areaSize, height: areaSize, flexShrink: 0 }}>
          {faceLayout.map(({ id, label, color, fx, fy }) => (
            <div key={id} style={{ position: 'absolute', left: `${fx * 100}%`, top: `${fy * 100}%`, transform: 'translate(-50%,-50%)' }}>
              <FaceBtn id={id} label={label} color={color} size={bSize} onPress={sendInput} />
            </div>
          ))}
        </div>
      )
    }
    // Row layout (2 or 3 buttons)
    return (
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: Math.round(bSize * 0.35), flexShrink: 0 }}>
        {faceLayout.map(({ id, label, color }) => (
          <FaceBtn key={id} id={id} label={label} color={color} size={bSize} onPress={sendInput} />
        ))}
      </div>
    )
  }

  // ── Menu hamburger ────────────────────────────────────────────────────────────
  const MenuBtn = () => (
    <button onClick={() => setMenuOpen(true)}
      style={{ width: statusH * 1.1, height: statusH * 1.1, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', touchAction: 'none', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}>
      {[0,1,2].map(i => <div key={i} style={{ width: 15, height: 2, borderRadius: 1, background: '#fff' }} />)}
    </button>
  )

  if (isLandscape) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: profile.theme.background, display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)', touchAction: 'none', userSelect: 'none', fontFamily: 'system-ui,sans-serif', overflow: 'hidden' }}>
        <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} gameStatus={gameStatus} isMuted={isMuted} isFullscreen={isFullscreen} doAction={doAction} />
        {/* Shoulder row */}
        {hasShoulders && (
          <div style={{ display: 'flex', gap: 6, padding: '6px 12px 0', height: Math.round(h * 0.12), flexShrink: 0 }}>
            <ShoulderBtn id="l" label="L" onPress={sendInput} side="L" />
            <ShoulderBtn id="r" label="R" onPress={sendInput} side="R" />
          </div>
        )}
        {/* Main row */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', gap: 8, minHeight: 0, overflow: 'hidden' }}>
          <DPad onPress={sendInput} size={lDpadSize} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {systemBtns.map(b => <PillBtn key={b.id} id={b.id} label={b.label} onPress={sendInput} width={lPillW} height={lPillH} />)}
          </div>
          {renderFace(lDpadSize, lBtnSize)}
        </div>
        {/* Status bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', backgroundColor: 'rgba(0,0,0,0.45)', flexShrink: 0, height: statusH }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: cs.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#fff', flexShrink: 0 }}>{player?.id}</div>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{romName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {gameStatus === 'paused' && <span style={{ color: '#fbbf24', fontSize: 9, fontWeight: 800 }}>PAUSED</span>}
            {isMuted && <span style={{ fontSize: 10 }}>🔇</span>}
            <span style={{ color: '#4ade80', fontSize: 9, fontFamily: 'monospace' }}>{latency}ms</span>
            <MenuBtn />
          </div>
        </div>
      </div>
    )
  }

  // Portrait
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: profile.theme.background, display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)', touchAction: 'none', userSelect: 'none', fontFamily: 'system-ui,sans-serif', overflow: 'hidden' }}>
      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} gameStatus={gameStatus} isMuted={isMuted} isFullscreen={isFullscreen} doAction={doAction} />

      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', backgroundColor: 'rgba(0,0,0,0.45)', flexShrink: 0, height: statusH }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <div style={{ width: Math.round(statusH * 0.75), height: Math.round(statusH * 0.75), borderRadius: '50%', backgroundColor: cs.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(statusH * 0.28), fontWeight: 900, color: '#fff', flexShrink: 0 }}>{player?.id}</div>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: Math.round(statusH * 0.3), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{romName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {gameStatus === 'paused' && <span style={{ color: '#fbbf24', fontSize: Math.round(statusH * 0.28), fontWeight: 800 }}>PAUSED</span>}
          {isMuted && <span style={{ fontSize: Math.round(statusH * 0.35) }}>🔇</span>}
          <span style={{ color: '#4ade80', fontSize: Math.round(statusH * 0.28), fontFamily: 'monospace' }}>{latency}ms</span>
          <MenuBtn />
        </div>
      </div>

      {/* Shoulder buttons */}
      {hasShoulders && (
        <div style={{ display: 'flex', gap: 6, padding: '4px 12px', height: shoulderH, flexShrink: 0 }}>
          <ShoulderBtn id="l" label="L" onPress={sendInput} side="L" />
          <ShoulderBtn id="r" label="R" onPress={sendInput} side="R" />
        </div>
      )}

      {/* Main controls */}
      <div style={{ height: ctrlH, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${Math.round(w * 0.05)}px`, flexShrink: 0, overflow: 'hidden' }}>
        <DPad onPress={sendInput} size={dpadSize} />
        {renderFace(faceAreaSize, btnSize)}
      </div>

      {/* Pill row */}
      <div style={{ height: pillH, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: Math.round(w * 0.06), flexShrink: 0 }}>
        {systemBtns.map(b => <PillBtn key={b.id} id={b.id} label={b.label} onPress={sendInput} width={pillW} height={pillHeight} />)}
      </div>
    </div>
  )
}

// ── Main Controller ────────────────────────────────────────────────────────────
function ControllerInner() {
  const searchParams = useSearchParams()

  const [isConnected, setIsConnected]       = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [step, setStep]                     = useState<Step>('connect')
  const [roomCode, setRoomCode]             = useState('')
  const [joinError, setJoinError]           = useState<string | null>(null)
  const [player, setPlayer]                 = useState<Player | null>(null)
  const [romName, setRomName]               = useState<string | null>(null)
  const [consoleType, setConsoleType]       = useState<ConsoleType | null>(null)
  const [gameStatus, setGameStatus]         = useState<'idle' | 'ready' | 'playing' | 'paused'>('idle')
  const [latency, setLatency]               = useState(0)
  const [isFullscreen, setIsFullscreen]     = useState(false)
  const [isMuted, setIsMuted]               = useState(false)
  const [romError, setRomError]             = useState<{ error: string; suggestion: string } | null>(null)
  const [isUploading, setIsUploading]       = useState(false)
  const [uploadStage, setUploadStage]       = useState<'reading' | 'validating' | 'sending' | 'ready' | null>(null)

  const fileInputRef   = useRef<HTMLInputElement>(null)
  const pingRef        = useRef<NodeJS.Timeout | null>(null)
  const resetTimerRef  = useRef<NodeJS.Timeout | null>(null)
  const playerRef      = useRef<Player | null>(null)
  const roomCodeRef    = useRef('')
  const stepRef        = useRef<Step>('connect')
  const gameStatusRef  = useRef<'idle' | 'ready' | 'playing' | 'paused'>('idle')
  const socketRef      = useRef<Socket | null>(null)

  useEffect(() => { playerRef.current = player }, [player])
  useEffect(() => { roomCodeRef.current = roomCode }, [roomCode])
  useEffect(() => { stepRef.current = step }, [step])
  useEffect(() => { gameStatusRef.current = gameStatus }, [gameStatus])

  useWakeLock(step === 'playing')

  useEffect(() => {
    const onChange = () => { const d = document as any; setIsFullscreen(!!(d.fullscreenElement ?? d.webkitFullscreenElement)) }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => { document.removeEventListener('fullscreenchange', onChange); document.removeEventListener('webkitfullscreenchange', onChange) }
  }, [])

  const stopPing = useCallback(() => { if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null } }, [])
  const startPing = useCallback((sock: Socket) => { stopPing(); pingRef.current = setInterval(() => sock.emit('ping:measure', { timestamp: Date.now() }), 2000) }, [stopPing])
  const cancelReset = useCallback(() => { if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null } }, [])
  const scheduleReset = useCallback(() => {
    cancelReset()
    resetTimerRef.current = setTimeout(() => {
      setStep('connect'); setPlayer(null); setRomName(null); setGameStatus('idle'); setIsReconnecting(false); stopPing()
      localStorage.removeItem('controller:roomCode')
    }, RESET_TIMEOUT)
  }, [cancelReset, stopPing])

  useEffect(() => {
    const urlCode = searchParams.get('room')
    const saved   = localStorage.getItem('controller:roomCode')
    const code    = urlCode || saved || ''
    if (code.length === 6) setRoomCode(code)
  }, [searchParams])

  useEffect(() => { if (roomCode.length === 6) localStorage.setItem('controller:roomCode', roomCode) }, [roomCode])

  useEffect(() => {
    const sock = io(getWsUrl(), { transports: ['websocket', 'polling'], forceNew: true, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 10000, timeout: 45000 })
    sock.on('connect', () => {
      setIsConnected(true); setIsReconnecting(false); cancelReset()
      const urlCode = searchParams.get('room')
      const code = roomCodeRef.current || urlCode || ''
      if (stepRef.current !== 'connect' && code) sock.emit('controller:join', { code })
      else if (code.length === 6 && stepRef.current === 'connect') { setStep('connecting'); sock.emit('controller:join', { code }) }
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
        setStep('connect'); localStorage.removeItem('controller:roomCode')
      }
    })
    sock.on('tv:disconnected', () => {
      cancelReset(); setStep('connect'); setPlayer(null); setRomName(null)
      setGameStatus('idle'); setIsReconnecting(false); stopPing()
      localStorage.removeItem('controller:roomCode')
    })
    sock.on('tv:reconnected', () => { setIsReconnecting(false); cancelReset() })
    sock.on('tv:rom-loaded', (data: { romName: string; consoleType: ConsoleType }) => {
      setRomName(data.romName); setConsoleType(data.consoleType); setGameStatus('ready')
    })
    sock.on('tv:game-started', () => { setGameStatus('playing'); setStep('playing') })
    sock.on('tv:game-paused',  () => setGameStatus('paused'))
    sock.on('tv:game-resumed', () => setGameStatus('playing'))
    sock.on('tv:game-exited',  () => { setGameStatus('idle'); setRomName(null); setConsoleType(null); setIsMuted(false); setStep('lobby') })
    sock.on('pong:measure', (data: { timestamp: number }) => {
      const ms = Date.now() - data.timestamp
      setLatency(ms)
      if (playerRef.current) sock.emit('controller:latency', { playerNumber: playerRef.current.id, latency: ms })
    })
    socketRef.current = sock
    return () => { stopPing(); cancelReset(); sock.disconnect() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const joinRoom = useCallback((code: string) => {
    const s = socketRef.current
    if (s && isConnected && code.length === 6) { setStep('connecting'); s.emit('controller:join', { code }) }
  }, [isConnected])

  const uploadROM = useCallback(async (file: File) => {
    const s = socketRef.current; if (!s || !playerRef.current) return
    setRomError(null); setIsUploading(true); setUploadStage('reading')
    try {
      const buf = await file.arrayBuffer()
      setUploadStage('validating')
      const result = await validateROM(file)
      if (!result.valid) { setRomError({ error: result.error!, suggestion: result.suggestion! }); haptic.heavy(); return }
      setUploadStage('sending')
      const ct = getEmulatorConsoleType(result.consoleType!) as ConsoleType
      const name = file.name.replace(/\.[^/.]+$/, '')
      s.emit('controller:upload-rom', { romData: buf, romName: name, consoleType: ct, uploadedBy: playerRef.current.id })
      setUploadStage('ready'); setRomName(name); setConsoleType(ct); setGameStatus('ready')
      haptic.confirm(); await new Promise(r => setTimeout(r, 600))
    } finally { setIsUploading(false); setUploadStage(null) }
  }, [])

  const setReady = useCallback((r: boolean) => {
    const s = socketRef.current; const p = playerRef.current; if (!s || !p) return
    s.emit('controller:ready', { playerId: p.id, ready: r }); setPlayer(prev => prev ? { ...prev, ready: r } : null)
  }, [])

  const startGame = useCallback(() => { const s = socketRef.current; if (!s) return; haptic.confirm(); s.emit('controller:start-game') }, [])

  const sendInput = useCallback((buttonId: string, pressed: boolean) => {
    const s = socketRef.current; const p = playerRef.current
    if (!s || !p || gameStatusRef.current !== 'playing') return
    s.emit('controller:input', { playerId: p.id, buttonId, pressed, timestamp: Date.now() })
  }, [])

  const doAction = useCallback((id: string) => {
    const s = socketRef.current; if (!s) return
    switch (id) {
      case 'pause':      s.emit('controller:pause');             break
      case 'reset':      s.emit('controller:reset');             break
      case 'mute':       s.emit('controller:mute'); setIsMuted(m => !m); break
      case 'fullscreen': s.emit('controller:toggle-fullscreen'); break
      case 'save':       s.emit('controller:save-state');        break
      case 'load':       s.emit('controller:load-state');        break
      case 'exit':       s.emit('controller:exit-game');         break
    }
  }, [])

  const ReconnectBanner = () => isReconnecting ? (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99, backgroundColor: '#f59e0b', color: '#000', padding: '10px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <RefreshCw style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
      Reconnecting — session held for 60s
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  ) : null

  // ── Playing ──────────────────────────────────────────────────────────────────
  if (step === 'playing') {
    return (
      <>
        <ReconnectBanner />
        <PlayingScreen
          consoleType={consoleType} player={player} romName={romName}
          gameStatus={gameStatus} latency={latency} isMuted={isMuted} isFullscreen={isFullscreen}
          sendInput={sendInput} doAction={doAction}
        />
      </>
    )
  }

  // ── Connect ──────────────────────────────────────────────────────────────────
  if (step === 'connect' || step === 'connecting') {
    return (
      <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#030712,#111827)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, paddingTop: 'max(16px,env(safe-area-inset-top))', paddingBottom: 'max(16px,env(safe-area-inset-bottom))', fontFamily: 'system-ui,sans-serif' }}>
        <ReconnectBanner />
        <div style={{ background: 'rgba(17,24,39,0.85)', border: '1px solid rgba(6,182,212,0.18)', borderRadius: 24, padding: 32, maxWidth: 360, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 72, height: 72, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.18)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Gamepad2 style={{ width: 36, height: 36, color: '#22d3ee' }} />
            </div>
            <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 900, margin: 0 }}>NOSTALGIA CONSOLE</h1>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '6px 0 0' }}>Enter the room code shown on your TV</p>
          </div>

          {joinError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15 }}>⚠️</span>
              <p style={{ color: '#fca5a5', fontSize: 13, fontWeight: 600, margin: 0 }}>{joinError}</p>
              <button onClick={() => setJoinError(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', marginLeft: 'auto', padding: 0, flexShrink: 0 }}><X style={{ width: 14, height: 14 }} /></button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
            {[0,1,2,3,4,5].map(i => (
              <input key={i} id={`rc-${i}`} type="text" maxLength={6} inputMode="numeric"
                style={{ width: 44, height: 56, textAlign: 'center', fontSize: 24, fontWeight: 900, background: '#1f2937', border: `2px solid ${joinError ? 'rgba(239,68,68,0.5)' : '#374151'}`, borderRadius: 12, color: '#fff', outline: 'none' }}
                value={roomCode[i] || ''}
                onFocus={e => { setJoinError(null); e.target.style.borderColor = '#22d3ee' }}
                onBlur={e => (e.target.style.borderColor = joinError ? 'rgba(239,68,68,0.5)' : '#374151')}
                onPaste={e => { e.preventDefault(); const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); if (digits.length === 6) { setRoomCode(digits); (document.getElementById('rc-5') as HTMLInputElement)?.focus() } }}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '')
                  if (val.length > 1) { const digits = val.slice(0,6).split(''); const nc = roomCode.padEnd(6,' ').split(''); digits.forEach((d,idx) => { if (i+idx < 6) nc[i+idx] = d }); setRoomCode(nc.join('').trimEnd().slice(0,6)); (document.getElementById(`rc-${Math.min(i+digits.length,5)}`) as HTMLInputElement)?.focus(); return }
                  const nc = roomCode.padEnd(6,' ').split(''); nc[i] = val || ' '; setRoomCode(nc.join('').trimEnd())
                  if (val && i < 5) (document.getElementById(`rc-${i+1}`) as HTMLInputElement)?.focus()
                }}
                onKeyDown={e => { if (e.key === 'Backspace' && !roomCode[i] && i > 0) (document.getElementById(`rc-${i-1}`) as HTMLInputElement)?.focus(); if (e.key === 'Enter' && roomCode.replace(/ /g,'').length === 6) joinRoom(roomCode.replace(/ /g,'')) }}
              />
            ))}
          </div>

          <button onClick={() => joinRoom(roomCode.replace(/ /g,''))} disabled={!isConnected || roomCode.replace(/ /g,'').length !== 6 || step === 'connecting'}
            style={{ width: '100%', height: 56, background: isConnected ? '#0e7490' : '#374151', color: '#fff', fontSize: 18, fontWeight: 800, borderRadius: 16, border: 'none', cursor: isConnected ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (!isConnected || roomCode.replace(/ /g,'').length !== 6) ? 0.4 : 1 }}>
            {step === 'connecting' ? <><div style={{ width: 18, height: 18, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />Connecting…</> : <><Wifi style={{ width: 18, height: 18 }} />Connect</>}
          </button>

          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
            {isConnected
              ? <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Wifi style={{ width: 12, height: 12 }} />Server Online</span>
              : <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><WifiOff style={{ width: 12, height: 12 }} />Connecting to server…</span>}
          </div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  // ── Lobby ────────────────────────────────────────────────────────────────────
  const cs = PLAYER_COLORS[player?.color || 'red']
  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#030712,#111827)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', fontFamily: 'system-ui,sans-serif' }}>
      <ReconnectBanner />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: cs.primary, boxShadow: `0 0 14px ${cs.primary}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 19, color: '#fff' }}>{player?.id ?? '?'}</div>
          <div>
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: 0 }}>Player {player?.id}</p>
            <p style={{ color: '#6b7280', fontSize: 12, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}><Zap style={{ width: 10, height: 10 }} />{latency}ms</p>
          </div>
        </div>
        <div style={{ color: '#22d3ee', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 8, padding: '5px 14px', fontFamily: 'monospace', fontSize: 14, fontWeight: 700 }}>{roomCode}</div>
      </div>

      <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!romName ? (
          <>
            {romError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12 }}>
                <AlertCircle style={{ width: 20, height: 20, color: '#f87171', flexShrink: 0, marginTop: 1 }} />
                <div><p style={{ color: '#fca5a5', fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>{romError.error}</p><p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>{romError.suggestion}</p></div>
                <button onClick={() => setRomError(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, flexShrink: 0 }}><X style={{ width: 16, height: 16 }} /></button>
              </div>
            )}
            {isUploading && uploadStage && (
              <div style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 16, padding: '14px 16px' }}>
                {(['reading','validating','sending','ready'] as const).map(key => {
                  const labels: Record<string, string> = { reading: 'Reading file…', validating: 'Detecting console…', sending: 'Sending to TV…', ready: 'Ready to launch!' }
                  const colors: Record<string, string> = { reading: '#22d3ee', validating: '#a78bfa', sending: '#4ade80', ready: '#f59e0b' }
                  const stages = ['reading','validating','sending','ready']
                  const done   = stages.indexOf(key) < stages.indexOf(uploadStage!)
                  const active = key === uploadStage
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? `${colors[key]}30` : active ? `${colors[key]}18` : 'rgba(255,255,255,0.04)', border: `1.5px solid ${done || active ? colors[key] : 'rgba(255,255,255,0.08)'}` }}>
                        {done ? <span style={{ color: colors[key], fontSize: 11 }}>✓</span> : active ? <div style={{ width: 8, height: 8, border: `2px solid ${colors[key]}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : null}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: done ? '#6b7280' : active ? '#fff' : '#374151' }}>{labels[key]}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div onClick={() => !isUploading && fileInputRef.current?.click()}
              style={{ border: `2px dashed ${romError ? '#ef4444' : '#374151'}`, borderRadius: 20, padding: 36, textAlign: 'center', cursor: isUploading ? 'default' : 'pointer', opacity: isUploading ? 0.4 : 1 }}
              onTouchStart={e => { if (!isUploading) e.currentTarget.style.borderColor = '#22d3ee' }}
              onTouchEnd={e => (e.currentTarget.style.borderColor = romError ? '#ef4444' : '#374151')}>
              <Upload style={{ width: 48, height: 48, color: '#6b7280', margin: '0 auto 14px', display: 'block' }} />
              <p style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Upload ROM</p>
              <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>NES · SNES · GBA · GB · GBC · Genesis · SMS</p>
              <input ref={fileInputRef} type="file" accept={getSupportedExtensions()} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { uploadROM(f); e.target.value = '' } }} />
            </div>
          </>
        ) : (
          <div style={{ background: 'rgba(31,41,55,0.7)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, background: 'rgba(74,222,128,0.12)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check style={{ width: 24, height: 24, color: '#4ade80' }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{romName}</p>
              <p style={{ color: '#9ca3af', fontSize: 12, margin: '3px 0 0' }}>{{ nes:'NES', snes:'SNES', gba:'GBA', gb:'Game Boy', gbc:'Game Boy Color', genesis:'Genesis', sms:'Master System' }[consoleType || 'nes'] ?? consoleType?.toUpperCase()}</p>
            </div>
            <button onClick={() => { setRomName(null); setGameStatus('idle') }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}><X style={{ width: 18, height: 18 }} /></button>
          </div>
        )}

        {romName && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => setReady(!player?.ready)} style={{ width: '100%', height: 60, borderRadius: 18, backgroundColor: player?.ready ? '#15803d' : '#0e7490', color: '#fff', fontSize: 20, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: player?.ready ? '0 0 24px rgba(22,163,74,0.35)' : '0 0 20px rgba(8,145,178,0.25)' }}>
              {player?.ready ? '✓  Ready!' : 'Press Ready'}
            </button>
            {player?.ready && (
              <button onClick={startGame} style={{ width: '100%', height: 60, borderRadius: 18, backgroundColor: '#7c3aed', color: '#fff', fontSize: 20, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 0 28px rgba(124,58,237,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Play style={{ width: 22, height: 22 }} />Start Game
              </button>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
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
