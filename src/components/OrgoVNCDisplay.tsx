'use client'

import { useState, useEffect, useCallback } from 'react'
import { ComputerDisplay, ComputerDisplayHandle } from 'orgo-vnc'
import { Loader2, Monitor, RefreshCw, AlertCircle } from 'lucide-react'

interface OrgoVNCDisplayProps {
  vmId?: string
  className?: string
  readOnly?: boolean
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

export function OrgoVNCDisplay({
  vmId,
  className = '',
  readOnly = false,
  onConnect,
  onDisconnect,
  onError,
}: OrgoVNCDisplayProps) {
  const [hostname, setHostname] = useState<string | null>(null)
  const [password, setPassword] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [handle, setHandle] = useState<ComputerDisplayHandle | null>(null)

  const fetchVNCCredentials = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const url = vmId ? `/api/setup/vnc-password?vmId=${vmId}` : '/api/setup/vnc-password'
      const response = await fetch(url)
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch VNC credentials')
      }
      
      const data = await response.json()
      setHostname(data.hostname)
      setPassword(data.password)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to VM'
      setError(errorMessage)
      onError?.(err instanceof Error ? err : new Error(errorMessage))
    } finally {
      setIsLoading(false)
    }
  }, [vmId, onError])

  useEffect(() => {
    fetchVNCCredentials()
  }, [fetchVNCCredentials])

  const handleConnect = useCallback(() => {
    setIsConnected(true)
    onConnect?.()
  }, [onConnect])

  const handleDisconnect = useCallback(() => {
    setIsConnected(false)
    onDisconnect?.()
  }, [onDisconnect])

  const handleVNCError = useCallback((err: Error) => {
    setError(err.message)
    onError?.(err)
  }, [onError])

  const handleRetry = useCallback(() => {
    if (handle) {
      handle.reconnect()
    } else {
      fetchVNCCredentials()
    }
  }, [handle, fetchVNCCredentials])

  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center bg-sam-bg ${className}`}>
        <Loader2 className="w-8 h-8 animate-spin text-sam-accent mb-3" />
        <p className="text-sm text-sam-text-dim font-mono">Connecting to VM...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-sam-bg ${className}`}>
        <AlertCircle className="w-8 h-8 text-sam-error mb-3" />
        <p className="text-sm text-sam-error font-mono mb-4">{error}</p>
        <button
          onClick={handleRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border bg-sam-surface hover:border-sam-accent text-sam-text-dim hover:text-sam-accent transition-all text-sm font-mono"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  if (!hostname || !password) {
    return (
      <div className={`flex flex-col items-center justify-center bg-sam-bg ${className}`}>
        <Monitor className="w-8 h-8 text-sam-text-dim mb-3" />
        <p className="text-sm text-sam-text-dim font-mono">VM credentials not available</p>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <ComputerDisplay
        hostname={hostname}
        password={password}
        background="transparent"
        readOnly={readOnly}
        scaleViewport={true}
        clipViewport={false}
        resizeSession={false}
        showDotCursor={false}
        compressionLevel={2}
        qualityLevel={6}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onError={handleVNCError}
        onReady={setHandle}
      />
    </div>
  )
}
