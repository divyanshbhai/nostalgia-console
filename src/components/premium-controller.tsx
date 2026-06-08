'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize,
  Settings,
  Zap
} from 'lucide-react'
import { 
  ControllerProfile, 
  ButtonConfig,
  NES_PROFILE,
  PLAYER_COLORS,
  PlayerColor
} from '@/lib/controller-profiles'

// Props for the premium controller
interface PremiumControllerProps {
  socket: Socket | null
  playerNumber: number
  playerColor: PlayerColor
  profile?: ControllerProfile
  gameName?: string
  onReady?: (ready: boolean) => void
}

// Haptic feedback utility
const hapticFeedback = {
  light: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10)
    }
  },
  medium: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(25)
    }
  },
  heavy: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50)
    }
  },
  success: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([10, 30, 50])
    }
  }
}

// Main Premium Controller Component
export function PremiumController({
  socket,
  playerNumber,
  playerColor,
  profile = NES_PROFILE,
  gameName,
  onReady
}: PremiumControllerProps) {
  const [activeButtons, setActiveButtons] = useState<Set<string>>(new Set())
  const [isReady, setIsReady] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [hapticEnabled, setHapticEnabled] = useState(true)
  const [isPortrait, setIsPortrait] = useState(true)
  const [latency, setLatency] = useState(0)
  
  const lastInputTime = useRef<number>(Date.now())
  const inputCount = useRef<number>(0)

  // Handle orientation change
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth)
    }
    
    checkOrientation()
    window.addEventListener('resize', checkOrientation)
    return () => window.removeEventListener('resize', checkOrientation)
  }, [])

  // Calculate input rate
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = (now - lastInputTime.current) / 1000
      if (elapsed > 0 && inputCount.current > 0) {
        // Could emit input rate for dashboard
        inputCount.current = 0
        lastInputTime.current = now
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [])

  // Send button input
  const sendInput = useCallback((buttonId: string, pressed: boolean) => {
    if (!socket) return
    
    const timestamp = Date.now()
    
    // Send to server
    socket.emit('controller:input', {
      playerId: playerNumber,
      buttonId,
      pressed,
      timestamp
    })
    
    // Update visual state
    setActiveButtons(prev => {
      const next = new Set(prev)
      if (pressed) {
        next.add(buttonId)
      } else {
        next.delete(buttonId)
      }
      return next
    })
    
    // Haptic feedback
    if (hapticEnabled && pressed) {
      hapticFeedback.light()
    }
    
    // Track input rate
    inputCount.current++
    lastInputTime.current = timestamp
    
  }, [socket, playerNumber, hapticEnabled])

  // Touch handlers with proper event handling
  const createTouchHandlers = (buttonId: string) => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault()
      sendInput(buttonId, true)
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault()
      sendInput(buttonId, false)
    },
    onTouchCancel: (e: React.TouchEvent) => {
      e.preventDefault()
      sendInput(buttonId, false)
    },
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault()
      sendInput(buttonId, true)
    },
    onMouseUp: (e: React.MouseEvent) => {
      e.preventDefault()
      sendInput(buttonId, false)
    },
    onMouseLeave: () => {
      sendInput(buttonId, false)
    }
  })

  // Toggle ready status
  const toggleReady = useCallback(() => {
    const newReady = !isReady
    setIsReady(newReady)
    if (hapticEnabled) {
      hapticFeedback.success()
    }
    socket?.emit('controller:ready', { playerId: playerNumber, ready: newReady })
    onReady?.(newReady)
  }, [isReady, socket, playerNumber, hapticEnabled, onReady])

  // Get player color styling
  const colorStyle = PLAYER_COLORS[playerColor] || PLAYER_COLORS.red

  // Button size classes
  const sizeClasses = {
    small: 'w-10 h-10 text-sm',
    medium: 'w-14 h-14 text-lg',
    large: 'w-16 h-16 text-xl'
  }

  // Render a button
  const renderButton = (config: ButtonConfig) => {
    const isActive = activeButtons.has(config.id)
    const sizeClass = sizeClasses[config.size]
    
    return (
      <button
        key={config.id}
        {...createTouchHandlers(config.id)}
        className={`
          ${sizeClass} rounded-full font-bold
          flex items-center justify-center
          transition-all duration-75 select-none
          touch-none active:scale-95
          ${isActive 
            ? 'ring-4 ring-white/50 scale-95' 
            : 'shadow-lg'
          }
        `}
        style={{
          backgroundColor: isActive ? '#ffffff' : config.color,
          color: isActive ? config.color : '#ffffff',
          boxShadow: isActive ? '0 0 20px rgba(255,255,255,0.3)' : '0 4px 12px rgba(0,0,0,0.3)'
        }}
      >
        {config.label}
      </button>
    )
  }

  // D-Pad component
  const DPad = () => {
    const directions = [
      { id: 'dpad_up', icon: ChevronUp, pos: 'top-0 left-1/2 -translate-x-1/2' },
      { id: 'dpad_down', icon: ChevronDown, pos: 'bottom-0 left-1/2 -translate-x-1/2' },
      { id: 'dpad_left', icon: ChevronLeft, pos: 'left-0 top-1/2 -translate-y-1/2' },
      { id: 'dpad_right', icon: ChevronRight, pos: 'right-0 top-1/2 -translate-y-1/2' }
    ]
    
    const sizeMap = {
      small: 'w-10 h-10',
      medium: 'w-12 h-12',
      large: 'w-14 h-14'
    }
    
    const buttonSize = sizeMap[profile.dpad.size]
    
    return (
      <div className={`relative ${profile.dpad.size === 'large' ? 'w-36 h-36' : profile.dpad.size === 'medium' ? 'w-32 h-32' : 'w-28 h-28'}`}>
        {directions.map(({ id, icon: Icon, pos }) => {
          const isActive = activeButtons.has(id)
          return (
            <button
              key={id}
              {...createTouchHandlers(id)}
              className={`
                absolute ${buttonSize} rounded-lg
                flex items-center justify-center
                transition-all duration-75 select-none touch-none
                ${isActive ? 'bg-white scale-95' : 'bg-gray-700 active:bg-gray-600'}
              `}
              style={{
                boxShadow: isActive ? '0 0 15px rgba(255,255,255,0.3)' : '0 2px 8px rgba(0,0,0,0.3)'
              }}
            >
              <Icon className={`w-6 h-6 ${isActive ? 'text-gray-700' : 'text-white'}`} />
            </button>
          )
        })}
        {/* Center piece */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gray-800" />
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen flex flex-col touch-none select-none overflow-hidden"
      style={{ backgroundColor: profile.theme.background }}
    >
      {/* Header */}
      <header 
        className="p-3 flex items-center justify-between"
        style={{ backgroundColor: `${colorStyle.bg}` }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg"
            style={{ backgroundColor: colorStyle.primary }}
          >
            <span className="text-white">P{playerNumber}</span>
          </div>
          <div>
            <div className="text-white font-medium text-sm">{gameName || profile.consoleName}</div>
            <div className="text-gray-400 text-xs flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {latency}ms
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Ready Button */}
          <button
            onClick={toggleReady}
            className={`
              px-4 py-2 rounded-lg font-medium text-sm transition-all
              ${isReady 
                ? 'bg-green-500 text-white' 
                : 'bg-gray-700 text-gray-300 border border-gray-600'
              }
            `}
          >
            {isReady ? '✓ READY' : 'READY?'}
          </button>
          
          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg bg-gray-700 text-gray-300"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-gray-800/90 p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-white text-sm">Haptic Feedback</span>
            <button
              onClick={() => {
                setHapticEnabled(!hapticEnabled)
                if (!hapticEnabled) hapticFeedback.success()
              }}
              className={`w-12 h-6 rounded-full transition-all ${hapticEnabled ? 'bg-green-500' : 'bg-gray-600'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${hapticEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      )}

      {/* Main Controller Area */}
      <main className="flex-1 flex flex-col justify-end p-4">
        {/* System Buttons Row */}
        <div className="flex justify-center gap-4 mb-4">
          {profile.systemButtons.map(config => (
            <button
              key={config.id}
              {...createTouchHandlers(config.id)}
              className={`
                px-4 py-2 rounded-md text-sm font-medium
                transition-all duration-75
                ${activeButtons.has(config.id) ? 'bg-white text-gray-700' : 'bg-gray-700 text-gray-300'}
              `}
            >
              {config.label}
            </button>
          ))}
        </div>

        {/* Main Controls */}
        <div className="flex items-center justify-between px-4">
          {/* D-Pad */}
          {profile.dpad.enabled && <DPad />}

          {/* Face Buttons */}
          <div 
            className="relative"
            style={{ 
              width: profile.buttons.length > 2 ? '140px' : '120px',
              height: profile.buttons.length > 2 ? '140px' : '100px'
            }}
          >
            {profile.buttons.map(config => (
              <div
                key={config.id}
                className="absolute"
                style={{
                  left: `${config.position.x - 70}%`,
                  top: `${config.position.y - 50}%`
                }}
              >
                {renderButton(config)}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Quick Actions */}
        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={() => socket?.emit('controller:action', { action: 'reset' })}
            className="p-3 rounded-full bg-gray-700 text-gray-300"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </main>

      {/* Latency Indicator */}
      <div className="fixed bottom-2 right-2 bg-gray-800/80 px-2 py-1 rounded text-xs text-gray-400">
        {latency}ms | {profile.name}
      </div>
    </div>
  )
}
