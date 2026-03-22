"use client"

import { createContext, useContext } from "react"

type PillClickHandler = (nodeKey: string, rect: DOMRect) => void

const PillClickContext = createContext<PillClickHandler | null>(null)

export const PillClickProvider = PillClickContext.Provider

export function usePillClick(): PillClickHandler | null {
  return useContext(PillClickContext)
}
