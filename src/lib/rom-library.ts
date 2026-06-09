// ROM Library Scanner — SERVER-SIDE ONLY (uses Node.js fs/path).
// Only import this from API route handlers, never from client components.

import fs from 'fs'
import path from 'path'
export type { LibraryConsoleType, ROMEntry } from './rom-library-types'
export { CONSOLE_META } from './rom-library-types'
import type { LibraryConsoleType, ROMEntry } from './rom-library-types'

// ── Console folder → type mapping ─────────────────────────────────────────────

interface ConsoleDef {
  type: LibraryConsoleType
  emulatorType: string
  extensions: Set<string>
  folderKeywords: string[]
}

const CONSOLE_DEFS: ConsoleDef[] = [
  { type: 'snes',    emulatorType: 'snes',    extensions: new Set(['.sfc','.smc','.fig']),  folderKeywords: ['SUPER NINTENDO'] },
  { type: 'nes',     emulatorType: 'nes',     extensions: new Set(['.nes','.fds','.unf']),  folderKeywords: ['NINTENDO ENTERTAINMENT'] },
  { type: 'gbc',     emulatorType: 'gba',     extensions: new Set(['.gbc']),                folderKeywords: ['GAMEBOY COLOR','GAME BOY COLOR'] },
  { type: 'gb',      emulatorType: 'gba',     extensions: new Set(['.gb']),                 folderKeywords: ['GAMEBOY','GAME BOY'] },
  { type: 'genesis', emulatorType: 'genesis', extensions: new Set(['.md','.gen','.smd']),  folderKeywords: ['GENESIS','MEGA DRIVE'] },
  { type: 'sms',     emulatorType: 'genesis', extensions: new Set(['.sms','.sg']),          folderKeywords: ['MASTER SYSTEM'] },
]

function normalizeTitle(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function makeId(consoleType: string, filename: string): string {
  return `${consoleType}_${filename.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`
}

function detectConsoleFromFolder(folderName: string): ConsoleDef | null {
  const upper = folderName.toUpperCase()
  for (const def of CONSOLE_DEFS) {
    if (def.folderKeywords.some(kw => upper.includes(kw))) return def
  }
  return null
}

function detectConsoleFromExt(ext: string): ConsoleDef | null {
  for (const def of CONSOLE_DEFS) {
    if (def.extensions.has(ext.toLowerCase())) return def
  }
  return null
}

let _cache: ROMEntry[] | null = null

export function bustROMCache(): void { _cache = null }

export function getROMLibrary(): ROMEntry[] {
  if (_cache) return _cache

  const romsRoot = path.join(process.cwd(), 'ROMS')
  if (!fs.existsSync(romsRoot)) { _cache = []; return _cache }

  const entries: ROMEntry[] = []

  for (const folder of fs.readdirSync(romsRoot)) {
    const folderPath = path.join(romsRoot, folder)
    if (!fs.statSync(folderPath).isDirectory()) continue
    const consoleDef = detectConsoleFromFolder(folder)

    for (const filename of fs.readdirSync(folderPath)) {
      const ext = path.extname(filename).toLowerCase()
      if (!ext || filename.startsWith('---')) continue
      // Per-file extension detection — handles mixed folders (e.g. GB + GBC together)
      const def = detectConsoleFromExt(ext) ?? consoleDef
      if (!def || !def.extensions.has(ext)) continue

      const filepath = path.join(folderPath, filename)
      entries.push({
        id: makeId(def.type, filename),
        title: normalizeTitle(filename),
        normalizedTitle: normalizeTitle(filename).toLowerCase(),
        consoleType: def.type,
        emulatorType: def.emulatorType,
        filename,
        filepath,
        size: fs.statSync(filepath).size,
      })
    }
  }

  entries.sort((a, b) =>
    a.consoleType.localeCompare(b.consoleType) ||
    a.normalizedTitle.localeCompare(b.normalizedTitle)
  )

  _cache = entries
  return _cache
}

export function getROMsByConsole(): Map<LibraryConsoleType, ROMEntry[]> {
  const grouped = new Map<LibraryConsoleType, ROMEntry[]>()
  for (const rom of getROMLibrary()) {
    const arr = grouped.get(rom.consoleType) ?? []
    arr.push(rom)
    grouped.set(rom.consoleType, arr)
  }
  return grouped
}

export function getROMById(id: string): ROMEntry | undefined {
  return getROMLibrary().find(r => r.id === id)
}

export function searchROMs(query: string, limit = 50): ROMEntry[] {
  const q = query.toLowerCase().trim()
  if (!q) return getROMLibrary().slice(0, limit)

  const tokens = q.split(/\s+/)
  return getROMLibrary()
    .map(rom => ({
      rom,
      score: tokens.reduce((s, t) =>
        s + ((rom.normalizedTitle + ' ' + rom.consoleType).includes(t) ? 1 : 0), 0),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.rom.normalizedTitle.localeCompare(b.rom.normalizedTitle))
    .slice(0, limit)
    .map(x => x.rom)
}
