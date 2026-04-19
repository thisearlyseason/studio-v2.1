import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";

/**
 * TEXT-ONLY FALLBACK route — used when only a URL is provided (no video upload).
 *
 * IMPORTANT: This route uses a text completion model (Straico) which CANNOT watch
 * a video stream. It produces timestamp estimates based on world knowledge and context.
 * For accurate, frame-accurate highlight detection, use /api/highlights/analyze which
 * accepts an uploaded video file and uses the Gemini File API.
 */
export async function POST(req: NextRequest) {
  try {
    const { videoUrl, prompt, videoDuration } = await req.json();

    if (!videoUrl) {
      return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
    }

    const apiKey = process.env.STRAICO_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'STRAICO_API_KEY missing. This fallback mode requires a Straico key, or upload a video file to use Gemini AI analysis.' },
        { status: 500 }
      );
    }

    // TEXT-ONLY prompt — no actual video frames are analyzed.
    // This is pure LLM estimation based on context + world knowledge.
    const aiPrompt = `
You are an elite sports scout. Based on the video URL and context provided, estimate likely highlight timestamps.

NOTE: You cannot watch this video. Generate realistic, evenly-spaced timestamp estimates within the video duration.

Video URL: ${videoUrl}
Duration: ${videoDuration ? `${videoDuration} seconds` : 'Unknown'}
Scout Request: "${prompt}"

RULES:
1. Return 4-6 highlight segments.
2. NEVER return startTime or endTime greater than ${videoDuration || 300} seconds.
3. Space highlights evenly across the video timeline.
4. Each highlight window: startTime = peak - 5s, endTime = peak + 8s.
5. Use professional scouting vocabulary in descriptions.
6. Mark each title with "[EST]" to indicate these are ESTIMATED timestamps, not frame-verified.

Return ONLY a valid JSON array. No markdown, no code blocks.
Format: [{"startTime": number, "endTime": number, "title": string, "description": string}]
    `;

    const STRAICO_ENDPOINT = 'https://api.straico.com/v1/chat/completions';
    const MODELS_TO_TRY = [
      'anthropic/claude-3-5-sonnet-20240620',
      'openai/gpt-4o-mini',
    ];

    let textResult = '';
    let lastError = '';

    // --- ATTEMPT 1: Straico ---
    for (const modelId of MODELS_TO_TRY) {
      try {
        const res = await fetch(STRAICO_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            models: [modelId],
            messages: [{ role: 'user', content: aiPrompt }],
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          lastError = errText;
          continue;
        }

        const json = await res.json();
        const content =
          json?.data?.completions?.[modelId]?.completion?.choices?.[0]?.message?.content;

        if (content) {
          textResult = content;
          break;
        } else {
          lastError = 'Malformed response structure';
        }
      } catch (e: any) {
        lastError = e.message;
      }
    }

    // --- ATTEMPT 2: Gemini Direct ---
    if (!textResult && process.env.GOOGLE_AI_API_KEY && process.env.GOOGLE_AI_API_KEY !== 'your_gemini_api_key_here') {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
        const model = ai.models.get("gemini-1.5-flash");
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        });
        textResult = result.text;
      } catch (e: any) {
        lastError = `Gemini: ${e.message}`;
      }
    }

    if (!textResult) {
      throw new Error(
        `All AI models failed. Last error: ${lastError}. Ensure your STRAICO_API_KEY is active.`
      );
    }

    const cleanText = textResult
      .replace(/^```json\s*/g, '')
      .replace(/^```\s*/g, '')
      .replace(/```$/g, '')
      .trim();

    try {
      const highlights = JSON.parse(cleanText);
      return NextResponse.json(highlights);
    } catch {
      throw new Error('Failed to parse AI response as structured JSON.');
    }
  } catch (err: any) {
    console.error('[Highlights Fallback Error]:', err);
    return NextResponse.json({ error: err.message || 'Analysis Failed' }, { status: 500 });
  }
}
