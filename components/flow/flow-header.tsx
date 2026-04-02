"use client"

import { useState, useEffect } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform, FlowVersion, EditModeState, FlowChange } from "@/types"
import type { FlowData } from "@/utils/flow-storage"
import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { getPlatformDisplayName } from "@/utils/platform-labels"
import { useTheme } from "next-themes"
import { PublishModal } from "@/components/publish-modal"
import {
  Upload,
  Clock,
  MoreHorizontal,
  RotateCcw,
  Edit3,
  ExternalLink,
  Eye,
  ArrowLeft,
  History,
  Camera,
  Trash2,
  Copy,
  Link,
  Network,
  LogOut,
  Check,
  ChevronDown,
  Smartphone,
  CloudUpload,
  Sun,
  Moon,
  Monitor,
} from "lucide-react"
import { toast } from "sonner"
import { logout } from "@/lib/auth"

function SaveStatus({ isSaving, isEditMode }: { isSaving?: boolean; isEditMode: boolean }) {
  const [showSaved, setShowSaved] = useState(false)
  const [wasSaving, setWasSaving] = useState(false)

  useEffect(() => {
    if (isSaving) {
      setWasSaving(true)
      setShowSaved(false)
    } else if (wasSaving) {
      setWasSaving(false)
      setShowSaved(true)
      const timer = setTimeout(() => setShowSaved(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [isSaving, wasSaving])

  if (!isEditMode || (!isSaving && !showSaved)) return null

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {isSaving ? (
        <>
          <CloudUpload className="size-3.5 animate-pulse" />
          <span className="text-xs">Saving changes</span>
        </>
      ) : (
        <>
          <CloudUpload className="size-3.5 text-emerald-600" />
          <span className="text-xs text-emerald-600">Changes saved</span>
        </>
      )}
    </div>
  )
}

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
  isSaving?: boolean
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
  isSaving,
}: FlowHeaderProps) {
  const [showResetDialog, setShowResetDialog] = useState(false)
  const { theme, setTheme } = useTheme()

  const versionStatus: "draft" | "published" = isEditMode ? "draft" : (currentVersion?.isPublished ? "published" : "draft")

  return (
    <TooltipProvider delayDuration={300}>
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between h-14 px-3 border-b bg-background/95 backdrop-blur-sm overflow-visible">
        {/* Left Section */}
        <div className="flex items-center gap-2 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleBackClick}
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8 text-muted-foreground shrink-0")}
              >
                <ArrowLeft className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Back to flows</TooltipContent>
          </Tooltip>

          {currentFlow && (
            <>
              <div className="flex items-center gap-3">
                {isEditingFlowName ? (
                  <Input
                    value={editingFlowNameValue}
                    onChange={(e) => setEditingFlowNameValue(e.target.value)}
                    onBlur={handleFlowNameBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur()
                      if (e.key === "Escape") {
                        setEditingFlowNameValue(currentFlow.name)
                        setIsEditingFlowName(false)
                      }
                    }}
                    className="text-base font-semibold h-8 px-2 min-w-[200px] max-w-[400px]"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="flex items-center gap-2 group cursor-pointer hover:bg-accent px-2 py-1 rounded transition-colors"
                    onClick={() => {
                      setEditingFlowNameValue(currentFlow.name)
                      setIsEditingFlowName(true)
                    }}
                  >
                    <h1 className="font-semibold text-base truncate">{currentFlow.name}</h1>
                    <Edit3 className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                )}
                <SaveStatus isSaving={isSaving} isEditMode={isEditMode} />
              </div>

              <div className="h-5 w-px bg-border mx-1" />

              {/* Version Badge Dropdown */}
              {currentVersion && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent transition-colors text-sm cursor-pointer">
                      <Clock className="size-3.5 text-muted-foreground" />
                      <span className="font-medium">v{currentVersion.version}</span>
                      <Badge
                        variant={versionStatus === "draft" ? "secondary" : "default"}
                        className={
                          versionStatus === "draft"
                            ? "text-[10px] px-1.5 py-0 h-4 uppercase tracking-wide bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
                            : "text-[10px] px-1.5 py-0 h-4 uppercase tracking-wide"
                        }
                      >
                        {versionStatus}
                      </Badge>
                      <ChevronDown className="size-3 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onSelect={() => setIsVersionHistoryModalOpen(true)}>
                      <History className="size-4" />
                      Version History
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!getAllVersions().find((v) => v.isPublished)}
                      onSelect={() => {
                        if (!getAllVersions().find((v) => v.isPublished)) return
                        setShowResetDialog(true)
                      }}
                    >
                      <RotateCcw className="size-4" />
                      Reset to Published
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mode Toggle */}
          <ToggleGroup
            type="single"
            value={isEditMode ? "edit" : "view"}
            onValueChange={(v) => {
              if (v && ((v === "edit" && !isEditMode) || (v === "view" && isEditMode))) {
                handleModeToggle()
              }
            }}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="edit" className="gap-1.5 px-3 cursor-pointer">
              <Edit3 className="size-3.5" />
              Edit
            </ToggleGroupItem>
            <ToggleGroupItem value="view" className="gap-1.5 px-3 cursor-pointer">
              <Eye className="size-3.5" />
              View
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="h-5 w-px bg-border mx-1" />

          {/* Publish Button */}
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
              size="sm"
              disabled={(() => {
                const hasChanges = hasActualChanges(nodes, edges, platform)
                const changesCount = getChangesCount()
                return !isEditMode || (!hasChanges && changesCount === 0)
              })()}
              className="gap-1.5"
            >
              <Upload className="size-3.5" />
              Publish
            </Button>
          </PublishModal>

          {/* Platform Badge (static, not a dropdown) */}
          <div
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium",
              platform === "whatsapp"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
                : platform === "instagram"
                  ? "bg-pink-50 border-pink-200 text-pink-700 dark:bg-pink-950/30 dark:border-pink-800 dark:text-pink-400"
                  : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400",
            )}
          >
            {platform === "whatsapp" && <WhatsAppIcon className="size-3.5" />}
            {platform === "instagram" && <InstagramIcon className="size-3.5" />}
            {platform === "web" && <WebIcon className="size-3.5" />}
            {getPlatformDisplayName(platform)}
          </div>

          {/* Flow Graph */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  buttonVariants({ variant: isFlowGraphPanelOpen ? "secondary" : "ghost", size: "icon" }),
                  "size-8",
                )}
                onClick={onToggleFlowGraph}
              >
                <Network className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Flow Graph</TooltipContent>
          </Tooltip>

          {/* More Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8")}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* Test on WhatsApp / Preview (moved from platform dropdown) */}
              {platform === "whatsapp" && waPhoneNumber && triggerKeywords && triggerKeywords.length > 0 && (
                <>
                  {triggerKeywords.map((kw) => (
                    <DropdownMenuItem key={kw} asChild>
                      <a
                        href={`https://wa.me/${waPhoneNumber}?text=${encodeURIComponent(kw)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-pointer"
                      >
                        <Smartphone className="size-4" />
                        {triggerKeywords.length === 1 ? "Test on WhatsApp" : <>Test: <span className="font-mono">{kw}</span></>}
                      </a>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              {platform !== "whatsapp" && currentVersion?.isPublished && !isEditMode && currentVersion.previewUrl && (
                <>
                  <DropdownMenuItem asChild>
                    <a
                      href={currentVersion.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer"
                    >
                      <ExternalLink className="size-4" />
                      Preview
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {publishedFlowId && (
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard.writeText(publishedFlowId)
                    toast.success("Flow ID copied!")
                  }}
                >
                  <Link className="size-4" />
                  Copy Flow ID
                </DropdownMenuItem>
              )}
              {flowSlug && (
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard.writeText(flowSlug)
                    toast.success("Flow slug copied! Use as {{flow." + flowSlug + ".<var>}}")
                  }}
                >
                  <Copy className="size-4" />
                  Copy Slug
                </DropdownMenuItem>
              )}
              {(publishedFlowId || flowSlug) && <DropdownMenuSeparator />}

              {isEditMode && hasActualChanges(nodes, edges, platform) && (
                <>
                  <DropdownMenuItem onSelect={() => setIsChangesModalOpen(true)}>
                    <Clock className="size-4" />
                    {getChangesSummary()}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onSelect={() => setIsExportModalOpen(true)}>
                <Upload className="size-4" />
                Export/Import Flow
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setIsScreenshotModalOpen(true)}>
                <Camera className="size-4" />
                Take Screenshot
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                Theme
              </DropdownMenuLabel>
              <div className="flex gap-0.5 px-2 py-1">
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 cursor-pointer", theme === "light" && "bg-muted")}
                  onClick={() => setTheme("light")}
                >
                  <Sun className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 cursor-pointer", theme === "dark" && "bg-muted")}
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 cursor-pointer", theme === "system" && "bg-muted")}
                  onClick={() => setTheme("system")}
                >
                  <Monitor className="size-3.5" />
                </button>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={logout} className="cursor-pointer">
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setShowDeleteDialog(true)}
                className="cursor-pointer"
              >
                <Trash2 className="size-4" />
                Delete Flow
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

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
    </TooltipProvider>
  )
}
