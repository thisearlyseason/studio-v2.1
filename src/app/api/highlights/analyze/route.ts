import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * /api/highlights/analyze — Vision-based highlight detection via Straico (Primary) or Gemini (Fallback)
 *
 * Flow:
 *   Client extracts frames → uploads to Firebase Storage → sends HTTPS URLs here →
 *   We forward to Straico vision model or Gemini → parse JSON response → return highlights
 */

const STRAICO_ENDPOINT = 'https://api.straico.com/v1/chat/completions';

// Vision-capable models — confirmed from /v1/models, ordered by quality preference
const VISION_MODELS = [
  'qwen/qwen-2-vl-72b-instruct',        // Primary: Top performance
  'qwen/qwen2.5-vl-32b-instruct:free',  // Backup: Fastest response
];

// Text-only fallback — when vision upload is unavailable
const TEXT_MODELS = [
  'anthropic/claude-sonnet-4.5',
  'google/gemini-3-flash-preview',
  'google/gemini-2.5-flash-lite',
  'deepseek/deepseek-chat',
  'openai/gpt-4o-mini',
  'openai/gpt-4.1-nano',
];

async function callStraico(apiKey: string, modelId: string, messages: any[]): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s hard timeout

  try {
    const res = await fetch(STRAICO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ models: [modelId], messages }),
      signal: controller.signal,
    });
    
    const responseText = await res.text();
    clearTimeout(timeoutId);

    if (!res.ok) {
      let errMsg = responseText;
      try { errMsg = JSON.parse(responseText)?.error || responseText; } catch (_) {}
      throw new Error(`HTTP ${res.status}: ${errMsg.slice(0, 200)}`);
    }

    let json: any;
    try { json = JSON.parse(responseText); } catch (_) { throw new Error('non-JSON response'); }

    return json?.data?.completions?.[modelId]?.completion?.choices?.[0]?.message?.content ?? null;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out after 25s');
    throw err;
  }
}

