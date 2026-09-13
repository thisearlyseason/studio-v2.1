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
        long pageGeneration =
                controller.navigationStarted("https://store.example.com/dashboard");
        controller.pageCommitted(pageGeneration, "https://store.example.com/dashboard");
        controller.pageFinished(pageGeneration, "https://store.example.com/dashboard");
        assertTrue(renderer.contentVisible);

        controller.background();
        controller.foreground();
        controller.pageFinished(pageGeneration, "https://store.example.com/dashboard");
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
        ControlledDeadlines deadlines = new ControlledDeadlines();
        ShellLifecycleController controller = new ShellLifecycleController(
                DESTINATION, bootstrap, renderer, deadlines);

        controller.foreground();
        bootstrap.checks.get(0).completion.accept(true);
        long firstGeneration =
                controller.navigationStarted("https://store.example.com/dashboard");
        controller.pageFailed(firstGeneration);
        assertEquals(ShellLifecycleController.NativeState.FAILED, renderer.state);
        assertFalse(renderer.contentVisible);

        controller.retry();
        bootstrap.checks.get(1).completion.accept(true);
        assertEquals(2, renderer.loadedUrls.size());
        assertFalse(renderer.contentVisible);
    }

    @Test
    public void committedFinishedPageCancelsAndOutlivesItsDeadline() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ControlledDeadlines deadlines = new ControlledDeadlines();
        ShellLifecycleController controller = new ShellLifecycleController(
                DESTINATION, bootstrap, renderer, deadlines);

        controller.foreground();
        bootstrap.checks.get(0).completion.accept(true);
        long generation =
                controller.navigationStarted("https://store.example.com/dashboard");
        controller.pageCommitted(generation, "https://store.example.com/dashboard");
        controller.pageFinished(generation, "https://store.example.com/dashboard");

        assertTrue(renderer.contentVisible);
        assertTrue(deadlines.scheduled.get(0).cancelled);
        deadlines.scheduled.get(0).action.run();
        assertTrue(renderer.contentVisible);
        assertEquals(ShellLifecycleController.NativeState.CONTENT, renderer.state);
    }

    @Test
    public void staleDeadlineCannotFailNewerNavigation() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ControlledDeadlines deadlines = new ControlledDeadlines();
        ShellLifecycleController controller = new ShellLifecycleController(
                DESTINATION, bootstrap, renderer, deadlines);

        controller.foreground();
        bootstrap.checks.get(0).completion.accept(true);
        controller.navigationStarted("https://store.example.com/first");
        long newerGeneration =
                controller.navigationStarted("https://store.example.com/second");

        assertTrue(deadlines.scheduled.get(0).cancelled);
        deadlines.scheduled.get(0).action.run();
        controller.pageCommitted(newerGeneration, "https://store.example.com/second");
        controller.pageFinished(newerGeneration, "https://store.example.com/second");

        assertTrue(renderer.contentVisible);
        assertEquals(ShellLifecycleController.NativeState.CONTENT, renderer.state);
    }

    @Test
    public void pageFinishWithoutCommitCannotRevealContent() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ControlledDeadlines deadlines = new ControlledDeadlines();
        ShellLifecycleController controller = new ShellLifecycleController(
                DESTINATION, bootstrap, renderer, deadlines);

        controller.foreground();
        bootstrap.checks.get(0).completion.accept(true);
        long generation =
                controller.navigationStarted("https://store.example.com/dashboard");

        controller.pageFinished(generation, "https://store.example.com/dashboard");

        assertFalse(renderer.contentVisible);
    }

    @Test
    public void navigationWithoutTrustedCompletionSchedulesThirtySecondFailure() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ControlledDeadlines deadlines = new ControlledDeadlines();
        ShellLifecycleController controller = new ShellLifecycleController(
                DESTINATION, bootstrap, renderer, deadlines);

        controller.foreground();
        bootstrap.checks.get(0).completion.accept(true);
        controller.navigationStarted("https://store.example.com/dashboard");

        assertEquals(1, deadlines.scheduled.size());
        assertEquals(30_000, deadlines.scheduled.get(0).delayMillis);
        deadlines.scheduled.get(0).action.run();
        assertEquals(ShellLifecycleController.NativeState.FAILED, renderer.state);
        assertFalse(renderer.contentVisible);
    }

    @Test
    public void latePageFinishAfterFailureCannotSatisfyRetry() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ShellLifecycleController controller =
                new ShellLifecycleController(DESTINATION, bootstrap, renderer);

        controller.foreground();
        bootstrap.checks.get(0).completion.accept(true);
        long failedGeneration =
                controller.navigationStarted("https://store.example.com/dashboard");
        controller.pageFailed(failedGeneration);
        controller.pageFinished(failedGeneration, "https://store.example.com/dashboard");

        controller.retry();
        bootstrap.checks.get(1).completion.accept(true);

        assertEquals(2, renderer.loadedUrls.size());
        assertFalse(renderer.contentVisible);
    }

    @Test
    public void latePageFailureCannotOverrideNewerSuccessfulNavigation() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ShellLifecycleController controller =
                new ShellLifecycleController(DESTINATION, bootstrap, renderer);

        controller.foreground();
        bootstrap.checks.get(0).completion.accept(true);
        long failedGeneration =
                controller.navigationStarted("https://store.example.com/dashboard");
        controller.pageFailed(failedGeneration);

        controller.retry();
        bootstrap.checks.get(1).completion.accept(true);
        long successfulGeneration =
                controller.navigationStarted("https://store.example.com/dashboard");
        controller.pageCommitted(
                successfulGeneration, "https://store.example.com/dashboard");
        controller.pageFinished(successfulGeneration, "https://store.example.com/dashboard");
        controller.pageFailed(failedGeneration);

        assertTrue(renderer.contentVisible);
        assertEquals(ShellLifecycleController.NativeState.CONTENT, renderer.state);
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

    @Test
    public void rendererDeathBeforeNavigationInvalidatesPendingCheck() {
        ControlledBootstrap bootstrap = new ControlledBootstrap();
        RecordingRenderer renderer = new RecordingRenderer();
        ShellLifecycleController controller =
                new ShellLifecycleController(DESTINATION, bootstrap, renderer);

        controller.foreground();
        controller.webViewFailed();
        bootstrap.checks.get(0).completion.accept(true);

        assertTrue(bootstrap.checks.get(0).cancellation.cancelled);
        assertEquals(ShellLifecycleController.NativeState.FAILED, renderer.state);
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

    private static final class ControlledDeadlines implements NavigationDeadlineScheduling {
        private final List<Deadline> scheduled = new ArrayList<>();

        @Override
        public NavigationDeadlineCancellation schedule(long delayMillis, Runnable action) {
            Deadline deadline = new Deadline(delayMillis, action);
            scheduled.add(deadline);
            return () -> deadline.cancelled = true;
        }
    }

    private static final class Deadline {
        private final long delayMillis;
        private final Runnable action;
        private boolean cancelled;

        private Deadline(long delayMillis, Runnable action) {
            this.delayMillis = delayMillis;
            this.action = action;
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
