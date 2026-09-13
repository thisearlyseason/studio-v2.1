package pro.thesquad.shell;

final class ShellLifecycleController {
    static final long INVALID_NAVIGATION_GENERATION = -1;

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

    private BootstrapCancellation cancellation;
    private long generation;
    private long navigationGeneration;
    private boolean active;
    private boolean destroyed;
    private boolean verified;
    private boolean pageReady;

    ShellLifecycleController(
            StoreDestination destination,
            StoreBootstrapChecking bootstrap,
            Renderer renderer) {
        this.destination = destination;
        this.bootstrap = bootstrap;
        this.renderer = renderer;
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
        navigationGeneration += 1;
        pageReady = false;
        return navigationGeneration;
    }

    void pageFinished(long callbackGeneration, String url) {
        if (destroyed
                || callbackGeneration != navigationGeneration
                || destination == null
                || !destination.allows(url)) {
            return;
        }
        pageReady = true;
        if (active && verified) {
            renderer.showContent();
        }
    }

    boolean pageFailed(long callbackGeneration) {
        if (destroyed || callbackGeneration != navigationGeneration) {
            return false;
        }
        navigationGeneration += 1;
        verified = false;
        pageReady = false;
        invalidatePendingCheck();
        if (active) {
            renderer.showNative(NativeState.FAILED);
        }
        return true;
    }

    void destroy() {
        if (destroyed) {
            return;
        }
        destroyed = true;
        active = false;
        verified = false;
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

    private void invalidatePendingCheck() {
        generation += 1;
        BootstrapCancellation previous = cancellation;
        cancellation = null;
        if (previous != null) {
            previous.cancel();
        }
    }
}
