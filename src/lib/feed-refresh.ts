/** One request at a time, with late results suppressed after user/team/unmount cleanup. */
export function startFeedRefresh<T>({load,onValue,onError,schedule=setTimeout,cancel=clearTimeout,pauseOn}: {
  load: (signal: AbortSignal) => Promise<T>;
  onValue: (value:T)=>void;
  onError: (error:unknown)=>void;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
  pauseOn?: {target: Pick<EventTarget,'addEventListener'|'removeEventListener'>; eventName: string; resumeEventName: string};
}) {
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let paused = false;
  let refreshing = false;
  let resumePending = false;
  const pause = () => {
    if (stopped || paused) return;
    paused = true;
    controller?.abort();
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const resume = () => {
    if (stopped || !paused) return;
    paused = false;
    if (refreshing) resumePending = true;
    else void refresh();
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller?.abort();
    if (timer !== undefined) cancel(timer);
    pauseOn?.target.removeEventListener(pauseOn.eventName,pause);
    pauseOn?.target.removeEventListener(pauseOn.resumeEventName,resume);
  };
  pauseOn?.target.addEventListener(pauseOn.eventName,pause);
  pauseOn?.target.addEventListener(pauseOn.resumeEventName,resume);
  const refresh = async () => {
    if (stopped || paused) return;
    controller = new AbortController();
    const activeController = controller;
    refreshing = true;
    try { const value = await load(activeController.signal); if (!stopped && !paused && !activeController.signal.aborted) onValue(value); }
    catch(error) { if (!stopped && !paused && !activeController.signal.aborted) onError(error); }
    finally {
      refreshing = false;
      if (stopped || paused) return;
      if (resumePending) { resumePending = false; void refresh(); }
      else if (activeController.signal.aborted) return;
      else timer = schedule(refresh,1000);
    }
  };
  void refresh();
  return stop;
}
