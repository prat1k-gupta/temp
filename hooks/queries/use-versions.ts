import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { isApiStorage } from "@/lib/feature-flags"
import type { FlowVersion, FlowChange, Platform } from "@/types"
import type { Node, Edge } from "@xyflow/react"
import { versionKeys, flowKeys } from "./query-keys"

// ---------------------------------------------------------------------------
// Backend response → frontend type mappers
// ---------------------------------------------------------------------------

interface VersionResponse {
  id: string
  project_id: string
  version_number: number
  name: string
  description: string
  nodes: any[]
  edges: any[]
  platform: Platform
  is_published: boolean
  published_at?: string
  changes: any[]
  created_at: string
}

interface DraftResponse {
  id: string
  project_id: string
  user_id: string
  nodes: any[]
  edges: any[]
  platform: Platform
  updated_at: string
}

function mapVersion(v: VersionResponse): FlowVersion {
  return {
    id: v.id,
    version: v.version_number,
    name: v.name,
    description: v.description,
    nodes: v.nodes || [],
    edges: v.edges || [],
    platform: v.platform as Platform,
    isPublished: v.is_published,
    publishedAt: v.published_at,
    changes: v.changes || [],
    createdAt: v.created_at,
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch all versions for a project (sorted by version_number DESC from backend).
 */
export function useVersions(projectId: string) {
  return useQuery<FlowVersion[]>({
    queryKey: versionKeys.list(projectId),
    queryFn: async () => {
      if (!isApiStorage()) return []
      const data = await apiClient.get<any>(
        `/api/magic-flow/projects/${projectId}/versions`,
      )
      const versions: VersionResponse[] = data?.versions || []
      return versions.map(mapVersion)
    },
    enabled: !!projectId && projectId !== "new",
  })
}

/**
 * Fetch the current user's draft for a project.
 * Returns null if no draft exists (404 from backend).
 */
export function useDraft(projectId: string) {
  return useQuery<DraftResponse | null>({
    queryKey: versionKeys.draft(projectId),
    queryFn: async () => {
      if (!isApiStorage()) return null
      try {
        const data = await apiClient.get<any>(
          `/api/magic-flow/projects/${projectId}/draft`,
        )
        return (data?.draft || data) as DraftResponse
      } catch {
        // 404 = no draft exists, not an error
        return null
      }
    },
    enabled: !!projectId && projectId !== "new",
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

interface CreateVersionParams {
  projectId: string
  name: string
  description?: string
  nodes: Node[]
  edges: Edge[]
  platform: Platform
  changes?: FlowChange[]
}

/**
 * Create a new version. Invalidates the version list on success.
 */
export function useCreateVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CreateVersionParams) => {
      const data = await apiClient.post<any>(
        `/api/magic-flow/projects/${params.projectId}/versions`,
        {
          name: params.name,
          description: params.description,
          nodes: params.nodes,
          edges: params.edges,
          platform: params.platform,
          changes: params.changes || [],
        },
      )
      return mapVersion(data?.version || data)
    },
    onSuccess: (_version, params) => {
      queryClient.invalidateQueries({
        queryKey: versionKeys.all(params.projectId),
      })
    },
  })
}

interface PublishVersionParams {
  projectId: string
  versionId: string
}

/**
 * Publish a version. Invalidates versions and the project detail cache.
 */
export function usePublishVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: PublishVersionParams) => {
      const data = await apiClient.post<any>(
        `/api/magic-flow/projects/${params.projectId}/versions/${params.versionId}/publish`,
      )
      return mapVersion(data?.version || data)
    },
    onSuccess: (_version, params) => {
      queryClient.invalidateQueries({
        queryKey: versionKeys.all(params.projectId),
      })
      // Published state affects the project detail (hasPublished flag)
      queryClient.invalidateQueries({
        queryKey: flowKeys.detail(params.projectId),
      })
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() })
    },
  })
}

interface SaveDraftParams {
  projectId: string
  nodes: Node[]
  edges: Edge[]
  platform: Platform
}

/**
 * Save (upsert) a draft. Used by auto-save.
 * Optimistically updates the draft cache so the UI stays in sync.
 */
export function useSaveDraft() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: SaveDraftParams) => {
      await apiClient.put(
        `/api/magic-flow/projects/${params.projectId}/draft`,
        {
          nodes: params.nodes,
          edges: params.edges,
          platform: params.platform,
        },
      )
      return params // return for onSuccess
    },
    onSuccess: (_data, params) => {
      // Optimistic set — we know exactly what was saved, no need to refetch
      queryClient.setQueryData(
        versionKeys.draft(params.projectId),
        {
          nodes: params.nodes,
          edges: params.edges,
          platform: params.platform,
          updated_at: new Date().toISOString(),
        },
      )
    },
  })
}

/**
 * Delete a draft. Invalidates the draft cache.
 */
export function useDeleteDraft() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      await apiClient.delete(
        `/api/magic-flow/projects/${projectId}/draft`,
      )
    },
    onSuccess: (_data, projectId) => {
      queryClient.setQueryData(versionKeys.draft(projectId), null)
    },
  })
}
