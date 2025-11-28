"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Plus, Trash2, Copy, FileEdit, Sparkles } from "lucide-react"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { ThemeToggle } from "@/components/theme-toggle"
import { getAllFlows, createFlow, deleteFlow, duplicateFlow, type FlowMetadata } from "@/utils/flow-storage"
import { getPlatformDisplayName } from "@/utils/platform-labels"
import type { Platform } from "@/types"
import { toast } from "sonner"

export default function FlowsPage() {
  const router = useRouter()
  const [flows, setFlows] = useState<FlowMetadata[]>([])
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null)

  useEffect(() => {
    loadFlows()
  }, [])

  const loadFlows = () => {
    const allFlows = getAllFlows()
    setFlows(allFlows)
  }

  const handleCreateFlow = () => {
    // Create a temporary flow and navigate to it
    // The setup modal will appear on the flow editor page
    const tempFlow = createFlow("New Flow", "", "whatsapp")
    router.push(`/flow/${tempFlow.id}?setup=true`)
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

  const handleDuplicateFlow = (flowId: string, flowName: string) => {
    const duplicated = duplicateFlow(flowId)
    if (duplicated) {
      toast.success(`Flow "${flowName}" duplicated!`)
      loadFlows()
    } else {
      toast.error("Failed to duplicate flow")
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header with gradient */}
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div 
                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-all group"
                onClick={() => router.push('/flows')}
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 via-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:shadow-xl group-hover:shadow-purple-500/40 transition-all">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
                    Magic Flow
                  </h1>
                  <p className="text-xs text-muted-foreground">Build conversational experiences</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                onClick={handleCreateFlow} 
                size="lg"
                className="gap-2 shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
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
        {flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div className="relative">
              {/* Animated gradient circles in background */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
                <div className="w-32 h-32 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-75 -ml-16" />
              </div>
              
              {/* Main icon */}
              <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500 via-purple-600 to-blue-600 flex items-center justify-center mb-8 shadow-2xl shadow-purple-500/50">
                <Sparkles className="w-12 h-12 text-white" />
              </div>
            </div>
            
            <h2 className="text-3xl font-bold text-foreground mb-3">Start Your Journey</h2>
            <p className="text-muted-foreground mb-8 max-w-md text-center leading-relaxed">
              Create your first flow and bring your conversational experiences to life across WhatsApp, Instagram, and Web.
            </p>
            
            <Button 
              onClick={handleCreateFlow} 
              size="lg" 
              className="gap-2 h-12 px-8 text-base shadow-lg hover:shadow-xl transition-all bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
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
          <div>
            {/* Stats bar */}
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
              <Card 
                key={flow.id} 
                className="group relative overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer border hover:border-accent/50 hover:-translate-y-1"
                onClick={() => router.push(`/flow/${flow.id}`)}
              >
                {/* Platform-colored accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${getPlatformColor(flow.platform)}`} />
                
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
                
                <CardFooter className="pt-3 border-t">
                  <div className="flex items-center justify-end gap-1 w-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-xs gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDuplicateFlow(flow.id, flow.name)
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Duplicate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFlowToDelete(flow.id)
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!flowToDelete} onOpenChange={(open) => !open && setFlowToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this flow and all its data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => flowToDelete && handleDeleteFlow(flowToDelete)}
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

