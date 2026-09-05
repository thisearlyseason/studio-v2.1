export async function awaitEventually(label, probe, predicate, {
  timeoutMs = 5_000,
  intervalMs = 25,
  terminate,
} = {}) {
  if (typeof probe !== 'function' || typeof predicate !== 'function') throw new TypeError('Eventual assertion requires probe and predicate functions.');
  if (typeof terminate !== 'function') throw new Error(`${label} requires an owned terminator before starting its probe.`);
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  do {
    const remainingMs = Math.max(1, deadline - Date.now());
    const controller = new AbortController();
    let timer;
    const timedOut = Symbol('probe-timeout');
    const probePromise = Promise.resolve().then(() => probe(controller.signal));
    lastValue = await Promise.race([
      probePromise,
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(timedOut); }, remainingMs); }),
    ]).finally(() => clearTimeout(timer));
    if (lastValue === timedOut) {
      let terminationError;
      try {
        await terminate({ settled: probePromise, signal: controller.signal });
      } catch (error) {
        terminationError = error;
      }
      await probePromise.catch(() => undefined);
      if (terminationError) throw new AggregateError([terminationError], `Unable to terminate ${label} probe.`, { cause: terminationError });
      break;
    }
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
  if (typeof terminate !== 'function') {
    throw new Error(`${label} requires an owned terminator before starting participant callbacks.`);
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
        let terminationError;
        try {
          await terminate({ settled, signal: controller.signal });
        } catch (error) {
          terminationError = error;
        }
        // A valid terminator owns the worker/server boundary and does not
        // return until it is impossible for the callbacks to mutate again.
        // Therefore settlement is awaited without exposing cleanup early.
        await settled;
        if (terminationError) {
          throw new AggregateError([terminationError], `${label} two-party barrier termination failed.`, { cause: terminationError });
        }
      }
      throw new Error(`${label} two-party barrier timed out.`);
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
