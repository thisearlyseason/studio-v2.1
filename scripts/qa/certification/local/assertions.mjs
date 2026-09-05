export async function awaitEventually(label, probe, predicate, {
  timeoutMs = 5_000,
  intervalMs = 25,
} = {}) {
  if (typeof probe !== 'function' || typeof predicate !== 'function') throw new TypeError('Eventual assertion requires probe and predicate functions.');
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  do {
    lastValue = await probe();
    if (predicate(lastValue)) return lastValue;
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, Math.max(1, deadline - Date.now()))));
  } while (Date.now() <= deadline);
  throw new Error(`Timed out waiting for ${label}.`);
}

export async function runTwoParty(label, callbacks, { timeoutMs = 5_000 } = {}) {
  if (!Array.isArray(callbacks) || callbacks.length !== 2 || callbacks.some(callback => typeof callback !== 'function')) {
    throw new Error(`${label} requires exactly two participant callbacks.`);
  }
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = callbacks.map(callback => Promise.resolve().then(async () => {
    await gate;
    return callback();
  }));
  queueMicrotask(release);
  let timer;
  try {
    return await Promise.race([
      Promise.allSettled(ready),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} two-party barrier timed out.`)), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
