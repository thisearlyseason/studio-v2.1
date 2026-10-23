/** Transport scheduling only. The outbox continues to own auth, locks and CAS. */
export function createAutomaticTasks(deps: {
  eligible(): boolean;
  online(): boolean;
  pending(): boolean;
  synchronize(refresh: boolean): Promise<void>;
  failed(error: unknown): void;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
}) {
  const schedule = deps.schedule ?? setTimeout, cancel = deps.cancel ?? clearTimeout;
  let stopped = false, running = false, requestedRefresh = false, retry = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  function arm(delay: number) {
    if (stopped || timer !== null || running) return;
    timer = schedule(() => { timer = null; void tick(); }, delay);
  }
  async function tick() {
    if (stopped || running || !deps.online() || !deps.eligible()) return;
    if (!requestedRefresh && !deps.pending()) return;
    const refresh = requestedRefresh; requestedRefresh = false; running = true;
    let failed = false;
    try { await deps.synchronize(refresh); retry = 1000; }
    catch (error) { failed = true; if (!stopped) deps.failed(error); }
    finally {
      running = false;
      if (!stopped && deps.online() && deps.eligible() && (requestedRefresh || deps.pending())) {
        arm(failed ? retry : 100); if (failed) retry = Math.min(retry * 2, 60000);
      }
    }
  }
  return {
    wake(refresh = false) { if (stopped) return; requestedRefresh ||= refresh; arm(100); },
    stop() { stopped = true; if (timer !== null) cancel(timer); timer = null; },
  };
}
