import { todosStorageKey, type ScheduleTodo } from './storage';

/** Navigation must not overwrite a newer copy from another tab or clear an outbox. */
export function verifyTasksBeforeExit(storage: Pick<Storage, 'getItem'>, uid: string, todos: ScheduleTodo[]) {
  if (!uid) return;
  if (storage.getItem(todosStorageKey(uid)) !== JSON.stringify(todos)) {
    throw new Error('Device tasks are not confirmed saved. Stay here and review before leaving.');
  }
}
