import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server, Socket } from 'socket.io'

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Health check for Railway / Render uptime probes
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }))
    return
  }
  res.writeHead(404)
  res.end()
})
const io = new Server(httpServer, {
  // Use default /socket.io path — matches Socket.IO client default
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // Allow ROM uploads up to 32 MB (GBA max)
  maxHttpBufferSize: 32 * 1024 * 1024,
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Types
interface TVClient {
  id: string
  roomCode: string
  type: 'tv'
}

interface ControllerClient {
  id: string
  roomCode: string
  type: 'controller'
  playerNumber: number
  ready: boolean
  latency: number
  lastPingTime: number
  disconnectedAt: number | null // null = currently connected
}

interface GameSession {
  romName: string | null
  consoleType: string | null
  status: 'idle' | 'rom-loaded' | 'playing' | 'paused'
  startedAt: number | null
}

interface Room {
  code: string
  tv: TVClient | null
  controllers: ControllerClient[] // indexed by slot, never shuffled
  session: GameSession
  createdAt: number
}

// How long a player slot is reserved after disconnect (ms)
const PLAYER_SLOT_HOLD_MS = 15_000

// Storage
const rooms = new Map<string, Room>()
const clientRooms = new Map<string, string>()

// Generate 6-digit room code
const generateRoomCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Create a new room
const createRoom = (code: string): Room => ({
  code,
  tv: null,
  controllers: [],
  session: {
    romName: null,
    consoleType: null,
    status: 'idle',
    startedAt: null
  },
  createdAt: Date.now()
})

// Player colors
const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow']

// Clean up empty rooms (only when no TV and no active or reserved controllers)
const cleanupRoom = (code: string) => {
  const room = rooms.get(code)
  if (room && !room.tv && room.controllers.length === 0) {
    rooms.delete(code)
    console.log(`Room ${code} cleaned up`)
  }
}

io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`)

  // ===== TV EVENTS =====

  // TV creates a room (idempotent — reconnecting TV reuses its existing room)
  socket.on('tv:create-room', () => {
    // Check if this TV already owns a room
    const existingCode = clientRooms.get(socket.id)
    if (existingCode) {
      const existing = rooms.get(existingCode)
      if (existing) {
        socket.emit('tv:room-created', { code: existingCode })
        console.log(`TV reclaimed room: ${existingCode}`)
        return
      }
    }

    // Check if any room still references this socket as TV (stale socket id after reconnect)
    // We can't match by socket.id here since it changed — just create a new room.
    let code = generateRoomCode()
    while (rooms.has(code)) code = generateRoomCode()

    const room = createRoom(code)
    room.tv = { id: socket.id, roomCode: code, type: 'tv' }
    rooms.set(code, room)
    clientRooms.set(socket.id, code)

    socket.join(code)
    socket.emit('tv:room-created', { code })
    console.log(`TV created room: ${code}`)
  })

  // TV joins existing room (reconnection)
  socket.on('tv:join-room', (data: { code: string }) => {
    const room = rooms.get(data.code) || createRoom(data.code)
    
    if (room.tv) {
      const oldSocket = io.sockets.sockets.get(room.tv.id)
      if (oldSocket) {
        oldSocket.emit('tv:kicked', { reason: 'Another TV connected' })
        oldSocket.disconnect()
      }
    }
    
    room.tv = { id: socket.id, roomCode: data.code, type: 'tv' }
    clientRooms.set(socket.id, data.code)
    
    socket.join(data.code)
    socket.emit('tv:joined', { 
      code: data.code,
      playerCount: room.controllers.length,
      session: room.session
    })
    
    console.log(`TV joined room: ${data.code}`)
  })

  // ===== CONTROLLER EVENTS =====

  // Controller joins a room
  socket.on('controller:join', (data: { code: string }) => {
    const room = rooms.get(data.code)

    if (!room) {
      socket.emit('controller:join-failed', { error: 'Room not found' })
      return
    }

    if (!room.tv) {
      socket.emit('controller:join-failed', { error: 'No TV connected' })
      return
    }

    // Check if this is a reconnecting controller (same socket.id won't match,
    // but we match by finding a reserved disconnected slot and assign it).
    // Simple heuristic: prefer the first reserved disconnected slot, else
    // pick the first empty slot up to max 4.
    const now = Date.now()

    // Release expired reserved slots first
    room.controllers.forEach(c => {
      if (c.disconnectedAt !== null && now - c.disconnectedAt > PLAYER_SLOT_HOLD_MS) {
        room.controllers.splice(room.controllers.indexOf(c), 1)
      }
    })

    // Find a reserved (disconnected) slot to reclaim, or assign new slot
    const reservedSlot = room.controllers.find(c => c.disconnectedAt !== null)
    const connectedCount = room.controllers.filter(c => c.disconnectedAt === null).length

    if (!reservedSlot && connectedCount >= 4) {
      socket.emit('controller:join-failed', { error: 'Room is full' })
      return
    }

    let playerNumber: number
    if (reservedSlot) {
      // Reclaim the reserved slot
      playerNumber = reservedSlot.playerNumber
      reservedSlot.id = socket.id
      reservedSlot.disconnectedAt = null
      reservedSlot.ready = false
      reservedSlot.lastPingTime = now
    } else {
      // New slot — find the lowest available number
      const usedNumbers = new Set(room.controllers.map(c => c.playerNumber))
      playerNumber = 1
      while (usedNumbers.has(playerNumber) && playerNumber <= 4) playerNumber++

      const controller: ControllerClient = {
        id: socket.id,
        roomCode: data.code,
        type: 'controller',
        playerNumber,
        ready: false,
        latency: 0,
        lastPingTime: now,
        disconnectedAt: null
      }
      room.controllers.push(controller)
    }

    clientRooms.set(socket.id, data.code)
    socket.join(data.code)

    socket.emit('controller:joined', {
      playerNumber,
      roomCode: data.code,
      color: PLAYER_COLORS[playerNumber - 1]
    })

    if (room.tv) {
      io.to(room.tv.id).emit('controller:connected', { playerNumber })
    }

    // Restore session state for reconnecting controller
    if (room.session.romName) {
      socket.emit('tv:rom-loaded', {
        romName: room.session.romName,
        consoleType: room.session.consoleType
      })
    }
    if (room.session.status === 'playing') {
      socket.emit('tv:game-started')
    }

    console.log(`Controller P${playerNumber} joined room: ${data.code}`)
  })

  // Controller ready status
  socket.on('controller:ready', (data: { playerId: number; ready: boolean }) => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return

    const room = rooms.get(roomCode)
    if (!room) return

    // Find controller by socket id (authoritative), not client-sent playerId
    const controller = room.controllers.find(c => c.id === socket.id)
    if (controller) {
      controller.ready = data.ready

      if (room.tv) {
        io.to(room.tv.id).emit('controller:ready', {
          playerNumber: controller.playerNumber,
          ready: data.ready
        })
      }

      console.log(`P${controller.playerNumber} ready: ${data.ready}`)
    }
  })

  // ===== ROM UPLOAD (FROM CONTROLLER TO TV) =====

  // Controller uploads ROM to TV
  socket.on('controller:upload-rom', (data: {
    romData: ArrayBuffer
    romName: string
    consoleType: string
    uploadedBy: number
  }) => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    
    // Update session
    room.session.romName = data.romName
    room.session.consoleType = data.consoleType
    room.session.status = 'rom-loaded'
    
    // Forward ROM data to TV
    io.to(room.tv.id).emit('tv:rom-uploaded', {
      romData: data.romData,
      romName: data.romName,
      consoleType: data.consoleType,
      uploadedBy: data.uploadedBy
    })
    
    // Notify all controllers in room
    io.to(roomCode).emit('tv:rom-loaded', {
      romName: data.romName,
      consoleType: data.consoleType
    })
    
    console.log(`ROM uploaded: ${data.romName} (${data.consoleType}) by P${data.uploadedBy}`)
  })

  // ===== GAME CONTROL =====

  // Start game (any connected controller can trigger start)
  socket.on('controller:start-game', () => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    room.session.status = 'playing'
    room.session.startedAt = Date.now()
    io.to(room.tv.id).emit('tv:game-start')
    io.to(roomCode).emit('tv:game-started')
    console.log(`Game started in room: ${roomCode}`)
  })

  // Pause/Resume game
  socket.on('controller:pause', () => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    
    if (room.session.status === 'playing') {
      room.session.status = 'paused'
    } else if (room.session.status === 'paused') {
      room.session.status = 'playing'
    }
    
    io.to(room.tv.id).emit('game:toggle-pause')
    io.to(roomCode).emit(`tv:game-${room.session.status === 'paused' ? 'paused' : 'resumed'}`)
  })

  // Reset game
  socket.on('controller:reset', () => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:reset')
  })

  // Toggle fullscreen — controller requests, TV handles the actual API
  socket.on('controller:toggle-fullscreen', () => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:toggle-fullscreen')
  })

  // Mute toggle
  socket.on('controller:mute', () => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:toggle-mute')
  })

  // Save state
  socket.on('controller:save-state', () => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:save-state')
  })

  // Load state
  socket.on('controller:load-state', () => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:load-state')
  })

  // TV UI navigation from controller (D-pad + A/B before game starts)
  socket.on('controller:nav', (data: { key: string }) => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    io.to(room.tv.id).emit('tv:nav', { key: data.key })
  })

  // Open emulator menu
  socket.on('controller:menu', () => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:menu')
  })

  // Exit game — any player can request; TV is authority
  socket.on('controller:exit-game', () => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    room.session.status = 'idle'
    room.session.romName = null
    room.session.consoleType = null
    room.session.startedAt = null
    io.to(room.tv.id).emit('game:exit')
    // Notify all controllers so they return to lobby
    io.to(roomCode).emit('tv:game-exited')
    console.log(`Game exited in room: ${roomCode}`)
  })

  // ===== CONTROLLER INPUT =====

  // Controller input - THE MAIN EVENT
  socket.on('controller:input', (data: {
    playerId: number
    buttonId: string
    pressed: boolean
    timestamp: number
  }) => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return

    const room = rooms.get(roomCode)
    if (!room || !room.tv) return

    // Use server-authoritative player number
    const controller = room.controllers.find(c => c.id === socket.id)
    if (!controller || controller.disconnectedAt !== null) return

    const latency = Date.now() - data.timestamp

    io.to(room.tv.id).emit('controller:input', {
      playerId: controller.playerNumber,
      buttonId: data.buttonId,
      pressed: data.pressed,
      timestamp: data.timestamp,
      latency,
      serverTime: Date.now()
    })
  })

  // Legacy button events (for backward compatibility)
  socket.on('controller:button', (data: { button: string; pressed: boolean }) => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    
    const controller = room.controllers.find(c => c.id === socket.id)
    const playerNumber = controller?.playerNumber || 1
    
    io.to(room.tv.id).emit('controller:button', {
      ...data,
      player: playerNumber
    })
  })

  // Legacy D-pad events
  socket.on('controller:dpad', (data: { direction: string; pressed: boolean }) => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    
    const controller = room.controllers.find(c => c.id === socket.id)
    const playerNumber = controller?.playerNumber || 1
    
    io.to(room.tv.id).emit('controller:dpad', {
      ...data,
      player: playerNumber
    })
  })

  // Controller latency update
  socket.on('controller:latency', (data: { playerNumber: number; latency: number }) => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room || !room.tv) return
    
    // Update controller latency
    const controller = room.controllers.find(c => c.playerNumber === data.playerNumber)
    if (controller) {
      controller.latency = data.latency
    }
    
    // Notify TV
    io.to(room.tv.id).emit('controller:latency', data)
  })

  // ===== LATENCY MEASUREMENT =====

  // Ping measurement for latency
  socket.on('ping:measure', (data: { timestamp: number }) => {
    socket.emit('pong:measure', { timestamp: data.timestamp })
  })

  // ===== DISCONNECT HANDLING =====

  socket.on('disconnect', () => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) {
      console.log(`Client disconnected: ${socket.id}`)
      return
    }
    
    const room = rooms.get(roomCode)
    if (!room) {
      clientRooms.delete(socket.id)
      return
    }
    
    // TV disconnected
    if (room.tv?.id === socket.id) {
      room.tv = null
      io.to(roomCode).emit('tv:disconnected')
      console.log(`TV disconnected from room: ${roomCode}`)
    }
    
    // Controller disconnected — reserve the slot, do NOT reassign numbers
    const controller = room.controllers.find(c => c.id === socket.id)
    if (controller) {
      controller.disconnectedAt = Date.now()

      // Notify TV that this player disconnected (slot preserved)
      if (room.tv) {
        io.to(room.tv.id).emit('controller:disconnected', {
          playerNumber: controller.playerNumber
        })
      }

      // Schedule slot release after hold period
      setTimeout(() => {
        const idx = room.controllers.indexOf(controller)
        if (idx !== -1 && controller.disconnectedAt !== null) {
          room.controllers.splice(idx, 1)
          cleanupRoom(roomCode)
        }
      }, PLAYER_SLOT_HOLD_MS)

      console.log(`Controller P${controller.playerNumber} disconnected (slot reserved) from room: ${roomCode}`)
    }
    
    clientRooms.delete(socket.id)
    cleanupRoom(roomCode)
  })

  socket.on('error', (error) => {
    console.error(`Socket error (${socket.id}):`, error)
  })
})

const PORT = parseInt(process.env.PORT || '3003', 10)
httpServer.listen(PORT, () => {
  console.log(`🎮 Nostalgia Console Server running on port ${PORT}`)
  console.log(`📱 Controller Platform Ready`)
  console.log(`📺 TV + Phone Pairing Active`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})
