import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

/**
 * Tactical AI Configuration
 * 
 * - Migrated to gemini-1.5-flash for maximum reliability and quota availability.
 * - Optimized for real-time coordination and scouting analysis.
 */
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-1.5-flash',
});
