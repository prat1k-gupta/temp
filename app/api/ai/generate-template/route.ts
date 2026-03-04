import { NextRequest, NextResponse } from 'next/server'
import { generateTemplate, type GenerateTemplateRequest } from '@/lib/ai/tools/generate-template'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured. Please set ANTHROPIC_API_KEY in your .env.local file.' },
        { status: 500 }
      )
    }

    const body = await request.json() as GenerateTemplateRequest

    if (!body.mode || !body.description) {
      return NextResponse.json(
        { error: 'Missing required fields: mode, description' },
        { status: 400 }
      )
    }

    const result = await generateTemplate(body)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[API] generate-template error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate template' },
      { status: 500 }
    )
  }
}
