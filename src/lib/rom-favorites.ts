// ROM Favorites & Recently Played — localStorage, client-side only.

const FAV_KEY = 'nc:rom:favorites'
const RECENT_KEY = 'nc:rom:recent'
const MAX_RECENT = 20

export interface RecentEntry {
  id: string
  title: string
  consoleType: string
  lastPlayed: number
  playCount: number
}

// ── Favorites ─────────────────────────────────────────────────────────────────

export function getFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

export function toggleFavorite(id: string): boolean {
  const favs = getFavorites()
  const isNowFav = !favs.has(id)
  isNowFav ? favs.add(id) : favs.delete(id)
  localStorage.setItem(FAV_KEY, JSON.stringify([...favs]))
  return isNowFav
}

export function isFavorite(id: string): boolean {
  return getFavorites().has(id)
}

// ── Recently Played ───────────────────────────────────────────────────────────

export function getRecentlyPlayed(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function recordPlay(entry: Omit<RecentEntry, 'lastPlayed' | 'playCount'>): void {
  const recent = getRecentlyPlayed()
  const existing = recent.find(r => r.id === entry.id)
  if (existing) {
    existing.lastPlayed = Date.now()
    existing.playCount++
    // Move to front
    const idx = recent.indexOf(existing)
    recent.splice(idx, 1)
    recent.unshift(existing)
  } else {
    recent.unshift({ ...entry, lastPlayed: Date.now(), playCount: 1 })
  }
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
}
