// Emulator Runtime Configuration
//
// Single source of truth for all EmulatorJS asset paths and runtime settings.
// EmulatorAdapter imports from here — nothing else in the app should reference
// EmulatorJS CDN URLs or paths directly.
//
// Runtime selection priority:
//   1. NEXT_PUBLIC_EMULATOR_PATH env var  — explicit override (self-hosted)
//   2. Default: EmulatorJS stable CDN

// ── Asset source ────────────────────────────────────────────────────────────

// To self-host: copy EmulatorJS data/ folder into public/emulatorjs/
// and set NEXT_PUBLIC_EMULATOR_PATH=/emulatorjs/data/
const CDN_PATH = 'https://cdn.emulatorjs.org/stable/data/'
const ENV_PATH = process.env.NEXT_PUBLIC_EMULATOR_PATH

export const EMULATOR_DATA_PATH: string = ENV_PATH?.trim() || CDN_PATH
export const EMULATOR_LOADER_URL: string = `${EMULATOR_DATA_PATH}loader.js`

// ── Core map ────────────────────────────────────────────────────────────────
// Maps our internal ConsoleType to the libretro core name EmulatorJS expects.

export const EMULATOR_CORE_MAP: Record<string, string> = {
  nes:     'fceumm',
  snes:    'snes9x',
  gba:     'mgba',
  gb:      'mgba',             // mgba handles GB and GBC
  gbc:     'mgba',
  genesis: 'genesis_plus_gx',
  sms:     'genesis_plus_gx',  // genesis_plus_gx handles SMS/GG too
  ps1:     'pcsx_rearmed',
  n64:     'mupen64plus_next',
}

// ── Button index map ─────────────────────────────────────────────────────────
// Maps our ButtonId strings to EmulatorJS controller slot indices.
//
// Source: audited from EmulatorJS defaultControllers definition in emulator.js
// Slot order (this.controls[player][slot]):
//   0  = B button  (NES B / SNES B / GBA B)
//   1  = Y button  (SNES Y / GBA —)
//   2  = Select
//   3  = Start
//   4  = D-pad Up
//   5  = D-pad Down
//   6  = D-pad Left
//   7  = D-pad Right
//   8  = A button  (NES A / SNES A / GBA A)
//   9  = X button  (SNES X / GBA —)
//   10 = L shoulder
//   11 = R shoulder
//   12 = L2 / ZL
//   13 = R2 / ZR

export const EMULATOR_BUTTON_INDEX: Record<string, number> = {
  b:          0,
  y:          1,
  select:     2,
  start:      3,
  dpad_up:    4,
  dpad_down:  5,
  dpad_left:  6,
  dpad_right: 7,
  a:          8,
  x:          9,
  l:          10,
  r:          11,
  l2:         12,
  r2:         13,
}

// ── Runtime flags ────────────────────────────────────────────────────────────

export const EMULATOR_THEME_COLOR = '#7c3aed'
export const EMULATOR_DEBUG       = false
export const EMULATOR_AUTOSTART   = true
