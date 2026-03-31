"use client"

import { useState, useRef, useCallback } from "react"
import { apiClient } from "@/lib/api-client"

declare global {
  interface Window {
    fbAsyncInit: () => void
    FB: {
      init: (params: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void
      login: (callback: (response: FBLoginResponse) => void, options: Record<string, unknown>) => void
    }
  }
}

interface FBLoginResponse {
  authResponse?: {
    code: string
  }
  status?: string
}

interface SDKConfig {
  app_id: string
  configuration_id: string
  api_version: string
}

export interface EmbeddedSignupResult {
  code: string
  wabaId: string
  phoneNumberId: string
}

function isFacebookOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com")
  } catch {
    return false
  }
}

export function useFacebookSDK() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSDKReady, setIsSDKReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sdkConfig = useRef<SDKConfig | null>(null)
  const loadingRef = useRef(false)

  const loadSDK = useCallback(async () => {
    if (isSDKReady || loadingRef.current) return
    loadingRef.current = true
    setIsLoading(true)
    setError(null)

    try {
      const config = await apiClient.get<SDKConfig>("/api/embedded-signup/config")
      sdkConfig.current = config

      await new Promise<void>((resolve, reject) => {
        // SDK already loaded (e.g. hot-reload)
        if (window.FB) {
          setIsSDKReady(true)
          resolve()
          return
        }

        window.fbAsyncInit = () => {
          window.FB.init({
            appId: config.app_id,
            autoLogAppEvents: true,
            xfbml: true,
            version: config.api_version,
          })
          setIsSDKReady(true)
          resolve()
        }

        // Script tag exists but FB not ready yet — reassign fbAsyncInit
        if (document.getElementById("facebook-jssdk")) return

        const script = document.createElement("script")
        script.id = "facebook-jssdk"
        script.src = "https://connect.facebook.net/en_US/sdk.js"
        script.async = true
        script.defer = true
        script.crossOrigin = "anonymous"
        script.onerror = () => reject(new Error("Failed to load Facebook SDK"))
        document.head.appendChild(script)
      })
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Failed to load Facebook SDK"
      const msg = raw.includes("Request failed")
        ? "Embedded Signup is not configured on the server. Use manual 'Add Account' instead."
        : raw
      setError(msg)
      throw e
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [isSDKReady])

  const launchEmbeddedSignup = useCallback((): Promise<EmbeddedSignupResult> => {
    return new Promise((resolve, reject) => {
      if (!isSDKReady || !sdkConfig.current) {
        reject(new Error("Facebook SDK not loaded"))
        return
      }

      let wabaId = ""
      let phoneNumberId = ""

      const messageHandler = (event: MessageEvent) => {
        if (!isFacebookOrigin(event.origin)) return
        try {
          const data = JSON.parse(event.data)
          if (data.type === "WA_EMBEDDED_SIGNUP") {
            wabaId = data.data?.waba_id || ""
            phoneNumberId = data.data?.phone_number_id || ""
          }
        } catch {
          // Not JSON, ignore
        }
      }

      window.addEventListener("message", messageHandler)

      const timeout = setTimeout(() => {
        window.removeEventListener("message", messageHandler)
        reject(new Error("Embedded Signup timed out. Please try again."))
      }, 300000) // 5 minutes

      window.FB.login(
        (response: FBLoginResponse) => {
          clearTimeout(timeout)
          window.removeEventListener("message", messageHandler)

          if (response.authResponse?.code) {
            if (!wabaId || !phoneNumberId) {
              reject(new Error("WhatsApp account data was not received. Please try again."))
              return
            }
            resolve({ code: response.authResponse.code, wabaId, phoneNumberId })
          } else {
            reject(new Error("Setup was cancelled or failed. You can try again anytime."))
          }
        },
        {
          config_id: sdkConfig.current.configuration_id,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {} },
        }
      )
    })
  }, [isSDKReady])

  return { isLoading, isSDKReady, error, loadSDK, launchEmbeddedSignup }
}
