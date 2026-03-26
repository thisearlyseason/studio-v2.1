import { NextRequest, NextResponse } from 'next/server';
import { generateWithStraico, USE_STRAICO } from '@/lib/straico';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt } = body as { prompt?: string };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { error: 'Missing or empty "prompt" field.' },
        { status: 400 }
      );
    }

    if (!USE_STRAICO) {
      return NextResponse.json(
        { error: 'Straico is disabled (USE_STRAICO=false). Enable it to use this endpoint.' },
        { status: 503 }
      );
    }

    const response = await generateWithStraico(prompt);
    return NextResponse.json({ response });

  } catch (err: any) {
    // Distinguish "all failed" from other errors
    if (err?.message === 'STRAICO_ALL_FAILED') {
      return NextResponse.json(
        { error: 'Straico and all fallback models failed. Try again later.' },
        { status: 502 }
      );
    }
    if (err?.message === 'USE_STRAICO is false — use default model') {
      return NextResponse.json(
        { error: 'Straico is disabled.' },
        { status: 503 }
      );
    }
    console.error('[/api/straico-code] Unhandled error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
