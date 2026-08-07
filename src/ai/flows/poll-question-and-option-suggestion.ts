'use server';
/**
 * @fileOverview Suggests poll questions and options
 * based on a given context or prompt, using the Straico LLM provider.
 *
 * - suggestPollQuestionAndOptions - A function that handles the poll suggestion process.
 * - SuggestPollInput - The input type for the suggestPollQuestionAndOptions function.
 * - SuggestPollOutput - The return type for the suggestPollQuestionAndOptions function.
 */

import { z } from 'zod';
import { generateWithStraico } from '@/lib/straico';
import { parseStructuredAiResponse } from '@/lib/structured-ai-response';

const SuggestPollInputSchema = z.object({
  prompt: z.string().describe('A brief prompt or topic for the poll.').min(1, 'Prompt cannot be empty.'),
  chatContext: z.string().optional().describe('Optional chat context that can provide more background for the poll suggestion.'),
});
export type SuggestPollInput = z.infer<typeof SuggestPollInputSchema>;

const SuggestPollOutputSchema = z.object({
  question: z.string().describe('The suggested poll question.'),
  options: z.array(z.string()).min(2).max(6).describe('A list of 2 to 6 suggested poll options.'),
});
export type SuggestPollOutput = z.infer<typeof SuggestPollOutputSchema>;

export async function suggestPollQuestionAndOptions(input: SuggestPollInput): Promise<SuggestPollOutput> {
  const validatedInput = SuggestPollInputSchema.parse(input);
  const response = await generateWithStraico(`You are an AI assistant specialized in generating engaging poll questions and relevant options.

Based on the following information, suggest a poll question and 2 to 6 options for a group chat poll.

Constraint: The options must be concise and directly related to the question.
Return only valid JSON with this exact shape:
{"question":"string","options":["string","string"]}

${validatedInput.chatContext ? `Chat Context: ${validatedInput.chatContext}` : ''}

Prompt/Topic: ${validatedInput.prompt}`);
  return SuggestPollOutputSchema.parse(parseStructuredAiResponse(response));
}
