import { NextRequest, NextResponse } from 'next/server'
import type { FlowData } from '@/utils/flow-storage'
import { createCampaign, type CampaignData } from '@/utils/campaign-api'

export async function POST(request: NextRequest) {
  try {
    // Get the request body
    const body = await request.json()
    const { flow, campaignData }: { flow: FlowData; campaignData?: CampaignData } = body

    // Validate required fields
    if (!flow || !flow.name) {
      return NextResponse.json(
        { error: 'Flow data with name is required' },
        { status: 400 }
      )
    }

    // Create the campaign
    const result = await createCampaign(flow, campaignData)

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error || 'Failed to create campaign',
          details: result.details 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(result, { status: 201 })

  } catch (error: any) {
    console.error('[Campaign API] Error creating campaign:', error)
    return NextResponse.json(
      { 
        error: 'Failed to create campaign',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

