export async function awaitEventually(label, probe, predicate, {
  timeoutMs = 5_000,
  intervalMs = 25,
} = {}) {
  if (typeof probe !== 'function' || typeof predicate !== 'function') throw new TypeError('Eventual assertion requires probe and predicate functions.');
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  do {
    const remainingMs = Math.max(1, deadline - Date.now());
    const controller = new AbortController();
    let timer;
    const timedOut = Symbol('probe-timeout');
    lastValue = await Promise.race([
      Promise.resolve().then(() => probe(controller.signal)),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(timedOut); }, remainingMs); }),
    ]).finally(() => clearTimeout(timer));
    if (lastValue === timedOut) break;
    if (predicate(lastValue)) return lastValue;
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, Math.max(1, deadline - Date.now()))));
  } while (Date.now() <= deadline);
  throw new Error(`Timed out waiting for ${label}.`);
}

export async function runTwoParty(label, callbacks, {
  timeoutMs = 5_000,
  settleTimeoutMs = 1_000,
  terminate,
} = {}) {
  if (!Array.isArray(callbacks) || callbacks.length !== 2 || callbacks.some(callback => typeof callback !== 'function')) {
    throw new Error(`${label} requires exactly two participant callbacks.`);
  }
  let release;
  const controller = new AbortController();
  const gate = new Promise(resolve => { release = resolve; });
  const ready = callbacks.map(callback => Promise.resolve().then(async () => {
    await gate;
    return callback(controller.signal);
  }));
  queueMicrotask(release);
  let timer;
  try {
    const settled = Promise.allSettled(ready);
    const timeout = Symbol('timeout');
    const result = await Promise.race([
      settled,
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(timeout); }, timeoutMs); }),
    ]);
    if (result === timeout) {
      const waitForSettlement = () => Promise.race([
        settled.then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), settleTimeoutMs)),
      ]);
      if (!await waitForSettlement()) {
        if (typeof terminate !== 'function') {
          throw new Error(`${label} two-party barrier timed out with a noncooperative participant and no owned terminator.`);
        }
        await terminate();
        if (!await waitForSettlement()) {
          throw new Error(`${label} two-party barrier termination did not settle every participant.`);
        }
      }
      throw new Error(`${label} two-party barrier timed out.`);
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
