import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

// Execute the page's real assignment effects and handlers with a small hook host.
// Only the auth/network boundary is supplied by each test.
export async function teamAssignmentPage(overrides = {}) {
  const source = await readFile(new URL('../../src/app/(dashboard)/team/page.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const [assignment');
  const block = source.slice(start, source.indexOf('  const [editForm, setEditForm]'));
  const code = (await transform(`${block}\nreturn {
    assignments,
    error: typeof assignmentError === 'undefined' ? null : assignmentError,
    loading: typeof isAssignmentsLoading === 'undefined' ? false : isAssignmentsLoading,
    retry: () => refreshAssignments.current(),
    respond: handleAssignmentResponse,
  };`, { loader: 'ts' })).code;
  const dependencies = {
    firebaseAuth: {},
    activeTeam: { id: 'squad', isDemo: false, planId: 'elite_league' },
    authUser: { uid: 'staff', isAnonymous: false },
    isStaff: true,
    hasFeature: () => true,
    getAuthToken: async () => 'token',
    fetch: async () => Response.json({ assignments: [] }),
    authHeader: token => ({ Authorization: `Bearer ${token}` }),
    respondToAssignment: async () => true,
    ...overrides,
  };
  const slots = [];
  let cursor = 0;
  let pending = [];
  const useState = initial => {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
    return [slots[index].value, next => {
      slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
    }];
  };
  const useRef = current => {
    const index = cursor++;
    if (!slots[index]) slots[index] = { current };
    return slots[index];
  };
  const useEffect = (effect, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) {
      pending.push(() => {
        previous?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    }
  };
  const execute = new Function('useState', 'useRef', 'useEffect', ...Object.keys(dependencies), code);
  const render = (updates = {}) => {
    Object.assign(dependencies, updates);
    cursor = 0;
    pending = [];
    const view = execute(useState, useRef, useEffect, ...Object.values(dependencies));
    for (const effect of pending) effect();
    return view;
  };
  return {
    render,
    async settle() {
      await new Promise(resolve => setImmediate(resolve));
      return render();
    },
    dispose() {
      for (const slot of slots) slot?.cleanup?.();
    },
  };
}
