package pro.thesquad.shell;

final class ShellLifecycleController {
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

    void pageFinished(String url) {
        if (destroyed || destination == null || !destination.allows(url)) {
            return;
        }
        pageReady = true;
        if (active && verified) {
            renderer.showContent();
        }
    }

    void pageFailed() {
        if (destroyed) {
            return;
        }
        verified = false;
        pageReady = false;
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
