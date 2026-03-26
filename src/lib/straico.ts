/**
 * Straico Code Generation Utility
 *
 * USE_STRAICO = true  → ALL code gen routes through Straico (Claude Opus 4.6)
 * USE_STRAICO = false → Default Antigravity model behavior (no-op passthrough)
 */

// ─── GLOBAL TOGGLE ────────────────────────────────────────────────────────────
export const USE_STRAICO = true;
export const USE_FALLBACK = true;

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const STRAICO_ENDPOINT = 'https://api.straico.com/v1/chat/completions';
const PRIMARY_MODEL = 'anthropic/claude-opus-4';
const FALLBACK_MODEL = 'anthropic/claude-3.7-sonnet';
const MAX_RETRIES = 3;

// ─── PROMPT OPTIMIZER ─────────────────────────────────────────────────────────
export function buildStraicoPrompt(task: string): string {
  return `You are a senior software engineer.

Write clean, production-ready code.

Task:
${task.trim()}

Constraints:
- Output ONLY code
- No explanations
- Keep it minimal
- Optimize for performance
- Follow best practices`;
}

// ─── CORE REQUEST ─────────────────────────────────────────────────────────────
async function callStraico(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.STRAICO_API_KEY;
  if (!apiKey) throw new Error('STRAICO_API_KEY is not set');

  const res = await fetch(STRAICO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      models: [model],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Straico ${res.status}: ${body}`);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(`Straico Error: ${json.error || 'Unknown error'}`);
  }

  // Straico nestles the completion under data.completions[modelID].completion
  const chatCompletion = json?.data?.completions?.[model]?.completion;
  const text = chatCompletion?.choices?.[0]?.message?.content;

  if (!text) {
    console.error('[Straico] Unexpected response shape:', JSON.stringify(json, null, 2));
    throw new Error('Straico returned empty or malformed response');
  }

  return text as string;
}

// ─── RETRY WRAPPER ────────────────────────────────────────────────────────────
async function withRetry(
  fn: () => Promise<string>,
  retries: number = MAX_RETRIES
): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) throw err;
      const delay = 500 * Math.pow(2, attempt - 1); // 500ms → 1s → 2s
      console.warn(`[Straico] Attempt ${attempt} failed. Retrying in ${delay}ms…`, err);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Straico: all retries exhausted');
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
/**
 * Generate code via Straico.
 * Pass a raw task description — prompt optimization is applied automatically.
 *
 * Throws 'STRAICO_ALL_FAILED' if every model and retry is exhausted,
 * so callers can fall back to the default Antigravity model.
 */
export async function generateWithStraico(task: string): Promise<string> {
  if (!USE_STRAICO) {
    throw new Error('USE_STRAICO is false — use default model');
  }

  const prompt = buildStraicoPrompt(task);

  // ── Primary model with exponential backoff ──────────────────────────────
  try {
    return await withRetry(() => callStraico(prompt, PRIMARY_MODEL));
  } catch (primaryErr) {
    console.error('[Straico] Primary model failed:', primaryErr);
    if (!USE_FALLBACK) throw primaryErr;
  }

  // ── Fallback 1: smaller Straico model ──────────────────────────────────
  try {
    console.warn('[Straico] Falling back to', FALLBACK_MODEL);
    return await withRetry(() => callStraico(prompt, FALLBACK_MODEL), 2);
  } catch (fallbackErr) {
    console.error('[Straico] Fallback model also failed:', fallbackErr);
  }

  // ── Fallback 2: signal caller to use default Antigravity model ──────────
  console.warn('[Straico] All models failed — falling back to default Antigravity model.');
  throw new Error('STRAICO_ALL_FAILED');
}

// ─── LEGACY COMPAT ───────────────────────────────────────────────────────────
/** @deprecated use generateWithStraico() */
export async function straicoGenerate(prompt: string): Promise<string | undefined> {
  try {
    return await generateWithStraico(prompt);
  } catch {
    return undefined;
  }
}
