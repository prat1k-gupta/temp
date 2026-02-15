import type { FlowData } from '@/utils/flow-storage'

export interface Vendor {
  id: string
  numberOfSamples: number
  pps?: number
  selectedOffering: {
    id: string
    name: string
  }
}

export interface CampaignPayload {
  campaignName: string
  sku: string[]
  samplingExperience: 'digital' | 'website'
  locations: string[][]
  numberOfSamples?: number
  comments?: string
  cohorts?: string[][]
  demographicCohorts?: string[][]
  behaviourCohorts?: string[][]
  interestCohorts?: string[][]
  clientId: string
  agencyId?: string
  brandId?: string
  teamId: string
  userId: string
  flowId?: string
  vendors?: Vendor[]
}

export interface CampaignData {
  campaignName?: string
  sku?: string[]
  samplingExperience?: 'digital' | 'website'
  locations?: string[][]
  numberOfSamples?: number
  comments?: string
  cohorts?: string[][]
  demographicCohorts?: string[][]
  behaviourCohorts?: string[][]
  interestCohorts?: string[][]
  clientId?: string
  agencyId?: string
  brandId?: string
  teamId?: string
  userId?: string
  flowId?: string
  vendors?: Vendor[]
}

export interface CreateCampaignResult {
  success: boolean
  campaign?: any
  flowId: string
  flowName: string
  error?: string
  details?: any
}

/**
 * Create a campaign on the platform API based on flow data
 */
export async function createCampaign(
  flow: FlowData,
  campaignData?: CampaignData
): Promise<CreateCampaignResult> {
  try {
    // Check if platform URL is configured
    const platformUrl = process.env.PLATFORM_URL
    if (!platformUrl) {
      throw new Error('PLATFORM_URL is not configured. Please set PLATFORM_URL environment variable.')
    }

    // Build campaign payload
    // Use campaignData from request body, or fallback to env/defaults/dummy values
    const campaignPayload: CampaignPayload = {
      campaignName: campaignData?.campaignName || flow.name,
      sku: campaignData?.sku || [],
      samplingExperience: campaignData?.samplingExperience || 'digital',
      locations: campaignData?.locations || [['pan-india']],
      numberOfSamples: campaignData?.numberOfSamples || 10000,
      comments: campaignData?.comments,
      cohorts: campaignData?.cohorts,
      demographicCohorts: campaignData?.demographicCohorts,
      behaviourCohorts: campaignData?.behaviourCohorts,
      interestCohorts: campaignData?.interestCohorts,
      // Use dummy values if not provided in campaignData or env vars
      clientId: campaignData?.clientId || process.env.CLIENT_ID || 'dummy-client-id',
      agencyId: campaignData?.agencyId,
      brandId: campaignData?.brandId,
      teamId: campaignData?.teamId || process.env.TEAM_ID || 'dummy-team-id',
      userId: campaignData?.userId || process.env.USER_ID || 'dummy-user-id',
      flowId: campaignData?.flowId || flow.id,
      vendors: campaignData?.vendors,
    }

    // Build the request payload in the format expected by the platform API
    const requestPayload = {
      "0": {
        "json": campaignPayload,
        "meta": {
          "values": {
            "agencyId": campaignPayload.agencyId ? [campaignPayload.agencyId] : ["undefined"]
          }
        }
      }
    }

    // Make the API call to the platform
    const platformApiUrl = `${platformUrl}/api/trpc/campaign.createDigitalWebsiteCampaign?batch=1`

    console.log('[Campaign API] Platform API URL:', platformApiUrl)
    console.log('[Campaign API] Request Payload:', requestPayload)
    
    const response = await fetch(platformApiUrl, {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Campaign API] Platform API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      })
      return {
        success: false,
        flowId: flow.id,
        flowName: flow.name,
        error: 'Failed to create campaign on platform',
        details: errorText,
      }
    }

    const result = await response.json()

    return {
      success: true,
      campaign: result,
      flowId: flow.id,
      flowName: flow.name,
    }
  } catch (error: any) {
    console.error('[Campaign API] Error creating campaign:', error)
    return {
      success: false,
      flowId: flow.id,
      flowName: flow.name,
      error: 'Failed to create campaign',
      details: error.message,
    }
  }
}

