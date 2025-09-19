"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { 
  History, 
  Eye, 
  Trash2, 
  CheckCircle, 
  Clock, 
  GitBranch,
  Plus,
  Loader2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  FileText,
  PlusCircle,
  MinusCircle,
  Edit,
  Link,
  Globe,
  Layers
} from "lucide-react"
import { toast } from "sonner"
import type { FlowVersion, FlowChange } from "@/types"

const CHANGES_PER_PAGE = 10
const MAX_CHANGES_DISPLAY = 50 // Show pagination if more than this

interface VersionHistoryModalProps {
  versions: FlowVersion[]
  currentVersion: FlowVersion | null
  onLoadVersion: (version: FlowVersion) => void
  onDeleteVersion: (versionId: string) => void
  onCreateVersion: (name: string, description?: string) => void
  onPublishVersion: (versionId: string) => void
  isEditMode: boolean
  hasChanges: boolean
  children: React.ReactNode
}

export function VersionHistoryModal({
  versions,
  currentVersion,
  onLoadVersion,
  onDeleteVersion,
  onCreateVersion,
  onPublishVersion,
  isEditMode,
  hasChanges,
  children
}: VersionHistoryModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newVersionName, setNewVersionName] = useState("")
  const [newVersionDescription, setNewVersionDescription] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set())
  const [changePage, setChangePage] = useState<Record<string, number>>({})
  const [groupChanges, setGroupChanges] = useState<Record<string, boolean>>({})

  // Generate default version name
  const generateDefaultVersionName = () => {
    const allVersions = versions || []
    const nextVersion = allVersions.length > 0 ? Math.max(...allVersions.map(v => v.version)) + 1 : 1
    return `v${nextVersion} - Flow`
  }

  // Sort versions by date
  const sortedVersions = React.useMemo(() => {
    if (!versions) return []
    
    return [...versions].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
    })
  }, [versions, sortOrder])

  // Toggle sort order
  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')
  }

  // Toggle version expansion
  const toggleVersionExpansion = (versionId: string) => {
    setExpandedVersions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(versionId)) {
        newSet.delete(versionId)
      } else {
        newSet.add(versionId)
      }
      return newSet
    })
  }

  // Get icon for change type
  const getChangeIcon = (type: FlowChange['type']) => {
    switch (type) {
      case 'node_add':
        return <PlusCircle className="w-4 h-4 text-green-600" />
      case 'node_delete':
        return <MinusCircle className="w-4 h-4 text-red-600" />
      case 'node_update':
        return <Edit className="w-4 h-4 text-blue-600" />
      case 'edge_add':
        return <Link className="w-4 h-4 text-green-600" />
      case 'edge_delete':
        return <MinusCircle className="w-4 h-4 text-red-600" />
      case 'edge_update':
        return <Edit className="w-4 h-4 text-blue-600" />
      case 'platform_change':
        return <Globe className="w-4 h-4 text-purple-600" />
      case 'flow_import':
        return <FileText className="w-4 h-4 text-orange-600" />
      default:
        return <FileText className="w-4 h-4 text-gray-600" />
    }
  }

  // Format change description
  const formatChangeDescription = (change: FlowChange) => {
    const time = new Date(change.timestamp).toLocaleTimeString()
    return `${change.description} (${time})`
  }

  // Get paginated changes for a version
  const getPaginatedChanges = (version: FlowVersion) => {
    const changes = version.changes || []
    const currentPage = changePage[version.id] || 1
    const startIndex = (currentPage - 1) * CHANGES_PER_PAGE
    const endIndex = startIndex + CHANGES_PER_PAGE
    return changes.slice(startIndex, endIndex)
  }

  // Get total pages for a version
  const getTotalPages = (version: FlowVersion) => {
    const changes = version.changes || []
    return Math.ceil(changes.length / CHANGES_PER_PAGE)
  }

  // Group changes by type
  const getGroupedChanges = (changes: FlowChange[]) => {
    const grouped = changes.reduce((acc, change) => {
      if (!acc[change.type]) {
        acc[change.type] = []
      }
      acc[change.type].push(change)
      return acc
    }, {} as Record<string, FlowChange[]>)

    return Object.entries(grouped).map(([type, changes]) => ({
      type: type as FlowChange['type'],
      changes,
      count: changes.length
    }))
  }

  // Toggle grouping for a version
  const toggleGrouping = (versionId: string) => {
    setGroupChanges(prev => ({
      ...prev,
      [versionId]: !prev[versionId]
    }))
  }

  // Change page for a version
  const changePageForVersion = (versionId: string, page: number) => {
    setChangePage(prev => ({
      ...prev,
      [versionId]: page
    }))
  }

  const handleCreateVersion = async () => {
    const versionName = newVersionName.trim() || generateDefaultVersionName()
    
    setIsCreating(true)
    try {
      await onCreateVersion(versionName, newVersionDescription.trim() || undefined)
      setNewVersionName("")
      setNewVersionDescription("")
      setShowCreateForm(false)
      toast.success("Version created successfully!")
    } catch (error) {
      toast.error("Failed to create version")
    } finally {
      setIsCreating(false)
    }
  }

  const handleLoadVersion = (version: FlowVersion) => {
    console.log('[Version History Modal] Loading version:', version)
    onLoadVersion(version)
    setIsOpen(false)
    toast.success(`Loaded version ${version.version}: ${version.name}`)
  }

  const handleDeleteVersion = (versionId: string, versionName: string) => {
    if (confirm(`Are you sure you want to delete version "${versionName}"?`)) {
      onDeleteVersion(versionId)
      toast.success("Version deleted successfully")
    }
  }

  const handlePublishVersion = (versionId: string) => {
    onPublishVersion(versionId)
    toast.success("Version published successfully!")
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getVersionStatus = (version: FlowVersion) => {
    if (version.isPublished) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
    }
    return <Badge variant="secondary">Draft</Badge>
  }

  const isCurrentVersion = (version: FlowVersion) => {
    return currentVersion?.id === version.id
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Version History
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Create Version Section */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="text-lg font-semibold">Versions</h3>
              <p className="text-sm text-muted-foreground">
                Manage and publish your flow versions
              </p>
            </div>
            <Button
              disabled={!isEditMode || !hasChanges}
              onClick={() => {
                setShowCreateForm(!showCreateForm)
                if (!showCreateForm) {
                  setNewVersionName(generateDefaultVersionName())
                }
              }}
              className="flex items-center gap-2"
              title={
                !isEditMode 
                  ? "Enter edit mode to create versions" 
                  : !hasChanges 
                    ? "No changes to save as version" 
                    : "Create new version from current changes"
              }
            >
              <Plus className="w-4 h-4" />
              Create Version
            </Button>
          </div>

          {/* Create Version Form */}
          {showCreateForm && (
            <Card className="flex-shrink-0">
              <CardHeader>
                <CardTitle className="text-base">Create New Version</CardTitle>
                <CardDescription>
                  Save the current flow state as a new version
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="version-name">Version Name (Optional)</Label>
                  <Input
                    id="version-name"
                    value={newVersionName}
                    onChange={(e) => setNewVersionName(e.target.value)}
                    placeholder="e.g., v1.2.0 - User Onboarding Flow"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave empty to use default name: {generateDefaultVersionName()}
                  </p>
                </div>
                <div>
                  <Label htmlFor="version-description">Description (Optional)</Label>
                  <Textarea
                    id="version-description"
                    value={newVersionDescription}
                    onChange={(e) => setNewVersionDescription(e.target.value)}
                    placeholder="Describe the changes in this version..."
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateVersion}
                    disabled={isCreating}
                    className="flex items-center gap-2"
                  >
                    {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create Version
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCreateForm(false)
                      setNewVersionName("")
                      setNewVersionDescription("")
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Separator className="flex-shrink-0" />

          {/* Sort Controls */}
          {versions.length > 0 && (
            <div className="flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-medium text-muted-foreground">
                {versions.length} version{versions.length !== 1 ? 's' : ''}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSortOrder}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                {sortOrder === 'desc' ? (
                  <>
                    <ArrowDown className="w-4 h-4" />
                    Newest First
                  </>
                ) : (
                  <>
                    <ArrowUp className="w-4 h-4" />
                    Oldest First
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Versions List */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-3 pr-4">
              {versions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No versions created yet</p>
                  <p className="text-sm">Create your first version to start tracking changes</p>
                </div>
              ) : (
                sortedVersions.map((version) => (
                  <Card key={version.id} className={`${isCurrentVersion(version) ? 'ring-2 ring-blue-500' : ''}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-base">
                              v{version.version}: {version.name}
                            </CardTitle>
                            {isCurrentVersion(version) && (
                              <Badge variant="outline" className="text-blue-600 border-blue-600">
                                Current
                              </Badge>
                            )}
                            {getVersionStatus(version)}
                          </div>
                          {version.description && (
                            <CardDescription className="mt-1">
                              {version.description}
                            </CardDescription>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {version.nodes.length} nodes
                          </Badge>
                          <Badge variant="outline">
                            {version.edges.length} edges
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Created: {formatDate(version.createdAt)}
                          </div>
                          {version.publishedAt && (
                            <div className="flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              Published: {formatDate(version.publishedAt)}
                            </div>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {version.platform}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLoadVersion(version)}
                            className="flex items-center gap-1"
                          >
                            <Eye className="w-4 h-4" />
                            Load
                          </Button>
                          {!version.isPublished && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePublishVersion(version.id)}
                              className="flex items-center gap-1"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Publish
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteVersion(version.id, version.name)}
                            className="flex items-center gap-1 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Version Changes */}
                      {version.changes && version.changes.length > 0 && (
                        <div className="mt-4 border-t pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleVersionExpansion(version.id)}
                              className="flex items-center gap-2 text-muted-foreground hover:text-foreground p-0 h-auto"
                            >
                              {expandedVersions.has(version.id) ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                              <span className="text-sm">
                                {version.changes.length} change{version.changes.length !== 1 ? 's' : ''}
                              </span>
                            </Button>
                            
                            {version.changes.length > 5 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleGrouping(version.id)}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              >
                                <Layers className="w-3 h-3" />
                                {groupChanges[version.id] ? 'Ungroup' : 'Group'}
                              </Button>
                            )}
                          </div>
                          
                          {expandedVersions.has(version.id) && (
                            <div className="space-y-3">
                              {version.changes.length > MAX_CHANGES_DISPLAY ? (
                                // Show pagination warning
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                                  <p className="text-sm text-yellow-800">
                                    ⚠️ This version has {version.changes.length} changes. 
                                    Showing first {CHANGES_PER_PAGE} changes per page for better performance.
                                  </p>
                                </div>
                              ) : null}
                              
                              {groupChanges[version.id] ? (
                                // Grouped view
                                <div className="space-y-3">
                                  {getGroupedChanges(version.changes).map((group) => (
                                    <div key={group.type} className="border rounded-md">
                                      <div className="flex items-center gap-2 p-2 bg-muted/30 border-b">
                                        {getChangeIcon(group.type)}
                                        <span className="text-sm font-medium capitalize">
                                          {group.type.replace('_', ' ')} ({group.count})
                                        </span>
                                      </div>
                                      <div className="p-2 space-y-1">
                                        {group.changes.slice(0, 5).map((change, index) => (
                                          <div key={change.id || index} className="flex items-start gap-2 text-xs">
                                            <span className="text-muted-foreground">
                                              {new Date(change.timestamp).toLocaleTimeString()}
                                            </span>
                                            <span className="text-foreground">{change.description}</span>
                                          </div>
                                        ))}
                                        {group.changes.length > 5 && (
                                          <p className="text-xs text-muted-foreground italic">
                                            ... and {group.changes.length - 5} more
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                // Paginated view
                                <div className="space-y-2">
                                  {getPaginatedChanges(version).map((change, index) => (
                                    <div key={change.id || index} className="flex items-start gap-3 p-2 bg-muted/50 rounded-md">
                                      {getChangeIcon(change.type)}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-foreground">
                                          {formatChangeDescription(change)}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                  
                                  {/* Pagination */}
                                  {getTotalPages(version) > 1 && (
                                    <div className="flex items-center justify-between pt-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => changePageForVersion(version.id, (changePage[version.id] || 1) - 1)}
                                        disabled={(changePage[version.id] || 1) <= 1}
                                        className="flex items-center gap-1 text-xs"
                                      >
                                        <ChevronLeft className="w-3 h-3" />
                                        Previous
                                      </Button>
                                      
                                      <span className="text-xs text-muted-foreground">
                                        Page {changePage[version.id] || 1} of {getTotalPages(version)}
                                      </span>
                                      
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => changePageForVersion(version.id, (changePage[version.id] || 1) + 1)}
                                        disabled={(changePage[version.id] || 1) >= getTotalPages(version)}
                                        className="flex items-center gap-1 text-xs"
                                      >
                                        Next
                                        <ChevronRight className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
