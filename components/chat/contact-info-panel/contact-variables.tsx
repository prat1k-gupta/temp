"use client"

import { useState } from "react"
import { ChevronDown, Database } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { ContactVariable } from "@/types/chat"

interface ContactVariablesProps {
  variables: Record<string, ContactVariable[]>
}

export function ContactVariables({ variables }: ContactVariablesProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  if (!variables || Object.keys(variables).length === 0) return null

  return (
    <div className="pt-4 border-t">
      <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-primary transition-colors cursor-pointer">
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            <span>Saved Variables</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", isCollapsed && "-rotate-90")} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          {Object.entries(variables).map(([flowSlug, vars]) => (
            <div key={flowSlug} className="mt-3">
              <Badge variant="outline" className="text-xs mb-2">
                {flowSlug}
              </Badge>
              <div className="grid grid-cols-1 gap-2">
                {vars.map((v) => (
                  <div key={v.variable_name} className="bg-muted/50 rounded-md px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                      {v.variable_name}
                    </p>
                    <p className="text-sm font-semibold break-words mt-0.5">{v.value || "-"}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
