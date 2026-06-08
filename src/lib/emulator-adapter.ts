// EmulatorAdapter — the ONLY place in the codebase that touches EmulatorJS.
//
// EmulatorJS lifecycle (audited from cdn.emulatorjs.org/stable/data/):
//
//   loader.js is an async IIFE. When appended as a <script> it:
//     1. Loads sub-scripts (emulator.js, GameManager.js, etc.)
//     2. Reads window.EJS_* globals that must be set BEFORE the script runs
//     3. Calls:  window.EJS_emulator = new EmulatorJS(EJS_player, config)
//        — YOU must NEVER call `new EmulatorJS()` yourself
//     4. Fires window.EJS_onGameStart when the game is actually running
//
//   Runtime API (via window.EJS_emulator):
//     .pause()                            — pause emulation
//     .play()                             — resume emulation
//     .gameManager.restart()              — reset/restart
//     .gameManager.simulateInput(p,i,v)   — inject input (p = 0-indexed player)

import {
  EMULATOR_DATA_PATH,
  EMULATOR_LOADER_URL,
  EMULATOR_CORE_MAP,
  EMULATOR_BUTTON_INDEX,
  EMULATOR_THEME_COLOR,
  EMULATOR_DEBUG,
  EMULATOR_AUTOSTART,
} from './emulator-config'
import { getTVSessionManager, InputEvent, ConsoleType } from './game-session-manager'

// ── EmulatorJS window interface ──────────────────────────────────────────────

interface EJSGameManager {
  simulateInput(player: number, index: number, value: number): void
  restart(): void
}

interface EJSEmulator {
  pause(): void
  play(): void
  gameManager?: EJSGameManager
}

interface EJSGlobals {
  EJS_player:        string
  EJS_core:          string
  EJS_gameUrl:       string
  EJS_gameName:      string
  EJS_color:         string
  EJS_pathtodata:    string
  EJS_DEBUG_XX:      boolean
  EJS_startOnLoaded: boolean
  EJS_onGameStart?:  () => void
  EJS_onError?:      (msg: string) => void
  EJS_emulator?:     EJSEmulator
}

function ejsGlobals(): EJSGlobals {
  return window as unknown as EJSGlobals
}

// ── Structured logger ────────────────────────────────────────────────────────

function log(msg: string)  { console.log(`[Emulator] ${msg}`) }
function warn(msg: string) { console.warn(`[Emulator] ${msg}`) }
function lerr(msg: string) { console.error(`[Emulator] ${msg}`) }

// ── Types ────────────────────────────────────────────────────────────────────

export type AdapterStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AdapterState {
  status: AdapterStatus
  paused: boolean
  romUrl: string | null
  error:  string | null
}

// ── EmulatorAdapter ──────────────────────────────────────────────────────────

export class EmulatorAdapter {
  private state: AdapterState = {
    status: 'idle',
    paused: false,
    romUrl: null,
    error:  null,
  }

  private canvasId: string
  private unsubscribeInput: (() => void) | null = null
  private onReadyCallbacks:  Array<() => void>           = []
  private onErrorCallbacks:  Array<(msg: string) => void> = []

