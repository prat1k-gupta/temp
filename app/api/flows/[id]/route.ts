import { NextRequest, NextResponse } from 'next/server'
import { getAllFlowsFromRedis, saveFlowsToRedis, deleteFlowFromRedis } from '@/utils/redis-storage'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const flowId = params.id

    if (!flowId) {
      return NextResponse.json(
        { error: 'Flow ID is required' },
        { status: 400 }
      )
    }

    // Check if Redis is configured
    if (!process.env.REDIS_URL) {
      console.error('[API] REDIS_URL is not configured')
      return NextResponse.json(
        { error: 'Redis is not configured. Please set REDIS_URL environment variable.' },
        { status: 500 }
      )
    }

    // Load flows from Redis
    const flows = await getAllFlowsFromRedis()
    
    // Find the flow by ID
    const flow = flows[flowId]

    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(flow)
  } catch (error) {
    console.error('Error fetching flow from database:', error)
    return NextResponse.json(
      { error: 'Failed to fetch flow from database' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const flowId = params.id

    if (!flowId) {
      return NextResponse.json(
        { error: 'Flow ID is required' },
        { status: 400 }
      )
    }

    // Get the updated flow data from request body
    const updatedFlowData = await request.json()

    // Load current flows from Redis
    const flows = await getAllFlowsFromRedis()

    // Check if flow exists
    if (!flows[flowId]) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      )
    }

    // Update the flow with new data
    // Preserve the ID and merge with existing data
    const updatedFlow = {
      ...flows[flowId],
      ...updatedFlowData,
      id: flowId, // Ensure ID cannot be changed
      updatedAt: new Date().toISOString(), // Update timestamp
    }

    // Save updated flow back to Redis
    flows[flowId] = updatedFlow
    
    const saved = await saveFlowsToRedis(flows)

    if (!saved) {
      return NextResponse.json(
        { error: 'Failed to save flow to database' },
        { status: 500 }
      )
    }

    return NextResponse.json(updatedFlow)
  } catch (error) {
    console.error('Error updating flow in database:', error)
    return NextResponse.json(
      { error: 'Failed to update flow in database' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const flowId = params.id

    if (!flowId) {
      return NextResponse.json(
        { error: 'Flow ID is required' },
        { status: 400 }
      )
    }

    // Check if Redis is configured
    if (!process.env.REDIS_URL) {
      console.error('[API] REDIS_URL is not configured')
      return NextResponse.json(
        { error: 'Redis is not configured. Please set REDIS_URL environment variable.' },
        { status: 500 }
      )
    }

    // Load flows from Redis to check if flow exists
    const flows = await getAllFlowsFromRedis()
    
    if (!flows[flowId]) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      )
    }

    // Delete the flow from Redis
    const deleted = await deleteFlowFromRedis(flowId)

    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete flow from database' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: 'Flow deleted successfully' })
  } catch (error) {
    console.error('Error deleting flow from database:', error)
    return NextResponse.json(
      { error: 'Failed to delete flow from database' },
      { status: 500 }
    )
  }
}

