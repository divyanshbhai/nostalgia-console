// EmulatorJS Integration for Multi-Console Support
// Supports: NES, SNES, GBA, PS1, N64, Genesis via libretro cores

export type ConsoleType = 'nes' | 'snes' | 'gba' | 'n64' | 'psx' | 'genesis'

export interface ConsoleConfig {
  name: string
  core: string
  extensions: string[]
  icon: string
  bios?: string[]
}

export const CONSOLE_CONFIGS: Record<ConsoleType, ConsoleConfig> = {
  nes: {
    name: 'NES',
    core: 'fceumm',
    extensions: ['.nes', '.fds', '.unf', '.unif'],
    icon: '🎮',
    bios: ['disksys.rom'] // For FDS games
  },
  snes: {
    name: 'SNES',
    core: 'snes9x',
    extensions: ['.sfc', '.smc', '.fig', '.bs'],
    icon: '🕹️',
  },
  gba: {
    name: 'GBA',
    core: 'mgba',
    extensions: ['.gba', '.gb', '.gbc'],
    icon: '📱',
    bios: ['gba_bios.bin']
  },
  n64: {
    name: 'N64',
    core: 'mupen64plus_next',
    extensions: ['.n64', '.z64', '.v64'],
    icon: '🎯',
  },
  psx: {
    name: 'PS1',
    core: 'pcsx_rearmed',
    extensions: ['.bin', '.cue', '.chd', '.pbp'],
    icon: '💿',
    bios: ['scph5500.bin', 'scph5501.bin', 'scph5502.bin']
  },
  genesis: {
    name: 'Genesis',
    core: 'genesis_plus_gx',
    extensions: ['.md', '.smd', '.gen', '.bin'],
    icon: ' Sega'
  }
}

// Button mapping for different consoles
export const BUTTON_MAP: Record<string, number> = {
  // Standard gamepad buttons (libretro mapping)
  B: 0,      // A button on NES, B on SNES
  A: 1,      // B button on NES, A on SNES  
  X: 2,      // X on SNES
  Y: 3,      // Y on SNES
  L: 4,      // Left bumper
  R: 5,      // Right bumper
  SELECT: 6, // Select
  START: 7,  // Start
  UP: 8,     // D-pad up
  DOWN: 9,   // D-pad down
  LEFT: 10,  // D-pad left
  RIGHT: 11, // D-pad right
}

// EmulatorJS CDN configuration
const EMULATORJS_CDN = 'https://cdn.emulatorjs.org/stable/data/'

// Global emulator instance reference
declare global {
  interface Window {
    EmulatorJS: any
    EJS_player: string
    EJS_core: string
    EJS_gameUrl: string
    EJS_gameName: string
    EJS_color: string
    EJS_startOnLoaded: boolean
    EJS_pathtodata: string
    EJS_DEBUG_XX: boolean
    EJS_onGameStart?: () => void
    EJS_onError?: (error: string) => void
    EJS_defaultControls?: any
    EJS_Buttons?: any
    _emulatorInstance?: any
  }
}

export class EmulatorJSWrapper {
  private container: HTMLDivElement | null = null
  private isLoaded = false
  private currentConsole: ConsoleType | null = null
  private onLoadCallback: (() => void) | null = null
  private onErrorCallback: ((error: string) => void) | null = null
  private emulatorInstance: any = null
  private scriptLoaded = false

  // Detect console type from filename
  static detectConsoleType(filename: string): ConsoleType | null {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
    
    for (const [consoleType, config] of Object.entries(CONSOLE_CONFIGS)) {
      if (config.extensions.includes(ext)) {
        return consoleType as ConsoleType
      }
    }
    return null
  }

  // Get supported extensions
  static getSupportedExtensions(): string[] {
    const extensions = new Set<string>()
    for (const config of Object.values(CONSOLE_CONFIGS)) {
      config.extensions.forEach(ext => extensions.add(ext))
    }
    return Array.from(extensions)
  }

  // Load EmulatorJS script
  private async loadScript(): Promise<void> {
    if (this.scriptLoaded) return

    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (typeof window.EmulatorJS !== 'undefined') {
        this.scriptLoaded = true
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = `${EMULATORJS_CDN}loader.js`
      script.async = true
      
      script.onload = () => {
        this.scriptLoaded = true
        console.log('EmulatorJS script loaded')
        resolve()
      }
      
      script.onerror = () => {
        reject(new Error('Failed to load EmulatorJS from CDN'))
      }

      document.head.appendChild(script)
    })
  }

  // Initialize and load ROM
  async loadROM(
    container: HTMLDivElement,
    consoleType: ConsoleType,
    romData: Uint8Array,
    romName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.container = container
      this.currentConsole = consoleType
      const config = CONSOLE_CONFIGS[consoleType]

      // Load the script first
      await this.loadScript()

      // Clear container
      container.innerHTML = ''

      // Create unique canvas ID
      const canvasId = `emulator-canvas-${Date.now()}`
      const canvas = document.createElement('canvas')
      canvas.id = canvasId
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      container.appendChild(canvas)

      // Create blob URL for ROM
      const romBlob = new Blob([romData.buffer as ArrayBuffer])
      const romUrl = URL.createObjectURL(romBlob)

      // Set up global config BEFORE the script runs
      window.EJS_player = `#${canvasId}`
      window.EJS_core = config.core
      window.EJS_gameUrl = romUrl
      window.EJS_gameName = romName.replace(/\.[^/.]+$/, '')
      window.EJS_color = '#7c3aed' // Purple theme
      window.EJS_startOnLoaded = true
      window.EJS_pathtodata = EMULATORJS_CDN
      window.EJS_DEBUG_XX = false

      // Callbacks
      window.EJS_onGameStart = () => {
        this.isLoaded = true
        console.log('Game started!')
        if (this.onLoadCallback) {
          this.onLoadCallback()
        }
      }

      window.EJS_onError = (error: string) => {
        console.error('Emulator error:', error)
        if (this.onErrorCallback) {
          this.onErrorCallback(error)
        }
      }

      // Initialize EmulatorJS
      if (typeof window.EmulatorJS === 'function') {
        this.emulatorInstance = new window.EmulatorJS()
        window._emulatorInstance = this.emulatorInstance
      }

      return { success: true }
    } catch (error: any) {
      const errorMessage = error?.message || String(error)
      console.error('Failed to load ROM:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  // Set callbacks
  onLoad(callback: () => void): void {
    this.onLoadCallback = callback
  }

  onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback
  }

  // Check if ready
  isReady(): boolean {
    return this.isLoaded
  }

  // Get current console
  getCurrentConsole(): ConsoleType | null {
    return this.currentConsole
  }

  // Cleanup
  destroy(): void {
    if (this.container) {
      this.container.innerHTML = ''
    }
    this.emulatorInstance = null
    this.isLoaded = false
    this.currentConsole = null
  }
}

// Singleton instance
let emulatorWrapper: EmulatorJSWrapper | null = null

export function getEmulatorWrapper(): EmulatorJSWrapper {
  if (!emulatorWrapper) {
    emulatorWrapper = new EmulatorJSWrapper()
  }
  return emulatorWrapper
}

export function destroyEmulatorWrapper(): void {
  if (emulatorWrapper) {
    emulatorWrapper.destroy()
    emulatorWrapper = null
  }
}
