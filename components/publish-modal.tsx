"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Upload,
  CheckCircle,
  Clock,
  GitBranch,
  Loader2,
  AlertCircle
} from "lucide-react"
import { toast } from "sonner"
import type { Node, Edge } from "@xyflow/react"
import type { FlowChange } from "@/types"
import { convertToFsWhatsApp } from "@/utils/whatsapp-converter"
import { flattenFlow } from "@/utils/flow-flattener"
import { validateFlowVariables } from "@/utils/flow-variables"
import { publishFlowToWhatsApp } from "@/lib/whatsapp-api"
import { apiClient } from "@/lib/api-client"

interface PublishModalProps {
  changes: FlowChange[]
  hasUnsavedChanges: boolean
  onCreateVersion: (name: string, description?: string) => Promise<void>
  onPublishVersion: (versionId?: string, versionName?: string, description?: string) => Promise<void>
  currentVersion: any
  children: React.ReactNode
  platform?: string
  nodes?: Node[]
  edges?: Edge[]
  flowName?: string
  flowDescription?: string
  triggerIds?: string[]
  triggerKeywords?: string[]
  triggerMatchType?: string
  triggerRef?: string
  publishedFlowId?: string
  flowSlug?: string
  waAccountId?: string
  waPhoneNumber?: string
  onPublished?: (flowId: string, waPhoneNumber?: string, flowSlug?: string) => void
  onValidationError?: (nodeIds: string[]) => void
}

