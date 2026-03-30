import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  createFlow,
  updateFlow,
  deleteFlow,
  duplicateFlow,
  type FlowData,
  type FlowMetadata,
} from "@/utils/flow-storage"
import type { Platform } from "@/types"
import { flowKeys } from "./query-keys"

interface CreateFlowParams {
  name: string
  description?: string
  platform?: Platform
  triggerId?: string
  triggerKeywords?: string[]
  waAccountId?: string
  triggerMatchType?: string
  triggerRef?: string
}

/**
 * Create a new flow. Invalidates the flow list on success.
 */
export function useCreateFlow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: CreateFlowParams) =>
      createFlow(
        params.name,
        params.description,
        params.platform,
        params.triggerId,
        params.triggerKeywords,
        params.waAccountId,
        params.triggerMatchType,
        params.triggerRef,
      ),
    onSuccess: (newFlow) => {
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() })
      // Seed the detail cache so navigating to the new flow is instant
      queryClient.setQueryData(flowKeys.detail(newFlow.id), newFlow)
    },
  })
}

/**
 * Update flow metadata. Optimistically updates the detail cache.
 */
export function useUpdateFlow(flowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates: Partial<Omit<FlowData, "id" | "createdAt">>) =>
      updateFlow(flowId, updates),
    onSuccess: (updatedFlow) => {
      if (updatedFlow) {
        queryClient.setQueryData(flowKeys.detail(flowId), updatedFlow)
      }
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() })
    },
  })
}

/**
 * Delete a flow. Optimistically removes it from the list cache.
 */
export function useDeleteFlow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (flowId: string) => deleteFlow(flowId),
    onMutate: async (flowId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: flowKeys.lists() })

      // Snapshot previous value
      const previousFlows = queryClient.getQueryData<FlowMetadata[]>(flowKeys.lists())

      // Optimistically remove from list
      if (previousFlows) {
        queryClient.setQueryData(
          flowKeys.lists(),
          previousFlows.filter((f) => f.id !== flowId),
        )
      }

      return { previousFlows }
    },
    onError: (_err, _flowId, context) => {
      // Rollback on error
      if (context?.previousFlows) {
        queryClient.setQueryData(flowKeys.lists(), context.previousFlows)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() })
    },
  })
}

/**
 * Duplicate a flow. Invalidates the flow list on success.
 */
export function useDuplicateFlow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ flowId, newName }: { flowId: string; newName?: string }) =>
      duplicateFlow(flowId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() })
    },
  })
}
