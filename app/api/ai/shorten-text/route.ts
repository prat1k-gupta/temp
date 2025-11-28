import { NextRequest, NextResponse } from 'next/server'
import type { ShortenTextRequest, ShortenTextResponse } from '@/types/ai'
import { shortenTextTool } from '@/lib/ai/tools/shorten-text'

export const runtime = 'edge'

/**
 * POST /api/ai/shorten-text
 * Shorten text to fit character limits
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

    console.log('[API] Processing shorten-text request')

    // Parse request body
    const body = await request.json() as ShortenTextRequest

    // Validate required fields
    if (!body.text || !body.targetLength || !body.nodeType || !body.platform) {
      return NextResponse.json(
        { error: 'Missing required fields: text, targetLength, nodeType, platform' },
        { status: 400 }
      )
    }

    // Execute the tool
    const result = await shortenTextTool.execute(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to shorten text' },
        { status: 500 }
      )
    }

    // Return the shortened text
    return NextResponse.json(result.data as ShortenTextResponse)

  } catch (error) {
    console.error('[API] Error shortening text:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

