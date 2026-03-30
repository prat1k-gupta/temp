"use client"

import { useState } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform, FlowVersion, EditModeState, FlowChange } from "@/types"
import type { FlowData } from "@/utils/flow-storage"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { getPlatformDisplayName } from "@/utils/platform-labels"
// PlatformSelector removed — platform is locked after flow creation
import { ThemeToggle } from "@/components/theme-toggle"
import { PublishModal } from "@/components/publish-modal"
import {
  Upload,
  Clock,
  MoreHorizontal,
  RotateCcw,
  Edit3,
  ExternalLink,
  Pencil,
  Eye,
  ArrowLeft,
  History,
  Camera,
  Trash2,
  Copy,
  Link,
  Network,
} from "lucide-react"
import { toast } from "sonner"

interface FlowHeaderProps {
  currentFlow: FlowData | null
  isEditingFlowName: boolean
  editingFlowNameValue: string
  setEditingFlowNameValue: (value: string) => void
  setIsEditingFlowName: (editing: boolean) => void
  handleFlowNameBlur: () => void
  currentVersion: FlowVersion | null
  isEditMode: boolean
  editModeState: EditModeState
  draftChanges: FlowChange[]
  platform: Platform
  nodes: Node[]
  edges: Edge[]
  loadFromDb: boolean
  flowId: string
  handleBackClick: () => void
  handleModeToggle: () => void
  handlePlatformChange: (platform: Platform) => void
  hasActualChanges: (nodes: Node[], edges: Edge[], platform: Platform) => boolean
  getChangesCount: () => number
  getChangesSummary: () => string
  getAllVersions: () => FlowVersion[]
  resetToPublished: (setNodes: any, setEdges: any, setPlatform: any) => void
  setNodes: any
  setEdges: any
  setPlatform: any
  setSelectedNode: (node: Node | null) => void
  setSelectedNodes: (nodes: Node[]) => void
  setIsPropertiesPanelOpen: (open: boolean) => void
  setIsChangesModalOpen: (open: boolean) => void
  setIsExportModalOpen: (open: boolean) => void
  setIsVersionHistoryModalOpen: (open: boolean) => void
  setIsScreenshotModalOpen: (open: boolean) => void
  setShowDeleteDialog: (show: boolean) => void
  onCreateVersion: (name: string, description?: string) => Promise<void>
  onPublishVersion: (versionId?: string, versionName?: string, description?: string) => Promise<void>
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
  isFlowGraphPanelOpen?: boolean
  onToggleFlowGraph?: () => void
}

