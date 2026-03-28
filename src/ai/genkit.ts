import { genkit } from 'genkit';
import { straicoGenerate } from "@/lib/straico";

/**
 * Genkit instance for the application.
 * Configured without the Google AI plugin to use a custom Straico model instead.
 */
export const ai = genkit({
  plugins: [],
});

/**
 * Defines a custom Straico model within Genkit.
 * This allows the application to use the Straico API via the existing helper function
 * while still benefiting from Genkit's prompt management and structured output.
 */
ai.defineModel(
  {
    name: 'straico/default',
    label: 'Straico Claude Model',
  } as any,
  async (request) => {
    // Construct a single prompt string from the message history
    const prompt = request.messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content.map((c: any) => c.text).join('')}`)
      .join('\n\n');

    // Call the Straico generation helper using anthropic/claude-sonnet-4.5
    const responseText = await straicoGenerate(prompt);

    return {
      message: {
        role: 'model' as const,
        content: [{ text: responseText || "" }],
      },
    } as any;
  }
);