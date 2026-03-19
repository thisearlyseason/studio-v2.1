'use server';
/**
 * @fileOverview This file implements a Genkit flow that suggests poll questions and options
 * based on a given context or prompt, using the Straico LLM provider.
 *
 * - suggestPollQuestionAndOptions - A function that handles the poll suggestion process.
 * - SuggestPollInput - The input type for the suggestPollQuestionAndOptions function.
 * - SuggestPollOutput - The return type for the suggestPollQuestionAndOptions function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

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
  return suggestPollFlow(input);
}

const pollPrompt = ai.definePrompt({
  name: 'pollQuestionAndOptionPrompt',
  model: 'straico/default',
  input: { schema: SuggestPollInputSchema },
  output: { schema: SuggestPollOutputSchema },
  prompt: `You are an AI assistant specialized in generating engaging poll questions and relevant options.

Based on the following information, suggest a poll question and 2 to 6 options for a group chat poll.

Constraint: The options must be concise and directly related to the question.

{{#if chatContext}}
Chat Context: {{{chatContext}}}
{{/if}}

Prompt/Topic: {{{prompt}}}`,
});

const suggestPollFlow = ai.defineFlow(
  {
    name: 'pollQuestionAndOptionSuggestionFlow',
    inputSchema: SuggestPollInputSchema,
    outputSchema: SuggestPollOutputSchema,
  },
  async (input) => {
    const { output } = await pollPrompt(input);
    return output!;
  }
);
