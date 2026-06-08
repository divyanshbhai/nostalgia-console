import os from 'os'

const FRONTEND_PORT = 3000
const SOCKET_PORT = 3003

function getLanIp() {
  const nets = os.networkInterfaces()
  for (const iface of Object.values(nets)) {
    for (const net of iface ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

// Wait for servers to start printing their own boot logs first
setTimeout(() => {
  const ip = getLanIp()
  const reset  = '\x1b[0m'
  const bold   = '\x1b[1m'
  const cyan   = '\x1b[36m'
  const yellow = '\x1b[33m'
  const green  = '\x1b[32m'
  const dim    = '\x1b[2m'

  console.log('')
  console.log(`${bold}${green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}`)
  console.log(`${bold}${green}  🎮 Nostalgia Console — LAN Dev URLs${reset}`)
  console.log(`${bold}${green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}`)
  console.log('')
  console.log(`  ${cyan}📺 TV${reset}`)
  console.log(`  ${bold}http://${ip}:${FRONTEND_PORT}/tv${reset}`)
  console.log(`  ${dim}Open this on your Android TV or browser${reset}`)
  console.log('')
  console.log(`  ${yellow}🎮 Controller${reset}`)
  console.log(`  ${bold}http://${ip}:${FRONTEND_PORT}/controller${reset}`)
  console.log(`  ${dim}Open this on your phone${reset}`)
  console.log('')
  console.log(`  ${green}⚡ Socket Server${reset}`)
  console.log(`  ${bold}http://${ip}:${SOCKET_PORT}${reset}`)
  console.log(`  ${dim}WebSocket server (Socket.IO)${reset}`)
  console.log('')
  console.log(`${bold}${green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}`)
  console.log(`  ${dim}Ctrl+C to stop all services${reset}`)
  console.log(`${bold}${green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}`)
  console.log('')
}, 2000)