  constructor(canvasId = 'game-canvas') {
    this.canvasId = canvasId
    log(`Adapter created (canvas: #${canvasId}, path: ${EMULATOR_DATA_PATH})`)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async loadROM(romData: Uint8Array, romName: string, consoleType: ConsoleType): Promise<void> {
    if (this.state.status === 'loading' || this.state.status === 'ready') {
      warn('loadROM called while already loading or running — ignoring')
      return
    }

    log(`Loading ROM: "${romName}" [${consoleType}]`)
    this.state.status = 'loading'
    this.state.error  = null

    // Install global error capture — EmulatorJS throws async errors that
    // would otherwise escape to Next.js and trigger a full page reload
    this._installGlobalErrorCapture()

    // Release previous blob URL
    if (this.state.romUrl) {
      URL.revokeObjectURL(this.state.romUrl)
      this.state.romUrl = null
    }

    // Validate console type
    const core = EMULATOR_CORE_MAP[consoleType]
    if (!core) {
      this._fail(`Unsupported console type: "${consoleType}"`)
      return
    }

    // Verify the container element exists in the DOM before proceeding.
    // EmulatorJS calls document.querySelector(EJS_player) synchronously on
    // construction and throws TypeError if the element is missing.
    const container = document.getElementById(this.canvasId)
    if (!container) {
      this._fail(`Container element #${this.canvasId} not found in DOM. Ensure it is mounted before calling loadROM.`)
      return
    }
    log(`Container element #${this.canvasId} found in DOM ✔`)

    // Preflight: verify loader.js is reachable before injecting the script
    log(`Preflight: checking ${EMULATOR_LOADER_URL}`)
    try {
      const probe = await fetch(EMULATOR_LOADER_URL, { method: 'HEAD' })
      if (!probe.ok) {
        this._fail(`EmulatorJS loader not reachable (HTTP ${probe.status}): ${EMULATOR_LOADER_URL}`)
        return
      }
      log('Preflight passed ✔')
    } catch {
      this._fail(`EmulatorJS loader unreachable (network error): ${EMULATOR_LOADER_URL}`)
      return
    }

    // Create blob URL for ROM data
    const romBlob = new Blob([romData.buffer as ArrayBuffer])
    const romUrl  = URL.createObjectURL(romBlob)
    this.state.romUrl = romUrl

    // ── Set all EJS globals BEFORE loading the script ──────────────────────
    // loader.js reads these synchronously when it runs
    const ejs = ejsGlobals()
    ejs.EJS_player        = `#${this.canvasId}`
    ejs.EJS_core          = core
    ejs.EJS_gameUrl       = romUrl
    ejs.EJS_gameName      = romName
    ejs.EJS_color         = EMULATOR_THEME_COLOR
    ejs.EJS_pathtodata    = EMULATOR_DATA_PATH
    ejs.EJS_DEBUG_XX      = EMULATOR_DEBUG
    ejs.EJS_startOnLoaded = EMULATOR_AUTOSTART

    // ── Register callbacks loader.js will wire after EmulatorJS is created ──
    ejs.EJS_onGameStart = () => {
      log('Runtime initialized')
      log(`ROM loaded: "${romName}"`)
      this.state.status = 'ready'
      this.state.paused = false
      this._subscribeToInputs()
      this.onReadyCallbacks.forEach(cb => cb())
    }

    ejs.EJS_onError = (msg: string) => {
      this._fail(`EmulatorJS runtime error: ${msg}`)
    }

    // ── Load loader.js — it takes over and creates window.EJS_emulator ──────
    try {
      await this._loadScript()
    } catch (e) {
      this._fail(`Failed to load EmulatorJS script: ${String(e)}`)
    }
  }

  pause(): void {
    if (this.state.paused) return
    const emu = this._getEmulator()
    if (!emu) return
    emu.pause()
    this.state.paused = true
    log('Paused')
  }

  resume(): void {
    if (!this.state.paused) return
    const emu = this._getEmulator()
    if (!emu) return
    emu.play()
    this.state.paused = false
    log('Resumed')
  }

  reset(): void {
    const emu = this._getEmulator()
    if (!emu) return
    emu.gameManager?.restart()
    this.state.paused = false
    log('Reset')
  }

  saveState(): void {
    const emu = this._getEmulator() as any
    if (!emu) return
    try {
      // EmulatorJS exposes saveState on the emulator instance
      emu.saveState?.()
      log('Save state triggered')
    } catch (e) { warn(`saveState failed: ${e}`) }
  }

  loadState(): void {
    const emu = this._getEmulator() as any
    if (!emu) return
    try {
      emu.loadState?.()
      log('Load state triggered')
    } catch (e) { warn(`loadState failed: ${e}`) }
  }

  openMenu(): void {
    const emu = this._getEmulator() as any
    if (!emu) return
    try {
      // EmulatorJS menu toggle — different versions use different APIs
      emu.openMenu?.() ?? emu.toggleMenu?.()
      log('Menu toggled')
    } catch (e) { warn(`openMenu failed: ${e}`) }
  }

  isPaused():  boolean      { return this.state.paused }
  isReady():   boolean      { return this.state.status === 'ready' }
  getStatus(): AdapterStatus { return this.state.status }
  getError():  string | null { return this.state.error }

  onReady(cb: () => void):           void { this.onReadyCallbacks.push(cb) }
  onError(cb: (msg: string) => void): void { this.onErrorCallbacks.push(cb) }

  destroy(): void {
    log('Destroying adapter')
    this._unsubscribeInputs()
    this._removeGlobalErrorCapture?.()
    this._removeGlobalErrorCapture = null

    // Best-effort pause before teardown
    try { this._getEmulator()?.pause() } catch { /* ignore */ }

    if (this.state.romUrl) {
      URL.revokeObjectURL(this.state.romUrl)
    }

    // Clear EJS globals so a fresh loadROM starts clean
    const ejs = ejsGlobals()
    delete ejs.EJS_emulator
    delete ejs.EJS_onGameStart
    delete ejs.EJS_onError

    // Remove the loader script tag so it can be re-injected for the next game
    document.querySelector(`script[src="${EMULATOR_LOADER_URL}"]`)?.remove()

    // Wipe any DOM nodes EmulatorJS injected into the container
    // (canvas, style tags, iframes) so the next game starts with a clean div
    const container = document.getElementById(this.canvasId)
    if (container) container.innerHTML = ''

    this.state             = { status: 'idle', paused: false, romUrl: null, error: null }
    this.onReadyCallbacks  = []
    this.onErrorCallbacks  = []
  }

  // ── Input pipeline ─────────────────────────────────────────────────────────

  private _subscribeToInputs(): void {
    this.unsubscribeInput = getTVSessionManager().onInput((event: InputEvent) => {
      this._handleInput(event)
    })
    log('Input pipeline connected: Controller → SessionManager → EmulatorAdapter → EmulatorJS')
  }

  private _unsubscribeInputs(): void {
    this.unsubscribeInput?.()
    this.unsubscribeInput = null
  }

  private _handleInput(event: InputEvent): void {
    if (this.state.status !== 'ready' || this.state.paused) return

    const emu = this._getEmulator()
    if (!emu?.gameManager) return

    const buttonIndex = EMULATOR_BUTTON_INDEX[event.buttonId]
    if (buttonIndex === undefined) {
      warn(`Unknown buttonId: "${event.buttonId}"`)
      return
    }

    // simulateInput(player 0-indexed, buttonIndex, value 0|1)
    emu.gameManager.simulateInput(event.playerId - 1, buttonIndex, event.pressed ? 1 : 0)
    log(`Input: P${event.playerId} ${event.buttonId} ${event.pressed ? 'DOWN' : 'UP'}`)
  }

  private _installGlobalErrorCapture(): void {
    // Intercept unhandled errors that EmulatorJS throws outside of try/catch.
    // Without this, async WASM/worker errors escape to Next.js dev overlay
    // and trigger a full page reload, destroying the TV session.
    const onError = (event: ErrorEvent) => {
      const msg = event.message || String(event)
      if (
        msg.includes('EmulatorJS') ||
        msg.includes('EJS') ||
        msg.includes('WebAssembly') ||
        msg.includes('wasm') ||
        // Null-deref from querySelector failure is the most common boot crash
        (msg.includes('null') && this.state.status === 'loading')
      ) {
        event.preventDefault()
        this._fail(`Runtime crash: ${msg}`)
      }
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = String(event.reason)
      if (this.state.status === 'loading' || this.state.status === 'ready') {
        event.preventDefault()
        lerr(`Unhandled promise rejection: ${msg}`)
        // Only escalate to _fail if we haven't booted yet
        if (this.state.status === 'loading') {
          this._fail(`Async boot error: ${msg}`)
        }
      }
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    // Store references so destroy() can remove them
    this._removeGlobalErrorCapture = () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }

  private _removeGlobalErrorCapture: (() => void) | null = null

  // ── Internals ──────────────────────────────────────────────────────────────

  private _getEmulator(): EJSEmulator | null {
    const emu = ejsGlobals().EJS_emulator
    if (!emu) {
      if (this.state.status === 'ready') {
        warn('window.EJS_emulator is gone — page may have been refreshed')
      }
      return null
    }
    return emu
  }

  private _loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Remove any existing loader script — EmulatorJS is a self-executing IIFE
      // that reads EJS_* globals at the moment it runs. Re-using the old script
      // tag does NOT re-execute it, so the second game never boots.
      // We must remove and re-inject the script for every new game.
      const existing = document.querySelector(`script[src="${EMULATOR_LOADER_URL}"]`)
      if (existing) {
        existing.remove()
        log('Removed stale loader script — will re-inject for new game')
      }

      log(`Loading script: ${EMULATOR_LOADER_URL}`)
      const script   = document.createElement('script')
      script.src     = EMULATOR_LOADER_URL
      script.async   = true
      script.onload  = () => { log('Script loaded'); resolve() }
      script.onerror = () => reject(new Error(`Failed to fetch ${EMULATOR_LOADER_URL}`))
      document.head.appendChild(script)
    })
  }

  private _fail(message: string): void {
    lerr(message)
    this.state.status = 'error'
    this.state.error  = message
    this.onErrorCallbacks.forEach(cb => cb(message))
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance: EmulatorAdapter | null = null

export function getEmulatorAdapter(canvasId?: string): EmulatorAdapter {
  if (!_instance) _instance = new EmulatorAdapter(canvasId)
  return _instance
}

export function destroyEmulatorAdapter(): void {
  _instance?.destroy()
  _instance = null
}
