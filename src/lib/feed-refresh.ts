/** One request at a time, with late results suppressed after user/team/unmount cleanup. */
export function startFeedRefresh<T>({load,onValue,onError,schedule=setTimeout,cancel=clearTimeout}: {
  load: (signal: AbortSignal) => Promise<T>;
  onValue: (value:T)=>void;
  onError: (error:unknown)=>void;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = async () => {
    try { const value = await load(controller.signal); if (!controller.signal.aborted) onValue(value); }
    catch(error) { if (!controller.signal.aborted) onError(error); }
    finally { if (!controller.signal.aborted) timer = schedule(refresh,1000); }
  };
  void refresh();
  return () => { controller.abort(); if (timer !== undefined) cancel(timer); };
}
