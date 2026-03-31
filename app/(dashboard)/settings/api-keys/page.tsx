"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2, Key, Trash2, Plus, Copy, Eye, EyeOff, ExternalLink } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  type ApiKey,
} from "@/hooks/queries"
import { useChatbotFlows } from "@/hooks/queries"
import { apiClient } from "@/lib/api-client"

// ---------------------------------------------------------------------------
// Flow API Key types & hooks
// ---------------------------------------------------------------------------

interface FlowApiKey {
  id: string
  name: string
  flow_id: string
  flow_name: string
  key: string
  is_active: boolean
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

const flowApiKeyKeys = {
  all: ["flowApiKeys"] as const,
  list: () => [...flowApiKeyKeys.all, "list"] as const,
} as const

function useFlowApiKeys() {
  return useQuery<FlowApiKey[]>({
    queryKey: flowApiKeyKeys.list(),
    queryFn: async () => {
      const data = await apiClient.get<FlowApiKey[]>("/api/flow-api-keys")
      return Array.isArray(data) ? data : []
    },
  })
}

function useCreateFlowApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; flow_id: string; expires_at?: string }) =>
      apiClient.post<FlowApiKey & { key: string }>("/api/flow-api-keys", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowApiKeyKeys.list() })
    },
  })
}

function useDeleteFlowApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/flow-api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowApiKeyKeys.list() })
    },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never"
  try {
    return format(new Date(dateStr), "MMM d, yyyy")
  } catch {
    return "Invalid date"
  }
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "Never"
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return "Unknown"
  }
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

function maskFlowKey(key: string): string {
  if (!key || key.length < 8) return key
  const last4 = key.slice(-4)
  return `fsk_...${last4}`
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  toast.success("Copied to clipboard")
}

// ---------------------------------------------------------------------------
// General API Keys Tab
// ---------------------------------------------------------------------------

