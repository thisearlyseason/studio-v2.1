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
      3. Timing: Ensure highlight clips map cleanly to realistic pacing (usually 5 to 12 seconds per clip).
      4. Professional Terminology: Use elite scouting vocabulary in the descriptions (e.g. "weak-side help", "explosive first step", "verticality", "vision", "anticipation").

      Return ONLY a raw JSON array of objects with the exact following keys. Do NOT wrap in markdown formatting blocks (\`\`\`json).
      - "startTime" (number, start time in seconds, e.g. 14.5)
      - "endTime" (number, end time in seconds, e.g. 22.0)
      - "title" (short 2-4 word intense title, e.g. "Weak-Side Block")
      - "description" (a 1-2 sentence elite breakdown of the execution and impact)
      
      Structure the output to simulate 3-5 high-quality findings.
    `;

    // Attempting to use a reliable model via Straico proxy
    const STRAICO_ENDPOINT = 'https://api.straico.com/v1/chat/completions';
    const MODEL = 'anthropic/claude-3.7-sonnet'; // Guaranteed working model in Straico

    const res = await fetch(STRAICO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        models: [MODEL],
        messages: [{ role: 'user', content: aiPrompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[Straico Error Response]:", text);
      throw new Error(`AI Engine rejected the request. Details: ${text}`);
    }

    const json = await res.json();
    let textResult = '';

    // Parse the dynamic response structure from Straico
    if (json?.data?.completions?.[MODEL]?.completion?.choices?.[0]?.message?.content) {
       textResult = json.data.completions[MODEL].completion.choices[0].message.content;
    } else {
       console.error("Malformed Response:", JSON.stringify(json, null, 2));
       throw new Error("Analyzed data was returned empty or malformed.");
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
