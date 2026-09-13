package pro.thesquad.shell;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.ArrayList;
import java.util.List;

@RunWith(AndroidJUnit4.class)
public final class ShellLifecycleControllerInstrumentedTest {
    private static final StoreDestination DESTINATION =
            StoreDestination.parse("https://store.example.com");

    @Test
    public void missingOriginShowsSetupAndNeverChecksOrLoads() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ShellLifecycleController controller =
                new ShellLifecycleController(null, bootstrap, renderer);

        controller.foreground();

        assertEquals(ShellLifecycleController.NativeState.SETUP_REQUIRED, renderer.state);
        assertFalse(renderer.contentVisible);
        assertTrue(bootstrap.checks.isEmpty());
        assertTrue(renderer.loadedUrls.isEmpty());
    }

    @Test
    public void failedCheckShowsFailureAndRetryStartsNewGeneration() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ShellLifecycleController controller =
                new ShellLifecycleController(DESTINATION, bootstrap, renderer);

        controller.foreground();
        assertEquals(ShellLifecycleController.NativeState.CHECKING, renderer.state);
        bootstrap.checks.get(0).completion.accept(false);
        assertEquals(ShellLifecycleController.NativeState.FAILED, renderer.state);

        controller.retry();
        assertEquals(2, bootstrap.checks.size());
        assertEquals(ShellLifecycleController.NativeState.CHECKING, renderer.state);
        assertFalse(renderer.contentVisible);
    }

    @Test
    public void staleSuccessCannotReplaceNewerFailure() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ShellLifecycleController controller =
                new ShellLifecycleController(DESTINATION, bootstrap, renderer);

        controller.foreground();
        controller.background();
        assertTrue(bootstrap.checks.get(0).cancellation.cancelled);
        controller.foreground();
        bootstrap.checks.get(1).completion.accept(false);
        bootstrap.checks.get(0).completion.accept(true);

        assertEquals(ShellLifecycleController.NativeState.FAILED, renderer.state);
        assertFalse(renderer.contentVisible);
        assertTrue(renderer.loadedUrls.isEmpty());
    }

    @Test
    public void oldPageCompletionStaysHiddenUntilForegroundBootstrapPasses() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ShellLifecycleController controller =
                new ShellLifecycleController(DESTINATION, bootstrap, renderer);

        controller.foreground();
        bootstrap.checks.get(0).completion.accept(true);
        assertEquals(
                "https://store.example.com/dashboard",
                renderer.loadedUrls.get(0));
        controller.pageFinished("https://store.example.com/dashboard");
        assertTrue(renderer.contentVisible);

        controller.background();
        controller.foreground();
        controller.pageFinished("https://store.example.com/dashboard");
        assertFalse(renderer.contentVisible);
        assertEquals(ShellLifecycleController.NativeState.CHECKING, renderer.state);

        bootstrap.checks.get(1).completion.accept(true);
        assertTrue(renderer.contentVisible);
        assertEquals(1, renderer.loadedUrls.size());
    }

    @Test
    public void pageFailureRequiresReloadAfterSuccessfulRetry() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ShellLifecycleController controller =
                new ShellLifecycleController(DESTINATION, bootstrap, renderer);

        controller.foreground();
        bootstrap.checks.get(0).completion.accept(true);
        controller.pageFailed();
        assertEquals(ShellLifecycleController.NativeState.FAILED, renderer.state);
        assertFalse(renderer.contentVisible);

        controller.retry();
        bootstrap.checks.get(1).completion.accept(true);
        assertEquals(2, renderer.loadedUrls.size());
        assertFalse(renderer.contentVisible);
    }

    @Test
    public void destroyCancelsPendingCheckAndIgnoresCompletion() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ShellLifecycleController controller =
                new ShellLifecycleController(DESTINATION, bootstrap, renderer);

        controller.foreground();
        controller.destroy();
        bootstrap.checks.get(0).completion.accept(true);

        assertTrue(bootstrap.checks.get(0).cancellation.cancelled);
        assertFalse(renderer.contentVisible);
        assertTrue(renderer.loadedUrls.isEmpty());
    }

    private static final class ControlledBootstrap implements StoreBootstrapChecking {
        private final List<Check> checks = new ArrayList<>();

        @Override
        public BootstrapCancellation check(
                StoreDestination destination,
                java.util.function.Consumer<Boolean> completion) {
            ControlledCancellation cancellation = new ControlledCancellation();
            checks.add(new Check(destination, completion, cancellation));
            return cancellation;
        }
    }

    private static final class ControlledCancellation implements BootstrapCancellation {
        private boolean cancelled;

        @Override
        public void cancel() {
            cancelled = true;
        }
    }

    private static final class Check {
        private final StoreDestination destination;
        private final java.util.function.Consumer<Boolean> completion;
        private final ControlledCancellation cancellation;

        private Check(
                StoreDestination destination,
                java.util.function.Consumer<Boolean> completion,
                ControlledCancellation cancellation) {
            this.destination = destination;
            this.completion = completion;
            this.cancellation = cancellation;
        }
    }

    private static final class RecordingRenderer implements ShellLifecycleController.Renderer {
        private ShellLifecycleController.NativeState state;
        private boolean contentVisible;
        private final List<String> loadedUrls = new ArrayList<>();

        @Override
        public void showNative(ShellLifecycleController.NativeState state) {
            this.state = state;
            contentVisible = false;
        }

        @Override
        public void showContent() {
            state = ShellLifecycleController.NativeState.CONTENT;
            contentVisible = true;
        }

        @Override
        public void loadDashboard(String url) {
            loadedUrls.add(url);
            contentVisible = false;
        }
    }
}
