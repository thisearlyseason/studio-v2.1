/**
 * Extracts a JSON object from an AI response without evaluating model output.
 * Accepts plain JSON or a fenced JSON block and rejects all malformed output.
 */
export function parseStructuredAiResponse(value: string): unknown {
  const trimmed = value.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const objectStart = unfenced.indexOf('{');
  const objectEnd = unfenced.lastIndexOf('}');
  const candidate = objectStart >= 0 && objectEnd > objectStart
    ? unfenced.slice(objectStart, objectEnd + 1)
    : unfenced;

  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error('AI provider returned an invalid structured response.');
  }
}
