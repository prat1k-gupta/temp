import { NextRequest, NextResponse } from 'next/server'
import type { ImproveCopyRequest, ImproveCopyResponse } from '@/types/ai'
import { improveCopyTool } from '@/lib/ai/tools/improve-copy'

export const runtime = 'edge'

/**
 * POST /api/ai/improve-copy
 * Improve text copy using AI
 */
export async function POST(request: NextRequest) {
  try {
    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[API] Anthropic API key not configured')
      return NextResponse.json(
        {
          error: 'Anthropic API key not configured. Please set ANTHROPIC_API_KEY in your .env.local file.'
        },
        { status: 500 }
      )
    }

    console.log('[API] Processing improve-copy request')

    // Parse request body
    const body = await request.json() as ImproveCopyRequest

    // Validate required fields
    if (!body.text || !body.nodeType || !body.platform || !body.field) {
      return NextResponse.json(
        { error: 'Missing required fields: text, nodeType, platform, field' },
        { status: 400 }
      )
    }

    // Execute the tool
    const result = await improveCopyTool.execute(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to improve copy' },
        { status: 500 }
      )
    }

    // Return the improved text
    return NextResponse.json(result.data as ImproveCopyResponse)

  } catch (error) {
    console.error('[API] Error improving copy:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

