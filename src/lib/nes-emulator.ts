// NES Emulator wrapper using jsnes
// This provides a clean interface for the NES emulator

export interface NESButton {
  A: number
  B: number
  SELECT: number
  START: number
  UP: number
  DOWN: number
  LEFT: number
  RIGHT: number
}

export const NES_BUTTONS: NESButton = {
  A: 0,
  B: 1,
  SELECT: 2,
  START: 3,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7
}

export interface NESControllerState {
  a: boolean
  b: boolean
  select: boolean
  start: boolean
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

export class NESEmulator {
  private nes: any = null
  private _jsnes: any = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private imageData: ImageData | null = null
  private audioCtx: AudioContext | null = null
  private audioScriptProcessor: ScriptProcessorNode | null = null
  private frameBuffer: number[] = []
  private isRunning = false
  private animationFrameId: number | null = null
  
  // Controller states for 2 players
  private controller1: NESControllerState = this.createEmptyController()
  private controller2: NESControllerState = this.createEmptyController()

  private createEmptyController(): NESControllerState {
    return {
      a: false,
      b: false,
      select: false,
      start: false,
      up: false,
      down: false,
      left: false,
      right: false
    }
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    
    if (!this.ctx) {
      throw new Error('Could not get 2D context from canvas')
    }

    // Create image data for the frame buffer
    this.imageData = this.ctx.createImageData(256, 240)
    
    // Initialize audio context
    try {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (e) {
      console.warn('Audio context not available')
    }

    // Load jsnes dynamically
    const jsnesModule = await import('jsnes')
    this._jsnes = jsnesModule
    
    // Create the NES instance
    this.nes = new jsnesModule.NES({
      onFrame: (frameBuffer: Uint32Array) => {
        this.frameBuffer = Array.from(frameBuffer)
      },
      onAudioSample: (_left: number, _right: number) => {
        // Audio samples - we'll skip audio for MVP
      }
    })

    console.log('NES Emulator initialized')
  }

  loadROM(romData: Uint8Array): { success: boolean; error?: string } {
    if (!this.nes) {
      console.error('NES not initialized')
      return { success: false, error: 'Emulator not initialized' }
    }

    try {
      // Convert Uint8Array to string format expected by jsnes
      const romString = this.uint8ArrayToString(romData)
      this.nes.loadROM(romString)
      console.log('ROM loaded successfully')
      return { success: true }
    } catch (error: any) {
      const errorMessage = error?.message || String(error)
      console.error('Failed to load ROM:', errorMessage)
      
      // Parse common jsnes errors for user-friendly messages
      if (errorMessage.includes('mapper')) {
        const mapperMatch = errorMessage.match(/mapper[:\s]*(\d+)/i)
        const mapperNum = mapperMatch ? mapperMatch[1] : 'unknown'
        return { 
          success: false, 
          error: `This ROM uses Mapper ${mapperNum} which is not supported. jsnes supports mappers 0-4, 7, 66, 71 (common games like Super Mario Bros, Contra, Tetris, etc.)`
        }
      }
      
      if (errorMessage.includes('Invalid ROM')) {
        return { success: false, error: 'Invalid ROM file. Please make sure this is a valid .nes file.' }
      }
      
      return { success: false, error: `Failed to load ROM: ${errorMessage}` }
    }
  }

  private uint8ArrayToString(array: Uint8Array): string {
    let str = ''
    for (let i = 0; i < array.length; i++) {
      str += String.fromCharCode(array[i])
    }
    return str
  }

  start(): void {
    if (!this.nes || !this.ctx || !this.imageData) {
      console.error('NES not properly initialized')
      return
    }

    this.isRunning = true
    this.runFrame()
  }

  stop(): void {
    this.isRunning = false
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  reset(): void {
    if (this.nes) {
      this.nes.reset()
    }
  }

  private runFrame = (): void => {
    if (!this.isRunning || !this.nes || !this.ctx || !this.imageData) return

    // Update controller state
    this.updateControllers()

    // Run one frame
    this.nes.frame()

    // Render the frame buffer to canvas
    this.renderFrame()

    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(this.runFrame)
  }

  private updateControllers(): void {
    if (!this.nes) return

    const Controller = this._jsnes?.Controller
    if (!Controller) return
    // Update controller 1
    this.nes.buttonPress(1, Controller.BUTTON_A, this.controller1.a ? 1 : 0)
    this.nes.buttonPress(1, Controller.BUTTON_B, this.controller1.b ? 1 : 0)
    this.nes.buttonPress(1, Controller.BUTTON_SELECT, this.controller1.select ? 1 : 0)
    this.nes.buttonPress(1, Controller.BUTTON_START, this.controller1.start ? 1 : 0)
    this.nes.buttonPress(1, Controller.BUTTON_UP, this.controller1.up ? 1 : 0)
    this.nes.buttonPress(1, Controller.BUTTON_DOWN, this.controller1.down ? 1 : 0)
    this.nes.buttonPress(1, Controller.BUTTON_LEFT, this.controller1.left ? 1 : 0)
    this.nes.buttonPress(1, Controller.BUTTON_RIGHT, this.controller1.right ? 1 : 0)

    // Update controller 2
    this.nes.buttonPress(2, Controller.BUTTON_A, this.controller2.a ? 1 : 0)
    this.nes.buttonPress(2, Controller.BUTTON_B, this.controller2.b ? 1 : 0)
    this.nes.buttonPress(2, Controller.BUTTON_SELECT, this.controller2.select ? 1 : 0)
    this.nes.buttonPress(2, Controller.BUTTON_START, this.controller2.start ? 1 : 0)
    this.nes.buttonPress(2, Controller.BUTTON_UP, this.controller2.up ? 1 : 0)
    this.nes.buttonPress(2, Controller.BUTTON_DOWN, this.controller2.down ? 1 : 0)
    this.nes.buttonPress(2, Controller.BUTTON_LEFT, this.controller2.left ? 1 : 0)
    this.nes.buttonPress(2, Controller.BUTTON_RIGHT, this.controller2.right ? 1 : 0)
  }

  private renderFrame(): void {
    if (!this.ctx || !this.imageData || this.frameBuffer.length === 0) return

    // Convert the frame buffer to ImageData
    const data = this.imageData.data
    for (let i = 0; i < this.frameBuffer.length; i++) {
      const pixel = this.frameBuffer[i]
      const offset = i * 4
      
      // Extract RGB from the packed integer
      data[offset] = (pixel >> 16) & 0xFF     // Red
      data[offset + 1] = (pixel >> 8) & 0xFF  // Green
      data[offset + 2] = pixel & 0xFF         // Blue
      data[offset + 3] = 0xFF                 // Alpha
    }

    // Put the image data on canvas (scaled)
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = 256
    tempCanvas.height = 240
    const tempCtx = tempCanvas.getContext('2d')
    if (tempCtx) {
      tempCtx.putImageData(this.imageData, 0, 0)
      this.ctx.imageSmoothingEnabled = false
      this.ctx.drawImage(tempCanvas, 0, 0, this.canvas!.width, this.canvas!.height)
    }
  }

  // Set button state for a specific player
  setButton(player: 1 | 2, button: keyof NESControllerState, pressed: boolean): void {
    const controller = player === 1 ? this.controller1 : this.controller2
    controller[button] = pressed
  }

  // Handle button press from string name
  handleButtonPress(player: number, button: string, pressed: boolean): void {
    const playerNum = player === 1 ? 1 : 2 as 1 | 2
    const buttonLower = button.toLowerCase() as keyof NESControllerState
    
    if (buttonLower in this.controller1) {
      this.setButton(playerNum, buttonLower, pressed)
    }
  }

  // Get current save state
  getSaveState(): string | null {
    if (!this.nes) return null
    try {
      return JSON.stringify(this.nes.toJSON())
    } catch {
      return null
    }
  }

  // Load save state
  loadSaveState(stateJson: string): boolean {
    if (!this.nes) return false
    try {
      const state = JSON.parse(stateJson)
      this.nes.fromJSON(state)
      return true
    } catch {
      return false
    }
  }

  // Get screenshot as data URL
  getScreenshot(): string | null {
    if (!this.canvas) return null
    return this.canvas.toDataURL('image/png')
  }

  // Cleanup
  destroy(): void {
    this.stop()
    this.nes = null
    this.canvas = null
    this.ctx = null
    this.imageData = null
    if (this.audioCtx) {
      this.audioCtx.close()
      this.audioCtx = null
    }
  }
}

// Singleton instance for global access
let emulatorInstance: NESEmulator | null = null

export function getEmulator(): NESEmulator {
  if (!emulatorInstance) {
    emulatorInstance = new NESEmulator()
  }
  return emulatorInstance
}

export function destroyEmulator(): void {
  if (emulatorInstance) {
    emulatorInstance.destroy()
    emulatorInstance = null
  }
}
