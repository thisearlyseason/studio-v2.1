export function eventMutationFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'Unable to save this activity. Please try again.';
}
