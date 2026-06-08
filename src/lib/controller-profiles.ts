// Controller Profiles - Different layouts for different consoles
// Each profile defines the button layout and visual appearance

import { ButtonId } from './input-router'

// Player colors for multiplayer (exported first to ensure availability)
export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow'

export const PLAYER_COLORS: Record<PlayerColor, { primary: string; bg: string; text: string }> = {
  red: { primary: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)', text: '#fca5a5' },
  blue: { primary: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)', text: '#93c5fd' },
  green: { primary: '#22c55e', bg: 'rgba(34, 197, 94, 0.2)', text: '#86efac' },
  yellow: { primary: '#facc15', bg: 'rgba(250, 204, 21, 0.2)', text: '#fde047' }
}

// Button definition
export interface ButtonConfig {
  id: ButtonId
  label: string
  position: { x: number; y: number } // Percentage position (0-100)
  size: 'small' | 'medium' | 'large'
  shape: 'circle' | 'square' | 'pill'
  color: string
  hapticFeedback: boolean
}

// D-pad configuration
export interface DPadConfig {
  enabled: boolean
  position: { x: number; y: number }
  size: 'small' | 'medium' | 'large'
  style: 'cross' | 'disc' | 'arrows'
}

// Analog stick configuration
export interface StickConfig {
  enabled: boolean
  position: { x: number; y: number }
  size: 'small' | 'medium' | 'large'
  side: 'left' | 'right'
}

// Controller profile definition
export interface ControllerProfile {
  id: string
  name: string
  consoleName: string
  icon: string
  description: string
  maxPlayers: number
  dpad: DPadConfig
  sticks: StickConfig[]
  buttons: ButtonConfig[]
  systemButtons: ButtonConfig[]
  layout: 'standard' | 'asymmetric' | 'dual' // Layout type
  orientation: 'portrait' | 'landscape' | 'both'
  theme: {
    primary: string
    secondary: string
    background: string
    accent: string
  }
}

// NES Controller Profile
export const NES_PROFILE: ControllerProfile = {
  id: 'nes',
  name: 'NES Controller',
  consoleName: 'Nintendo Entertainment System',
  icon: '🎮',
  description: 'Classic NES controller layout',
  maxPlayers: 2,
  dpad: {
    enabled: true,
    position: { x: 20, y: 60 },
    size: 'large',
    style: 'cross'
  },
  sticks: [],
  buttons: [
    {
      id: 'b',
      label: 'B',
      position: { x: 70, y: 55 },
      size: 'large',
      shape: 'circle',
      color: '#ef4444',
      hapticFeedback: true
    },
    {
      id: 'a',
      label: 'A',
      position: { x: 82, y: 45 },
      size: 'large',
      shape: 'circle',
      color: '#22c55e',
      hapticFeedback: true
    }
  ],
  systemButtons: [
    {
      id: 'select',
      label: 'SELECT',
      position: { x: 40, y: 85 },
      size: 'small',
      shape: 'pill',
      color: '#6b7280',
      hapticFeedback: false
    },
    {
      id: 'start',
      label: 'START',
      position: { x: 60, y: 85 },
      size: 'small',
      shape: 'pill',
      color: '#6b7280',
      hapticFeedback: true
    }
  ],
  layout: 'standard',
  orientation: 'portrait',
  theme: {
    primary: '#dc2626',
    secondary: '#1f2937',
    background: '#111827',
    accent: '#f59e0b'
  }
}

// SNES Controller Profile
export const SNES_PROFILE: ControllerProfile = {
  id: 'snes',
  name: 'SNES Controller',
  consoleName: 'Super Nintendo',
  icon: '🕹️',
  description: 'SNES controller with shoulder buttons',
  maxPlayers: 2,
  dpad: {
    enabled: true,
    position: { x: 18, y: 55 },
    size: 'medium',
    style: 'cross'
  },
  sticks: [],
  buttons: [
    {
      id: 'y',
      label: 'Y',
      position: { x: 65, y: 60 },
      size: 'medium',
      shape: 'circle',
      color: '#22c55e',
      hapticFeedback: true
    },
    {
      id: 'x',
      label: 'X',
      position: { x: 75, y: 50 },
      size: 'medium',
      shape: 'circle',
      color: '#3b82f6',
      hapticFeedback: true
    },
    {
      id: 'b',
      label: 'B',
      position: { x: 75, y: 70 },
      size: 'medium',
      shape: 'circle',
      color: '#facc15',
      hapticFeedback: true
    },
    {
      id: 'a',
      label: 'A',
      position: { x: 85, y: 60 },
      size: 'medium',
      shape: 'circle',
      color: '#ef4444',
      hapticFeedback: true
    }
  ],
  systemButtons: [
    {
      id: 'l',
      label: 'L',
      position: { x: 10, y: 15 },
      size: 'small',
      shape: 'pill',
      color: '#6b7280',
      hapticFeedback: true
    },
    {
      id: 'r',
      label: 'R',
      position: { x: 90, y: 15 },
      size: 'small',
      shape: 'pill',
      color: '#6b7280',
      hapticFeedback: true
    },
    {
      id: 'select',
      label: 'SELECT',
      position: { x: 40, y: 88 },
      size: 'small',
      shape: 'pill',
      color: '#6b7280',
      hapticFeedback: false
    },
    {
      id: 'start',
      label: 'START',
      position: { x: 60, y: 88 },
      size: 'small',
      shape: 'pill',
      color: '#6b7280',
      hapticFeedback: true
    }
  ],
  layout: 'standard',
  orientation: 'portrait',
  theme: {
    primary: '#6366f1',
    secondary: '#374151',
    background: '#1f2937',
    accent: '#a855f7'
  }
}

