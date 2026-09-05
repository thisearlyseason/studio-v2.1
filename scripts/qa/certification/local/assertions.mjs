async function settleWithin(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function terminateOwnedProcess(child, sendSignal, {
  gracefulTimeoutMs = 5_000,
  killTimeoutMs = 2_000,
} = {}) {
  if (!child || child.exitCode !== null || child.signalCode) return Object.freeze({ terminated: true, alreadyExited: true });
  if (typeof child.once !== 'function' || typeof sendSignal !== 'function') {
    throw new Error('Owned process termination requires an observable child and signal owner.');
  }
  const exited = new Promise(resolve => child.once('exit', () => resolve(true)));
  sendSignal('SIGTERM');
  if (!await settleWithin(exited, gracefulTimeoutMs)) {
    sendSignal('SIGKILL');
    if (!await settleWithin(exited, killTimeoutMs)) {
      throw new Error(`Owned process ${child.pid ?? 'unknown'} exit was not observed after SIGKILL.`);
    }
  }
  return Object.freeze({ terminated: true, alreadyExited: false });
}

export async function awaitEventually(label, probe, predicate, {
  timeoutMs = 5_000,
  intervalMs = 25,
  terminationTimeoutMs = 8_000,
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
        const termination = Promise.resolve().then(() => terminate({ settled: probePromise, signal: controller.signal }));
        const bounded = await settleWithin(Promise.race([
          termination.then(() => true, error => { terminationError = error; return false; }),
        ]), terminationTimeoutMs);
        if (!bounded && !terminationError) terminationError = new Error('owned termination did not settle within its bound');
      } catch (error) {
        terminationError = error;
      }
      if (terminationError) throw new AggregateError([terminationError], `Unable to terminate ${label} probe.`, { cause: terminationError });
      await settleWithin(probePromise.then(() => true, () => true), Math.max(1, intervalMs));
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
  terminationTimeoutMs = 8_000,
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
      // Client-side AbortSignal settlement says nothing about whether the
      // owned server handler can still commit. Always terminate and verify the
      // owned worker/server boundary after a mutating timeout.
      let terminationError;
      const termination = Promise.resolve().then(() => terminate({ settled, signal: controller.signal }));
      const terminatedWithinBound = await settleWithin(Promise.race([
        termination.then(() => true, error => { terminationError = error; return false; }),
      ]), terminationTimeoutMs);
      if (!terminatedWithinBound && !terminationError) {
        terminationError = new Error('owned termination did not settle within its bound');
      }
      if (terminationError) {
        throw new AggregateError([terminationError], `${label} two-party barrier termination failed.`, { cause: terminationError });
      }
      // The server boundary is now dead/settled. Give local client promises a
      // bounded opportunity to release without making safety depend on them.
      await settleWithin(settled.then(() => true), settleTimeoutMs);
      throw new Error(`${label} two-party barrier timed out.`);
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
