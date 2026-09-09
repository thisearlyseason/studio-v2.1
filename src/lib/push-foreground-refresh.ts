type EventSurface = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

type VisibilitySurface = EventSurface & {
  visibilityState: string;
};

/**
 * Installed PWAs can survive a deployment without remounting React. Retry the
 * idempotent push registration whenever that app returns to the foreground so
 * a rotated VAPID key is adopted without requiring a reinstall.
 */
export function listenForPushForegroundRefresh({
  page,
  documentSurface,
  onForeground,
}: {
  page: EventSurface;
  documentSurface: VisibilitySurface;
  onForeground: () => void;
}): () => void {
  const handlePageShow = () => onForeground();
  const handleVisibilityChange = () => {
    if (documentSurface.visibilityState === 'visible') onForeground();
  };

  page.addEventListener('pageshow', handlePageShow);
  documentSurface.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    page.removeEventListener('pageshow', handlePageShow);
    documentSurface.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