export function FlowHeader({
  currentFlow,
  isEditingFlowName,
  editingFlowNameValue,
  setEditingFlowNameValue,
  setIsEditingFlowName,
  handleFlowNameBlur,
  currentVersion,
  isEditMode,
  editModeState,
  draftChanges,
  platform,
  nodes,
  edges,
  loadFromDb,
  flowId,
  handleBackClick,
  handleModeToggle,
  handlePlatformChange,
  hasActualChanges,
  getChangesCount,
  getChangesSummary,
  getAllVersions,
  resetToPublished,
  setNodes,
  setEdges,
  setPlatform,
  setSelectedNode,
  setSelectedNodes,
  setIsPropertiesPanelOpen,
  setIsChangesModalOpen,
  setIsExportModalOpen,
  setIsVersionHistoryModalOpen,
  setIsScreenshotModalOpen,
  setShowDeleteDialog,
  onCreateVersion,
  onPublishVersion,
  flowName,
  flowDescription,
  triggerIds,
  triggerKeywords,
  triggerMatchType,
  triggerRef,
  publishedFlowId,
  flowSlug,
  waAccountId,
  waPhoneNumber,
  onPublished,
  onValidationError,
  isFlowGraphPanelOpen,
  onToggleFlowGraph,
}: FlowHeaderProps) {
  const [showResetDialog, setShowResetDialog] = useState(false)

  return (
    <>
    <div className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border overflow-visible">
      <div className="flex items-center justify-between px-6 py-3 gap-2">
        {/* Left Section */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="default"
            size="sm"
            onClick={handleBackClick}
            className="shrink-0 h-8 w-8 p-0"
            title="Back to flows"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          {currentFlow && (
            <>
              {isEditingFlowName ? (
                <Input
                  value={editingFlowNameValue}
                  onChange={(e) => setEditingFlowNameValue(e.target.value)}
                  onBlur={handleFlowNameBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur()
                    }
                    if (e.key === "Escape") {
                      setEditingFlowNameValue(currentFlow.name)
                      setIsEditingFlowName(false)
                    }
                  }}
                  className="text-lg font-semibold h-8 px-2 min-w-[200px] max-w-[400px]"
                  autoFocus
                />
              ) : (
                <div
                  className="flex items-center gap-2 group cursor-pointer hover:bg-muted/50 px-2 py-1 rounded transition-colors"
                  onClick={() => {
                    setEditingFlowNameValue(currentFlow.name)
                    setIsEditingFlowName(true)
                  }}
                >
                  <h1 className="text-lg font-semibold text-foreground truncate">
                    {currentFlow.name}
                  </h1>
                  <Edit3 className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              )}
              {currentVersion && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                  <span className="font-medium">{currentVersion.name}</span>
                  {currentVersion.isPublished && !isEditMode ? (
                    <>
                      <Badge variant="secondary" className="text-xs px-2 py-0.5">Published</Badge>
                      {platform !== "whatsapp" && currentVersion.previewUrl && (
                        <a
                          href={currentVersion.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-xs font-medium transition-colors cursor-pointer shadow-sm hover:shadow-md"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Preview
                        </a>
                      )}
                    </>
                  ) : (
                    <Badge variant="outline" className="text-xs px-2 py-0.5">Draft</Badge>
                  )}
                  {!isEditMode && !currentVersion.isPublished && (
                    <Badge variant="destructive" className="text-xs px-2 py-0.5">Previous</Badge>
                  )}
                </div>
              )}
              {publishedFlowId && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(publishedFlowId)
                    toast.success("Flow ID copied!")
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-muted/50 hover:bg-muted text-xs text-muted-foreground transition-colors cursor-pointer"
                  title={`Flow ID: ${publishedFlowId}`}
                >
                  <Link className="w-3 h-3" />
                  <span className="font-mono">{publishedFlowId.slice(0, 8)}...</span>
                  <Copy className="w-3 h-3" />
                </button>
              )}
              {flowSlug && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(flowSlug)
                    toast.success("Flow slug copied! Use as {{flow." + flowSlug + ".<var>}}")
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-950/50 text-xs text-purple-700 dark:text-purple-300 transition-colors cursor-pointer"
                  title={`Flow slug: ${flowSlug} — use in cross-flow references as {{flow.${flowSlug}.<var>}}`}
                >
                  <span className="font-medium">slug:</span>
                  <span className="font-mono">{flowSlug}</span>
                  <Copy className="w-3 h-3" />
                </button>
              )}
              {platform === "whatsapp" && waPhoneNumber && triggerKeywords && triggerKeywords.length > 0 && (
                triggerKeywords.length === 1 ? (
                  <a
                    href={`https://wa.me/${waPhoneNumber}?text=${encodeURIComponent(triggerKeywords[0])}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white rounded-md text-xs font-medium transition-colors cursor-pointer shadow-sm hover:shadow-md"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Test on WhatsApp
                  </a>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white rounded-md text-xs font-medium transition-colors cursor-pointer shadow-sm hover:shadow-md"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Test on WhatsApp
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[160px]">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Send keyword</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {triggerKeywords.map((kw) => (
                        <DropdownMenuItem key={kw} asChild>
                          <a
                            href={`https://wa.me/${waPhoneNumber}?text=${encodeURIComponent(kw)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cursor-pointer"
                          >
                            <span className="font-mono text-xs">{kw}</span>
                          </a>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              )}
            </>
          )}
        </div>

        {/* Center Section */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 bg-muted rounded-md p-1">
            <button
              onClick={handleModeToggle}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                isEditMode
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Pencil className="w-4 h-4" />
              <span>Edit Mode</span>
            </button>
            <button
              onClick={handleModeToggle}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                !isEditMode
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>View Mode</span>
            </button>
          </div>
          <PublishModal
            changes={draftChanges}
            hasUnsavedChanges={editModeState.hasUnsavedChanges}
            onCreateVersion={onCreateVersion}
            onPublishVersion={onPublishVersion}
            currentVersion={currentVersion}
            platform={platform}
            nodes={nodes}
            edges={edges}
            flowName={flowName}
            flowDescription={flowDescription}
            triggerIds={triggerIds}
            triggerKeywords={triggerKeywords}
            triggerMatchType={triggerMatchType}
            triggerRef={triggerRef}
            publishedFlowId={publishedFlowId}
            flowSlug={flowSlug}
            waAccountId={waAccountId}
            waPhoneNumber={waPhoneNumber}
            onPublished={onPublished}
            onValidationError={onValidationError}
          >
            <Button
              variant="default"
              size="sm"
              disabled={(() => {
                const hasChanges = hasActualChanges(nodes, edges, platform)
                const changesCount = getChangesCount()
                return !isEditMode || (!hasChanges && changesCount === 0)
              })()}
              className="h-9 px-4 gap-2"
            >
              <Upload className="w-4 h-4" />
              Publish
            </Button>
          </PublishModal>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border-2 ${
              platform === "web"
                ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                : platform === "whatsapp"
                  ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                  : "bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800"
            }`}
            title={getPlatformDisplayName(platform)}
          >
            {platform === "web" && <WebIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
            {platform === "whatsapp" && <WhatsAppIcon className="w-4 h-4 text-green-600 dark:text-green-400" />}
            {platform === "instagram" && <InstagramIcon className="w-4 h-4 text-pink-600 dark:text-pink-400" />}
            <span
              className={`text-sm font-semibold ${
                platform === "web"
                  ? "text-blue-700 dark:text-blue-300"
                  : platform === "whatsapp"
                    ? "text-green-700 dark:text-green-300"
                    : "text-pink-700 dark:text-pink-300"
              }`}
            >
              {getPlatformDisplayName(platform)}
            </span>
          </div>

          <Button
            variant={isFlowGraphPanelOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleFlowGraph}
            className="h-9 w-9 p-0"
            title="Flow Graph"
          >
            <Network className="w-4 h-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transition-colors cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
                <span className="sr-only">More options</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Flow Options</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {isEditMode && hasActualChanges(nodes, edges, platform) && (
                <DropdownMenuItem onSelect={() => setIsChangesModalOpen(true)}>
                  <Clock className="w-4 h-4 mr-2" />
                  {getChangesSummary()}
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                disabled={!getAllVersions().find((v) => v.isPublished)}
                onSelect={() => {
                  if (!getAllVersions().find((v) => v.isPublished)) return
                  setShowResetDialog(true)
                }}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Published
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={() => setIsExportModalOpen(true)}>
                <Eye className="w-4 h-4 mr-2" />
                Export/Import Flow
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => setIsVersionHistoryModalOpen(true)}>
                <History className="w-4 h-4 mr-2" />
                Version History
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => setIsScreenshotModalOpen(true)}>
                <Camera className="w-4 h-4 mr-2" />
                Take Screenshot
              </DropdownMenuItem>

              {loadFromDb && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setShowDeleteDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Flow
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />

              <div className="px-2 py-1.5">
                <ThemeToggle />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>

    <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset to published version?</AlertDialogTitle>
          <AlertDialogDescription>
            All unsaved changes will be lost. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={() => {
            resetToPublished(setNodes, setEdges, setPlatform)
            setSelectedNode(null)
            setSelectedNodes([])
            setIsPropertiesPanelOpen(false)
            toast.success("Reset to published version")
          }}>
            Reset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
