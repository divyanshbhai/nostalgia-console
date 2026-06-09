'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Search, Heart, Clock, ChevronLeft, Star, X, Play, Loader2 } from 'lucide-react'
import { CONSOLE_META, type LibraryConsoleType } from '@/lib/rom-library-types'
import {
  getFavorites,
  toggleFavorite,
  getRecentlyPlayed,
  recordPlay,
  type RecentEntry,
} from '@/lib/rom-favorites'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ROMRecord {
  id: string
  title: string
  consoleType: LibraryConsoleType
  emulatorType: string
  filename: string
  size: number
}

interface ConsoleGroup {
  type: LibraryConsoleType
  meta: typeof CONSOLE_META[LibraryConsoleType]
  count: number
  roms: ROMRecord[]
}

interface LibraryData {
  total: number
  consoles: ConsoleGroup[]
}

interface Props {
  onLaunch: (rom: ROMRecord) => void
  isLaunching: boolean
}

// ── Artwork Generator ─────────────────────────────────────────────────────────
// Generates a deterministic gradient + initials card for each game.
// Never shows broken images — purely CSS/canvas driven.

const CARD_GRADIENTS = [
  ['#7c3aed', '#1e1b4b'],
  ['#dc2626', '#450a0a'],
  ['#0ea5e9', '#0c4a6e'],
  ['#16a34a', '#14532d'],
  ['#f59e0b', '#451a03'],
  ['#ec4899', '#500724'],
  ['#06b6d4', '#083344'],
  ['#8b5cf6', '#2e1065'],
  ['#ef4444', '#1c0404'],
  ['#22d3ee', '#042f2e'],
]

function getGradient(title: string): [string, string] {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  const pair = CARD_GRADIENTS[hash % CARD_GRADIENTS.length]
  return [pair[0], pair[1]]
}

