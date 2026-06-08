// Game Session Manager - The core of the controller platform
// Handles ROM selection, multiplayer, save states, game switching, player management
// Controllers communicate with this, NOT with the emulator directly

import { ButtonId } from './input-router'

// Types
export type ConsoleType = 'nes' | 'snes' | 'gba' | 'gb' | 'gbc' | 'genesis' | 'sms' | 'ps1' | 'n64'
export type GameStatus = 'idle' | 'rom-loaded' | 'waiting-for-players' | 'playing' | 'paused'

export interface ROMInfo {
  id: string
  name: string
  consoleType: ConsoleType
  size: number
  data?: Uint8Array // Only on TV side
  uploadedAt: number
  uploadedBy: number // Player ID who uploaded
}

export interface PlayerInfo {
  id: number
  connected: boolean
  ready: boolean
  color: PlayerColor
  name: string
  latency: number
  lastPing: number
  isHost: boolean // Player 1 is always host
}

export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow'

export interface GameSession {
  roomCode: string
  status: GameStatus
  currentROM: ROMInfo | null
  players: Map<number, PlayerInfo>
  createdAt: number
  startedAt: number | null
  hostPlayerId: number // Always 1
}

export interface SessionEvent {
  type: 'rom-uploaded' | 'player-joined' | 'player-left' | 'player-ready' | 'game-started' | 'game-paused' | 'game-resumed' | 'game-reset' | 'save-state' | 'load-state'
  data: any
  timestamp: number
}

export interface InputEvent {
  playerId: number
  buttonId: ButtonId
  pressed: boolean
  value?: number
  timestamp: number
}

// Player colors
export const PLAYER_COLORS: Record<PlayerColor, { primary: string; bg: string; text: string }> = {
  red: { primary: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)', text: '#fca5a5' },
  blue: { primary: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)', text: '#93c5fd' },
  green: { primary: '#22c55e', bg: 'rgba(34, 197, 94, 0.2)', text: '#86efac' },
  yellow: { primary: '#facc15', bg: 'rgba(250, 204, 21, 0.2)', text: '#fde047' }
}

// Game Session Manager Class
export class GameSessionManager {
  private session: GameSession | null = null
  private eventHandlers: Set<(event: SessionEvent) => void> = new Set()
  private inputHandlers: Set<(event: InputEvent) => void> = new Set()
  private maxPlayers = 4

  // Create a new session (TV side)
  createSession(roomCode: string): GameSession {
    this.session = {
      roomCode,
      status: 'idle',
      currentROM: null,
      players: new Map(),
      createdAt: Date.now(),
      startedAt: null,
      hostPlayerId: 1
    }
    return this.session
  }

  // Get current session
  getSession(): GameSession | null {
    return this.session
  }

  // Get session status
  getStatus(): GameStatus {
    return this.session?.status || 'idle'
  }

  // ===== PLAYER MANAGEMENT =====

  // Add a player (called when controller connects)
  addPlayer(playerId: number): PlayerInfo {
    const session = this.ensureSession()
    
    const colors: PlayerColor[] = ['red', 'blue', 'green', 'yellow']
    const color = colors[(playerId - 1) % 4]
    
    const player: PlayerInfo = {
      id: playerId,
      connected: true,
      ready: false,
      color,
      name: `Player ${playerId}`,
      latency: 0,
      lastPing: Date.now(),
      isHost: playerId === 1
    }
    
    session.players.set(playerId, player)
    this.emitEvent({ type: 'player-joined', data: { player }, timestamp: Date.now() })
    
    return player
  }

  // Remove a player
  removePlayer(playerId: number): void {
    if (!this.session) return
    
    this.session.players.delete(playerId)
    this.emitEvent({ type: 'player-left', data: { playerId }, timestamp: Date.now() })
  }

  // Get all connected players
  getPlayers(): PlayerInfo[] {
    if (!this.session) return []
    return Array.from(this.session.players.values()).filter(p => p.connected)
  }

  // Get player by ID
  getPlayer(playerId: number): PlayerInfo | undefined {
    return this.session?.players.get(playerId)
  }

  // Set player ready status
  setPlayerReady(playerId: number, ready: boolean): void {
    if (!this.session) return
    const player = this.session.players.get(playerId)
    if (player) {
      player.ready = ready
      this.emitEvent({ type: 'player-ready', data: { playerId, ready }, timestamp: Date.now() })
    }
  }

  // Update player latency
  updatePlayerLatency(playerId: number, latency: number): void {
    if (!this.session) return
    
    const player = this.session.players.get(playerId)
    if (player) {
      player.latency = latency
      player.lastPing = Date.now()
    }
  }

  // Get next available player slot
  getNextPlayerSlot(): number {
    if (!this.session) return -1
    
    for (let i = 1; i <= this.maxPlayers; i++) {
      const player = this.session.players.get(i)
      if (!player || !player.connected) {
        return i
      }
    }
    return -1
  }

