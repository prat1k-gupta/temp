"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Plus, Trash2, Copy, FileEdit, Sparkles, Globe, MessageCircle, Instagram } from "lucide-react"
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
        return <Globe className="w-4 h-4" />
      case "whatsapp":
        return <MessageCircle className="w-4 h-4" />
      case "instagram":
        return <Instagram className="w-4 h-4" />
      default:
        return <Globe className="w-4 h-4" />
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push('/flows')}
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Magic Flow</h1>
                <p className="text-sm text-muted-foreground">Your Flows</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Button className="gap-2" onClick={handleCreateFlow}>
                <Plus className="w-4 h-4" />
                New Flow
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        {flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">No flows yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Create your first flow to start building amazing conversation experiences.
            </p>
            <Button onClick={handleCreateFlow} size="lg" className="gap-2">
              <Plus className="w-5 h-5" />
              Create Your First Flow
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {flows.map((flow) => (
              <Card 
                key={flow.id} 
                className="group hover:shadow-lg transition-all duration-200 cursor-pointer border-2 hover:border-accent/50"
                onClick={() => router.push(`/flow/${flow.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{flow.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {flow.description || "No description"}
                      </CardDescription>
                    </div>
                    <div className={`${getPlatformColor(flow.platform)} p-2 rounded-md text-white shrink-0 ml-2`}>
                      {getPlatformIcon(flow.platform)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <span className="font-medium">{flow.nodeCount}</span>
                      <span>nodes</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-medium">{flow.edgeCount}</span>
                      <span>connections</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Badge variant="secondary" className="text-xs">
                      {getPlatformDisplayName(flow.platform)}
                    </Badge>
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(flow.updatedAt)}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDuplicateFlow(flow.id, flow.name)
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFlowToDelete(flow.id)
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
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

