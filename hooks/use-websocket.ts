"use client"

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react"
import { createElement, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getAccessToken } from "@/lib/auth"
import { contactKeys, messageKeys } from "@/hooks/queries/query-keys"
import type { WebSocketMessage } from "@/types/chat"

type EventHandler = (payload: any) => void

interface WebSocketContextValue {
  sendEvent: (type: string, payload?: any) => void
  subscribe: (eventType: string, handler: EventHandler) => () => void
  isConnected: boolean
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

const FAST_RETRY_BASE_MS = 1000
const FAST_RETRY_MAX = 5
const SLOW_RETRY_MS = 30_000

function buildWsUrl(token: string): string {
  const httpUrl = process.env.NEXT_PUBLIC_FS_WHATSAPP_URL || ""
  const wsUrl = httpUrl.replace(/^http/, "ws")
  return `${wsUrl}/ws?token=${encodeURIComponent(token)}`
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const listenersRef = useRef<Map<string, Set<EventHandler>>>(new Map())
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialConnectRef = useRef(true)
  const unmountedRef = useRef(false)

  const dispatch = useCallback((type: string, payload: any) => {
    const handlers = listenersRef.current.get(type)
    if (handlers) {
      handlers.forEach((handler) => handler(payload))
    }
  }, [])

  const connect = useCallback(() => {
    if (unmountedRef.current) return

    const token = getAccessToken()
    if (!token) return

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }

    const url = buildWsUrl(token)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (unmountedRef.current) {
        ws.close()
        return
      }
      setIsConnected(true)
      retryCountRef.current = 0

      // Refresh data on reconnect (not initial connect)
      if (!isInitialConnectRef.current) {
        queryClient.invalidateQueries({ queryKey: contactKeys.all })
        queryClient.invalidateQueries({ queryKey: messageKeys.all })
      }
      isInitialConnectRef.current = false
    }

    ws.onmessage = (event) => {
      let msg: WebSocketMessage
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      // Respond to server pings
      if (msg.type === "ping") {
        ws.readyState === WebSocket.OPEN &&
          ws.send(JSON.stringify({ type: "pong" }))
        return
      }

      dispatch(msg.type, msg.payload)

      // Normalize: message_status events also dispatch as status_update
      if (msg.type === "message_status") {
        dispatch("status_update", msg.payload)
      }
    }

    ws.onerror = () => {
      // onclose will fire after onerror, reconnection handled there
    }

    ws.onclose = () => {
      if (unmountedRef.current) return
      setIsConnected(false)
      wsRef.current = null
      scheduleReconnect()
    }
  }, [queryClient, dispatch])

  const scheduleReconnect = useCallback(() => {
    if (unmountedRef.current) return

    const count = retryCountRef.current
    retryCountRef.current = count + 1

    const delay =
      count < FAST_RETRY_MAX
        ? FAST_RETRY_BASE_MS * Math.pow(2, count)
        : SLOW_RETRY_MS

    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null
      connect()
    }, delay)
  }, [connect])

  // Connect on mount
  useEffect(() => {
    unmountedRef.current = false
    isInitialConnectRef.current = true
    connect()

    return () => {
      unmountedRef.current = true
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  const sendEvent = useCallback((type: string, payload?: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }))
    }
  }, [])

  const subscribe = useCallback(
    (eventType: string, handler: EventHandler): (() => void) => {
      if (!listenersRef.current.has(eventType)) {
        listenersRef.current.set(eventType, new Set())
      }
      listenersRef.current.get(eventType)!.add(handler)

      return () => {
        const handlers = listenersRef.current.get(eventType)
        if (handlers) {
          handlers.delete(handler)
          if (handlers.size === 0) {
            listenersRef.current.delete(eventType)
          }
        }
      }
    },
    []
  )

  const value = useMemo<WebSocketContextValue>(
    () => ({ sendEvent, subscribe, isConnected }),
    [sendEvent, subscribe, isConnected]
  )

  return createElement(WebSocketContext.Provider, { value }, children)
}

export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider")
  }
  return context
}
