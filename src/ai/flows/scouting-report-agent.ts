'use server';
/**
 * @fileOverview Generates professional scouting reports using Straico.
 * 
 * - generateScoutingBrief - Analysis engine for opponent tactics.
 */

import { z } from 'zod';
import { generateWithStraico } from '@/lib/straico';
import { parseStructuredAiResponse } from '@/lib/structured-ai-response';

const ScoutingInputSchema = z.object({
  opponentName: z.string(),
  sport: z.string(),
  rawObservations: z.string().describe('Coach observations about the opponent, player tendencies, or previous match notes.'),
});

const ScoutingOutputSchema = z.object({
  strengths: z.string().describe('Key tactical advantages of the opponent.'),
  weaknesses: z.string().describe('Identified areas for exploitation.'),
  keysToVictory: z.string().describe('Direct tactical instructions for the squad.'),
  suggestedDrillFocus: z.string().describe('Recommended training priority for this match-up.'),
});

export async function generateScoutingBrief(input: z.infer<typeof ScoutingInputSchema>) {
  const validatedInput = ScoutingInputSchema.parse(input);
  const response = await generateWithStraico(`You are an Elite Tactical Analyst for a professional ${validatedInput.sport} team.

Analyze the following coach observations for the upcoming match against ${validatedInput.opponentName}:

OBSERVATIONS:
${validatedInput.rawObservations}

Generate a structured, high-performance scouting report that identifies strategic patterns and exploit points.
Ensure the tone is objective and instruction-focused for the squad.
Return only valid JSON with this exact shape:
{"strengths":"string","weaknesses":"string","keysToVictory":"string","suggestedDrillFocus":"string"}`);

  return ScoutingOutputSchema.parse(parseStructuredAiResponse(response));
}
