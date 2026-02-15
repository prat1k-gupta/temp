import { createClient } from 'redis'
import type { FlowData } from './flow-storage'

const FLOWS_REDIS_KEY = 'flows'

// Singleton Redis client
let redisClient: ReturnType<typeof createClient> | null = null

/**
 * Get or create Redis client
 */
async function getRedisClient() {
  if (!redisClient) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379'
    redisClient = createClient({ url })
    
    redisClient.on('error', (err) => {
      console.error('[Redis] Client error:', err)
    })
    
    redisClient.on('connect', () => {
      console.log('[Redis] Connecting to Redis...')
    })
    
    redisClient.on('ready', () => {
      console.log('[Redis] Redis client ready')
    })
    
    if (!redisClient.isOpen) {
      await redisClient.connect()
    }
  }
  
  // Ensure connection is still open
  if (!redisClient.isOpen) {
    await redisClient.connect()
  }
  
  return redisClient
}

/**
 * Check if Redis is configured
 */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL
}

/**
 * Get all flows from Redis
 */
export async function getAllFlowsFromRedis(): Promise<Record<string, FlowData>> {
  try {
    const client = await getRedisClient()
    const data = await client.get(FLOWS_REDIS_KEY)
    
    if (!data) {
      console.log('[Redis] No flows found, returning empty object')
      return {}
    }
    
    const flows = JSON.parse(data)
    console.log('[Redis] Successfully loaded flows:', Object.keys(flows).length, 'flows')
    return flows
  } catch (error: any) {
    console.error('[Redis] Error reading flows:', error)
    if (error.message) {
      console.error('[Redis] Error message:', error.message)
    }
    return {}
  }
}

/**
 * Get a specific flow by ID from Redis
 */
export async function getFlowFromRedis(flowId: string): Promise<FlowData | null> {
  try {
    const flows = await getAllFlowsFromRedis()
    return flows[flowId] || null
  } catch (error) {
    console.error('[Redis] Error reading flow:', error)
    return null
  }
}

/**
 * Save all flows to Redis
 */
export async function saveFlowsToRedis(flows: Record<string, FlowData>): Promise<boolean> {
  try {
    const client = await getRedisClient()
    const jsonString = JSON.stringify(flows, null, 2)
    
    console.log('[Redis] Saving flows:', {
      flowCount: Object.keys(flows).length,
      key: FLOWS_REDIS_KEY
    })
    
    await client.set(FLOWS_REDIS_KEY, jsonString)
    
    console.log('[Redis] Successfully saved flows')
    return true
  } catch (error: any) {
    console.error('[Redis] Error writing flows:', error)
    if (error.message) {
      console.error('[Redis] Error message:', error.message)
    }
    return false
  }
}

/**
 * Save or update a single flow in Redis
 */
export async function saveFlowToRedis(flow: FlowData): Promise<boolean> {
  try {
    const flows = await getAllFlowsFromRedis()
    flows[flow.id] = flow
    return await saveFlowsToRedis(flows)
  } catch (error) {
    console.error('[Redis] Error saving flow:', error)
    return false
  }
}

/**
 * Delete a flow from Redis
 */
export async function deleteFlowFromRedis(flowId: string): Promise<boolean> {
  try {
    const flows = await getAllFlowsFromRedis()
    if (!flows[flowId]) {
      return false // Flow not found
    }
    
    delete flows[flowId]
    return await saveFlowsToRedis(flows)
  } catch (error) {
    console.error('[Redis] Error deleting flow:', error)
    return false
  }
}

