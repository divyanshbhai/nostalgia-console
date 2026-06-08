// ROM Validator — auto-detects console from file extension + magic bytes,
// validates size, and returns structured results with friendly error messages.

export type SupportedConsole = 'nes' | 'snes' | 'gba' | 'gb' | 'gbc' | 'genesis' | 'sms'

export interface ROMValidationResult {
  valid: boolean
  consoleType: SupportedConsole | null
  consoleName: string | null
  error: string | null
  suggestion: string | null
  detectedBy: 'extension' | 'magic' | null
}

// ── Console definitions ───────────────────────────────────────────────────────

interface ConsoleDef {
  name: string
  extensions: string[]
  maxSizeMB: number
  magic?: { offset: number; bytes: number[] }
  // Which EmulatorJS ConsoleType to map to
  emulatorType: string
}

const CONSOLES: Record<SupportedConsole, ConsoleDef> = {
  nes: {
    name: 'Nintendo Entertainment System',
    extensions: ['.nes', '.fds', '.unf'],
    maxSizeMB: 4,
    magic: { offset: 0, bytes: [0x4e, 0x45, 0x53, 0x1a] }, // "NES\x1a"
    emulatorType: 'nes',
  },
  snes: {
    name: 'Super Nintendo',
    extensions: ['.sfc', '.smc', '.fig', '.bs'],
    maxSizeMB: 8,
    emulatorType: 'snes',
  },
  gba: {
    name: 'Game Boy Advance',
    extensions: ['.gba'],
    maxSizeMB: 32,
    magic: { offset: 0, bytes: [0x2e, 0x00, 0x00, 0xea] }, // GBA header start
    emulatorType: 'gba',
  },
  gb: {
    name: 'Game Boy',
    extensions: ['.gb'],
    maxSizeMB: 2,
    magic: { offset: 0x104, bytes: [0xce, 0xed, 0x66, 0x66] }, // Nintendo logo
    emulatorType: 'gba', // mgba handles GB/GBC too
  },
  gbc: {
    name: 'Game Boy Color',
    extensions: ['.gbc'],
    maxSizeMB: 4,
    magic: { offset: 0x104, bytes: [0xce, 0xed, 0x66, 0x66] },
    emulatorType: 'gba',
  },
  genesis: {
    name: 'Sega Genesis / Mega Drive',
    extensions: ['.md', '.smd', '.gen', '.bin'],
    maxSizeMB: 8,
    magic: { offset: 0x100, bytes: [0x53, 0x45, 0x47, 0x41] }, // "SEGA"
    emulatorType: 'genesis',
  },
  sms: {
    name: 'Sega Master System',
    extensions: ['.sms', '.sg'],
    maxSizeMB: 1,
    emulatorType: 'genesis', // genesis_plus_gx handles SMS too
  },
}

// Extensions that are never supported — give specific messages
const UNSUPPORTED: Record<string, string | null> = {
  '.zip': 'Compressed files are not supported. Please extract the ROM first.',
  '.rar': 'Compressed files are not supported. Please extract the ROM first.',
  '.7z': 'Compressed files are not supported. Please extract the ROM first.',
  '.iso': 'Disc images (PS2/GameCube/Wii) are not supported on this platform.',
  '.nds': 'Nintendo DS ROMs are not currently supported.',
  '.3ds': 'Nintendo 3DS ROMs are not supported.',
  '.wad': 'Wii WAD files are not supported.',
  '.n64': 'N64 ROMs are not currently supported.',
  '.z64': 'N64 ROMs are not currently supported.',
  '.v64': 'N64 ROMs are not currently supported.',
  '.bin': null, // Could be Genesis — let magic byte detection handle it
  '.cue': 'CD image files (PS1/Sega CD) are not supported.',
  '.chd': 'CD image files are not supported.',
}

// ── Main validator ────────────────────────────────────────────────────────────

export async function validateROM(file: File): Promise<ROMValidationResult> {
  const ext = getExtension(file.name)

  // 1. Check for explicitly unsupported extensions
  if (ext in UNSUPPORTED && UNSUPPORTED[ext] !== null) {
    return fail(UNSUPPORTED[ext]!, 'Try uploading a .nes, .sfc, .gba, .gb, .gbc, .md, or .sms file.')
  }

  // 2. Try extension match
  let matchedConsole = findByExtension(ext)

  // 3. If extension ambiguous (.bin) or no match, try magic bytes
  if (!matchedConsole || ext === '.bin') {
    const magic = matchedConsole ? null : await readMagicBytes(file, 0x110)
    if (magic) {
      const byMagic = findByMagic(magic)
      if (byMagic) matchedConsole = byMagic
    }
  }

  if (!matchedConsole) {
    const supportedExts = Object.values(CONSOLES)
      .flatMap(c => c.extensions)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(', ')
    return fail(
      `"${ext}" is not a supported ROM format.`,
      `Supported formats: ${supportedExts}`
    )
  }

  const def = CONSOLES[matchedConsole]

  // 4. Size check
  const sizeMB = file.size / (1024 * 1024)
  if (sizeMB > def.maxSizeMB) {
    return fail(
      `This file is ${sizeMB.toFixed(1)} MB — too large for a ${def.name} ROM (max ${def.maxSizeMB} MB).`,
      'The file might be corrupt or not a valid ROM.'
    )
  }

  if (file.size < 64) {
    return fail('This file is too small to be a valid ROM.', 'Make sure you selected the correct file.')
  }

  return {
    valid: true,
    consoleType: matchedConsole,
    consoleName: def.name,
    error: null,
    suggestion: null,
    detectedBy: 'extension',
  }
}

// Maps our SupportedConsole to the ConsoleType used by EmulatorAdapter
export function getEmulatorConsoleType(console: SupportedConsole): string {
  return CONSOLES[console].emulatorType
}

export function getSupportedExtensions(): string {
  return Object.values(CONSOLES)
    .flatMap(c => c.extensions)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(',')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i === -1 ? '' : filename.slice(i).toLowerCase()
}

function findByExtension(ext: string): SupportedConsole | null {
  for (const [key, def] of Object.entries(CONSOLES)) {
    if (def.extensions.includes(ext)) return key as SupportedConsole
  }
  return null
}

async function readMagicBytes(file: File, length: number): Promise<Uint8Array> {
  const slice = file.slice(0, length)
  const buf = await slice.arrayBuffer()
  return new Uint8Array(buf)
}

function findByMagic(bytes: Uint8Array): SupportedConsole | null {
  for (const [key, def] of Object.entries(CONSOLES)) {
    if (!def.magic) continue
    const { offset, bytes: magic } = def.magic
    if (bytes.length < offset + magic.length) continue
    if (magic.every((b, i) => bytes[offset + i] === b)) return key as SupportedConsole
  }
  return null
}

function fail(error: string, suggestion: string): ROMValidationResult {
  return { valid: false, consoleType: null, consoleName: null, error, suggestion, detectedBy: null }
}