export function PublishModal({
  changes,
  hasUnsavedChanges,
  onCreateVersion,
  onPublishVersion,
  currentVersion,
  children,
  platform,
  nodes,
  edges,
  flowName,
  flowDescription,
  triggerIds,
  triggerKeywords,
  triggerMatchType,
  triggerRef,
  publishedFlowId,
  flowSlug,
  waAccountId,
  waPhoneNumber: waPhoneNumberProp,
  onPublished,
  onValidationError,
}: PublishModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [versionName, setVersionName] = useState("")
  const [versionDescription, setVersionDescription] = useState("")
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishMode, setPublishMode] = useState<'create' | 'publish'>('create')

  // WhatsApp account selection
  const [waAccounts, setWaAccounts] = useState<{ id: string; name: string; status: string; phone_number?: string }[]>([])
  const [waAccountsLoading, setWaAccountsLoading] = useState(false)
  const [selectedWaAccountId, setSelectedWaAccountId] = useState(waAccountId || "")

  // Fetch WhatsApp accounts when modal opens
  useEffect(() => {
    if (isOpen && platform === "whatsapp") {
      setWaAccountsLoading(true)
      apiClient.get<any>("/api/accounts")
        .then((data) => {
          const list = Array.isArray(data) ? data : data.accounts || []
          setWaAccounts(list)
          // Pre-select stored account or default outgoing
          if (!selectedWaAccountId) {
            const defaultAcc = list.find((a: any) => a.is_default_outgoing) || list[0]
            if (defaultAcc) setSelectedWaAccountId(defaultAcc.id)
          }
        })
        .catch(() => setWaAccounts([]))
        .finally(() => setWaAccountsLoading(false))
    }
  }, [isOpen, platform])

  // Initialize with default name when modal opens
  useEffect(() => {
    if (isOpen) {
      if (publishMode === 'create') {
        setVersionName(generateDefaultVersionName())
      } else if (publishMode === 'publish') {
        // For publish mode, use a default name based on current version
        const defaultName = currentVersion ? `v${(currentVersion.version || 1) + 1} - Published Flow` : 'v1 - Published Flow'
        setVersionName(defaultName)
      }
    }
  }, [isOpen, publishMode, currentVersion])

  // Generate default version name
  const generateDefaultVersionName = () => {
    const nextVersion = changes.length > 0 ? Math.floor(changes.length / 10) + 1 : 1
    return `v${nextVersion} - Published Flow`
  }

  const handlePublish = async () => {
    // Validate: block publish if any node has unknown variables
    if (nodes) {
      const varErrors = validateFlowVariables(nodes)
      if (varErrors.length > 0) {
        setIsOpen(false)
        onValidationError?.(varErrors.map((e) => e.nodeId))
        toast.error("Cannot publish: unknown variables found", {
          description: `${varErrors.length} node${varErrors.length > 1 ? "s have" : " has"} unknown variables. They are highlighted on the canvas.`,
          duration: 5000,
        })
        return
      }

      // Validate: WhatsApp Flow nodes must have body text and a flow selected
      const flowErrors = nodes.filter((n) => n.type === "whatsappFlow" && n.data)
        .filter((n) => !n.data.whatsappFlowId || !(n.data.bodyText as string)?.trim())
      if (flowErrors.length > 0) {
        setIsOpen(false)
        onValidationError?.(flowErrors.map((n) => n.id))
        const missing = flowErrors.map((n) => {
          const parts: string[] = []
          if (!n.data.whatsappFlowId) parts.push("flow")
          if (!(n.data.bodyText as string)?.trim()) parts.push("message body")
          return parts.join(" & ")
        })
        toast.error("Cannot publish: WhatsApp Flow node incomplete", {
          description: `Missing ${missing[0]} on "${flowErrors[0].data.label || "WhatsApp Flow"}"`,
          duration: 5000,
        })
        return
      }
    }

    const finalVersionName = versionName.trim() || generateDefaultVersionName()

    setIsPublishing(true)
    try {
      if (publishMode === 'create') {
        await onCreateVersion(finalVersionName, versionDescription.trim() || undefined)
      } else {
        await onPublishVersion(undefined, finalVersionName, versionDescription.trim() || undefined)
      }

      // If WhatsApp platform, also publish to fs-whatsapp
      if (platform === "whatsapp" && nodes && edges && flowName) {
        try {
          // Flatten template nodes before converting
          const { nodes: flatNodes, edges: flatEdges } = flattenFlow(nodes, edges)
          const selectedAccountName = waAccounts.find((a) => a.id === selectedWaAccountId)?.name
          const converted = convertToFsWhatsApp(
            flatNodes,
            flatEdges,
            flowName,
            flowDescription,
            triggerIds,
            triggerKeywords,
            triggerMatchType,
            triggerRef,
            flowSlug,
            selectedAccountName,
          )
          const result = await publishFlowToWhatsApp(
            { ...converted, publishedFlowId: publishedFlowId || undefined },
            publishedFlowId,
          )
          if (result.flowId && onPublished) {
            // Fetch the actual phone number from Meta via account test endpoint
            let phoneNumber = waPhoneNumberProp
            if (selectedWaAccountId) {
              try {
                console.log("[PublishModal] Fetching phone number for account:", selectedWaAccountId)
                const tcData = await apiClient.post<any>(`/api/accounts/${selectedWaAccountId}/test`)
                console.log("[PublishModal] Test connection response:", tcData)
                if (tcData.display_phone_number) {
                  phoneNumber = tcData.display_phone_number.replace(/[^0-9]/g, "")
                  console.log("[PublishModal] Resolved phone number:", phoneNumber)
                }
              } catch (err) {
                console.error("[PublishModal] Failed to fetch phone number:", err)
              }
            }
            console.log("[PublishModal] Calling onPublished with flowId:", result.flowId, "phone:", phoneNumber, "slug:", result.flowSlug)
            onPublished(result.flowId, phoneNumber, result.flowSlug)
          }
          toast.success(
            result.updated ? "Flow updated on WhatsApp!" : "Published to WhatsApp!",
            { description: result.flowId ? `Flow ID: ${result.flowId}` : undefined }
          )
        } catch (waErr: any) {
          toast.error("Version created, but WhatsApp publish failed", {
            description: waErr.message,
          })
        }
      } else {
        toast.success(
          publishMode === 'create'
            ? "Version created successfully!"
            : "Version published successfully!"
        )
      }

      setVersionName("")
      setVersionDescription("")
      setIsOpen(false)
    } catch (error) {
      toast.error("Failed to publish version")
    } finally {
      setIsPublishing(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getChangeIcon = (type: FlowChange['type']) => {
    switch (type) {
      case 'node_add':
        return '➕'
      case 'node_delete':
        return '🗑️'
      case 'node_update':
        return '✏️'
      case 'edge_add':
        return '🔗'
      case 'edge_delete':
        return '❌'
      case 'edge_update':
        return '🔄'
      case 'platform_change':
        return '🔄'
      case 'flow_import':
        return '📥'
      default:
        return '📝'
    }
  }

  const getChangeColor = (type: FlowChange['type']) => {
    switch (type) {
      case 'node_add':
      case 'edge_add':
        return 'text-green-600'
      case 'node_delete':
      case 'edge_delete':
        return 'text-red-600'
      case 'node_update':
      case 'edge_update':
      case 'platform_change':
        return 'text-blue-600'
      case 'flow_import':
        return 'text-purple-600'
      default:
        return 'text-gray-600'
    }
  }

  // Prevent closing dialog while publishing
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setIsOpen(true)
    } else if (!isPublishing) {
      setIsOpen(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Publish Version
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
          {/* Publish Mode Selection */}
          <div className="space-y-2">
            <Label>Publish Mode</Label>
            <div className="flex gap-2">
              <Button
                variant={publishMode === 'create' ? 'default' : 'outline'}
                size="sm"
                disabled={isPublishing || changes.length === 0}
                onClick={() => setPublishMode('create')}
                className="flex items-center gap-2"
              >
                <GitBranch className="w-4 h-4" />
                Create New Version
              </Button>
              {currentVersion && !currentVersion.isPublished && (
                <Button
                  variant={publishMode === 'publish' ? 'default' : 'outline'}
                  size="sm"
                  disabled={isPublishing}
                  onClick={() => setPublishMode('publish')}
                  className="flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Publish Current
                </Button>
              )}
            </div>
          </div>

          {/* Version Info */}
          {publishMode === 'create' ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="version-name">Version Name (Optional)</Label>
                <Input
                  id="version-name"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="e.g., v1.2.0 - User Onboarding Flow"
                  disabled={isPublishing}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to use default name: {generateDefaultVersionName()}
                </p>
              </div>
              <div>
                <Label htmlFor="version-description">Description (Optional)</Label>
                <Textarea
                  id="version-description"
                  value={versionDescription}
                  onChange={(e) => setVersionDescription(e.target.value)}
                  placeholder="Describe the changes in this version..."
                  rows={2}
                  disabled={isPublishing}
                />
              </div>
            </div>
          ) : (
            <div className="p-4 bg-blue-50 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium">Publishing Current Version</span>
              </div>
              <p className="text-sm text-muted-foreground">
                v{currentVersion?.version}: {currentVersion?.name}
              </p>
              {currentVersion?.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {currentVersion.description}
                </p>
              )}
            </div>
          )}

          {/* WhatsApp Account Selector */}
          {platform === "whatsapp" && (
            <div className="space-y-2">
              <Label>WhatsApp Account</Label>
              <Select
                value={selectedWaAccountId}
                onValueChange={setSelectedWaAccountId}
                disabled={isPublishing || waAccountsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={waAccountsLoading ? "Loading accounts..." : "Select WhatsApp account"} />
                </SelectTrigger>
                <SelectContent>
                  {waAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                      {acc.phone_number ? ` (${acc.phone_number})` : ""}
                      {acc.status !== "active" ? ` - ${acc.status}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Flow will be deployed to this WhatsApp Business account
              </p>
            </div>
          )}

          <Separator />

          {/* Changes Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Changes to Publish</Label>
              <Badge variant="outline">
                {changes.length} changes
              </Badge>
            </div>
            
            {changes.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No changes to publish</p>
              </div>
            ) : (
              <ScrollArea className="h-32 border rounded-lg p-3">
                <div className="space-y-2">
                  {changes.map((change) => (
                    <div key={change.id} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50">
                      <span className="text-lg">{getChangeIcon(change.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${getChangeColor(change.type)}`}>
                          {change.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(change.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Warning for unsaved changes */}
          {hasUnsavedChanges && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  You have unsaved changes. Publishing will save these changes to the version.
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t flex-shrink-0 sticky bottom-0 bg-background">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isPublishing}>
              Cancel
            </Button>
            <Button
              onClick={handlePublish}
              disabled={isPublishing || (publishMode === 'create' && changes.length === 0)}
              className="flex items-center gap-2"
            >
              {isPublishing && <Loader2 className="w-4 h-4 animate-spin" />}
              {isPublishing
                ? (platform === "whatsapp" ? "Publishing to WhatsApp..." : (publishMode === 'create' ? 'Creating...' : 'Publishing...'))
                : (platform === "whatsapp"
                  ? (publishedFlowId ? "Update & Publish to WhatsApp" : "Create & Publish to WhatsApp")
                  : (publishMode === 'create' ? 'Create & Publish' : 'Publish Version'))
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