async function callGemini(apiKey: string, model: string, prompt: string, frameUrls: Array<{url: string, timestamp: number}>): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const contents: any[] = [{ text: prompt }];

    // Prepare multimodal content
    for (const frame of frameUrls) {
      contents.push({ text: `[Timestamp: ${frame.timestamp.toFixed(1)}s]` });
      const imageRes = await fetch(frame.url);
      const imageBuffer = await imageRes.arrayBuffer();
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: Buffer.from(imageBuffer).toString('base64'),
        },
      });
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: [{ role: 'user', parts: contents }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    return response.text;
  } catch (err: any) {
    console.warn(`[Gemini Fallback] Failed for ${model}:`, err.message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      frameUrls,  // PRIMARY: HTTPS URLs from Firebase Storage (Straico requires real URLs)
      frames,     // FALLBACK: base64 — triggers text-only mode (no vision)
      prompt,
      videoDuration,
    }: {
      frameUrls?: Array<{ timestamp: number; url: string }>;
      frames?: Array<{ timestamp: number; base64: string }>;
      prompt: string;
      videoDuration: number;
    } = body;

    const hasUrls = frameUrls && frameUrls.length > 0;
    const hasBase64 = frames && frames.length > 0;

    if (!hasUrls && !hasBase64) {
      return NextResponse.json({ error: 'No frames provided.' }, { status: 400 });
    }

    const apiKey = process.env.STRAICO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'STRAICO_API_KEY is not set in .env.local' }, { status: 500 });
    }

    const durationSecs = Math.round(videoDuration || 0);
    const frameCount = hasUrls ? frameUrls!.length : frames!.length;

    const frameTimestamps = hasUrls
      ? frameUrls!.map((f, i) => `Frame ${i + 1} @ ${f.timestamp.toFixed(1)}s`).join(', ')
      : frames!.map((f, i) => `Frame ${i + 1} @ ${f.timestamp.toFixed(1)}s`).join(', ');

    console.log(`[Straico] ${frameCount} frames (${hasUrls ? 'HTTPS vision' : 'text-only fallback'}), ${durationSecs}s video`);

    const scoutPrompt = `You are the Omni-Sport Tactical Brain, a world-class scout for ALL athletic disciplines (Baseball, Softball, Soccer, Football, Hockey, Golf, Pickleball, Tennis, Badminton, Squash, and more).

MISSION:
ACT AS AN ELITE PRO-SCOUT. Your mission is to extract the "Anatomy of the Play"—capturing the biomechanical mechanics that prove an athlete's potential.

SCOUTING CRITERIA BY DISCIPLINE:
- STRIKING (Baseball/Softball/Golf): Look for "Hips and Hands." prioritize the weight transfer, the 'load', and the extension.
- INVASION (Soccer/Football/Hockey): Look for "The Scan." Identify the player's head-movement and positioning *before* the play.
- RACKET/NET (Tennis/Pickleball): Look for "The Split-Step" and recovery positioning.
- PRECISION (Archery/Pickleball): Look for "Focus and Release."

UNIVERSAL SCOUTING DIRECTIVE:
1. THE ANCHOR: Always start the clip on the PREPARATION (wind-up, stance, or mark). 5.0s before mechanics.
2. THE IMPACT: Identify the "Moment of Truth" as impactFrameTime.
3. THE NARRATIVE: Your "description" should read like a professional scouting report (e.g., "Elite hip-internal rotation through the zone").
4. CONCISENESS: Return 15-25s tactical segments.

Return ONLY a valid JSON array.
EXAMPLE: [{"startTime":12.5,"endTime":28.0,"impactFrameTime":18.2,"title":"Elite HR Mechanics","description":"Exceptional weight transfer and bat-on-ball impact showing high-order torque."}]`;

    let textResult = '';
    let successModel = '';
    let lastError = '';

    if (hasUrls) {
      // ── VISION PATH: Send HTTPS image URLs to Straico ──────────────────
      const visionContent: any[] = [{ type: 'text', text: scoutPrompt }];

      for (let i = 0; i < frameUrls!.length; i++) {
        const frame = frameUrls![i];
        visionContent.push({
          type: 'text',
          text: `\n[Frame ${i + 1} — at ${frame.timestamp.toFixed(1)}s]`,
        });
        visionContent.push({
          type: 'image_url',
          image_url: { url: frame.url },  // Real HTTPS URL from Firebase Storage
        });
      }

      const visionMessages = [{ role: 'user', content: visionContent }];

      // --- ATTEMPT 1: Straico Vision Models ---
      for (const modelId of VISION_MODELS) {
        try {
          console.log(`[Straico Vision] Trying: ${modelId}`);
          const content = await callStraico(apiKey, modelId, visionMessages);
          if (content) { textResult = content; successModel = modelId; break; }
          lastError = `${modelId}: empty response`;
        } catch (e: any) {
          lastError = `${modelId}: ${e.message}`;
          console.warn(`[Straico Vision] ${modelId} failed:`, e.message);
        }
      }

      // --- ATTEMPT 2: Gemini Direct Fallback (Free if key is valid) ---
      if (!textResult && process.env.GOOGLE_AI_API_KEY && process.env.GOOGLE_AI_API_KEY !== 'your_gemini_api_key_here') {
        console.log('[Analyze] Straico vision failed/unavailable. Falling back to direct Gemini analysis.');
        const result = await callGemini(process.env.GOOGLE_AI_API_KEY, 'gemini-1.5-flash', scoutPrompt, frameUrls!);
        if (result) {
          textResult = result;
          successModel = 'google/gemini-1.5-flash (direct)';
        }
      }
    }

    // ── TEXT FALLBACK: No URLs, or all vision models failed ─────────────
    if (!textResult) {
      const reason = hasUrls ? 'vision models failed' : 'no HTTPS frame URLs (Firebase Storage unavailable)';
      console.warn(`[Straico] ${reason} — using text-only analysis`);

      const textPrompt = `You are an elite sports scout. A ${durationSecs}-second sports video was sampled at: ${frameTimestamps}.

Coach's request: "${prompt}"

Generate 4–8 highlight clips across the full ${durationSecs}s video:
- startTime = anchor timestamp - 5s (min 0), endTime = anchor timestamp + 8s (max ${durationSecs})
- No overlapping clips, spread across the timeline

Return ONLY valid JSON array, no markdown:
[{"startTime":number,"endTime":number,"title":string,"description":string}]`;

      const textMessages = [{ role: 'user', content: textPrompt }];

      for (const modelId of TEXT_MODELS) {
        try {
          console.log(`[Straico Text] Trying: ${modelId}`);
          const content = await callStraico(apiKey, modelId, textMessages);
          if (content) { textResult = content; successModel = `${modelId} (text-only)`; break; }
        } catch (e: any) {
          lastError = `${modelId}: ${e.message}`;
          console.warn(`[Straico Text] ${modelId} failed:`, e.message);
        }
      }
    }

    if (!textResult) {
      throw new Error(
        `All Straico models failed. Last error: ${lastError}. ` +
        `Check your coin balance at app.straico.com.`
      );
    }

    // ── Parse JSON response ─────────────────────────────────────────────
    const cleanText = textResult
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let highlights: any[];
    try {
      highlights = JSON.parse(cleanText);
    } catch {
      const match = cleanText.match(/\[[\s\S]*?\]/);
      if (match) { highlights = JSON.parse(match[0]); }
      else throw new Error('AI response was not valid JSON. Raw: ' + textResult.slice(0, 200));
    }

    if (durationSecs > 0) {
      highlights = highlights
        .filter((hl: any) => typeof hl.startTime === 'number' && typeof hl.endTime === 'number')
        .map((hl: any) => ({
          ...hl,
          startTime: Math.max(0, Math.min(hl.startTime, durationSecs - 1)),
          endTime: Math.max(1, Math.min(hl.endTime, durationSecs)),
        }));
    }

    console.log(`[Straico] ✓ ${highlights.length} highlights via ${successModel}`);
    return NextResponse.json(highlights);

  } catch (err: any) {
    console.error('[Straico Analyze Error]:', err.message);
    return NextResponse.json({ error: err.message || 'Analysis failed.' }, { status: 500 });
  }
}