// GBA Controller Profile
export const GBA_PROFILE: ControllerProfile = {
  id: 'gba',
  name: 'GBA Controller',
  consoleName: 'Game Boy Advance',
  icon: '📱',
  description: 'GBA layout with L and R buttons',
  maxPlayers: 1,
  dpad: {
    enabled: true,
    position: { x: 18, y: 55 },
    size: 'medium',
    style: 'cross'
  },
  sticks: [],
  buttons: [
    {
      id: 'b',
      label: 'B',
      position: { x: 70, y: 55 },
      size: 'medium',
      shape: 'circle',
      color: '#a855f7',
      hapticFeedback: true
    },
    {
      id: 'a',
      label: 'A',
      position: { x: 82, y: 45 },
      size: 'medium',
      shape: 'circle',
      color: '#ef4444',
      hapticFeedback: true
    }
  ],
  systemButtons: [
    {
      id: 'l',
      label: 'L',
      position: { x: 15, y: 12 },
      size: 'small',
      shape: 'pill',
      color: '#6b7280',
      hapticFeedback: true
    },
    {
      id: 'r',
      label: 'R',
      position: { x: 85, y: 12 },
      size: 'small',
      shape: 'pill',
      color: '#6b7280',
      hapticFeedback: true
    },
    {
      id: 'select',
      label: 'SELECT',
      position: { x: 40, y: 85 },
      size: 'small',
      shape: 'pill',
      color: '#6b7280',
      hapticFeedback: false
    },
    {
      id: 'start',
      label: 'START',
      position: { x: 60, y: 85 },
      size: 'small',
      shape: 'pill',
      color: '#6b7280',
      hapticFeedback: true
    }
  ],
  layout: 'standard',
  orientation: 'portrait',
  theme: {
    primary: '#7c3aed',
    secondary: '#1e1b4b',
    background: '#0f0d1a',
    accent: '#c084fc'
  }
}

// Genesis Controller Profile
export const GENESIS_PROFILE: ControllerProfile = {
  id: 'genesis',
  name: 'Genesis Controller',
  consoleName: 'Sega Genesis / Mega Drive',
  icon: '🎮',
  description: 'Sega Genesis 3-button layout',
  maxPlayers: 2,
  dpad: {
    enabled: true,
    position: { x: 20, y: 55 },
    size: 'large',
    style: 'disc'
  },
  sticks: [],
  buttons: [
    {
      id: 'a',
      label: 'A',
      position: { x: 65, y: 60 },
      size: 'medium',
      shape: 'circle',
      color: '#22c55e',
      hapticFeedback: true
    },
    {
      id: 'b',
      label: 'B',
      position: { x: 78, y: 50 },
      size: 'medium',
      shape: 'circle',
      color: '#3b82f6',
      hapticFeedback: true
    },
    {
      id: 'x',
      label: 'C',
      position: { x: 88, y: 60 },
      size: 'medium',
      shape: 'circle',
      color: '#ef4444',
      hapticFeedback: true
    }
  ],
  systemButtons: [
    {
      id: 'start',
      label: 'START',
      position: { x: 50, y: 88 },
      size: 'small',
      shape: 'pill',
      color: '#6b7280',
      hapticFeedback: true
    }
  ],
  layout: 'standard',
  orientation: 'portrait',
  theme: {
    primary: '#111827',
    secondary: '#1f2937',
    background: '#030712',
    accent: '#0ea5e9'
  }
}


// GB / GBC Controller Profile — no L/R, just A/B/Select/Start
export const GB_PROFILE: ControllerProfile = {
  id: 'gb',
  name: 'Game Boy Controller',
  consoleName: 'Game Boy / Game Boy Color',
  icon: '🎮',
  description: 'Classic Game Boy layout',
  maxPlayers: 1,
  dpad: { enabled: true, position: { x: 18, y: 55 }, size: 'medium', style: 'cross' },
  sticks: [],
  buttons: [
    { id: 'b', label: 'B', position: { x: 70, y: 55 }, size: 'medium', shape: 'circle', color: '#a855f7', hapticFeedback: true },
    { id: 'a', label: 'A', position: { x: 82, y: 45 }, size: 'medium', shape: 'circle', color: '#ef4444', hapticFeedback: true },
  ],
  systemButtons: [
    { id: 'select', label: 'SELECT', position: { x: 40, y: 85 }, size: 'small', shape: 'pill', color: '#6b7280', hapticFeedback: false },
    { id: 'start',  label: 'START',  position: { x: 60, y: 85 }, size: 'small', shape: 'pill', color: '#6b7280', hapticFeedback: true },
  ],
  layout: 'standard',
  orientation: 'portrait',
  theme: { primary: '#7c3aed', secondary: '#1e1b4b', background: '#0f0d1a', accent: '#c084fc' },
}

// All available profiles
export const CONTROLLER_PROFILES: Record<string, ControllerProfile> = {
  nes: NES_PROFILE,
  snes: SNES_PROFILE,
  gba: GBA_PROFILE,
  genesis: GENESIS_PROFILE,
  sms: GENESIS_PROFILE,  // SMS uses the same 2-button layout
  gb:  GB_PROFILE,
  gbc: GB_PROFILE,
}

// Get profile by console type
export function getProfileForConsole(consoleType: string): ControllerProfile {
  return CONTROLLER_PROFILES[consoleType] ?? NES_PROFILE
}

// Get default profile
export function getDefaultProfile(): ControllerProfile {
  return NES_PROFILE
}
