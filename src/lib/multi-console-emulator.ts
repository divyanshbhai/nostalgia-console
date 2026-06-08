// Multi-Console Emulator using EmulatorJS (libretro cores via WebAssembly)
// Supports: NES, SNES, GBA, PS1, N64, Sega Genesis, and more

export type ConsoleType = 
  | 'nes' 
  | 'snes' 
  | 'gba' 
  | 'n64' 
  | 'psx' 
  | 'genesis'
  | 'segacd'
  | 'atarilynx'
  | 'vb'

export interface ConsoleConfig {
  name: string
  core: string
  extensions: string[]
  bios?: string[]
}

export const CONSOLE_CONFIGS: Record<ConsoleType, ConsoleConfig> = {
  nes: {
    name: 'Nintendo Entertainment System',
    core: 'fceumm',
    extensions: ['.nes', '.fds', '.unf', '.unif'],
    bios: ['disksys.rom'] // For FDS games
  },
  snes: {
    name: 'Super Nintendo',
    core: 'snes9x',
    extensions: ['.sfc', '.smc', '.fig', '.bs'],
  },
  gba: {
    name: 'Game Boy Advance',
    core: 'mgba',
    extensions: ['.gba', '.gb', '.gbc'],
    bios: ['gba_bios.bin'] // Optional but recommended
  },
  n64: {
    name: 'Nintendo 64',
    core: 'mupen64plus_next',
    extensions: ['.n64', '.z64', '.v64'],
  },
  psx: {
    name: 'PlayStation 1',
    core: 'pcsx_rearmed',
    extensions: ['.bin', '.cue', '.chd', '.pbp'],
    bios: ['scph5500.bin', 'scph5501.bin', 'scph5502.bin']
  },
  genesis: {
    name: 'Sega Genesis / Mega Drive',
    core: 'genesis_plus_gx',
    extensions: ['.md', '.smd', '.gen', '.bin', '.cue'],
  },
  segacd: {
    name: 'Sega CD',
    core: 'genesis_plus_gx',
    extensions: ['.bin', '.cue', '.iso', '.chd'],
    bios: ['bios_CD_U.bin', 'bios_CD_E.bin', 'bios_CD_J.bin']
  },
  atarilynx: {
    name: 'Atari Lynx',
    core: 'handy',
    extensions: ['.lnx'],
    bios: ['lynxboot.img']
  },
  vb: {
    name: 'Virtual Boy',
    core: 'beetle_vb',
    extensions: ['.vb', '.vboy'],
  }
}

// EmulatorJS configuration
const EMULATORJS_VERSION = '4.0.0'
const EMULATORJS_CDN = `https://cdn.emulatorjs.org/${EMULATORJS_VERSION}`

export class MultiConsoleEmulator {
  private container: HTMLDivElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private emulatorInstance: any = null
  private isLoaded = false
  private currentConsole: ConsoleType | null = null
  private onLoadCallback: (() => void) | null = null
  private onErrorCallback: ((error: string) => void) | null = null

  constructor() {
    console.log('Multi-Console Emulator initialized')
  }

  // Detect console type from file extension
  static detectConsoleType(filename: string): ConsoleType | null {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
    
    for (const [consoleType, config] of Object.entries(CONSOLE_CONFIGS)) {
      if (config.extensions.includes(ext)) {
        return consoleType as ConsoleType
      }
    }
    return null
  }

  // Get supported file extensions for all consoles
  static getSupportedExtensions(): string[] {
    const extensions = new Set<string>()
    for (const config of Object.values(CONSOLE_CONFIGS)) {
      config.extensions.forEach(ext => extensions.add(ext))
    }
    return Array.from(extensions)
  }

  // Initialize the emulator
  async init(container: HTMLDivElement): Promise<void> {
    this.container = container
    
    // Create canvas if not exists
    if (!this.container.querySelector('canvas')) {
      this.canvas = document.createElement('canvas')
      this.canvas.id = 'emulator-canvas'
      this.canvas.style.width = '100%'
      this.canvas.style.height = '100%'
      this.container.appendChild(this.canvas)
    } else {
      this.canvas = this.container.querySelector('canvas')
    }

    // Load EmulatorJS script if not already loaded
    await this.loadEmulatorJSScript()
  }

  // Load EmulatorJS script from CDN
  private async loadEmulatorJSScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if ((window as any).EmulatorJS) {
        resolve()
        return
      }

      // Create script element
      const script = document.createElement('script')
      script.src = `${EMULATORJS_CDN}/data/loader.js`
      script.async = true
      
      script.onload = () => {
        console.log('EmulatorJS script loaded')
        resolve()
      }
      
      script.onerror = () => {
        reject(new Error('Failed to load EmulatorJS script'))
      }

