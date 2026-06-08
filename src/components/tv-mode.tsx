'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LatencyDashboard } from '@/components/latency-dashboard'
import { PLAYER_COLORS, PlayerColor, getDefaultProfile, ControllerProfile } from '@/lib/controller-profiles'
import { 
  Users, 
  Wifi, 
  WifiOff,
  Gamepad2,
  Tv,
  Play,
  Pause,
  RotateCcw,
  Maximize,
  Settings,
  Upload,
  Clock,
  HardDrive,
  ChevronRight
} from 'lucide-react'

// Player state for TV mode
interface TVPlayerState {
  id: number
  connected: boolean
  ready: boolean
  color: PlayerColor
  name: string
  latency: number
  joinedAt: number
}

// TV Mode Props
interface TVModeProps {
  socket: Socket | null
  isConnected: boolean
  onBack: () => void
}

// EmulatorJS Container (simplified)
function EmulatorContainer({ 
  romData, 
  romName, 
  consoleType, 
  isPlaying 
}: { 
  romData: Uint8Array | null
  romName: string | null
  consoleType: string | null
  isPlaying: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!isPlaying || !romData || !containerRef.current || initializedRef.current) return
    initializedRef.current = true

    const config = {
      nes: { core: 'fceumm', name: 'NES' },
      snes: { core: 'snes9x', name: 'SNES' },
      gba: { core: 'mgba', name: 'GBA' },
      genesis: { core: 'genesis_plus_gx', name: 'Genesis' }
    }[consoleType || 'nes']

    // Create blob URL
    const romBlob = new Blob([romData.buffer as ArrayBuffer])
    const romUrl = URL.createObjectURL(romBlob)

    // Configure EmulatorJS
    const w = window as any
    w.EJS_player = '#game-canvas'
    w.EJS_core = config?.core || 'fceumm'
    w.EJS_gameUrl = romUrl
    w.EJS_gameName = romName || 'Game'
    w.EJS_color = '#7c3aed'
    w.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/'
    w.EJS_DEBUG_XX = false

    // Load script
    if (!w.EmulatorJS) {
      const script = document.createElement('script')
      script.src = 'https://cdn.emulatorjs.org/stable/data/loader.js'
      script.async = true
      document.head.appendChild(script)
    } else {
      new w.EmulatorJS()
    }
  }, [isPlaying, romData, romName, consoleType])

  if (!isPlaying) return null

  return (
    <div ref={containerRef} className="w-full h-full bg-black">
      <canvas id="game-canvas" style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

// Main TV Mode Component
export function TVMode({ socket, isConnected, onBack }: TVModeProps) {
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [players, setPlayers] = useState<TVPlayerState[]>([])
  const [gameState, setGameState] = useState<'idle' | 'ready' | 'playing'>('idle')
  const [romData, setRomData] = useState<Uint8Array | null>(null)
  const [romName, setRomName] = useState<string | null>(null)
  const [consoleType, setConsoleType] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Create room
  const createRoom = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('tv:create-room')
    }
  }, [socket, isConnected])

  // Socket event handlers
  useEffect(() => {
    if (!socket) return

    socket.on('tv:room-created', (data: { code: string }) => {
      setRoomCode(data.code)
    })

    socket.on('controller:connected', (data: { playerNumber: number }) => {
      const colors: PlayerColor[] = ['red', 'blue', 'green', 'yellow']
      setPlayers(prev => {
        if (prev.find(p => p.id === data.playerNumber)) {
          return prev.map(p => p.id === data.playerNumber ? { ...p, connected: true } : p)
        }
        return [...prev, {
          id: data.playerNumber,
          connected: true,
          ready: false,
          color: colors[(data.playerNumber - 1) % 4],
          name: `Player ${data.playerNumber}`,
          latency: 0,
          joinedAt: Date.now()
        }]
      })
    })

    socket.on('controller:disconnected', (data: { playerNumber: number }) => {
      setPlayers(prev => prev.filter(p => p.id !== data.playerNumber))
    })

    socket.on('controller:ready', (data: { playerNumber: number; ready: boolean }) => {
      setPlayers(prev => prev.map(p => 
        p.id === data.playerNumber ? { ...p, ready: data.ready } : p
      ))
    })

    return () => {
      socket.removeAllListeners()
    }
  }, [socket])

  // Load ROM
  const loadRom = useCallback(async (file: File) => {
    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    
    // Detect console type
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
    const typeMap: Record<string, string> = {
      '.nes': 'nes', '.fds': 'nes',
      '.sfc': 'snes', '.smc': 'snes',
      '.gba': 'gba', '.gb': 'gba', '.gbc': 'gba',
      '.md': 'genesis', '.gen': 'genesis'
    }
    
    setRomData(data)
    setRomName(file.name.replace(/\.[^/.]+$/, ''))
    setConsoleType(typeMap[ext] || 'nes')
    setGameState('ready')
  }, [])

  // Start game
  const startGame = useCallback(() => {
    setGameState('playing')
  }, [])

  // Toggle pause
  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev)
  }, [])

  // Reset game
  const resetGame = useCallback(() => {
    socket?.emit('game:reset')
  }, [socket])

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    const container = document.getElementById('game-container')
    if (container) {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        container.requestFullscreen()
      }
    }
  }, [])

  // Check if all connected players are ready
  const allReady = players.filter(p => p.connected).every(p => p.ready)
  const playerCount = players.filter(p => p.connected).length

  // Get current controller profile
  const currentProfile = consoleType ? getDefaultProfile() : null

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800/80 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-6">
            <Button variant="ghost" onClick={onBack} className="text-gray-400 hover:text-white">
              ← Back
            </Button>
            <div className="flex items-center gap-3">
              <Tv className="w-6 h-6 text-purple-400" />
              <span className="text-white text-xl font-bold">TV Mode</span>
            </div>
          </div>

          {/* Center: Room Code (LARGE) */}
          {roomCode && (
            <div className="flex items-center gap-4">
              <div className="text-gray-400 text-sm">Room Code:</div>
              <div className="bg-purple-500/20 border border-purple-500/50 rounded-lg px-6 py-2">
                <span className="text-white font-mono text-3xl font-bold tracking-widest">
                  {roomCode}
                </span>
              </div>
              {isConnected ? (
                <Badge className="bg-green-500/20 text-green-400 border-0">
                  <Wifi className="w-3 h-3 mr-1" /> Connected
                </Badge>
              ) : (
                <Badge className="bg-red-500/20 text-red-400 border-0">
                  <WifiOff className="w-3 h-3 mr-1" /> Disconnected
                </Badge>
              )}
            </div>
          )}

          {/* Right: Players + Actions */}
          <div className="flex items-center gap-4">
            {/* Player Indicators */}
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map(num => {
                const player = players.find(p => p.id === num)
                const colorStyle = PLAYER_COLORS[(player?.color || 'red') as PlayerColor]
                return (
                  <div
                    key={num}
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                      player?.connected 
                        ? 'ring-2 ring-white/50 scale-110' 
                        : 'opacity-30'
                    }`}
                    style={{ 
                      backgroundColor: player?.connected ? colorStyle.primary : '#374151'
                    }}
                  >
                    <span className="text-white text-sm">{num}</span>
                  </div>
                )
              })}
            </div>
            
            <div className="text-gray-300 text-sm">
              {playerCount}/4 Players
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex">
        {/* Game Area */}
        <div className="flex-1 flex items-center justify-center p-8">
          {!roomCode ? (
            /* No Room - Generate Code */
            <Card className="bg-gray-800/50 border-purple-500/30 backdrop-blur-sm max-w-lg w-full">
              <CardHeader className="text-center">
                <CardTitle className="text-white text-3xl">Create Room</CardTitle>
                <CardDescription className="text-gray-400 text-lg">
                  Generate a code for your phone to connect
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Button 
                  onClick={createRoom}
                  disabled={!isConnected}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white h-16 text-xl"
                >
                  {isConnected ? 'Generate Room Code' : 'Connecting...'}
                </Button>
                
                <div className="text-center text-gray-400">
                  <p className="text-sm">1. Generate a room code</p>
                  <p className="text-sm">2. Open Controller Mode on your phone</p>
                  <p className="text-sm">3. Enter the code to connect</p>
                </div>
              </CardContent>
            </Card>
          ) : gameState === 'idle' ? (
            /* No Game - Upload or Select */
            <div className="max-w-4xl w-full space-y-6">
              {/* Upload Section */}
              <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white text-xl">Load Game</CardTitle>
                </CardHeader>
                <CardContent>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-purple-500 hover:bg-purple-500/5 transition-all"
                  >
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-white text-lg">Click to upload ROM</p>
                    <p className="text-gray-500 text-sm mt-2">NES, SNES, GBA, Genesis supported</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".nes,.fds,.sfc,.smc,.gba,.gb,.gbc,.md,.gen"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) loadRom(file)
                    }}
                  />
                </CardContent>
              </Card>
            </div>
          ) : gameState === 'ready' ? (
            /* Game Ready - Waiting for Players */
            <div className="text-center space-y-8">
              <div className="space-y-4">
                <h2 className="text-white text-4xl font-bold">{romName}</h2>
                <p className="text-gray-400 text-lg">Waiting for players to connect...</p>
              </div>
              
              {/* Player Ready Status */}
              <div className="flex justify-center gap-6">
                {players.filter(p => p.connected).map(player => {
                  const colorStyle = PLAYER_COLORS[player.color]
                  return (
                    <div 
                      key={player.id}
                      className={`p-6 rounded-xl transition-all ${player.ready ? 'ring-2 ring-green-500' : ''}`}
                      style={{ backgroundColor: colorStyle.bg }}
                    >
                      <div 
                        className="w-16 h-16 rounded-full flex items-center justify-center mb-3 mx-auto"
                        style={{ backgroundColor: colorStyle.primary }}
                      >
                        <span className="text-white text-2xl font-bold">{player.id}</span>
                      </div>
                      <p className="text-white font-medium">{player.name}</p>
                      <p className={`text-sm ${player.ready ? 'text-green-400' : 'text-gray-400'}`}>
                        {player.ready ? '✓ Ready' : 'Not Ready'}
                      </p>
                    </div>
                  )
                })}
              </div>

              {/* Start Button */}
              <Button
                onClick={startGame}
                disabled={playerCount === 0 || !allReady}
                className="bg-green-600 hover:bg-green-700 text-white h-16 px-12 text-xl disabled:opacity-50"
              >
                <Play className="w-6 h-6 mr-2" />
                {playerCount === 0 ? 'Waiting for Players...' : allReady ? 'Start Game' : 'Waiting for Ready...'}
              </Button>
            </div>
          ) : (
            /* Playing - Game Screen */
            <div id="game-container" className="w-full aspect-video max-w-5xl bg-black rounded-lg overflow-hidden relative">
              <EmulatorContainer 
                romData={romData}
                romName={romName}
                consoleType={consoleType}
                isPlaying={gameState === 'playing'}
              />
              
              {/* Pause Overlay */}
              {isPaused && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                  <div className="text-center">
                    <Pause className="w-16 h-16 text-white mx-auto mb-4" />
                    <p className="text-white text-2xl font-bold">PAUSED</p>
                  </div>
                </div>
              )}
              
              {/* Game Controls */}
              <div className="absolute bottom-4 right-4 flex gap-2">
                <Button onClick={togglePause} variant="secondary" size="icon">
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </Button>
                <Button onClick={resetGame} variant="secondary" size="icon">
                  <RotateCcw className="w-4 h-4" />
                </Button>
                <Button onClick={toggleFullscreen} variant="secondary" size="icon">
                  <Maximize className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Latency Dashboard */}
        {roomCode && (
          <div className="w-80 border-l border-gray-700 p-4 overflow-y-auto">
            <LatencyDashboard
              roomCode={roomCode}
              players={players.map(p => ({ ...p, inputRate: 0, lastInput: 0 }))}
              socket={socket}
            />
            
            {/* Controller Profile Preview */}
            {currentProfile && (
              <Card className="bg-gray-800/50 border-gray-700 mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-sm">Controller Layout</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-gray-400 text-xs">{currentProfile.name}</div>
                  <div className="flex gap-2 mt-2">
                    {currentProfile.buttons.map(b => (
                      <div 
                        key={b.id}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: b.color }}
                      >
                        {b.label}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
