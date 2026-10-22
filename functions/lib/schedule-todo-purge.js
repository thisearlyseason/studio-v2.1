"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purgeScheduleTodos = purgeScheduleTodos;
/** Called only inside the existing eligible account-deletion workflow.
 * Recursive deletion includes tasks, replay receipts and count metadata.
 * A failure must propagate so the deletion request remains retryable.
 */
async function purgeScheduleTodos(uid, removeTree) {
    if (!uid || uid.length > 128 || uid.includes('/'))
        throw new Error('Invalid account purge scope.');
    await removeTree(`scheduleTodoAccounts/${uid}`);
}
//# sourceMappingURL=schedule-todo-purge.js.map