      document.head.appendChild(script)
    })
  }

  // Load and start a game
  async loadROM(
    consoleType: ConsoleType,
    romData: Uint8Array,
    romName: string,
    biosData?: { [key: string]: Uint8Array }
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.container) {
      return { success: false, error: 'Emulator container not initialized' }
    }

    try {
      this.currentConsole = consoleType
      const config = CONSOLE_CONFIGS[consoleType]
      
      // Create blob URL for ROM
      const romBlob = new Blob([romData.buffer as ArrayBuffer])
      const romUrl = URL.createObjectURL(romBlob)

      // Clear previous emulator
      this.container.innerHTML = ''

      // Prepare bios files if needed
      const biosUrls: { [key: string]: string } = {}
      if (biosData) {
        for (const [name, data] of Object.entries(biosData)) {
          const biosBlob = new Blob([data.buffer as ArrayBuffer])
          biosUrls[name] = URL.createObjectURL(biosBlob)
        }
      }

      // Configure EmulatorJS
      const emulatorConfig = {
        EJS_player: '#emulator-canvas',
        EJS_core: config.core,
        EJS_gameUrl: romUrl,
        EJS_gameName: romName,
        EJS_color: '#7c3aed', // Purple theme
        EJS_startOnLoaded: true,
        EJS_pathtodata: `${EMULATORJS_CDN}/data/`,
        EJS_DEBUG_XX: false,
        
        // Controllers
        EJS_defaultControls: {
          0: {
            0: { value: 'x', value2: '' },      // A
            1: { value: 'z', value2: '' },      // B
            2: { value: 'shift', value2: '' },  // Select
            3: { value: 'enter', value2: '' },  // Start
            4: { value: 'arrowup', value2: '' },
            5: { value: 'arrowdown', value2: '' },
            6: { value: 'arrowleft', value2: '' },
            7: { value: 'arrowright', value2: '' },
          }
        },

        // Callbacks
        EJS_onSaveState: () => {
          console.log('State saved')
        },
        EJS_onLoadState: () => {
          console.log('State loaded')
        },
        EJS_onGameStart: () => {
          this.isLoaded = true
          console.log('Game started')
          if (this.onLoadCallback) {
            this.onLoadCallback()
          }
        },
        EJS_onError: (error: string) => {
          console.error('Emulator error:', error)
          if (this.onErrorCallback) {
            this.onErrorCallback(error)
          }
        }
      }

      // Create canvas element
      this.canvas = document.createElement('canvas')
      this.canvas.id = 'emulator-canvas'
      this.canvas.style.width = '100%'
      this.canvas.style.height = '100%'
      this.container.appendChild(this.canvas)

      // Initialize EmulatorJS
      // Note: EmulatorJS creates a global 'EmulatorJS' constructor
      const EmulatorJSClass = (window as any).EmulatorJS
      if (EmulatorJSClass) {
        this.emulatorInstance = new EmulatorJSClass(emulatorConfig)
      } else {
        // Fallback: load via script injection
        await this.injectEmulatorConfig(emulatorConfig)
      }

      return { success: true }
    } catch (error: any) {
      const errorMessage = error?.message || String(error)
      console.error('Failed to load ROM:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  // Inject EmulatorJS configuration (fallback method)
  private async injectEmulatorConfig(config: any): Promise<void> {
    // Set global configuration
    for (const [key, value] of Object.entries(config)) {
      (window as any)[key] = value
    }

    // Load the core script
    const script = document.createElement('script')
    script.src = `${EMULATORJS_CDN}/data/loader.js`
    document.head.appendChild(script)

    await new Promise<void>((resolve) => {
      script.onload = () => resolve()
    })
  }

  // Set callbacks
  onLoad(callback: () => void): void {
    this.onLoadCallback = callback
  }

  onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback
  }

  // Emulator controls
  pause(): void {
    if (this.emulatorInstance && this.emulatorInstance.pause) {
      this.emulatorInstance.pause()
    }
  }

  resume(): void {
    if (this.emulatorInstance && this.emulatorInstance.play) {
      this.emulatorInstance.play()
    }
  }

  reset(): void {
    if (this.emulatorInstance && this.emulatorInstance.restart) {
      this.emulatorInstance.restart()
    }
  }

  // Save/Load states
  saveState(slot: number = 1): void {
    if (this.emulatorInstance && this.emulatorInstance.saveState) {
      this.emulatorInstance.saveState(slot)
    }
  }

  loadState(slot: number = 1): void {
    if (this.emulatorInstance && this.emulatorInstance.loadState) {
      this.emulatorInstance.loadState(slot)
    }
  }

  // Quick save/load
  quickSave(): void {
    this.saveState(0)
  }

  quickLoad(): void {
    this.loadState(0)
  }

  // Screenshot
  takeScreenshot(): string | null {
    if (this.canvas) {
      return this.canvas.toDataURL('image/png')
    }
    return null
  }

  // Fullscreen
  toggleFullscreen(): void {
    if (this.emulatorInstance && this.emulatorInstance.toggleFullscreen) {
      this.emulatorInstance.toggleFullscreen()
    } else if (this.container) {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        this.container.requestFullscreen()
      }
    }
  }

  // Button press for external controllers
  pressButton(player: number, button: string, pressed: boolean): void {
    // EmulatorJS handles input via the gamepad API
    // For custom input handling, we'd need to use their input API
    console.log(`P${player} Button ${button}: ${pressed}`)
  }

  // Cleanup
  destroy(): void {
    if (this.emulatorInstance && this.emulatorInstance.exit) {
      this.emulatorInstance.exit()
    }
    if (this.container) {
      this.container.innerHTML = ''
    }
    this.emulatorInstance = null
    this.isLoaded = false
    this.currentConsole = null
  }

  // Get current console
  getCurrentConsole(): ConsoleType | null {
    return this.currentConsole
  }

  // Check if loaded
  isReady(): boolean {
    return this.isLoaded
  }
}

// Export singleton getter
let emulatorInstance: MultiConsoleEmulator | null = null

export function getMultiConsoleEmulator(): MultiConsoleEmulator {
  if (!emulatorInstance) {
    emulatorInstance = new MultiConsoleEmulator()
  }
  return emulatorInstance
}

export function destroyMultiConsoleEmulator(): void {
  if (emulatorInstance) {
    emulatorInstance.destroy()
    emulatorInstance = null
  }
}
