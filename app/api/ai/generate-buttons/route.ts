import { NextRequest, NextResponse } from 'next/server'
import type { GenerateOptionsRequest, GenerateOptionsResponse } from '@/types/ai'
import { generateButtonsTool } from '@/lib/ai/tools/generate-buttons'

export const runtime = 'edge'

/**
 * POST /api/ai/generate-buttons
 * Generate button options based on question context
 */
export async function POST(request: NextRequest) {
  try {
    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('[API] OpenAI API key not configured')
      return NextResponse.json(
        { 
          error: 'OpenAI API key not configured. Please create a .env.local file with OPENAI_API_KEY=your-key-here and restart the dev server.' 
        },
        { status: 500 }
      )
    }

    console.log('[API] Processing generate-buttons request')

    // Parse request body
    const body = await request.json() as GenerateOptionsRequest

    // Validate required fields
    if (!body.context || !body.count || !body.platform) {
      return NextResponse.json(
        { error: 'Missing required fields: context, count, platform' },
        { status: 400 }
      )
    }

    // Execute the tool
    const result = await generateButtonsTool.execute(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to generate buttons' },
        { status: 500 }
      )
    }

    // Return the generated buttons
    return NextResponse.json(result.data as GenerateOptionsResponse)

  } catch (error) {
    console.error('[API] Error generating buttons:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