function GeneralApiKeysTab() {
  const { data: apiKeys, isLoading } = useApiKeys()
  const createApiKey = useCreateApiKey()
  const deleteApiKey = useDeleteApiKey()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null)

  // Create form state
  const [createName, setCreateName] = useState("")
  const [createExpiry, setCreateExpiry] = useState("")

  function openCreate() {
    setCreateName("")
    setCreateExpiry("")
    setShowCreateDialog(true)
  }

  function handleCreate() {
    if (!createName.trim()) {
      toast.error("Name is required")
      return
    }
    createApiKey.mutate(
      {
        name: createName.trim(),
        expires_at: createExpiry || undefined,
      },
      {
        onSuccess: (response) => {
          setShowCreateDialog(false)
          setRevealedKey(response?.key ?? null)
        },
        onError: (err) => toast.error(err.message || "Failed to create API key"),
      },
    )
  }

  function confirmDelete() {
    if (!keyToDelete) return
    deleteApiKey.mutate(keyToDelete.id, {
      onSuccess: () => {
        toast.success("API key revoked")
        setKeyToDelete(null)
      },
      onError: (err) => toast.error(err.message || "Failed to revoke API key"),
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          General-purpose API keys for programmatic access to your account.
        </p>
        <Button onClick={openCreate} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Create Key
        </Button>
      </div>

      {!apiKeys || apiKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="rounded-full bg-muted p-4">
            <Key className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">No API keys</p>
            <p className="text-sm text-muted-foreground">
              Create a key to access the API programmatically.
            </p>
          </div>
          <Button onClick={openCreate} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Key
          </Button>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell className="font-medium">{apiKey.name}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                      whm_{apiKey.key_prefix}...
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatRelativeDate(apiKey.last_used_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(apiKey.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        apiKey.is_active
                          ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                          : "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                      }
                      variant="outline"
                    >
                      {apiKey.is_active ? "Active" : "Expired"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="cursor-pointer text-destructive hover:text-destructive"
                      onClick={() => setKeyToDelete(apiKey)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for programmatic access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gen-key-name">Name</Label>
              <Input
                id="gen-key-name"
                placeholder="e.g. Production Integration"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gen-key-expiry">Expiration (optional)</Label>
              <Input
                id="gen-key-expiry"
                type="datetime-local"
                value={createExpiry}
                onChange={(e) => setCreateExpiry(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createApiKey.isPending}
              className="cursor-pointer"
            >
              {createApiKey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Key Reveal Dialog */}
      <Dialog open={!!revealedKey} onOpenChange={(open) => !open && setRevealedKey(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Make sure to copy your API key now. You won&apos;t be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input readOnly value={revealedKey ?? ""} className="font-mono text-sm" />
              <Button
                variant="outline"
                size="icon"
                className="cursor-pointer shrink-0"
                onClick={() => revealedKey && copyToClipboard(revealedKey)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Usage example:</p>
              <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto">
                {`curl -H "X-API-Key: ${revealedKey ?? "{key}"}" https://your-api.com/api/contacts`}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button className="cursor-pointer" onClick={() => setRevealedKey(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog open={!!keyToDelete} onOpenChange={(open) => !open && setKeyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke{" "}
              <span className="font-medium">{keyToDelete?.name}</span>? Any integrations using
              this key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteApiKey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Flow API Keys Tab
// ---------------------------------------------------------------------------

function FlowApiKeysTab() {
  const { data: flowKeys, isLoading } = useFlowApiKeys()
  const { data: chatbotFlows } = useChatbotFlows()
  const createFlowApiKey = useCreateFlowApiKey()
  const deleteFlowApiKey = useDeleteFlowApiKey()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [keyToDelete, setKeyToDelete] = useState<FlowApiKey | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [revealedRows, setRevealedRows] = useState<Set<string>>(new Set())

  // Create form state
  const [createName, setCreateName] = useState("")
  const [createFlowId, setCreateFlowId] = useState("")
  const [createExpiry, setCreateExpiry] = useState("")

  function openCreate() {
    setCreateName("")
    setCreateFlowId("")
    setCreateExpiry("")
    setShowCreateDialog(true)
  }

  function handleCreate() {
    if (!createName.trim()) {
      toast.error("Name is required")
      return
    }
    if (!createFlowId) {
      toast.error("Please select a flow")
      return
    }
    createFlowApiKey.mutate(
      {
        name: createName.trim(),
        flow_id: createFlowId,
        expires_at: createExpiry || undefined,
      },
      {
        onSuccess: (response) => {
          setShowCreateDialog(false)
          setRevealedKey(response?.key ?? null)
        },
        onError: (err) => toast.error(err.message || "Failed to create flow API key"),
      },
    )
  }

  function openDelete(key: FlowApiKey) {
    setKeyToDelete(key)
    setDeleteConfirmText("")
  }

  function confirmDelete() {
    if (!keyToDelete) return
    deleteFlowApiKey.mutate(keyToDelete.id, {
      onSuccess: () => {
        toast.success("Flow API key deleted")
        setKeyToDelete(null)
        setDeleteConfirmText("")
      },
      onError: (err) => toast.error(err.message || "Failed to delete flow API key"),
    })
  }

  function toggleReveal(id: string) {
    setRevealedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          API keys scoped to a specific chatbot flow for external integrations.
        </p>
        <Button onClick={openCreate} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Create Flow Key
        </Button>
      </div>

      {!flowKeys || flowKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="rounded-full bg-muted p-4">
            <Key className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">No flow API keys</p>
            <p className="text-sm text-muted-foreground">
              Create a key to allow external services to trigger a specific flow.
            </p>
          </div>
          <Button onClick={openCreate} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Flow Key
          </Button>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Flow</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flowKeys.map((fk) => {
                const revealed = revealedRows.has(fk.id)
                const expired = isExpired(fk.expires_at)
                return (
                  <TableRow key={fk.id}>
                    <TableCell className="font-medium">{fk.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                          {revealed ? fk.key : maskFlowKey(fk.key)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="cursor-pointer h-6 w-6"
                          onClick={() => toggleReveal(fk.id)}
                        >
                          {revealed ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="cursor-pointer h-6 w-6"
                          onClick={() => copyToClipboard(fk.key)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/flow/${fk.flow_id}`}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline cursor-pointer"
                      >
                        {fk.flow_name}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          fk.is_active && !expired
                            ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                            : "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                        }
                        variant="outline"
                      >
                        {fk.is_active && !expired ? "Active" : "Expired"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatRelativeDate(fk.last_used_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(fk.expires_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(fk.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="cursor-pointer text-destructive hover:text-destructive"
                        onClick={() => openDelete(fk)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Flow Key Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create Flow API Key</DialogTitle>
            <DialogDescription>
              Create an API key scoped to a specific chatbot flow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="flow-key-name">Name</Label>
              <Input
                id="flow-key-name"
                placeholder="e.g. Shopify Webhook"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Flow</Label>
              <Select value={createFlowId} onValueChange={setCreateFlowId}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select a flow" />
                </SelectTrigger>
                <SelectContent>
                  {chatbotFlows?.map((flow) => (
                    <SelectItem key={flow.id} value={flow.id} className="cursor-pointer">
                      {flow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="flow-key-expiry">Expiration (optional)</Label>
              <Input
                id="flow-key-expiry"
                type="datetime-local"
                value={createExpiry}
                onChange={(e) => setCreateExpiry(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createFlowApiKey.isPending}
              className="cursor-pointer"
            >
              {createFlowApiKey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flow Key Reveal Dialog */}
      <Dialog open={!!revealedKey} onOpenChange={(open) => !open && setRevealedKey(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Flow API Key Created</DialogTitle>
            <DialogDescription>
              Make sure to copy your API key now. You won&apos;t be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input readOnly value={revealedKey ?? ""} className="font-mono text-sm" />
              <Button
                variant="outline"
                size="icon"
                className="cursor-pointer shrink-0"
                onClick={() => revealedKey && copyToClipboard(revealedKey)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Usage example:</p>
              <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto">
                {`curl -H "X-API-Key: ${revealedKey ?? "{key}"}" https://your-api.com/api/contacts`}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button className="cursor-pointer" onClick={() => setRevealedKey(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation — requires typing key name */}
      <AlertDialog
        open={!!keyToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setKeyToDelete(null)
            setDeleteConfirmText("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Flow API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Type{" "}
              <span className="font-semibold">{keyToDelete?.name}</span> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Type the key name to confirm"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteConfirmText !== keyToDelete?.name || deleteFlowApiKey.isPending}
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFlowApiKey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ApiKeysPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="text-sm text-muted-foreground">
          Manage API keys for programmatic access
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general" className="cursor-pointer">
            General
          </TabsTrigger>
          <TabsTrigger value="flow" className="cursor-pointer">
            Flow API Keys
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <GeneralApiKeysTab />
        </TabsContent>

        <TabsContent value="flow" className="space-y-4">
          <FlowApiKeysTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
