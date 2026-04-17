import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { videoUrl, prompt } = await req.json();

    if (!videoUrl) {
      return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
    }

    const apiKey = process.env.STRAICO_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing. Please configure your Straico key.' }, { status: 500 });
    }

    // Upgraded PRO Scout Prompt for highly accurate and diverse highlight parsing
    const aiPrompt = `
      You are an elite, professional sports scout operating an advanced video analysis engine.
      Analyze this game video stream: ${videoUrl}
      Identify key moments and game-changing plays based on this specific directive: "${prompt}"
      
      CRITICAL SCOUTING DIRECTIVES:
      1. Action Density: Look for high-impact plays (scoring, critical defense, massive momentum shifts).
      2. Player Focus: Isolate movements, off-ball IQ, and technical execution for the requested player/filter.
      3. Timing & Variety: 
         - Ensure highlight clips map cleanly to realistic pacing (usually 5 to 15 seconds per clip).
         - MANDATORY: Search the ENTIRE duration of provided metadata/stream.
         - MANDATORY: Return UNIQUE timestamps. NEVER return the same or nearly identical startTime/endTime for multiple highlights.
         - If the video is long, space the highlights throughout the game (e.g., 1st half, 2nd half, crunch time).
      4. Professional Terminology: Use elite scouting vocabulary in the descriptions (e.g. "weak-side help", "explosive first step", "verticality", "vision", "anticipation").

      Return ONLY a raw JSON array of objects with the exact following keys. Do NOT wrap in markdown formatting blocks (\`\`\`json).
      - "startTime" (number, start time in seconds, e.g. 14.5)
      - "endTime" (number, end time in seconds, e.g. 22.0)
      - "title" (short 2-4 word intense title, e.g. "Weak-Side Block")
      - "description" (a 1-2 sentence elite breakdown of the execution and impact)
      
      Structure the output to simulate 4-6 distinct, diverse, and high-quality findings.
    `;

    // Attempting to use a reliable model via Straico proxy
    const STRAICO_ENDPOINT = 'https://api.straico.com/v1/chat/completions';
    
    // We try a list of models for maximum reliability in "Live" environments
    const MODELS_TO_TRY = [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3.7-sonnet',
      'google/gemini-1.5-pro'
    ];

    let textResult = '';
    let lastError = '';

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
          console.error(`[Straico Error for ${modelId}]:`, errText);
          lastError = errText;
          continue; // Try next model
        }

        const json = await res.json();
        
        // Straico nests the result: data.completions[modelId].completion.choices[0].message.content
        const content = json?.data?.completions?.[modelId]?.completion?.choices?.[0]?.message?.content;
        
        if (content) {
          textResult = content;
          break; // Success!
        } else {
          console.error(`[Straico Malformed Response for ${modelId}]:`, JSON.stringify(json));
          lastError = 'Malformed response structure';
        }
      } catch (e: any) {
        console.error(`[Straico Fetch Failure for ${modelId}]:`, e);
        lastError = e.message;
      }
    }

    if (!textResult) {
      throw new Error(`AI Engines rejected the request or were unavailable. Last error: ${lastError}. Please ensure your STRAICO_API_KEY is active and has sufficient credits.`);
    }

    // Clean up Markdown JSON blocks if the model accidentally included them
    const cleanText = textResult.replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();

    try {
      const highlightData = JSON.parse(cleanText);
      return NextResponse.json(highlightData);
    } catch (parseErr) {
      console.error("JSON Parsing Error from Model Output:", cleanText);
      throw new Error("Failed to parse the AI analysis into structured timestamps.");
    }

  } catch (err: any) {
    console.error('[AI Highlight Generation Error]:', err);
    return NextResponse.json({ error: err.message || 'Analysis Failed' }, { status: 500 });
  }
}
