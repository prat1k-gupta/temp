"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Plus, Trash2, Copy, FileEdit, Database, Loader2, FileText, Layers } from "lucide-react"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { ThemeToggle } from "@/components/theme-toggle"
import { getAllFlows, getSharedFlows, createFlow, deleteFlow, deleteSharedFlow, duplicateFlow, updateFlow, type FlowMetadata } from "@/utils/flow-storage"
import { getPlatformDisplayName } from "@/utils/platform-labels"
import type { Platform } from "@/types"
import { toast } from "sonner"
import Link from "next/link"

// Freestand LogoClosed component (icon only)
const LogoClosed = ({ className }: { className?: string }) => (
  <svg viewBox='0 0 127 128' fill='none' xmlns='http://www.w3.org/2000/svg' className={className}>
    <g>
      <path
        d='M94.8052 62.1819V102.384C94.7538 104.184 94.7565 105.342 94.7565 105.342H68.3398V62.1819M94.8052 62.1819H68.3398M94.8052 62.1819H98.7703V51.4453L68.3398 51.4453V62.1819'
        stroke='#052762'
        strokeWidth='7'
        strokeMiterlimit='16'
        strokeLinecap='round'
      />
      <path
        d='M32.6543 62.1819V102.384C32.7057 104.184 32.703 105.342 32.703 105.342H57.2754V62.1819M32.6543 62.1819H57.2754M32.6543 62.1819H28.6892V51.4453L57.2754 51.4453V62.1819'
        stroke='#052762'
        strokeWidth='7'
        strokeMiterlimit='16'
        strokeLinecap='round'
      />
      <path
        d='M28.6895 41.6827C33.2272 41.6827 51.7948 41.6827 56.2307 41.6827L54.6309 39.8631C49.9526 34.0405 40.9363 28.2184 41.3726 18.3922C41.5859 13.5891 48.4992 8.05709 55.553 15.0442C61.1961 20.6339 62.1221 30.9108 61.8797 35.3505C64.1825 28.8971 70.737 17.0821 78.5326 21.449C88.2771 26.9077 76.3772 37.1701 73.9775 38.1891C72.0577 39.2371 70.1728 40.7122 69.0093 41.3187H98.7717'
        stroke='#052762'
        strokeWidth='7'
        strokeLinecap='square'
        strokeLinejoin='round'
      />
    </g>
  </svg>
)

