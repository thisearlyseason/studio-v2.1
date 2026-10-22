/** Called only inside the existing eligible account-deletion workflow.
 * Recursive deletion includes tasks, replay receipts and count metadata.
 * A failure must propagate so the deletion request remains retryable.
 */
export async function purgeScheduleTodos(
  uid: string,
  removeTree: (path: string) => Promise<unknown>,
): Promise<void> {
  if (!uid || uid.length > 128 || uid.includes('/')) throw new Error('Invalid account purge scope.');
  await removeTree(`scheduleTodoAccounts/${uid}`);
}
