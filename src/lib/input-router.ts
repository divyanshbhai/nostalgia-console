// Input Router - The core of the controller platform
// All controllers communicate ONLY with the Input Router
// The Input Router then forwards to the Emulator Adapter

// Button types for all possible inputs
export type ButtonId = 
  // D-Pad
  | 'dpad_up' | 'dpad_down' | 'dpad_left' | 'dpad_right'
  // Face buttons
  | 'a' | 'b' | 'x' | 'y'
  // Shoulder buttons
  | 'l' | 'r' | 'l2' | 'r2'
  // System buttons
  | 'start' | 'select' | 'home' | 'menu' | 'pause' | 'exit'
  // Analog sticks (normalized -1 to 1)
  | 'left_stick_x' | 'left_stick_y' 
  | 'right_stick_x' | 'right_stick_y'

// Input event from controller
export interface InputEvent {
  playerId: number
  buttonId: ButtonId
  pressed: boolean
  value?: number // For analog inputs, 0-1 for buttons, -1 to 1 for sticks
  timestamp: number
}

// Player state
export interface PlayerState {
  id: number
  connected: boolean
  ready: boolean
  color: PlayerColor
  name: string
  lastPing: number
  latency: number
  inputCount: number
}

// Player colors for multiplayer
export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow'

export const PLAYER_COLORS: Record<PlayerColor, { primary: string; bg: string; text: string }> = {
  red: { primary: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)', text: '#fca5a5' },
  blue: { primary: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)', text: '#93c5fd' },
  green: { primary: '#22c55e', bg: 'rgba(34, 197, 94, 0.2)', text: '#86efac' },
  yellow: { primary: '#eab308', bg: 'rgba(234, 179, 8, 0.2)', text: '#fde047' }
}

// Input Router class - manages all controller inputs
export class InputRouter {
  private players: Map<number, PlayerState> = new Map()
  private inputHandlers: Set<(event: InputEvent) => void> = new Set()
  private latencyWindow: number[] = []
  private maxPlayers = 4

  // Register a new player
  registerPlayer(playerId: number): PlayerState {
    const colors: PlayerColor[] = ['red', 'blue', 'green', 'yellow']
    const color = colors[(playerId - 1) % 4]
    
    const player: PlayerState = {
      id: playerId,
      connected: true,
      ready: false,
      color,
      name: `Player ${playerId}`,
      lastPing: Date.now(),
      latency: 0,
      inputCount: 0
    }
    
    this.players.set(playerId, player)
    return player
  }

  // Unregister a player
  unregisterPlayer(playerId: number): void {
    const player = this.players.get(playerId)
    if (player) {
      player.connected = false
      this.players.delete(playerId)
    }
  }

  // Get all connected players
  getPlayers(): PlayerState[] {
    return Array.from(this.players.values()).filter(p => p.connected)
  }

  // Get player by ID
  getPlayer(playerId: number): PlayerState | undefined {
    return this.players.get(playerId)
  }

  // Set player ready status
  setPlayerReady(playerId: number, ready: boolean): void {
    const player = this.players.get(playerId)
    if (player) {
      player.ready = ready
    }
  }

  // Process an input event from a controller
  processInput(event: Omit<InputEvent, 'timestamp'>): InputEvent {
    const fullEvent: InputEvent = {
      ...event,
      timestamp: Date.now()
    }

    // Update player stats
    const player = this.players.get(event.playerId)
    if (player) {
      player.inputCount++
      player.lastPing = fullEvent.timestamp
      this.updateLatency(fullEvent.timestamp)
    }

    // Forward to all handlers
    this.inputHandlers.forEach(handler => handler(fullEvent))

    return fullEvent
  }

  // Subscribe to input events
  subscribe(handler: (event: InputEvent) => void): () => void {
    this.inputHandlers.add(handler)
    return () => this.inputHandlers.delete(handler)
  }

  // Update latency calculation
  private updateLatency(timestamp: number): void {
    this.latencyWindow.push(timestamp)
    // Keep last 100 samples
    if (this.latencyWindow.length > 100) {
      this.latencyWindow.shift()
    }
  }

  // Get average latency
  getAverageLatency(): number {
    if (this.latencyWindow.length < 2) return 0
    // Simple calculation based on input frequency
    const avg = this.latencyWindow.reduce((a, b) => a + b, 0) / this.latencyWindow.length
    return Math.round(avg % 1000) // Placeholder for actual latency calculation
  }

  // Get room health score (0-100)
  getRoomHealth(): number {
    const players = this.getPlayers()
    if (players.length === 0) return 100
    
    const avgLatency = this.getAverageLatency()
    const readyCount = players.filter(p => p.ready).length
    
    // Health score based on latency and ready status
    const latencyScore = Math.max(0, 100 - avgLatency)
    const readyScore = (readyCount / players.length) * 100
    
    return Math.round((latencyScore + readyScore) / 2)
  }

  // Check if room is full
  isFull(): boolean {
    return this.getPlayers().length >= this.maxPlayers
  }

  // Get next available player slot
  getNextPlayerSlot(): number {
    for (let i = 1; i <= this.maxPlayers; i++) {
      if (!this.players.has(i) || !this.players.get(i)!.connected) {
        return i
      }
    }
    return -1
  }

  // Reset for new game
  reset(): void {
    this.players.clear()
    this.latencyWindow = []
  }
}

// Singleton instance
let inputRouterInstance: InputRouter | null = null

export function getInputRouter(): InputRouter {
  if (!inputRouterInstance) {
    inputRouterInstance = new InputRouter()
  }
  return inputRouterInstance
}

export function resetInputRouter(): void {
  if (inputRouterInstance) {
    inputRouterInstance.reset()
  }
  inputRouterInstance = null
}
