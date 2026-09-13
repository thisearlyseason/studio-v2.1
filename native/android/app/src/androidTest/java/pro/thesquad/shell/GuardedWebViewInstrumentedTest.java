package pro.thesquad.shell;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslCertificate;
import android.net.http.SslError;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.view.View;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.ArrayList;
import java.io.ByteArrayInputStream;
import java.lang.reflect.Constructor;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public final class GuardedWebViewInstrumentedTest {
    private static final StoreDestination DESTINATION =
            StoreDestination.parse("https://store.example.com");
    private final List<WebView> webViews = new ArrayList<>();

    @After
    public void destroyWebViews() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (WebView webView : webViews) {
                webView.stopLoading();
                webView.destroy();
            }
            webViews.clear();
        });
    }

    @Test
    public void configuresRequiredWebCapabilitiesWithoutBridgePrimitives() {
        AtomicReference<WebSettings> settings = new AtomicReference<>();
        onMain(() -> {
            WebView webView = createWebView();
            ShellWebView.configure(webView);
            settings.set(webView.getSettings());
        });

        assertTrue(settings.get().getJavaScriptEnabled());
        assertTrue(settings.get().getDomStorageEnabled());
        assertFalse(settings.get().getAllowFileAccess());
        assertFalse(settings.get().getAllowContentAccess());
        assertEquals(
                WebSettings.MIXED_CONTENT_NEVER_ALLOW,
                settings.get().getMixedContentMode());
        assertTrue(settings.get().supportMultipleWindows());
        assertFalse(settings.get().getJavaScriptCanOpenWindowsAutomatically());
    }

    @Test
    public void installedClientAllowsOnlyConfiguredTopLevelNavigation() {
        RecordingNavigation navigation = new RecordingNavigation();
        onMain(() -> {
            WebView webView = createWebView();
            GuardedWebViewClient client = new GuardedWebViewClient(DESTINATION, navigation);
            webView.setWebViewClient(client);
            assertSame(client, webView.getWebViewClient());

            assertFalse(client.shouldOverrideUrlLoading(
                    webView,
                    new Request("https://store.example.com/team/1", true, "GET")));
            assertTrue(client.shouldOverrideUrlLoading(
                    webView,
                    new Request("https://evil.example/team/1", true, "GET")));
            assertFalse(client.shouldOverrideUrlLoading(
                    webView,
                    new Request("https://evil.example/tracker", false, "GET")));
        });

        assertEquals(1, navigation.blocked);
    }

    @Test
    public void requestInterceptionBlocksExternalTopLevelPostButNotSubresources() {
        RecordingNavigation navigation = new RecordingNavigation();
        AtomicReference<WebResourceResponse> allowedPost = new AtomicReference<>();
        AtomicReference<WebResourceResponse> blockedPost = new AtomicReference<>();
        AtomicReference<WebResourceResponse> subresource = new AtomicReference<>();
        onMain(() -> {
            WebView webView = createWebView();
            GuardedWebViewClient client = new GuardedWebViewClient(DESTINATION, navigation);
            webView.setWebViewClient(client);
            allowedPost.set(client.shouldInterceptRequest(
                    webView,
                    new Request("https://store.example.com/submit", true, "POST")));
            blockedPost.set(client.shouldInterceptRequest(
                    webView,
                    new Request("https://evil.example/submit", true, "POST")));
            subresource.set(client.shouldInterceptRequest(
                    webView,
                    new Request("https://cdn.example/image.png", false, "GET")));
        });
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();

        assertNull(allowedPost.get());
        assertNotNull(blockedPost.get());
        assertEquals(403, blockedPost.get().getStatusCode());
        assertNull(subresource.get());
        assertEquals(1, navigation.blocked);
    }

    @Test
    public void permittedPageCompletionAndBlockedCancellationAreDistinguished() {
        RecordingNavigation navigation = new RecordingNavigation();
        onMain(() -> {
            WebView webView = createWebView();
            GuardedWebViewClient client = new GuardedWebViewClient(DESTINATION, navigation);
            webView.setWebViewClient(client);

            client.onPageStarted(webView, "https://store.example.com/dashboard", null);
            client.onPageCommitVisible(webView, "https://store.example.com/dashboard");
            client.onPageFinished(webView, "https://store.example.com/dashboard");
            client.shouldOverrideUrlLoading(
                    webView,
                    new Request("https://evil.example/out", true, "GET"));
            client.onReceivedError(
                    webView,
                    new Request("https://evil.example/out", true, "GET"),
                    null);
        });

        assertEquals(
                Collections.singletonList("https://store.example.com/dashboard"),
                navigation.finished);
        assertEquals(0, navigation.failures);
    }

    @Test
    public void hiddenAttachedHttpsFixtureCommitsAndFinishesCurrentGeneration()
            throws Exception {
        RecordingNavigation navigation = new RecordingNavigation();
        AtomicReference<WebView> fixtureView = new AtomicReference<>();
        try (ActivityScenario<ShellActivity> scenario =
                     ActivityScenario.launch(ShellActivity.class)) {
            scenario.onActivity(activity -> {
                FrameLayout root = activity.findViewById(R.id.shell_root);
                WebView webView = new WebView(activity);
                fixtureView.set(webView);
                webViews.add(webView);
                webView.setVisibility(View.INVISIBLE);
                ShellWebView.configure(webView);
                GuardedWebViewClient guarded =
                        new GuardedWebViewClient(DESTINATION, navigation);
                webView.setWebViewClient(new GuardedHttpsFixtureClient(guarded));
                root.addView(webView, new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT));
                webView.loadUrl("https://store.example.com/dashboard");
            });

            assertTrue(
                    "trusted attached WebView callbacks timed out",
                    navigation.trustedCallbacks.await(5, TimeUnit.SECONDS));
            assertEquals(
                    Collections.singletonList("https://store.example.com/dashboard"),
                    navigation.committed);
            assertEquals(
                    Collections.singletonList("https://store.example.com/dashboard"),
                    navigation.finished);
            assertEquals(
                    Collections.singletonList(1L),
                    navigation.committedGenerations);
            assertEquals(
                    Collections.singletonList(1L),
                    navigation.finishedGenerations);

            scenario.onActivity(activity -> {
                WebView webView = fixtureView.get();
                assertEquals(View.INVISIBLE, webView.getVisibility());
                ((FrameLayout) webView.getParent()).removeView(webView);
                webView.stopLoading();
                webView.destroy();
                webViews.remove(webView);
            });
        }
    }

    @Test
    public void mainFrameTlsCancellationWaitsForRequestAwareFailure() {
        RecordingNavigation navigation = new RecordingNavigation();
        onMain(() -> {
            WebView webView = createWebView();
            GuardedWebViewClient client = new GuardedWebViewClient(DESTINATION, navigation);
            webView.setWebViewClient(client);
            client.onPageStarted(webView, "https://store.example.com/dashboard", null);
            client.onReceivedSslError(
                    webView,
                    newSslErrorHandler(),
                    new SslError(
                            SslError.SSL_UNTRUSTED,
                            (SslCertificate) null,
                            "https://store.example.com/dashboard"));
            assertEquals(0, navigation.failures);
            client.onReceivedError(
                    webView,
                    new Request("https://store.example.com/dashboard", true, "GET"),
                    null);
        });

        assertEquals(1, navigation.failures);
        assertEquals(
                Collections.singletonList(1L),
                navigation.failedGenerations);
    }

    @Test
    public void subresourceTlsFailureDoesNotFailTheCurrentMainFrame() {
        RecordingNavigation navigation = new RecordingNavigation();
        onMain(() -> {
            WebView webView = createWebView();
            GuardedWebViewClient client = new GuardedWebViewClient(DESTINATION, navigation);
            webView.setWebViewClient(client);
            client.onPageStarted(webView, "https://store.example.com/dashboard", null);
            client.onReceivedSslError(
                    webView,
                    newSslErrorHandler(),
                    new SslError(
                            SslError.SSL_UNTRUSTED,
                            (SslCertificate) null,
                            "https://cdn.example/image.png"));
        });

        assertEquals(0, navigation.failures);
    }

    @Test
    public void sameUrlSubresourceTlsFailureDoesNotFailTheCurrentMainFrame() {
        RecordingNavigation navigation = new RecordingNavigation();
        onMain(() -> {
            WebView webView = createWebView();
            GuardedWebViewClient client = new GuardedWebViewClient(DESTINATION, navigation);
            webView.setWebViewClient(client);
            client.onPageStarted(webView, "https://store.example.com/dashboard", null);
            client.onReceivedSslError(
                    webView,
                    newSslErrorHandler(),
                    new SslError(
                            SslError.SSL_UNTRUSTED,
                            (SslCertificate) null,
                            "https://store.example.com/dashboard"));
        });

        assertEquals(0, navigation.failures);
    }

    @Test
    public void tlsCancellationWithoutFrameAwareFollowOnReachesDeadlineRetry() {
        ControllerHarness harness = new ControllerHarness();
        onMain(() -> {
            harness.foregroundAndAcceptBootstrap();
            WebView webView = createWebView();
            GuardedWebViewClient client = new GuardedWebViewClient(DESTINATION, harness);
            client.onPageStarted(webView, "https://store.example.com/dashboard", null);
            client.onReceivedSslError(
                    webView,
                    newSslErrorHandler(),
                    new SslError(
                            SslError.SSL_UNTRUSTED,
                            (SslCertificate) null,
                            "https://store.example.com/dashboard"));
        });

        assertEquals(1, harness.deadlines.scheduled.size());
        assertEquals(30_000, harness.deadlines.scheduled.get(0).delayMillis);
        onMain(() -> harness.deadlines.scheduled.get(0).action.run());
        assertEquals(ShellLifecycleController.NativeState.FAILED, harness.state);
        assertFalse(harness.contentVisible);
    }

    @Test
    public void sameUrlTlsAfterTrustedCommitPreservesContentAndExpiredDeadline() {
        ControllerHarness harness = new ControllerHarness();
        onMain(() -> {
            harness.foregroundAndAcceptBootstrap();
            WebView webView = createWebView();
            GuardedWebViewClient client = new GuardedWebViewClient(DESTINATION, harness);
            client.onPageStarted(webView, "https://store.example.com/dashboard", null);
            client.onPageCommitVisible(webView, "https://store.example.com/dashboard");
            client.onPageFinished(webView, "https://store.example.com/dashboard");
            assertTrue(harness.contentVisible);
            client.onReceivedSslError(
                    webView,
                    newSslErrorHandler(),
                    new SslError(
                            SslError.SSL_UNTRUSTED,
                            (SslCertificate) null,
                            "https://store.example.com/dashboard"));
        });

        assertTrue(harness.contentVisible);
        assertTrue(harness.deadlines.scheduled.get(0).cancelled);
        onMain(() -> harness.deadlines.scheduled.get(0).action.run());
        assertTrue(harness.contentVisible);
        assertEquals(ShellLifecycleController.NativeState.CONTENT, harness.state);
    }

    @Test
    public void staleMainFrameTlsFailureDoesNotFailNewerNavigation() {
        RecordingNavigation navigation = new RecordingNavigation();
        onMain(() -> {
            WebView webView = createWebView();
            GuardedWebViewClient client = new GuardedWebViewClient(DESTINATION, navigation);
            webView.setWebViewClient(client);
            client.onPageStarted(webView, "https://store.example.com/first", null);
            client.onPageStarted(webView, "https://store.example.com/second", null);
            client.onReceivedSslError(
                    webView,
                    newSslErrorHandler(),
                    new SslError(
                            SslError.SSL_UNTRUSTED,
                            (SslCertificate) null,
                            "https://store.example.com/first"));
        });

        assertEquals(0, navigation.failures);
    }

    @Test
    public void rendererDeathReportsItsSourceBeforeNavigationStarts() {
        RecordingNavigation navigation = new RecordingNavigation();
        AtomicReference<WebView> source = new AtomicReference<>();
        onMain(() -> {
            WebView webView = createWebView();
            source.set(webView);
            GuardedWebViewClient client = new GuardedWebViewClient(DESTINATION, navigation);

            assertTrue(client.onRenderProcessGone(webView, null));
        });

        assertEquals(
                Collections.singletonList(source.get()),
                navigation.failedWebViews);
        assertEquals(0, navigation.failures);
    }

    @Test
    public void newWindowUsesGuardedTransientWebViewAndExistingPageLoader() {
        RecordingNavigation navigation = new RecordingNavigation();
        AtomicReference<WebView> popup = new AtomicReference<>();
        onMain(() -> {
            WebView main = createWebView();
            GuardedWebChromeClient client = new GuardedWebChromeClient(
                    DESTINATION,
                    navigation,
                    url -> navigation.opened.add(url));
            main.setWebChromeClient(client);

            Handler handler = new Handler(Looper.getMainLooper(), message -> true);
            Message result = Message.obtain(handler);
            WebView.WebViewTransport transport = main.new WebViewTransport();
            result.obj = transport;
            assertTrue(client.onCreateWindow(main, false, true, result));
            popup.set(transport.getWebView());
            assertNotNull(popup.get());
            webViews.add(popup.get());
            assertTrue(popup.get().getWebViewClient().shouldOverrideUrlLoading(
                    popup.get(),
                    new Request("https://store.example.com/team/1", true, "GET")));
        });
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();

        assertEquals(
                Collections.singletonList("https://store.example.com/team/1"),
                navigation.opened);
        assertEquals(0, navigation.blocked);
    }

    @Test
    public void externalAndUnsolicitedNewWindowsAreDenied() {
        RecordingNavigation navigation = new RecordingNavigation();
        onMain(() -> {
            WebView main = createWebView();
            GuardedWebChromeClient client = new GuardedWebChromeClient(
                    DESTINATION,
                    navigation,
                    url -> navigation.opened.add(url));

            Handler handler = new Handler(Looper.getMainLooper(), message -> true);
            Message result = Message.obtain(handler);
            WebView.WebViewTransport transport = main.new WebViewTransport();
            result.obj = transport;
            assertTrue(client.onCreateWindow(main, false, true, result));
            WebView popup = transport.getWebView();
            webViews.add(popup);
            assertTrue(popup.getWebViewClient().shouldOverrideUrlLoading(
                    popup,
                    new Request("https://evil.example/out", true, "GET")));

            assertFalse(client.onCreateWindow(main, false, false, Message.obtain(handler)));
        });
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();

        assertTrue(navigation.opened.isEmpty());
        assertEquals(2, navigation.blocked);
    }

    @Test
    public void backNavigatesActualPermittedHistory() throws Exception {
        WebView webView = createHistory("https://store.example.com/one", "https://store.example.com/two");
        AtomicBoolean finishCalled = new AtomicBoolean();
        AtomicBoolean navigated = new AtomicBoolean();
        AtomicReference<String> historyDescription = new AtomicReference<>();

        onMain(() -> {
            android.webkit.WebBackForwardList history = webView.copyBackForwardList();
            StringBuilder description = new StringBuilder()
                    .append("size=").append(history.getSize())
                    .append(" current=").append(history.getCurrentIndex());
            for (int index = 0; index < history.getSize(); index += 1) {
                description.append(" [").append(index).append("]=")
                        .append(history.getItemAtIndex(index).getUrl());
            }
            historyDescription.set(description.toString());
            navigated.set(HistoryNavigator.goBackIfAllowed(
                    webView, DESTINATION, () -> finishCalled.set(true)));
        });

        assertTrue(historyDescription.get(), navigated.get());
        assertFalse(finishCalled.get());
    }

    @Test
    public void backRejectsActualExternalHistoryAndFinishesNormally() throws Exception {
        WebView webView = createHistory("https://evil.example/one", "https://store.example.com/two");
        AtomicBoolean finishCalled = new AtomicBoolean();
        AtomicBoolean navigated = new AtomicBoolean();

        onMain(() -> navigated.set(
                HistoryNavigator.goBackIfAllowed(webView, DESTINATION, () -> finishCalled.set(true))));

        assertFalse(navigated.get());
        assertTrue(finishCalled.get());
    }

    private WebView createHistory(String firstUrl, String secondUrl) throws Exception {
        AtomicReference<WebView> result = new AtomicReference<>();
        HistoryFixtureClient client = new HistoryFixtureClient();
        onMain(() -> {
            result.set(createWebView());
            result.get().setWebViewClient(client);
        });
        loadLocalPage(result.get(), client, firstUrl);
        loadLocalPage(result.get(), client, secondUrl);
        return result.get();
    }

    private void loadLocalPage(
            WebView webView,
            HistoryFixtureClient client,
            String url) throws Exception {
        CountDownLatch loaded = new CountDownLatch(1);
        client.loaded.set(loaded);
        onMain(() -> {
            webView.loadUrl(url);
        });
        assertTrue("local WebView fixture timed out", loaded.await(5, TimeUnit.SECONDS));
    }

    private WebView createWebView() {
        WebView webView = new WebView(
                InstrumentationRegistry.getInstrumentation().getTargetContext());
        webViews.add(webView);
        return webView;
    }

    private static SslErrorHandler newSslErrorHandler() {
        try {
            Constructor<SslErrorHandler> constructor =
                    SslErrorHandler.class.getDeclaredConstructor();
            constructor.setAccessible(true);
            return constructor.newInstance();
        } catch (ReflectiveOperationException exception) {
            throw new AssertionError(exception);
        }
    }

    private void onMain(Runnable action) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(action);
    }

    private static final class RecordingNavigation implements NavigationEvents {
        private int blocked;
        private int failures;
        private long nextGeneration;
        private final List<String> finished = new ArrayList<>();
        private final List<String> committed = new ArrayList<>();
        private final List<String> opened = new ArrayList<>();
        private final List<Long> failedGenerations = new ArrayList<>();
        private final List<WebView> failedWebViews = new ArrayList<>();
        private final List<Long> committedGenerations = new ArrayList<>();
        private final List<Long> finishedGenerations = new ArrayList<>();
        private final CountDownLatch trustedCallbacks = new CountDownLatch(2);

        @Override
        public void blocked() {
            blocked += 1;
        }

        @Override
        public long navigationStarted(String url) {
            nextGeneration += 1;
            return nextGeneration;
        }

        @Override
        public void pageCommitted(long navigationGeneration, String url) {
            committed.add(url);
            committedGenerations.add(navigationGeneration);
            trustedCallbacks.countDown();
        }

        @Override
        public void pageFinished(long navigationGeneration, String url) {
            finished.add(url);
            finishedGenerations.add(navigationGeneration);
            trustedCallbacks.countDown();
        }

        @Override
        public void pageFailed(long navigationGeneration) {
            failures += 1;
            failedGenerations.add(navigationGeneration);
        }

        @Override
        public void renderProcessGone(WebView sourceWebView) {
            failedWebViews.add(sourceWebView);
        }
    }

    private static final class GuardedHttpsFixtureClient extends WebViewClient {
        private final GuardedWebViewClient guarded;

        private GuardedHttpsFixtureClient(GuardedWebViewClient guarded) {
            this.guarded = guarded;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(
                WebView view,
                WebResourceRequest request) {
            WebResourceResponse blocked = guarded.shouldInterceptRequest(view, request);
            if (blocked != null || !request.isForMainFrame()) {
                return blocked;
            }
            return new WebResourceResponse(
                    "text/html",
                    "UTF-8",
                    new ByteArrayInputStream(
                            "<html><body>trusted fixture</body></html>"
                                    .getBytes(StandardCharsets.UTF_8)));
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            guarded.onPageStarted(view, url, favicon);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            guarded.onPageCommitVisible(view, url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            guarded.onPageFinished(view, url);
        }
    }

    private static final class ControllerHarness
            implements NavigationEvents, ShellLifecycleController.Renderer {
        private final HarnessBootstrap bootstrap = new HarnessBootstrap();
        private final HarnessDeadlines deadlines = new HarnessDeadlines();
        private final ShellLifecycleController controller = new ShellLifecycleController(
                DESTINATION, bootstrap, this, deadlines);
        private ShellLifecycleController.NativeState state;
        private boolean contentVisible;

        private void foregroundAndAcceptBootstrap() {
            controller.foreground();
            bootstrap.completion.accept(true);
        }

        @Override
        public void blocked() {
        }

        @Override
        public long navigationStarted(String url) {
            return controller.navigationStarted(url);
        }

        @Override
        public void pageCommitted(long navigationGeneration, String url) {
            controller.pageCommitted(navigationGeneration, url);
        }

        @Override
        public void pageFinished(long navigationGeneration, String url) {
            controller.pageFinished(navigationGeneration, url);
        }

        @Override
        public void pageFailed(long navigationGeneration) {
            controller.pageFailed(navigationGeneration);
        }

        @Override
        public void renderProcessGone(WebView sourceWebView) {
            controller.webViewFailed();
        }

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
            contentVisible = false;
        }
    }

    private static final class HarnessBootstrap implements StoreBootstrapChecking {
        private java.util.function.Consumer<Boolean> completion;

        @Override
        public BootstrapCancellation check(
                StoreDestination destination,
                java.util.function.Consumer<Boolean> completion) {
            this.completion = completion;
            return () -> {
            };
        }
    }

    private static final class HarnessDeadlines implements NavigationDeadlineScheduling {
        private final List<HarnessDeadline> scheduled = new ArrayList<>();

        @Override
        public NavigationDeadlineCancellation schedule(long delayMillis, Runnable action) {
            HarnessDeadline deadline = new HarnessDeadline(delayMillis, action);
            scheduled.add(deadline);
            return () -> deadline.cancelled = true;
        }
    }

    private static final class HarnessDeadline {
        private final long delayMillis;
        private final Runnable action;
        private boolean cancelled;

        private HarnessDeadline(long delayMillis, Runnable action) {
            this.delayMillis = delayMillis;
            this.action = action;
        }
    }

    private static final class HistoryFixtureClient extends WebViewClient {
        private final AtomicReference<CountDownLatch> loaded = new AtomicReference<>();

        @Override
        public WebResourceResponse shouldInterceptRequest(
                WebView view,
                WebResourceRequest request) {
            if (!request.isForMainFrame()) {
                return null;
            }
            return new WebResourceResponse(
                    "text/html",
                    "UTF-8",
                    new ByteArrayInputStream(
                            "<html><body>fixture</body></html>"
                                    .getBytes(StandardCharsets.UTF_8)));
        }

        @Override
        public void onPageFinished(WebView view, String finishedUrl) {
            CountDownLatch latch = loaded.getAndSet(null);
            if (latch != null) {
                latch.countDown();
            }
        }
    }

    private static final class Request implements WebResourceRequest {
        private final Uri url;
        private final boolean mainFrame;
        private final String method;

        private Request(String url, boolean mainFrame, String method) {
            this.url = Uri.parse(url);
            this.mainFrame = mainFrame;
            this.method = method;
        }

        @Override
        public Uri getUrl() {
            return url;
        }

        @Override
        public boolean isForMainFrame() {
            return mainFrame;
        }

        @Override
        public boolean isRedirect() {
            return false;
        }

        @Override
        public boolean hasGesture() {
            return true;
        }

        @Override
        public String getMethod() {
            return method;
        }

        @Override
        public Map<String, String> getRequestHeaders() {
            return Collections.emptyMap();
        }
    }
}
