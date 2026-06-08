'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  Users, 
  Zap,
  Clock,
  Signal,
  TrendingUp,
  TrendingDown
} from 'lucide-react'

// Latency metrics
interface LatencyMetrics {
  ping: number
  lastPingTime: number
  averageLatency: number
  minLatency: number
  maxLatency: number
  packetLoss: number
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor'
}

// Player metrics for dashboard
interface PlayerMetric {
  id: number
  name: string
  color: string
  connected: boolean
  ready: boolean
  latency: number
  inputRate: number
  lastInput: number
}

// Latency Dashboard Component
export function LatencyDashboard({ 
  roomCode,
  players,
  socket,
  compact = false 
}: { 
  roomCode: string | null
  players: PlayerMetric[]
  socket: any
  compact?: boolean
}) {
  const [metrics, setMetrics] = useState<LatencyMetrics>({
    ping: 0,
    lastPingTime: Date.now(),
    averageLatency: 0,
    minLatency: 999,
    maxLatency: 0,
    packetLoss: 0,
    connectionQuality: 'excellent'
  })
  
  const [latencyHistory, setLatencyHistory] = useState<number[]>([])
  const [pingActive, setPingActive] = useState(false)

  // Calculate connection quality
  const getConnectionQuality = useCallback((latency: number): 'excellent' | 'good' | 'fair' | 'poor' => {
    if (latency < 30) return 'excellent'
    if (latency < 50) return 'good'
    if (latency < 100) return 'fair'
    return 'poor'
  }, [])

  // Perform ping measurement
  const measurePing = useCallback(() => {
    if (!socket || !socket.connected) return
    
    setPingActive(true)
    const startTime = Date.now()
    
    // Emit ping and wait for pong
    socket.emit('ping:measure', { timestamp: startTime })
    
    const handlePong = (data: { timestamp: number }) => {
      const latency = Date.now() - data.timestamp
      setMetrics(prev => {
        const newHistory = [...latencyHistory, latency].slice(-20)
        const avg = newHistory.reduce((a, b) => a + b, 0) / newHistory.length
        const min = Math.min(prev.minLatency, latency)
        const max = Math.max(prev.maxLatency, latency)
        
        setLatencyHistory(newHistory)
        
        return {
          ping: latency,
          lastPingTime: Date.now(),
          averageLatency: Math.round(avg),
          minLatency: min === 999 ? latency : min,
          maxLatency: max,
          packetLoss: 0,
          connectionQuality: getConnectionQuality(latency)
        }
      })
      setPingActive(false)
    }
    
    socket.once('pong:measure', handlePong)
    
    // Timeout after 5 seconds
    setTimeout(() => {
      setPingActive(false)
    }, 5000)
  }, [socket, latencyHistory, getConnectionQuality])

  // Auto-measure ping every 2 seconds
  useEffect(() => {
    if (!socket) return
    
    // Initial ping
    measurePing()
    
    const interval = setInterval(measurePing, 2000)
    return () => clearInterval(interval)
  }, [socket, measurePing])

  // Quality color mapping
  const qualityColors = {
    excellent: 'text-green-400',
    good: 'text-blue-400',
    fair: 'text-yellow-400',
    poor: 'text-red-400'
  }

  const qualityBgColors = {
    excellent: 'bg-green-500/20',
    good: 'bg-blue-500/20',
    fair: 'bg-yellow-500/20',
    poor: 'bg-red-500/20'
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-1">
          {pingActive ? (
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          ) : (
            <Signal className={`w-4 h-4 ${qualityColors[metrics.connectionQuality]}`} />
          )}
          <span className="text-white font-mono">{metrics.ping}ms</span>
        </div>
        <Badge variant="secondary" className={`${qualityBgColors[metrics.connectionQuality]} border-0`}>
          {metrics.connectionQuality}
        </Badge>
      </div>
    )
  }

  return (
    <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Latency Dashboard
          </CardTitle>
          <Badge 
            variant="secondary" 
            className={`${qualityBgColors[metrics.connectionQuality]} ${qualityColors[metrics.connectionQuality]} border-0`}
          >
            {metrics.connectionQuality.toUpperCase()}
          </Badge>
        </div>
        <CardDescription className="text-gray-400">
          Room: {roomCode || 'Not connected'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Current Ping */}
          <div className="bg-gray-700/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              {pingActive ? (
                <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
              ) : (
                <Zap className="w-3 h-3" />
              )}
              PING
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {metrics.ping}
              <span className="text-sm text-gray-400 ml-1">ms</span>
            </div>
          </div>

          {/* Average Latency */}
          <div className="bg-gray-700/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <TrendingUp className="w-3 h-3" />
              AVG LATENCY
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {metrics.averageLatency}
              <span className="text-sm text-gray-400 ml-1">ms</span>
            </div>
          </div>

          {/* Min/Max */}
          <div className="bg-gray-700/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <TrendingDown className="w-3 h-3" />
              MIN / MAX
            </div>
            <div className="text-lg font-bold text-white font-mono">
              {metrics.minLatency} / {metrics.maxLatency}
              <span className="text-xs text-gray-400 ml-1">ms</span>
            </div>
          </div>

          {/* Connected Players */}
          <div className="bg-gray-700/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Users className="w-3 h-3" />
              PLAYERS
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {players.filter(p => p.connected).length}
              <span className="text-sm text-gray-400 ml-1">/ 4</span>
            </div>
          </div>
        </div>

        {/* Latency Graph */}
        <div className="bg-gray-700/30 rounded-lg p-3">
          <div className="text-gray-400 text-xs mb-2">LATENCY HISTORY</div>
          <div className="h-16 flex items-end gap-0.5">
            {latencyHistory.map((latency, i) => {
              const height = Math.min(100, (latency / 100) * 100)
              const color = latency < 30 ? 'bg-green-500' : latency < 50 ? 'bg-blue-500' : latency < 100 ? 'bg-yellow-500' : 'bg-red-500'
              return (
                <div
                  key={i}
                  className={`${color} rounded-t flex-1 transition-all duration-150`}
                  style={{ height: `${height}%` }}
                />
              )
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0ms</span>
            <span>50ms</span>
            <span>100ms+</span>
          </div>
        </div>

        {/* Player List */}
        <div className="space-y-2">
          <div className="text-gray-400 text-xs">PLAYER LATENCY</div>
          {players.filter(p => p.connected).map(player => (
            <div key={player.id} className="flex items-center justify-between bg-gray-700/30 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: player.color }}
                />
                <span className="text-white text-sm">{player.name}</span>
                {player.ready && (
                  <Badge variant="secondary" className="bg-green-500/20 text-green-400 text-xs border-0">
                    READY
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm font-mono">{player.latency}ms</span>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
            </div>
          ))}
          {players.filter(p => p.connected).length === 0 && (
            <div className="text-gray-500 text-sm text-center py-2">
              No players connected
            </div>
          )}
        </div>

        {/* Target Goal */}
        <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-700 pt-3">
          <span>Target: &lt;50ms latency</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Updated: {new Date(metrics.lastPingTime).toLocaleTimeString()}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
