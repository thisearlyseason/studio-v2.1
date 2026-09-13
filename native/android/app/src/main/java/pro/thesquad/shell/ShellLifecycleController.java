package pro.thesquad.shell;

import android.os.Handler;
import android.os.Looper;

interface NavigationDeadlineCancellation {
    void cancel();
}

interface NavigationDeadlineScheduling {
    NavigationDeadlineCancellation schedule(long delayMillis, Runnable action);
}

final class MainThreadNavigationDeadlineScheduler implements NavigationDeadlineScheduling {
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public NavigationDeadlineCancellation schedule(long delayMillis, Runnable action) {
        handler.postDelayed(action, delayMillis);
        return () -> handler.removeCallbacks(action);
    }
}

final class ShellLifecycleController {
    static final long INVALID_NAVIGATION_GENERATION = -1;
    static final long NAVIGATION_TIMEOUT_MILLIS = 30_000;

    enum NativeState {
        CHECKING,
        SETUP_REQUIRED,
        FAILED,
        CONTENT
    }

    interface Renderer {
        void showNative(NativeState state);

        void showContent();

        void loadDashboard(String url);
    }

    private final StoreDestination destination;
    private final StoreBootstrapChecking bootstrap;
    private final Renderer renderer;
    private final NavigationDeadlineScheduling deadlineScheduler;

    private BootstrapCancellation cancellation;
    private NavigationDeadlineCancellation navigationDeadline;
    private long generation;
    private long navigationGeneration;
    private long deadlineToken;
    private boolean active;
    private boolean destroyed;
    private boolean verified;
    private boolean pageReady;
    private boolean pageCommitted;
    private boolean pageFinished;

    ShellLifecycleController(
            StoreDestination destination,
            StoreBootstrapChecking bootstrap,
            Renderer renderer) {
        this(
                destination,
                bootstrap,
                renderer,
                new MainThreadNavigationDeadlineScheduler());
    }

    ShellLifecycleController(
            StoreDestination destination,
            StoreBootstrapChecking bootstrap,
            Renderer renderer,
            NavigationDeadlineScheduling deadlineScheduler) {
        this.destination = destination;
        this.bootstrap = bootstrap;
        this.renderer = renderer;
        this.deadlineScheduler = deadlineScheduler;
    }

    void foreground() {
        if (destroyed) {
            return;
        }
        active = true;
        beginCheck();
    }

    void background() {
        if (destroyed) {
            return;
        }
        active = false;
        verified = false;
        invalidatePendingCheck();
        renderer.showNative(NativeState.CHECKING);
    }

    void retry() {
        if (destroyed) {
            return;
        }
        active = true;
        beginCheck();
    }

    long navigationStarted(String url) {
        if (destroyed || destination == null || !destination.allows(url)) {
            return INVALID_NAVIGATION_GENERATION;
        }
        cancelNavigationDeadline();
        navigationGeneration += 1;
        pageReady = false;
        pageCommitted = false;
        pageFinished = false;
        long startedGeneration = navigationGeneration;
        long startedDeadlineToken = ++deadlineToken;
        navigationDeadline = deadlineScheduler.schedule(
                NAVIGATION_TIMEOUT_MILLIS,
                () -> navigationTimedOut(startedGeneration, startedDeadlineToken));
        return navigationGeneration;
    }

    void pageCommitted(long callbackGeneration, String url) {
        if (!isCurrentAllowedNavigation(callbackGeneration, url)) {
            return;
        }
        pageCommitted = true;
        completePageIfReady();
    }

    void pageFinished(long callbackGeneration, String url) {
        if (!isCurrentAllowedNavigation(callbackGeneration, url)) {
            return;
        }
        pageFinished = true;
        completePageIfReady();
    }

    boolean pageFailed(long callbackGeneration) {
        if (destroyed || callbackGeneration != navigationGeneration) {
            return false;
        }
        failCurrentPage();
        return true;
    }

    void webViewFailed() {
        if (destroyed) {
            return;
        }
        failCurrentPage();
    }

    private void failCurrentPage() {
        cancelNavigationDeadline();
        navigationGeneration += 1;
        verified = false;
        pageReady = false;
        pageCommitted = false;
        pageFinished = false;
        invalidatePendingCheck();
        if (active) {
            renderer.showNative(NativeState.FAILED);
        }
    }

    void destroy() {
        if (destroyed) {
            return;
        }
        destroyed = true;
        active = false;
        verified = false;
        cancelNavigationDeadline();
        navigationGeneration += 1;
        invalidatePendingCheck();
    }

    private void beginCheck() {
        verified = false;
        invalidatePendingCheck();
        renderer.showNative(NativeState.CHECKING);
        if (destination == null) {
            renderer.showNative(NativeState.SETUP_REQUIRED);
            return;
        }

        long checkGeneration = generation;
        BootstrapCancellation started = bootstrap.check(
                destination,
                accepted -> completeCheck(checkGeneration, accepted));
        if (isCurrent(checkGeneration)) {
            cancellation = started;
        } else {
            started.cancel();
        }
    }

    private void completeCheck(long checkGeneration, boolean accepted) {
        if (!isCurrent(checkGeneration)) {
            return;
        }
        cancellation = null;
        if (!accepted) {
            renderer.showNative(NativeState.FAILED);
            return;
        }

        verified = true;
        if (pageReady) {
            renderer.showContent();
        } else {
            renderer.loadDashboard(destination.origin() + "/dashboard");
        }
    }

    private boolean isCurrent(long checkGeneration) {
        return !destroyed && active && generation == checkGeneration;
    }

    private boolean isCurrentAllowedNavigation(long callbackGeneration, String url) {
        return !destroyed
                && callbackGeneration == navigationGeneration
                && destination != null
                && destination.allows(url);
    }

    private void completePageIfReady() {
        if (!pageCommitted || !pageFinished) {
            return;
        }
        pageReady = true;
        cancelNavigationDeadline();
        if (active && verified) {
            renderer.showContent();
        }
    }

    private void navigationTimedOut(long callbackGeneration, long callbackDeadlineToken) {
        if (destroyed
                || callbackGeneration != navigationGeneration
                || callbackDeadlineToken != deadlineToken
                || pageReady) {
            return;
        }
        navigationDeadline = null;
        deadlineToken += 1;
        failCurrentPage();
    }

    private void cancelNavigationDeadline() {
        deadlineToken += 1;
        NavigationDeadlineCancellation previous = navigationDeadline;
        navigationDeadline = null;
        if (previous != null) {
            previous.cancel();
        }
    }

    private void invalidatePendingCheck() {
        generation += 1;
        BootstrapCancellation previous = cancellation;
        cancellation = null;
        if (previous != null) {
            previous.cancel();
        }
    }
}
