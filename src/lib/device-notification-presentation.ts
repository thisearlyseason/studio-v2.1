'use client';

type BadgeNavigator = Navigator & {
  setAppBadge?: (count: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** Best-effort OS presentation cleanup; never changes server unread state. */
export async function clearDeviceNotifications(chat?: { chatId: string; teamId: string }): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  const device = navigator as BadgeNavigator;
  const cleanup = async () => {
    let remaining = 0;
    try {
      const registration = await device.serviceWorker?.getRegistration('/');
      const notifications = await registration?.getNotifications() || [];
      for (const notification of notifications) {
        let matches = !chat;
        if (chat && typeof notification.data?.url === 'string') {
          const url = new URL(notification.data.url, window.location.origin);
          matches = url.origin === window.location.origin &&
            url.pathname === `/chats/${chat.chatId}` && url.searchParams.get('teamId') === chat.teamId;
        }
        if (matches) notification.close();
        else remaining += 1;
      }
    } catch {
      // A failed scoped lookup must not erase other teams' pending badge state.
      if (chat) return;
    }
    try {
      if (remaining) await device.setAppBadge?.(remaining);
      else await device.clearAppBadge?.();
    } catch {
      // OS presentation failures must not block read, opt-out, or sign-out.
    }
  };
  try {
    // Match the worker's lock so an older read/opt-out cannot erase a newer push
    // badge while notification lookup is awaiting the browser.
    if (device.locks?.request) await device.locks.request('squad-notification-presentation', cleanup);
    else await cleanup();
  } catch {
    // A browser shutting down its lock manager must not prevent sign-out.
  }
}
