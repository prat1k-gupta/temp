import { NextRequest, NextResponse } from 'next/server'
import { getAllFlowsFromRedis, saveFlowsToRedis } from '@/utils/redis-storage'
import type { FlowData } from '@/utils/flow-storage'

export async function GET(request: NextRequest) {
  try {
    // Check if Redis is configured
    if (!process.env.REDIS_URL) {
      console.error('[API] REDIS_URL is not configured')
      return NextResponse.json(
        { error: 'Redis is not configured. Please set REDIS_URL environment variable.' },
        { status: 500 }
      )
    }
    
    // Load all flows from Redis
    const flows = await getAllFlowsFromRedis()
    
    // Convert to array and return metadata only (without full node/edge data for list view)
    const flowsArray: FlowData[] = Object.values(flows)
    const flowsMetadata = flowsArray.map(flow => ({
      id: flow.id,
      name: flow.name,
      description: flow.description,
      platform: flow.platform,
      thumbnail: flow.thumbnail,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
      nodeCount: flow.nodes?.length || 0,
      edgeCount: flow.edges?.length || 0,
    }))
    
    return NextResponse.json(flowsMetadata)
  } catch (error) {
    console.error('Error fetching flows from database:', error)
    return NextResponse.json(
      { error: 'Failed to fetch flows from database' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the flow data from request body
    const flowData = await request.json()

    // Validate required fields
    if (!flowData.name || !flowData.platform) {
      return NextResponse.json(
        { error: 'Name and platform are required' },
        { status: 400 }
      )
    }

    // Generate a unique flow ID if not provided
    const flowId = flowData.id || `flow-${Date.now()}`

    // Load current flows from Redis
    const flows = await getAllFlowsFromRedis()

    // Check if flow ID already exists
    if (flows[flowId]) {
      return NextResponse.json(
        { error: 'Flow with this ID already exists' },
        { status: 409 }
      )
    }

    // Create new flow object
    const newFlow = {
      id: flowId,
      name: flowData.name,
      description: flowData.description || '',
      platform: flowData.platform,
      nodes: flowData.nodes || [
        {
          id: "1",
          type: "start",
          position: { x: 250, y: 25 },
          data: {
            label: "Start",
            platform: flowData.platform,
            triggerId: flowData.triggerId,
            triggerIds: flowData.triggerId ? [flowData.triggerId] : [],
            triggerKeywords: flowData.triggerKeywords || [],
          },
          draggable: false,
          selectable: true,
        },
      ],
      edges: flowData.edges || [],
      triggerId: flowData.triggerId,
      triggerIds: flowData.triggerId ? [flowData.triggerId] : [],
      triggerKeywords: flowData.triggerKeywords || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Add the new flow to the flows object
    flows[flowId] = newFlow

    // Save flows back to Redis
    const saved = await saveFlowsToRedis(flows)

    if (!saved) {
      return NextResponse.json(
        { error: 'Failed to save flow to database' },
        { status: 500 }
      )
    }

    // Campaign creation is now handled by the frontend when the setup modal completes
    // This allows for better control and user feedback
    // Campaign creation is disabled here to avoid duplicates

    return NextResponse.json(newFlow, { status: 201 })
  } catch (error) {
    console.error('Error creating flow in database:', error)
    return NextResponse.json(
      { error: 'Failed to create flow in database' },
      { status: 500 }
    )
  }
}

