import { put, list } from '@vercel/blob'
import type { FlowData } from './flow-storage'

const FLOWS_BLOB_KEY = 'flows.json'

// Store the blob URL when we create/update it
let cachedBlobUrl: string | null = null

/**
 * Clear the cached blob URL to force a fresh lookup on next read
 */
export function clearBlobCache(): void {
  cachedBlobUrl = null
}

/**
 * Check if Blob storage is configured
 */
export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

/**
 * Check if the flows blob exists and get its URL
 */
async function getBlobUrl(): Promise<string | null> {
  try {
    // Use list to find the blob by pathname
    const { blobs } = await list({
      prefix: FLOWS_BLOB_KEY,
      limit: 10, // Get more results to find exact match
    })
    
    // Find exact match by pathname
    const exactMatch = blobs.find(blob => blob.pathname === FLOWS_BLOB_KEY)
    
    if (exactMatch) {
      cachedBlobUrl = exactMatch.url
      return exactMatch.url
    }
    
    // If no exact match, try to find by pathname (case-insensitive or partial match)
    if (blobs.length > 0) {
      const match = blobs.find(blob => 
        blob.pathname === FLOWS_BLOB_KEY || 
        blob.pathname?.endsWith(FLOWS_BLOB_KEY) ||
        blob.pathname?.includes(FLOWS_BLOB_KEY)
      )
      
      if (match) {
        cachedBlobUrl = match.url
        return match.url
      }
    }
    
    return null
  } catch (error: any) {
    console.error('Error checking blob existence:', error)
    // Log more details for debugging
    if (error.message) {
      console.error('Error message:', error.message)
    }
    if (error.status) {
      console.error('Error status:', error.status)
    }
    return null
  }
}

/**
 * Get all flows from Blob storage
 */
export async function getAllFlowsFromBlob(): Promise<Record<string, FlowData>> {
  try {
    // Get the blob URL (clear cache if it fails to force refresh)
    let blobUrl = cachedBlobUrl
    if (!blobUrl) {
      blobUrl = await getBlobUrl()
    }
    
    if (!blobUrl) {
      console.log('[Blob Storage] Blob does not exist yet, returning empty object')
      return {} // Blob doesn't exist yet
    }
    
    // Add cache busting query parameter to ensure fresh data
    const urlWithCacheBust = `${blobUrl}?t=${Date.now()}`
    
    console.log('[Blob Storage] Fetching flows from:', blobUrl)
    
    // Fetch the blob content by URL
    const response = await fetch(urlWithCacheBust, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[Blob Storage] Blob not found (404), clearing cache')
        cachedBlobUrl = null
        return {}
      }
      throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`)
    }
    
    const text = await response.text()
    if (!text) {
      console.log('[Blob Storage] Blob content is empty')
      return {}
    }
    
    const parsed = JSON.parse(text)
    console.log('[Blob Storage] Successfully loaded flows:', Object.keys(parsed).length, 'flows')
    return parsed
  } catch (error: any) {
    // If blob doesn't exist, return empty object
    if (error.status === 404 || error.message?.includes('not found') || error.message?.includes('404')) {
      console.log('[Blob Storage] Blob not found, returning empty object')
      cachedBlobUrl = null
      return {}
    }
    console.error('[Blob Storage] Error reading flows from Blob:', error)
    if (error.message) {
      console.error('[Blob Storage] Error message:', error.message)
    }
    // Clear cache on error to force refresh next time
    cachedBlobUrl = null
    return {}
  }
}

/**
 * Get a specific flow by ID from Blob storage
 */
export async function getFlowFromBlob(flowId: string): Promise<FlowData | null> {
  try {
    const flows = await getAllFlowsFromBlob()
    return flows[flowId] || null
  } catch (error) {
    console.error('Error reading flow from Blob:', error)
    return null
  }
}

/**
 * Save all flows to Blob storage
 * 
 * According to Vercel Blob docs:
 * - Blobs are immutable by default
 * - Use allowOverwrite: true to update existing blobs
 * - Best practice: Treat blobs as immutable, but for our use case (single flows.json file),
 *   we need to overwrite it to update flows
 */
export async function saveFlowsToBlob(flows: Record<string, FlowData>): Promise<boolean> {
  try {
    const jsonString = JSON.stringify(flows, null, 2)
    const blobUrl = await getBlobUrl()
    const exists = blobUrl !== null
    
    console.log('[Blob Storage] Saving flows to blob:', {
      exists,
      flowCount: Object.keys(flows).length,
      key: FLOWS_BLOB_KEY
    })
    
    // Always allow overwrite to update existing blob
    // This ensures we can update the same flows.json file
    // If blob doesn't exist, it will be created
    const blob = await put(FLOWS_BLOB_KEY, jsonString, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true, // Always allow overwrite to update existing blob
    })
    
    // Cache the blob URL for faster subsequent reads
    cachedBlobUrl = blob.url
    console.log('[Blob Storage] Successfully saved flows, blob URL:', blob.url)
    
    return true
  } catch (error: any) {
    console.error('[Blob Storage] Error writing flows to Blob:', error)
    if (error.message) {
      console.error('[Blob Storage] Error message:', error.message)
    }
    if (error.status) {
      console.error('[Blob Storage] Error status:', error.status)
    }
    // Clear cache on error to force refresh next time
    cachedBlobUrl = null
    return false
  }
}

/**
 * Save or update a single flow in Blob storage
 */
export async function saveFlowToBlob(flow: FlowData): Promise<boolean> {
  try {
    // Clear cache before reading to ensure we get the latest data
    cachedBlobUrl = null
    const flows = await getAllFlowsFromBlob()
    flows[flow.id] = flow
    return await saveFlowsToBlob(flows)
  } catch (error) {
    console.error('Error saving flow to Blob:', error)
    return false
  }
}

/**
 * Delete a flow from Blob storage
 */
export async function deleteFlowFromBlob(flowId: string): Promise<boolean> {
  try {
    const flows = await getAllFlowsFromBlob()
    if (!flows[flowId]) {
      return false // Flow not found
    }
    
    delete flows[flowId]
    return await saveFlowsToBlob(flows)
  } catch (error) {
    console.error('Error deleting flow from Blob:', error)
    return false
  }
}

