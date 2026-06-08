import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server, Socket } from 'socket.io'

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }))
    return
  }
  res.writeHead(404)
  res.end()
})

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 32 * 1024 * 1024,
  pingTimeout: 120000,
  pingInterval: 25000,
  connectTimeout: 45000,
})

interface TVClient { id: string; roomCode: string; type: 'tv' }
interface ControllerClient {
  id: string; roomCode: string; type: 'controller'
  playerNumber: number; ready: boolean; latency: number
  lastPingTime: number; disconnectedAt: number | null
}
interface GameSession {
  romName: string | null; consoleType: string | null
  status: 'idle' | 'rom-loaded' | 'playing' | 'paused'; startedAt: number | null
}
interface Room {
  code: string; tv: TVClient | null
  controllers: ControllerClient[]; session: GameSession; createdAt: number
}

const PLAYER_SLOT_HOLD_MS = 60_000
const rooms = new Map<string, Room>()
const clientRooms = new Map<string, string>()

const generateRoomCode = (): string => Math.floor(100000 + Math.random() * 900000).toString()

const createRoom = (code: string): Room => ({
  code, tv: null, controllers: [],
  session: { romName: null, consoleType: null, status: 'idle', startedAt: null },
  createdAt: Date.now()
})

const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow']

const cleanupRoom = (code: string) => {
  const room = rooms.get(code)
  if (room && !room.tv && room.controllers.length === 0) {
    rooms.delete(code)
    console.log(`Room ${code} cleaned up`)
  }
}

