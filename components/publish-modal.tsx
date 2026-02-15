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
import { 
  Upload, 
  CheckCircle, 
  Clock, 
  GitBranch,
  Loader2,
  AlertCircle
} from "lucide-react"
import { toast } from "sonner"
import type { FlowChange } from "@/types"

interface PublishModalProps {
  changes: FlowChange[]
  hasUnsavedChanges: boolean
  onCreateVersion: (name: string, description?: string) => Promise<void>
  onPublishVersion: (versionId?: string, versionName?: string, description?: string) => Promise<void>
  currentVersion: any
  children: React.ReactNode
}

export function PublishModal({
  changes,
  hasUnsavedChanges,
  onCreateVersion,
  onPublishVersion,
  currentVersion,
  children
}: PublishModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [versionName, setVersionName] = useState("")
  const [versionDescription, setVersionDescription] = useState("")
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishMode, setPublishMode] = useState<'create' | 'publish'>('create')

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
    const finalVersionName = versionName.trim() || generateDefaultVersionName()

    setIsPublishing(true)
    try {
      if (publishMode === 'create') {
        await onCreateVersion(finalVersionName, versionDescription.trim() || undefined)
        toast.success("Version created successfully!")
      } else {
        await onPublishVersion(undefined, finalVersionName, versionDescription.trim() || undefined)
        toast.success("Version published successfully!")
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
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Publish Version
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col gap-4">
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
                  rows={3}
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
              <ScrollArea className="h-48 border rounded-lg p-3">
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
          <div className="flex justify-end gap-2 pt-4 border-t">
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
                ? (publishMode === 'create' ? 'Creating...' : 'Publishing...')
                : (publishMode === 'create' ? 'Create & Publish' : 'Publish Version')
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
