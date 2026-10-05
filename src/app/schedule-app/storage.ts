import type { SyncEvent } from './sync';

export interface ScheduleTodo {
  id: string;
  text: string;
  dueDate: string;
  completed: boolean;
  createdAt: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = 'squad_schedule_v2';

function segment(value: string): string {
  return encodeURIComponent(value);
}

export function todosStorageKey(userId: string): string {
  return `${PREFIX}:user:${segment(userId)}:todos`;
}

export function eventsStorageKey(userId: string, teamId: string): string {
  return `${PREFIX}:user:${segment(userId)}:team:${segment(teamId)}:events`;
}

export function scopedLastTeamKey(userId: string): string {
  return `${PREFIX}:user:${segment(userId)}:last-team`;
}

function parseArray(storage: StorageLike, key: string): unknown[] {
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isTodo(value: unknown): value is ScheduleTodo {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.text === 'string'
    && typeof item.dueDate === 'string'
    && typeof item.completed === 'boolean'
    && typeof item.createdAt === 'string';
}

function isEvent(value: unknown): value is SyncEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === 'string'
    && typeof event.title === 'string'
    && typeof event.date === 'string'
    && typeof event.eventType === 'string';
}

export function loadScopedTodos(storage: StorageLike, userId: string): ScheduleTodo[] {
  if (!userId) return [];
  return parseArray(storage, todosStorageKey(userId)).filter(isTodo);
}

export function saveScopedTodos(storage: StorageLike, userId: string, todos: ScheduleTodo[]): void {
  if (!userId) return;
  storage.setItem(todosStorageKey(userId), JSON.stringify(todos.filter(isTodo)));
}

export function loadScopedEvents(storage: StorageLike, userId: string, teamId: string): SyncEvent[] {
  if (!userId || !teamId) return [];
  return parseArray(storage, eventsStorageKey(userId, teamId)).filter(isEvent);
}

export function saveScopedEvents(storage: StorageLike, userId: string, teamId: string, events: SyncEvent[]): void {
  if (!userId || !teamId) return;
  storage.setItem(eventsStorageKey(userId, teamId), JSON.stringify(events.filter(isEvent)));
}
