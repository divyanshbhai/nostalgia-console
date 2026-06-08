// Resolves the correct Socket.IO server URL for any environment.
//
// Priority:
// 1. NEXT_PUBLIC_SOCKET_URL  — Railway conventional name
// 2. NEXT_PUBLIC_WS_URL      — legacy / Render name
// 3. Dev tunnel (port 81 / space-z.ai) — Caddy XTransformPort proxy
// 4. LAN / localhost — same host, port 3003

export function getWsUrl(): string {
  if (typeof window === 'undefined') return ''

  const envUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_WS_URL
  if (envUrl?.trim()) return envUrl.trim()

  const { protocol, hostname, port } = window.location

  // Dev tunnel
  if (port === '81' || hostname.includes('space-z.ai')) {
    return '/?XTransformPort=3003'
  }

  // Production deployments on Vercel/Netlify/etc. MUST set env vars above.
  // Without them, fall back to same-host port 3003 for LAN/self-hosted.
  return `${protocol}//${hostname}:3003`
}
