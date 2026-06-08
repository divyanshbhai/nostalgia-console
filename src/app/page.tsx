'use client'

import { useEffect, useState, useRef } from 'react'
import { getWsUrl } from '@/lib/ws-url'
import { io } from 'socket.io-client'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { Monitor, Gamepad2, Wifi, WifiOff, Download, ChevronRight, Zap, Users, Globe, Shield, Tv, Smartphone } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Animated background grid
// ─────────────────────────────────────────────────────────────────────────────

function GridBackground() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(124,58,237,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(124,58,237,0.06) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
      }} />
      {/* Floating orbs */}
      <div style={{ position: 'absolute', top: '15%', left: '10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)', animation: 'orbFloat 8s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '12%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%)', animation: 'orbFloat 10s ease-in-out 2s infinite reverse' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Console badge
// ─────────────────────────────────────────────────────────────────────────────

const CONSOLES = [
  { name: 'NES',      color: '#ef4444', label: '8-bit'  },
  { name: 'SNES',     color: '#a855f7', label: '16-bit' },
  { name: 'Game Boy', color: '#22c55e', label: 'Handheld' },
  { name: 'GBA',      color: '#3b82f6', label: 'Handheld' },
  { name: 'Genesis',  color: '#0ea5e9', label: '16-bit' },
  { name: 'SMS',      color: '#f59e0b', label: '8-bit'  },
]

function ConsoleBadge({ name, color, label }: { name: string; color: string; label: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 18, padding: '18px 20px', minWidth: 100,
      transition: 'all 0.2s ease', cursor: 'default',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `${color}12`
        e.currentTarget.style.borderColor = `${color}40`
        e.currentTarget.style.transform = 'translateY(-3px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${color}20`, border: `1.5px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Gamepad2 style={{ width: 20, height: 20, color }} />
      </div>
      <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{name}</span>
      <span style={{ color: '#4b5563', fontSize: 11, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature card
// ─────────────────────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, desc, color }: { icon: React.ReactNode; title: string; desc: string; color: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 24, padding: '28px 24px',
      display: 'flex', flexDirection: 'column', gap: 14,
      transition: 'all 0.2s ease',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}40`; e.currentTarget.style.background = `${color}08` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: `${color}18`, border: `1.5px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ color: '#fff', fontWeight: 800, fontSize: 17, margin: '0 0 6px' }}>{title}</p>
        <p style={{ color: '#6b7280', fontSize: 14, margin: 0, lineHeight: 1.6 }}>{desc}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step
// ─────────────────────────────────────────────────────────────────────────────

function Step({ num, title, desc, color }: { num: number; title: string; desc: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, flex: 1, minWidth: 0, padding: '0 12px' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: `${color}18`, border: `2px solid ${color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 900, color,
        boxShadow: `0 0 20px ${color}20`,
      }}>{num}</div>
      <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, textAlign: 'center', margin: 0 }}>{title}</p>
      <p style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', margin: 0, lineHeight: 1.55 }}>{desc}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock controller preview
// ─────────────────────────────────────────────────────────────────────────────

function ControllerPreview() {
  const [active, setActive] = useState<string | null>(null)
  const buttons = [
    { id: 'Y', color: '#22c55e', top: '35%', left: '62%' },
    { id: 'X', color: '#3b82f6', top: '20%', left: '75%' },
    { id: 'B', color: '#facc15', top: '50%', left: '75%' },
    { id: 'A', color: '#ef4444', top: '35%', left: '88%' },
  ]
  useEffect(() => {
    const seq = ['A', 'B', 'Y', 'X', 'A', null]
    let i = 0
    const t = setInterval(() => { setActive(seq[i % seq.length]); i++ }, 600)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      width: '100%', maxWidth: 360, height: 220,
      background: 'linear-gradient(160deg, #1a1a2e, #0f0f1a)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 32, position: 'relative', overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    }}>
      {/* D-pad */}
      <div style={{ position: 'absolute', top: '30%', left: '12%', width: 80, height: 80 }}>
        {[
          { d: '▲', t: '0%', l: '33%' }, { d: '▼', t: '66%', l: '33%' },
          { d: '◀', t: '33%', l: '0%' }, { d: '▶', t: '33%', l: '66%' },
        ].map(({ d, t, l }) => (
          <div key={d} style={{
            position: 'absolute', width: 24, height: 24,
            top: t, left: l, borderRadius: 6,
            background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: '#9ca3af',
          }}>{d}</div>
        ))}
      </div>
      {/* Face buttons */}
      {buttons.map(b => (
        <div key={b.id} style={{
          position: 'absolute', width: 36, height: 36, borderRadius: '50%',
          top: b.top, left: b.left,
          backgroundColor: active === b.id ? '#fff' : b.color,
          boxShadow: active === b.id ? `0 0 16px ${b.color}` : `0 4px 12px ${b.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: active === b.id ? b.color : '#fff',
          fontWeight: 900, fontSize: 14,
          transition: 'all 0.1s ease',
          transform: `translate(-50%,-50%) scale(${active === b.id ? 0.88 : 1})`,
        }}>{b.id}</div>
      ))}
      {/* Status bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.4)', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 700 }}>● Connected</span>
        <span style={{ color: '#22d3ee', fontSize: 11, fontFamily: 'monospace' }}>12ms</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const { canInstall, install } = usePwaInstall()
  const checkedRef = useRef(false)

  useEffect(() => {
    if (checkedRef.current) return
    checkedRef.current = true
    const socket = io(getWsUrl(), { transports: ['websocket', 'polling'], reconnection: false, timeout: 5000 })
    socket.on('connect',       () => { setServerStatus('online');  socket.disconnect() })
    socket.on('connect_error', () =>   setServerStatus('offline'))
    return () => { socket.disconnect() }
  }, [])

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #06020f 0%, #08060f 50%, #060810 100%)',
      color: '#fff', fontFamily: 'system-ui,sans-serif',
      overflowX: 'hidden', position: 'relative',
    }}>
      <GridBackground />

      {/* ── Nav ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px',
        background: 'rgba(6,2,15,0.8)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Gamepad2 style={{ width: 18, height: 18, color: '#a78bfa' }} />
          </div>
          <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.01em' }}>Nostalgia Console</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/tv" style={{ textDecoration: 'none', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', color: '#a78bfa', borderRadius: 10, padding: '8px 18px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tv style={{ width: 14, height: 14 }} />TV Mode
          </a>
          <a href="/controller" style={{ textDecoration: 'none', background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.35)', color: '#22d3ee', borderRadius: 10, padding: '8px 18px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Smartphone style={{ width: 14, height: 14 }} />Controller
          </a>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 1 }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: 'center', padding: '80px 0 64px' }}>
          {/* Status badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 28, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: '6px 16px', fontSize: 13 }}>
            {serverStatus === 'online'
              ? <><div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#4ade80', boxShadow: '0 0 6px #4ade80', animation: 'pulse 2s ease infinite' }} /><span style={{ color: '#4ade80', fontWeight: 700 }}>Server Online</span></>
              : serverStatus === 'offline'
                ? <><div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#f87171' }} /><span style={{ color: '#f87171', fontWeight: 700 }}>Server Offline</span></>
                : <><div style={{ width: 7, height: 7, border: '2px solid #6b7280', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><span style={{ color: '#6b7280' }}>Checking…</span></>}
          </div>

          <h1 style={{
            fontSize: 'clamp(44px, 8vw, 88px)', fontWeight: 900,
            lineHeight: 1.0, letterSpacing: '-0.03em', margin: '0 0 8px',
            color: '#fff',
          }}>
            Retro Gaming,
          </h1>
          <h1 style={{
            fontSize: 'clamp(44px, 8vw, 88px)', fontWeight: 900,
            lineHeight: 1.0, letterSpacing: '-0.03em', margin: '0 0 28px',
            background: 'linear-gradient(90deg, #a78bfa 0%, #22d3ee 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Cloud Powered.
          </h1>

          <p style={{ color: '#9ca3af', fontSize: 'clamp(16px, 2.5vw, 20px)', lineHeight: 1.6, maxWidth: 600, margin: '0 auto 40px' }}>
            Turn any TV into a multiplayer retro console. Scan a QR code with your phone — it instantly becomes a premium game controller. No hardware, no installs.
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 48 }}>
            <a href="/tv" style={{ textDecoration: 'none' }}>
              <button style={{
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                color: '#fff', border: 'none', borderRadius: 16,
                padding: '16px 32px', fontSize: 17, fontWeight: 800,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: '0 8px 32px rgba(124,58,237,0.4)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(124,58,237,0.5)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(124,58,237,0.4)' }}>
                <Monitor style={{ width: 20, height: 20 }} />
                Open on TV
                <ChevronRight style={{ width: 18, height: 18 }} />
              </button>
            </a>
            <a href="/controller" style={{ textDecoration: 'none' }}>
              <button style={{
                background: 'rgba(6,182,212,0.1)',
                color: '#22d3ee', border: '1.5px solid rgba(6,182,212,0.4)', borderRadius: 16,
                padding: '16px 32px', fontSize: 17, fontWeight: 800,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(6,182,212,0.18)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(6,182,212,0.1)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                <Gamepad2 style={{ width: 20, height: 20 }} />
                Use as Controller
              </button>
            </a>
          </div>

          {/* Pills */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { icon: <Zap style={{ width: 12, height: 12 }} />, label: 'Instant pairing' },
              { icon: <Users style={{ width: 12, height: 12 }} />, label: '4-player local' },
              { icon: <Globe style={{ width: 12, height: 12 }} />, label: 'Works over internet' },
              { icon: <Shield style={{ width: 12, height: 12 }} />, label: 'Private sessions' },
            ].map(({ icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: '6px 14px', fontSize: 13, color: '#9ca3af' }}>
                {icon}<span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── How it works ── */}
        <div style={{ padding: '64px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 48 }}>HOW IT WORKS</p>
          <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 800, margin: '0 auto' }}>
            <Step num={1} color="#a78bfa" title="Open on TV" desc="Go to /tv on any browser. Works on Android TV, Smart TV, or any laptop." />
            <div style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 14, color: '#1f2937', fontSize: 20 }}>→</div>
            <Step num={2} color="#22d3ee" title="Scan QR Code" desc="Point your phone at the QR code. Opens the controller instantly." />
            <div style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 14, color: '#1f2937', fontSize: 20 }}>→</div>
            <Step num={3} color="#4ade80" title="Upload & Play" desc="Upload any ROM from your phone. The game starts on the TV immediately." />
          </div>
        </div>

        {/* ── Features ── */}
        <div style={{ padding: '64px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 48 }}>FEATURES</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <FeatureCard color="#a78bfa" icon={<Zap style={{ width: 22, height: 22, color: '#a78bfa' }} />}
              title="Ultra-Low Latency" desc="Sub-80ms input on local WiFi. Button presses feel instant — no visible lag." />
            <FeatureCard color="#22d3ee" icon={<Globe style={{ width: 22, height: 22, color: '#22d3ee' }} />}
              title="Play Anywhere" desc="Same WiFi, different networks, mobile hotspot — all supported through the relay server." />
            <FeatureCard color="#4ade80" icon={<Users style={{ width: 22, height: 22, color: '#4ade80' }} />}
              title="4-Player Multiplayer" desc="Up to 4 phones connected simultaneously. Each gets their own color and controller identity." />
            <FeatureCard color="#f59e0b" icon={<Gamepad2 style={{ width: 22, height: 22, color: '#f59e0b' }} />}
              title="Premium Controller" desc="D-pad, face buttons, shoulder buttons, haptics, save states, mute, fullscreen — all on your phone." />
            <FeatureCard color="#f87171" icon={<Shield style={{ width: 22, height: 22, color: '#f87171' }} />}
              title="Smart ROM Validation" desc="Auto-detects console from file extension and magic bytes. Gives clear errors for unsupported formats." />
            <FeatureCard color="#818cf8" icon={<Download style={{ width: 22, height: 22, color: '#818cf8' }} />}
              title="Installable PWA" desc="Add to Home Screen on iOS and Android. Works like a native app with offline shell support." />
          </div>
        </div>

        {/* ── Consoles + Controller preview ── */}
        <div style={{ padding: '64px 0', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 60, alignItems: 'center' }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 24 }}>SUPPORTED CONSOLES</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {CONSOLES.map(c => <ConsoleBadge key={c.name} {...c} />)}
            </div>
            <p style={{ color: '#374151', fontSize: 13, marginTop: 20, lineHeight: 1.6 }}>
              All consoles run client-side via EmulatorJS + WebAssembly libretro cores. Nothing is processed on the server.
            </p>
          </div>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 24 }}>PHONE CONTROLLER</p>
            <ControllerPreview />
            <p style={{ color: '#374151', fontSize: 13, marginTop: 16, lineHeight: 1.6 }}>
              Animated button presses, haptic feedback, latency indicator, portrait and landscape support.
            </p>
          </div>
        </div>

        {/* ── CTA bottom ── */}
        <div style={{ textAlign: 'center', padding: '80px 0 48px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 16px' }}>
            Ready to play?
          </h2>
          <p style={{ color: '#6b7280', fontSize: 17, marginBottom: 36 }}>
            Open on your TV and scan the QR code. Takes 10 seconds.
          </p>
          <a href="/tv" style={{ textDecoration: 'none' }}>
            <button style={{
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              color: '#fff', border: 'none', borderRadius: 16,
              padding: '18px 40px', fontSize: 18, fontWeight: 800,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
              boxShadow: '0 8px 32px rgba(124,58,237,0.4)',
            }}>
              <Monitor style={{ width: 22, height: 22 }} />
              Launch TV Mode
              <ChevronRight style={{ width: 20, height: 20 }} />
            </button>
          </a>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '24px', textAlign: 'center', color: '#1f2937', fontSize: 13, position: 'relative', zIndex: 1 }}>
        Nostalgia Console · Open source · Deployable on Vercel + Railway
      </div>

      {/* PWA install banner */}
      {canInstall && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, background: 'rgba(12,6,30,0.97)',
          border: '1px solid rgba(124,58,237,0.4)', borderRadius: 20,
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14,
          backdropFilter: 'blur(16px)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          width: 'calc(100% - 48px)', maxWidth: 420,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Gamepad2 style={{ width: 22, height: 22, color: '#a78bfa' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: '0 0 2px' }}>Install Nostalgia Console</p>
            <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>Add to home screen for the best experience</p>
          </div>
          <button onClick={install} style={{
            background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10,
            padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          }}>
            <Download style={{ width: 13, height: 13 }} />Install
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin      { to { transform: rotate(360deg); } }
        @keyframes pulse     { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes orbFloat  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-30px); } }
      `}</style>
    </div>
  )
}