function GameArtwork({ title, size = 56 }: { title: string; size?: number }) {
  const [from, to] = getGradient(title)
  const initials = title
    .split(' ')
    .filter(w => w.length > 0 && /[A-Za-z0-9]/.test(w[0]))
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')

  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.22),
      background: `linear-gradient(145deg, ${from}, ${to})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, overflow: 'hidden', position: 'relative',
    }}>
      {/* Subtle grid overlay for depth */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.12) 0%, transparent 60%)',
      }} />
      <span style={{
        fontSize: Math.round(size * 0.3), fontWeight: 900, color: 'rgba(255,255,255,0.9)',
        textShadow: '0 1px 4px rgba(0,0,0,0.5)', position: 'relative', zIndex: 1,
      }}>
        {initials || '?'}
      </span>
    </div>
  )
}

// ── Console Card ──────────────────────────────────────────────────────────────

function ConsoleCard({ group, onSelect }: { group: ConsoleGroup; onSelect: () => void }) {
  const [pressed, setPressed] = useState(false)
  const touchStartY = useRef(0)
  const didScroll = useRef(false)
  const meta = group.meta

  return (
    <button
      onTouchStart={e => { touchStartY.current = e.touches[0].clientY; didScroll.current = false; setPressed(true) }}
      onTouchMove={e => { if (Math.abs(e.touches[0].clientY - touchStartY.current) > 8) didScroll.current = true }}
      onTouchEnd={() => { setPressed(false); if (!didScroll.current) onSelect() }}
      onTouchCancel={() => { setPressed(false); didScroll.current = true }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => { setPressed(false); onSelect() }}
      onMouseLeave={() => setPressed(false)}
      style={{
        width: '100%',
        background: meta.gradient,
        border: 'none',
        borderRadius: 20,
        padding: '20px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        cursor: 'pointer',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        boxShadow: pressed
          ? `0 2px 8px ${meta.glow}`
          : `0 8px 32px ${meta.glow}, 0 2px 8px rgba(0,0,0,0.4)`,
        transition: 'transform 80ms, box-shadow 80ms',
        WebkitTapHighlightColor: 'transparent',
        textAlign: 'left',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Shine effect */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)',
        borderRadius: '20px 20px 0 0', pointerEvents: 'none',
      }} />

      <span style={{ fontSize: 40, lineHeight: 1, flexShrink: 0 }}>{meta.icon}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: '#fff', fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
          {meta.shortLabel}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '2px 0 0' }}>
          {meta.label}
        </p>
      </div>

      <div style={{
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 12, padding: '6px 12px',
        flexShrink: 0,
      }}>
        <span style={{ color: '#fff', fontSize: 18, fontWeight: 900 }}>{group.count}</span>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, margin: '1px 0 0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Games</p>
      </div>
    </button>
  )
}

// ── Shimmer skeleton ──────────────────────────────────────────────────────────

function Shimmer({ w, h, r = 8 }: { w: number | string; h: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      flexShrink: 0,
    }} />
  )
}

// ── Game Row Card ─────────────────────────────────────────────────────────────

function GameRow({
  rom, isFav, onFav, onLaunch, isLaunching,
}: {
  rom: ROMRecord
  isFav: boolean
  onFav: () => void
  onLaunch: () => void
  isLaunching: boolean
}) {
  const [pressed, setPressed] = useState(false)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      transform: pressed ? 'scale(0.98)' : 'scale(1)',
      transition: 'transform 60ms',
    }}>
      <GameArtwork title={rom.title} size={52} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          color: '#f9fafb', fontSize: 14, fontWeight: 700, margin: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {rom.title}
        </p>
        <p style={{ color: '#6b7280', fontSize: 11, margin: '2px 0 0' }}>
          {CONSOLE_META[rom.consoleType]?.shortLabel ?? rom.consoleType.toUpperCase()}
          {'  ·  '}{(rom.size / 1024).toFixed(0)} KB
        </p>
      </div>

      {/* Fav button */}
      <button
        onTouchEnd={e => { e.stopPropagation(); onFav() }}
        onClick={e => { e.stopPropagation(); onFav() }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 6, flexShrink: 0, color: isFav ? '#f43f5e' : '#374151',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Heart size={18} fill={isFav ? '#f43f5e' : 'none'} />
      </button>

      {/* Launch */}
      <button
        onTouchStart={() => setPressed(true)}
        onTouchEnd={e => { setPressed(false); e.stopPropagation(); onLaunch() }}
        onTouchCancel={() => setPressed(false)}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => { setPressed(false); onLaunch() }}
        onMouseLeave={() => setPressed(false)}
        disabled={isLaunching}
        style={{
          width: 42, height: 42, borderRadius: 12,
          background: isLaunching ? '#1f2937' : '#7c3aed',
          border: 'none', cursor: isLaunching ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, WebkitTapHighlightColor: 'transparent',
          boxShadow: isLaunching ? 'none' : '0 4px 14px rgba(124,58,237,0.5)',
          transition: 'background 100ms',
        }}
      >
        {isLaunching
          ? <Loader2 size={18} color="#6b7280" style={{ animation: 'spin 1s linear infinite' }} />
          : <Play size={16} color="#fff" fill="#fff" />}
      </button>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>{icon}</div>
      <p style={{ color: '#f9fafb', fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</p>
      <p style={{ color: '#6b7280', fontSize: 13, margin: '6px 0 0' }}>{sub}</p>
    </div>
  )
}

// ── Main ROM Library Browser ──────────────────────────────────────────────────

type View = 'consoles' | 'games' | 'search' | 'favorites' | 'recent'

export function ROMLibraryBrowser({ onLaunch, isLaunching }: Props) {
  const [data, setData]             = useState<LibraryData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [view, setView]             = useState<View>('consoles')
  const [activeConsole, setActive]  = useState<LibraryConsoleType | null>(null)
  const [searchQuery, setSearch]    = useState('')
  const [searchResults, setResults] = useState<ROMRecord[]>([])
  const [favorites, setFavs]        = useState<Set<string>>(new Set())
  const [recent, setRecent]         = useState<RecentEntry[]>([])
  const [launchingId, setLaunchId]  = useState<string | null>(null)

  const searchRef  = useRef<HTMLInputElement>(null)
  const searchTmr  = useRef<NodeJS.Timeout | null>(null)

  // Load library metadata
  useEffect(() => {
    fetch('/api/roms')
      .then(r => r.json())
      .then((d: LibraryData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
    setFavs(getFavorites())
    setRecent(getRecentlyPlayed())
  }, [])

  // Instant search with debounce
  useEffect(() => {
    if (view !== 'search') return
    if (searchTmr.current) clearTimeout(searchTmr.current)
    if (!searchQuery.trim()) { setResults([]); return }
    searchTmr.current = setTimeout(async () => {
      const r = await fetch(`/api/roms/search?q=${encodeURIComponent(searchQuery)}&limit=60`)
      const d = await r.json()
      setResults(d.results ?? [])
    }, 120)
    return () => { if (searchTmr.current) clearTimeout(searchTmr.current) }
  }, [searchQuery, view])

  const handleFav = useCallback((id: string) => {
    toggleFavorite(id)
    setFavs(getFavorites())
    if (view === 'favorites') setRecent(prev => prev) // force re-render
  }, [view])

  const handleLaunch = useCallback(async (rom: ROMRecord) => {
    if (launchingId) return
    setLaunchId(rom.id)
    try {
      const res = await fetch(`/api/roms/${rom.id}`)
      if (!res.ok) throw new Error('Fetch failed')
      const buf = await res.arrayBuffer()
      recordPlay({ id: rom.id, title: rom.title, consoleType: rom.consoleType })
      setRecent(getRecentlyPlayed())
      onLaunch({ ...rom, _buffer: buf } as any)
    } catch (e) {
      console.error('ROM fetch error', e)
    } finally {
      setLaunchId(null)
    }
  }, [launchingId, onLaunch])

  // Derived: favorites list from data
  const favRoms = useMemo<ROMRecord[]>(() => {
    if (!data) return []
    const all = data.consoles.flatMap(c => c.roms)
    return all.filter(r => favorites.has(r.id))
  }, [data, favorites])

  // All roms for current console
  const consoleRoms = useMemo<ROMRecord[]>(() => {
    if (!data || !activeConsole) return []
    return data.consoles.find(c => c.type === activeConsole)?.roms ?? []
  }, [data, activeConsole])

  // ── Header ─────────────────────────────────────────────────────────────────
  const Header = () => {
    const canBack = view !== 'consoles'
    const titles: Record<View, string> = {
      consoles:  'Game Library',
      games:     activeConsole ? CONSOLE_META[activeConsole].shortLabel : 'Games',
      search:    'Search',
      favorites: 'Favorites',
      recent:    'Recently Played',
    }
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        {canBack && (
          <button
            onClick={() => {
              if (view === 'games') { setView('consoles'); setActive(null) }
              else setView('consoles')
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px 4px 4px 0', WebkitTapHighlightColor: 'transparent' }}
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <p style={{ color: '#f9fafb', fontSize: 17, fontWeight: 800, margin: 0, flex: 1 }}>
          {titles[view]}
        </p>
        {/* Search icon in main view */}
        {view === 'consoles' && (
          <button
            onClick={() => { setView('search'); setTimeout(() => searchRef.current?.focus(), 100) }}
            style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer', color: '#9ca3af', WebkitTapHighlightColor: 'transparent' }}
          >
            <Search size={18} />
          </button>
        )}
      </div>
    )
  }

  // ── Navigation tabs (bottom) ───────────────────────────────────────────────
  const NavBar = () => (
    <div style={{
      display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0, backgroundColor: '#0a0a0f',
    }}>
      {([
        { v: 'consoles' as View,  icon: '🎮', label: 'Library' },
        { v: 'search'   as View,  icon: '🔍', label: 'Search'  },
        { v: 'favorites' as View, icon: '❤️',  label: 'Favs'   },
        { v: 'recent'   as View,  icon: '🕐',  label: 'Recent' },
      ] as { v: View; icon: string; label: string }[]).map(({ v, icon, label }) => {
        const active = view === v || (view === 'games' && v === 'consoles')
        return (
          <button key={v} onClick={() => {
            if (v === 'search') setTimeout(() => searchRef.current?.focus(), 100)
            if (v !== 'games') setView(v)
          }} style={{
            flex: 1, padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: active ? '#a78bfa' : '#4b5563', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
          </button>
        )
      })}
    </div>
  )

  // ── Views ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#060609' }}>
        <Header />
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 20, background: 'rgba(255,255,255,0.03)' }}>
              <Shimmer w={48} h={48} r={14} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Shimmer w="60%" h={14} />
                <Shimmer w="40%" h={10} />
              </div>
              <Shimmer w={48} h={48} r={12} />
            </div>
          ))}
        </div>
        <NavBar />
        <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (!data || data.total === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#060609' }}>
        <Header />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState icon="📭" title="No ROMs Found" sub="Add ROMs to the /ROMS folder to get started." />
        </div>
        <NavBar />
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#060609' }}>
      <Header />

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

        {/* ── Console Picker ─────────────────────────────────────── */}
        {(view === 'consoles') && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Summary */}
            <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>
              {data.total} games across {data.consoles.length} consoles
            </p>

            {/* Console cards */}
            {data.consoles.map(group => (
              <ConsoleCard key={group.type} group={group} onSelect={() => {
                setActive(group.type); setView('games')
              }} />
            ))}
          </div>
        )}

        {/* ── Game List ──────────────────────────────────────────── */}
        {view === 'games' && (
          <div style={{ padding: '4px 16px 16px' }}>
            {consoleRoms.length === 0
              ? <EmptyState icon="🎮" title="No Games" sub="No ROMs found for this console." />
              : consoleRoms.map(rom => (
                  <GameRow
                    key={rom.id} rom={rom}
                    isFav={favorites.has(rom.id)}
                    onFav={() => handleFav(rom.id)}
                    onLaunch={() => handleLaunch(rom)}
                    isLaunching={launchingId === rom.id || isLaunching}
                  />
                ))
            }
          </div>
        )}

        {/* ── Search ────────────────────────────────────────────── */}
        {view === 'search' && (
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.06)', borderRadius: 14,
              padding: '0 14px', margin: '10px 0 14px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <Search size={16} color="#6b7280" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search games, consoles…"
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: '#f9fafb', fontSize: 15, padding: '14px 0',
                  fontFamily: 'system-ui, sans-serif',
                }}
              />
              {searchQuery && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0 }}>
                  <X size={16} />
                </button>
              )}
            </div>

            {!searchQuery.trim()
              ? <EmptyState icon="🔍" title="Search your library" sub="Type a game name or console to find it instantly." />
              : searchResults.length === 0
                ? <EmptyState icon="😶" title="No results" sub={`Nothing found for "${searchQuery}"`} />
                : searchResults.map(rom => (
                    <GameRow
                      key={rom.id} rom={rom}
                      isFav={favorites.has(rom.id)}
                      onFav={() => handleFav(rom.id)}
                      onLaunch={() => handleLaunch(rom)}
                      isLaunching={launchingId === rom.id || isLaunching}
                    />
                  ))
            }
          </div>
        )}

        {/* ── Favorites ─────────────────────────────────────────── */}
        {view === 'favorites' && (
          <div style={{ padding: '4px 16px 16px' }}>
            {favRoms.length === 0
              ? <EmptyState icon="💔" title="No Favorites Yet" sub="Tap the heart on any game to save it here." />
              : favRoms.map(rom => (
                  <GameRow
                    key={rom.id} rom={rom}
                    isFav={true}
                    onFav={() => handleFav(rom.id)}
                    onLaunch={() => handleLaunch(rom)}
                    isLaunching={launchingId === rom.id || isLaunching}
                  />
                ))
            }
          </div>
        )}

        {/* ── Recently Played ───────────────────────────────────── */}
        {view === 'recent' && (
          <div style={{ padding: '4px 16px 16px' }}>
            {recent.length === 0
              ? <EmptyState icon="🎲" title="No Games Played Yet" sub="Launch a game from the library to see it here." />
              : (() => {
                  // Match recent entries to ROM records
                  const allRoms = data.consoles.flatMap(c => c.roms)
                  return recent.map(entry => {
                    const rom = allRoms.find(r => r.id === entry.id)
                    if (!rom) return null
                    return (
                      <div key={entry.id}>
                        <GameRow
                          rom={rom}
                          isFav={favorites.has(rom.id)}
                          onFav={() => handleFav(rom.id)}
                          onLaunch={() => handleLaunch(rom)}
                          isLaunching={launchingId === rom.id || isLaunching}
                        />
                        <p style={{ color: '#4b5563', fontSize: 10, margin: '-6px 0 4px 66px' }}>
                          Played {entry.playCount}× · {new Date(entry.lastPlayed).toLocaleDateString()}
                        </p>
                      </div>
                    )
                  }).filter(Boolean)
                })()
            }
          </div>
        )}
      </div>

      <NavBar />
      <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