io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`)

  // ── TV EVENTS ──────────────────────────────────────────────────────────────

  socket.on('tv:create-room', () => {
    // If TV already has a room (reconnect with same socket), reuse it
    const existingCode = clientRooms.get(socket.id)
    if (existingCode) {
      const existing = rooms.get(existingCode)
      if (existing) {
        socket.emit('tv:room-created', { code: existingCode })
        return
      }
    }
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

  // TV reconnects with its persisted room code (from localStorage)
  socket.on('tv:join-room', (data: { code: string }) => {
    // Reuse existing room if present, or create a fresh one with the same code
    let room = rooms.get(data.code)
    if (!room) {
      room = createRoom(data.code)
      rooms.set(data.code, room)
    }
    if (room.tv) {
      const oldSocket = io.sockets.sockets.get(room.tv.id)
      if (oldSocket) { oldSocket.emit('tv:kicked', { reason: 'Another TV connected' }); oldSocket.disconnect() }
    }
    room.tv = { id: socket.id, roomCode: data.code, type: 'tv' }
    clientRooms.set(socket.id, data.code)
    socket.join(data.code)
    socket.emit('tv:joined', { code: data.code, session: room.session })
    // Re-notify all connected controllers that TV is back
    room.controllers.filter(c => c.disconnectedAt === null).forEach(c => {
      io.to(c.id).emit('tv:reconnected')
    })
    console.log(`TV joined/reclaimed room: ${data.code}`)
  })

  // ── CONTROLLER EVENTS ──────────────────────────────────────────────────────

  socket.on('controller:join', (data: { code: string }) => {
    const room = rooms.get(data.code)
    if (!room) { socket.emit('controller:join-failed', { error: 'Room not found' }); return }

    // Allow join even when TV is temporarily disconnected (it reconnects shortly)
    // Only block fresh join on a brand-new never-used room with no TV
    if (!room.tv && room.session.status === 'idle' && room.controllers.length === 0) {
      socket.emit('controller:join-failed', { error: 'No TV connected' }); return
    }

    const now = Date.now()
    // Release expired slots
    room.controllers = room.controllers.filter(c =>
      !(c.disconnectedAt !== null && now - c.disconnectedAt > PLAYER_SLOT_HOLD_MS)
    )

    const reservedSlot = room.controllers.find(c => c.disconnectedAt !== null)
    const connectedCount = room.controllers.filter(c => c.disconnectedAt === null).length

    if (!reservedSlot && connectedCount >= 4) { socket.emit('controller:join-failed', { error: 'Room is full' }); return }

    let playerNumber: number
    if (reservedSlot) {
      playerNumber = reservedSlot.playerNumber
      reservedSlot.id = socket.id
      reservedSlot.disconnectedAt = null
      reservedSlot.ready = false
      reservedSlot.lastPingTime = now
    } else {
      const usedNumbers = new Set(room.controllers.map(c => c.playerNumber))
      playerNumber = 1
      while (usedNumbers.has(playerNumber) && playerNumber <= 4) playerNumber++
      room.controllers.push({
        id: socket.id, roomCode: data.code, type: 'controller',
        playerNumber, ready: false, latency: 0, lastPingTime: now, disconnectedAt: null
      })
    }

    clientRooms.set(socket.id, data.code)
    socket.join(data.code)
    socket.emit('controller:joined', { playerNumber, roomCode: data.code, color: PLAYER_COLORS[playerNumber - 1] })

    if (room.tv) io.to(room.tv.id).emit('controller:connected', { playerNumber })

    // Restore session state
    if (room.session.romName) socket.emit('tv:rom-loaded', { romName: room.session.romName, consoleType: room.session.consoleType })
    if (room.session.status === 'playing' || room.session.status === 'paused') socket.emit('tv:game-started')

    console.log(`Controller P${playerNumber} joined room: ${data.code}`)
  })

  socket.on('controller:ready', (data: { playerId: number; ready: boolean }) => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room) return
    const controller = room.controllers.find(c => c.id === socket.id)
    if (controller) {
      controller.ready = data.ready
      if (room.tv) io.to(room.tv.id).emit('controller:ready', { playerNumber: controller.playerNumber, ready: data.ready })
    }
  })

  // ── ROM UPLOAD ─────────────────────────────────────────────────────────────

  socket.on('controller:upload-rom', (data: { romData: ArrayBuffer; romName: string; consoleType: string; uploadedBy: number }) => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    room.session.romName = data.romName
    room.session.consoleType = data.consoleType
    room.session.status = 'rom-loaded'
    io.to(room.tv.id).emit('tv:rom-uploaded', { romData: data.romData, romName: data.romName, consoleType: data.consoleType, uploadedBy: data.uploadedBy })
    io.to(roomCode).emit('tv:rom-loaded', { romName: data.romName, consoleType: data.consoleType })
    console.log(`ROM uploaded: ${data.romName} by P${data.uploadedBy}`)
  })

  // ── GAME CONTROL ───────────────────────────────────────────────────────────

  socket.on('controller:start-game', () => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    room.session.status = 'playing'; room.session.startedAt = Date.now()
    io.to(room.tv.id).emit('tv:game-start')
    io.to(roomCode).emit('tv:game-started')
    console.log(`Game started in room: ${roomCode}`)
  })

  socket.on('controller:pause', () => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    if (room.session.status === 'playing') room.session.status = 'paused'
    else if (room.session.status === 'paused') room.session.status = 'playing'
    io.to(room.tv.id).emit('game:toggle-pause')
    io.to(roomCode).emit(`tv:game-${room.session.status === 'paused' ? 'paused' : 'resumed'}`)
  })

  socket.on('controller:reset', () => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:reset')
  })

  socket.on('controller:toggle-fullscreen', () => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:toggle-fullscreen')
  })

  socket.on('controller:mute', () => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:toggle-mute')
  })

  socket.on('controller:save-state', () => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:save-state')
  })

  socket.on('controller:load-state', () => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:load-state')
  })

  socket.on('controller:nav', (data: { key: string }) => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    io.to(room.tv.id).emit('tv:nav', { key: data.key })
  })

  socket.on('controller:menu', () => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    io.to(room.tv.id).emit('game:menu')
  })

  socket.on('controller:exit-game', () => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    room.session.status = 'idle'; room.session.romName = null
    room.session.consoleType = null; room.session.startedAt = null
    io.to(room.tv.id).emit('game:exit')
    io.to(roomCode).emit('tv:game-exited')
    console.log(`Game exited in room: ${roomCode}`)
  })

  // ── CONTROLLER INPUT ───────────────────────────────────────────────────────

  socket.on('controller:input', (data: { playerId: number; buttonId: string; pressed: boolean; timestamp: number }) => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    const controller = room.controllers.find(c => c.id === socket.id)
    if (!controller || controller.disconnectedAt !== null) return
    const latency = Date.now() - data.timestamp
    io.to(room.tv.id).emit('controller:input', {
      playerId: controller.playerNumber, buttonId: data.buttonId,
      pressed: data.pressed, timestamp: data.timestamp, latency, serverTime: Date.now()
    })
  })

  socket.on('controller:latency', (data: { playerNumber: number; latency: number }) => {
    const roomCode = clientRooms.get(socket.id); if (!roomCode) return
    const room = rooms.get(roomCode); if (!room || !room.tv) return
    const controller = room.controllers.find(c => c.playerNumber === data.playerNumber)
    if (controller) controller.latency = data.latency
    io.to(room.tv.id).emit('controller:latency', data)
  })

  socket.on('ping:measure', (data: { timestamp: number }) => {
    socket.emit('pong:measure', { timestamp: data.timestamp })
  })

  // ── DISCONNECT ─────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    const roomCode = clientRooms.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room) { clientRooms.delete(socket.id); return }

    if (room.tv?.id === socket.id) {
      room.tv = null
      io.to(roomCode).emit('tv:disconnected')
      console.log(`TV disconnected from room: ${roomCode}`)
    }

    const controller = room.controllers.find(c => c.id === socket.id)
    if (controller) {
      controller.disconnectedAt = Date.now()
      if (room.tv) io.to(room.tv.id).emit('controller:disconnected', { playerNumber: controller.playerNumber })
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

  socket.on('error', (error) => console.error(`Socket error (${socket.id}):`, error))
})

const PORT = parseInt(process.env.PORT || '3003', 10)
httpServer.listen(PORT, () => {
  console.log(`🎮 Nostalgia Console Server running on port ${PORT}`)

  // Keep Render free-tier awake — self-ping every 10 minutes
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL
  if (SELF_URL) {
    setInterval(() => fetch(`${SELF_URL}/health`).catch(() => {}), 10 * 60 * 1000)
    console.log(`💓 Keepalive pinging ${SELF_URL}/health every 10 min`)
  }
})

process.on('SIGTERM', () => httpServer.close(() => process.exit(0)))
process.on('SIGINT',  () => httpServer.close(() => process.exit(0)))