  // Check if all connected players are ready
  allPlayersReady(): boolean {
    const players = this.getPlayers()
    if (players.length === 0) return false
    return players.every(p => p.ready)
  }

  // ===== ROM MANAGEMENT =====

  // Ensure a session exists — auto-creates a stub if needed (handles TV page reload
  // where socket reconnects before tv:room-created fires a second time)
  private ensureSession(roomCode = 'UNKNOWN'): GameSession {
    if (!this.session) this.createSession(roomCode)
    return this.session!
  }

  // Load ROM (called from phone, stored on TV)
  loadROM(romInfo: Omit<ROMInfo, 'id' | 'uploadedAt' | 'uploadedBy'>, uploadedBy: number): ROMInfo {
    const session = this.ensureSession()
    
    const id = `rom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const rom: ROMInfo = {
      ...romInfo,
      id,
      uploadedAt: Date.now(),
      uploadedBy
    }
    
    session.currentROM = rom
    session.status = 'rom-loaded'
    
    this.emitEvent({ type: 'rom-uploaded', data: { rom }, timestamp: Date.now() })
    
    return rom
  }

  // Get current ROM
  getCurrentROM(): ROMInfo | null {
    return this.session?.currentROM || null
  }

  // Clear ROM
  clearROM(): void {
    if (!this.session) return
    
    this.session.currentROM = null
    this.session.status = 'idle'
  }

  // ===== GAME CONTROL =====

  // Start game
  startGame(): void {
    const session = this.ensureSession()
    if (!session.currentROM) return
    
    session.status = 'playing'
    session.startedAt = Date.now()
    
    this.emitEvent({ type: 'game-started', data: { rom: session.currentROM }, timestamp: Date.now() })
  }

  // Pause game
  pauseGame(): void {
    if (!this.session) return
    
    this.session.status = 'paused'
    this.emitEvent({ type: 'game-paused', data: {}, timestamp: Date.now() })
  }

  // Resume game
  resumeGame(): void {
    if (!this.session) return
    
    this.session.status = 'playing'
    this.emitEvent({ type: 'game-resumed', data: {}, timestamp: Date.now() })
  }

  // Reset game
  resetGame(): void {
    if (!this.session) return
    
    this.emitEvent({ type: 'game-reset', data: {}, timestamp: Date.now() })
  }

  // ===== INPUT HANDLING =====

  // Process input from controller
  processInput(event: Omit<InputEvent, 'timestamp'>): InputEvent {
    const fullEvent: InputEvent = {
      ...event,
      timestamp: Date.now()
    }
    
    // Forward to all input handlers (emulator adapter will subscribe)
    this.inputHandlers.forEach(handler => handler(fullEvent))
    
    return fullEvent
  }

  // Subscribe to input events
  onInput(handler: (event: InputEvent) => void): () => void {
    this.inputHandlers.add(handler)
    return () => this.inputHandlers.delete(handler)
  }

  // ===== EVENT HANDLING =====

  // Subscribe to session events
  onEvent(handler: (event: SessionEvent) => void): () => void {
    this.eventHandlers.add(handler)
    return () => this.eventHandlers.delete(handler)
  }

  // Emit event
  private emitEvent(event: SessionEvent): void {
    this.eventHandlers.forEach(handler => handler(event))
  }

  // ===== UTILITY =====

  // Get session info for display
  getSessionInfo(): {
    roomCode: string
    status: GameStatus
    playerCount: number
    hasROM: boolean
    romName: string | null
  } {
    if (!this.session) {
      return {
        roomCode: '',
        status: 'idle',
        playerCount: 0,
        hasROM: false,
        romName: null
      }
    }
    
    return {
      roomCode: this.session.roomCode,
      status: this.session.status,
      playerCount: this.getPlayers().length,
      hasROM: !!this.session.currentROM,
      romName: this.session.currentROM?.name || null
    }
  }

  // Get room health score (0-100)
  getRoomHealth(): number {
    if (!this.session) return 100
    
    const players = this.getPlayers()
    if (players.length === 0) return 100
    
    const avgLatency = players.reduce((sum, p) => sum + p.latency, 0) / players.length
    const latencyScore = Math.max(0, 100 - avgLatency)
    
    return Math.round(latencyScore)
  }

  // Reset session
  reset(): void {
    this.session = null
    this.eventHandlers.clear()
    this.inputHandlers.clear()
  }

  // Check if room is full
  isFull(): boolean {
    return this.getPlayers().length >= this.maxPlayers
  }
}

// Singleton instance for TV side
let tvSessionManager: GameSessionManager | null = null

export function getTVSessionManager(): GameSessionManager {
  if (!tvSessionManager) {
    tvSessionManager = new GameSessionManager()
  }
  return tvSessionManager
}

export function resetTVSessionManager(): void {
  if (tvSessionManager) {
    tvSessionManager.reset()
  }
  tvSessionManager = null
}
