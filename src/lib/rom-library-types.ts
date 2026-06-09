// ROM Library shared types & metadata — importable by both server and client.

export type LibraryConsoleType = 'nes' | 'snes' | 'gb' | 'gbc' | 'genesis' | 'sms'

export interface ROMEntry {
  id: string
  title: string
  normalizedTitle: string
  consoleType: LibraryConsoleType
  emulatorType: string
  filename: string
  filepath: string  // absolute, server-side only — empty string on client
  size: number
}

export const CONSOLE_META: Record<LibraryConsoleType, {
  label: string
  shortLabel: string
  gradient: string
  glow: string
  icon: string
  description: string
}> = {
  nes: {
    label: 'Nintendo Entertainment System',
    shortLabel: 'NES',
    gradient: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
    glow: 'rgba(220,38,38,0.4)',
    icon: '🎮',
    description: 'The console that saved gaming',
  },
  snes: {
    label: 'Super Nintendo',
    shortLabel: 'SNES',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
    glow: 'rgba(124,58,237,0.4)',
    icon: '🕹️',
    description: '16-bit classics',
  },
  gb: {
    label: 'Game Boy',
    shortLabel: 'Game Boy',
    gradient: 'linear-gradient(135deg, #16a34a 0%, #14532d 100%)',
    glow: 'rgba(22,163,74,0.4)',
    icon: '📱',
    description: 'Pocket perfection',
  },
  gbc: {
    label: 'Game Boy Color',
    shortLabel: 'GBC',
    gradient: 'linear-gradient(135deg, #059669 0%, #064e3b 100%)',
    glow: 'rgba(5,150,105,0.4)',
    icon: '🌈',
    description: 'Color on the go',
  },
  genesis: {
    label: 'Sega Genesis',
    shortLabel: 'Genesis',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
    glow: 'rgba(14,165,233,0.4)',
    icon: '⚡',
    description: 'Blast processing',
  },
  sms: {
    label: 'Sega Master System',
    shortLabel: 'Master System',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #92400e 100%)',
    glow: 'rgba(245,158,11,0.4)',
    icon: '🔵',
    description: "Sega's first home console",
  },
}
