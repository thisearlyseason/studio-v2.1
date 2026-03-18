import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

/**
 * Tactical AI Configuration
 * 
 * - Hardened to gemini-1.5-flash for maximum reliability and high-throughput quota availability.
 * - Optimized for real-time coordination, scouting analysis, and automated scheduling.
 */
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-1.5-flash',
});