export default function FlowsPage() {
  const router = useRouter()
  const [flows, setFlows] = useState<FlowMetadata[]>([])
  const [sharedFlows, setSharedFlows] = useState<FlowMetadata[]>([])
  const [loadingShared, setLoadingShared] = useState(true)
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null)
  const [isDeletingSharedFlow, setIsDeletingSharedFlow] = useState(false)

  useEffect(() => {
    loadFlows()
    loadSharedFlows()
  }, [])

  const loadFlows = () => {
    const allFlows = getAllFlows()
    // Sort flows by updatedAt (newest first)
    const sortedFlows = allFlows.sort((a, b) => {
      const dateA = new Date(a.updatedAt).getTime()
      const dateB = new Date(b.updatedAt).getTime()
      return dateB - dateA // Descending order (newest first)
    })
    setFlows(sortedFlows)
  }

  const loadSharedFlows = async () => {
    setLoadingShared(true)
    try {
      const shared = await getSharedFlows()
      setSharedFlows(shared)
    } catch (error) {
      console.error('Failed to load shared flows:', error)
    } finally {
      setLoadingShared(false)
    }
  }

  const handleCreateFlow = () => {
    // Create a temporary flow and navigate to it
    // The setup modal will appear on the flow editor page
    const tempFlow = createFlow("New Flow", "", "whatsapp")
    router.push(`/flow/${tempFlow.id}?setup=true`)
  }

  const handleCreateSharedFlow = () => {
    // Navigate to the flow editor in setup mode with loadFrom=db
    // The setup modal will appear, and on completion the flow is created via API (Redis)
    router.push(`/flow/new?loadFrom=db`)
  }

  const handleDeleteFlow = (flowId: string) => {
    const success = deleteFlow(flowId)
    if (success) {
      toast.success("Flow deleted")
      loadFlows()
    } else {
      toast.error("Failed to delete flow")
    }
    setFlowToDelete(null)
  }

  const handleDeleteSharedFlow = async (flowId: string) => {
    const success = await deleteSharedFlow(flowId)
    if (success) {
      toast.success("Shared flow deleted")
      loadSharedFlows()
    } else {
      toast.error("Failed to delete shared flow")
    }
    setFlowToDelete(null)
  }

  const handleDuplicateFlow = async (flowId: string, flowName: string, isShared: boolean = false) => {
    if (isShared) {
      // For shared flows, fetch from API first
      try {
        const response = await fetch(`/api/flows/${flowId}`)
        if (!response.ok) {
          toast.error("Failed to fetch shared flow")
          return
        }
        const flowData = await response.json()
        
        // Create a new flow in localStorage with the shared flow data
        const duplicatedFlow = createFlow(
          `${flowData.name} (Copy)`,
          flowData.description,
          flowData.platform,
          flowData.triggerId
        )
        
        // Update with the full flow data
        const updated = updateFlow(duplicatedFlow.id, {
          nodes: flowData.nodes,
          edges: flowData.edges,
          triggerIds: flowData.triggerIds,
        })
        
        if (updated) {
          toast.success(`Flow "${flowName}" duplicated to your flows!`)
          loadFlows()
        } else {
          toast.error("Failed to duplicate flow")
        }
      } catch (error) {
        console.error("Error duplicating shared flow:", error)
        toast.error("Failed to duplicate flow")
      }
    } else {
      // For local flows, use existing function
      const duplicated = duplicateFlow(flowId)
      if (duplicated) {
        toast.success(`Flow "${flowName}" duplicated!`)
        loadFlows()
      } else {
        toast.error("Failed to duplicate flow")
      }
    }
  }

  const getPlatformIcon = (platform: Platform) => {
    switch (platform) {
      case "web":
        return <WebIcon className="w-4 h-4" />
      case "whatsapp":
        return <WhatsAppIcon className="w-4 h-4" />
      case "instagram":
        return <InstagramIcon className="w-4 h-4" />
      default:
        return <WebIcon className="w-4 h-4" />
    }
  }

  const getPlatformColor = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "bg-blue-500"
      case "whatsapp":
        return "bg-green-500"
      case "instagram":
        return "bg-pink-500"
      default:
        return "bg-gray-500"
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  // FlowCard component for reusability
  const FlowCard = ({ 
    flow, 
    onDuplicate, 
    onDelete, 
    onEdit,
    showActions = true,
    isShared = false
  }: { 
    flow: FlowMetadata
    onDuplicate: () => void
    onDelete: () => void
    onEdit: () => void
    showActions?: boolean
    isShared?: boolean
  }) => (
    <Card 
      className="group relative overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer border hover:border-accent/50 hover:-translate-y-1"
      onClick={onEdit}
    >
      {/* Platform-colored accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${getPlatformColor(flow.platform)}`} />
      
      {isShared && (
        <div className="absolute top-2 right-2 z-10">
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/80 backdrop-blur-sm">
            <Database className="w-3 h-3 mr-1" />
            Shared
          </Badge>
        </div>
      )}
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`${getPlatformColor(flow.platform)} p-2.5 rounded-lg text-white shrink-0 shadow-sm`}>
              {getPlatformIcon(flow.platform)}
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base font-semibold truncate mb-1">
                {flow.name}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                  {getPlatformDisplayName(flow.platform)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDate(flow.updatedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pb-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm font-medium">{flow.nodeCount}</span>
            <span className="text-xs text-muted-foreground">nodes</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-sm font-medium">{flow.edgeCount}</span>
            <span className="text-xs text-muted-foreground">edges</span>
          </div>
        </div>
      </CardContent>
      
      {showActions && (
        <CardFooter className="pt-3 border-t">
          <div className="flex items-center justify-end gap-1 w-full opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs gap-1.5"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate()
              }}
            >
              <Copy className="w-3.5 h-3.5" />
              {isShared ? 'Copy' : 'Duplicate'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header with gradient */}
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    window.location.href = 'http://localhost:3000';
                  }}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  aria-label="Go to Freestand Sampling Central"
                >
                  <LogoClosed className="w-12 h-12" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-[#052762]">
                    Freestand Flow Builder
                  </h1>
                  <p className="text-xs text-muted-foreground">Build conversational experiences</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/templates">
                <Button variant="outline" size="lg" className="gap-2">
                  <WhatsAppIcon className="w-4 h-4" />
                  WhatsApp Templates
                </Button>
              </Link>
              <Link href="/flow-templates">
                <Button variant="outline" size="lg" className="gap-2">
                  <Layers className="w-4 h-4" />
                  Flow Templates
                </Button>
              </Link>
              <Button
                onClick={handleCreateFlow}
                size="lg"
                className="gap-2 shadow-md hover:shadow-lg transition-all bg-[#052762] hover:bg-[#0A49B7] text-white"
              >
                <Plus className="w-4 h-4" />
                New Flow
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-10">
        {/* Your Flows Section */}
        {flows.length === 0 && sharedFlows.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div className="relative">
              {/* Animated gradient circles in background */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 bg-[#052762]/20 rounded-full blur-3xl animate-pulse" />
                <div className="w-32 h-32 bg-[#2872F4]/20 rounded-full blur-3xl animate-pulse delay-75 -ml-16" />
              </div>
              
              {/* Main icon */}
              <div className="relative mb-8">
                <button
                  onClick={() => {
                    window.location.href = 'http://localhost:3000';
                  }}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  aria-label="Go to Freestand Sampling Central"
                >
                  <LogoClosed className="w-24 h-24" />
                </button>
              </div>
            </div>
            
            <h2 className="text-3xl font-bold text-foreground mb-3">Start Your Journey</h2>
            <p className="text-muted-foreground mb-8 max-w-md text-center leading-relaxed">
              Create your first flow and bring your conversational experiences to life across WhatsApp, Instagram, and Web.
            </p>
            
            <Button 
              onClick={handleCreateFlow} 
              size="lg" 
              className="gap-2 h-12 px-8 text-base shadow-lg hover:shadow-xl transition-all bg-[#052762] hover:bg-[#0A49B7] text-white"
            >
              <Plus className="w-5 h-5" />
              Create Your First Flow
            </Button>
            
            {/* Feature highlights */}
            <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                  <WhatsAppIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm font-medium text-foreground">WhatsApp</p>
                <p className="text-xs text-muted-foreground mt-1">Business messaging</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center mx-auto mb-3">
                  <InstagramIcon className="w-6 h-6 text-pink-600 dark:text-pink-400" />
                </div>
                <p className="text-sm font-medium text-foreground">Instagram</p>
                <p className="text-xs text-muted-foreground mt-1">Social engagement</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
                  <WebIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm font-medium text-foreground">Web</p>
                <p className="text-xs text-muted-foreground mt-1">Website integration</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Your Flows Section */}
            {flows.length > 0 && (
              <div>
                <div className="mb-8 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-1">Your Flows</h2>
                    <p className="text-sm text-muted-foreground">
                      {flows.length} {flows.length === 1 ? 'flow' : 'flows'} • Click to edit
                    </p>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm text-muted-foreground">All systems ready</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {flows.map((flow) => (
                    <FlowCard
                      key={flow.id}
                      flow={flow}
                      onDuplicate={() => handleDuplicateFlow(flow.id, flow.name, false)}
                      onDelete={() => setFlowToDelete(flow.id)}
                      onEdit={() => router.push(`/flow/${flow.id}`)}
                      showActions={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Shared Flows Section */}
            <div>
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-1">Shared Flows</h2>
                    <p className="text-sm text-muted-foreground">
                      {loadingShared ? 'Loading...' : `${sharedFlows.length} ${sharedFlows.length === 1 ? 'flow' : 'flows'} from database`}
                    </p>
                  </div>
                </div>
                {!loadingShared && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadSharedFlows}
                      className="gap-2"
                    >
                      <FileEdit className="w-4 h-4" />
                      Refresh
                    </Button>
                    <Button
                      onClick={handleCreateSharedFlow}
                      size="sm"
                      className="gap-2 bg-[#052762] hover:bg-[#0A49B7] text-white"
                    >
                      <Plus className="w-4 h-4" />
                      New Shared Flow
                    </Button>
                  </div>
                )}
              </div>
              
              {loadingShared ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : sharedFlows.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20">
                  <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No shared flows found in the database</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sharedFlows.map((flow) => (
                    <FlowCard
                      key={flow.id}
                      flow={flow}
                      onDuplicate={() => handleDuplicateFlow(flow.id, flow.name, true)}
                      onDelete={() => {
                        setIsDeletingSharedFlow(true)
                        setFlowToDelete(flow.id)
                      }}
                      onEdit={() => router.push(`/flow/${flow.id}?loadFrom=db`)}
                      showActions={true}
                      isShared={true}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!flowToDelete} onOpenChange={(open) => {
        if (!open) {
          setFlowToDelete(null)
          setIsDeletingSharedFlow(false)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this {isDeletingSharedFlow ? 'shared ' : ''}flow and all its data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (flowToDelete) {
                  if (isDeletingSharedFlow) {
                    handleDeleteSharedFlow(flowToDelete)
                  } else {
                    handleDeleteFlow(flowToDelete)
                  }
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

