package pro.thesquad.shell;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.net.http.SslError;
import android.os.Looper;
import android.os.Message;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebBackForwardList;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.function.Consumer;

interface NavigationEvents {
    void blocked();

    void pageFinished(String url);

    void pageFailed();

    default void renderProcessGone() {
        pageFailed();
    }
}

final class ShellWebView {
    private ShellWebView() {
    }

    @SuppressLint("SetJavaScriptEnabled")
    static void configure(WebView webView) {
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
    }
}

final class GuardedWebViewClient extends WebViewClient {
    private final StoreDestination destination;
    private final NavigationEvents events;
    private final Set<String> blockedMainFrames =
            Collections.synchronizedSet(new HashSet<>());

    GuardedWebViewClient(StoreDestination destination, NavigationEvents events) {
        this.destination = destination;
        this.events = events;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (!request.isForMainFrame()) {
            return false;
        }
        return blockIfUntrusted(view, request.getUrl().toString());
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        return blockIfUntrusted(view, url);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(
            WebView view,
            WebResourceRequest request) {
        if (!request.isForMainFrame() || destination.allows(request.getUrl().toString())) {
            return null;
        }
        rememberBlocked(request.getUrl().toString());
        notifyBlocked(view);
        return blockedResponse();
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        if (!destination.allows(url)) {
            rememberBlocked(url);
            view.stopLoading();
            notifyBlocked(view);
        }
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        if (destination.allows(url)) {
            events.pageFinished(url);
        } else {
            rememberBlocked(url);
            notifyBlocked(view);
        }
    }

    @Override
    public void onReceivedError(
            WebView view,
            WebResourceRequest request,
            WebResourceError error) {
        if (request.isForMainFrame()
                && !consumeBlocked(request.getUrl().toString())) {
            events.pageFailed();
        }
    }

    @Override
    public void onReceivedHttpError(
            WebView view,
            WebResourceRequest request,
            WebResourceResponse errorResponse) {
        if (request.isForMainFrame()
                && !consumeBlocked(request.getUrl().toString())) {
            events.pageFailed();
        }
    }

    @Override
    public void onReceivedSslError(
            WebView view,
            SslErrorHandler handler,
            SslError error) {
        handler.cancel();
        post(view, events::pageFailed);
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        post(view, events::renderProcessGone);
        return true;
    }

    private boolean blockIfUntrusted(WebView view, String url) {
        if (destination.allows(url)) {
            return false;
        }
        rememberBlocked(url);
        notifyBlocked(view);
        return true;
    }

    private void rememberBlocked(String url) {
        blockedMainFrames.add(url);
    }

    private boolean consumeBlocked(String url) {
        return blockedMainFrames.remove(url);
    }

    private void notifyBlocked(WebView view) {
        post(view, events::blocked);
    }

    private static void post(WebView view, Runnable action) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action.run();
        } else {
            view.post(action);
        }
    }

    static WebResourceResponse blockedResponse() {
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                403,
                "Blocked",
                Collections.emptyMap(),
                new ByteArrayInputStream(new byte[0]));
    }
}

final class GuardedWebChromeClient extends WebChromeClient {
    private final StoreDestination destination;
    private final NavigationEvents events;
    private final Consumer<String> openInMainWebView;

    GuardedWebChromeClient(
            StoreDestination destination,
            NavigationEvents events,
            Consumer<String> openInMainWebView) {
        this.destination = destination;
        this.events = events;
        this.openInMainWebView = openInMainWebView;
    }

    @Override
    public boolean onCreateWindow(
            WebView view,
            boolean isDialog,
            boolean isUserGesture,
            Message resultMessage) {
        if (!isUserGesture
                || resultMessage == null
                || !(resultMessage.obj instanceof WebView.WebViewTransport)) {
            events.blocked();
            return false;
        }

        WebView popup = new WebView(view.getContext());
        ShellWebView.configure(popup);
        popup.setWebViewClient(new WebViewClient() {
            private boolean consumed;

            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView popupView,
                    WebResourceRequest request) {
                if (request.isForMainFrame()) {
                    consume(view, popupView, request.getUrl().toString(), request.getMethod());
                }
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView popupView, String url) {
                consume(view, popupView, url, "GET");
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView popupView,
                    WebResourceRequest request) {
                if (request.isForMainFrame()) {
                    consume(view, popupView, request.getUrl().toString(), request.getMethod());
                    return GuardedWebViewClient.blockedResponse();
                }
                return null;
            }

            @Override
            public void onPageStarted(WebView popupView, String url, Bitmap favicon) {
                consume(view, popupView, url, "GET");
            }

            private void consume(WebView mainView, WebView popupView, String url, String method) {
                if (consumed) {
                    return;
                }
                consumed = true;
                Runnable action = () -> {
                    if ("GET".equalsIgnoreCase(method) && destination.allows(url)) {
                        openInMainWebView.accept(url);
                    } else {
                        events.blocked();
                    }
                    popupView.stopLoading();
                    popupView.destroy();
                };
                if (Looper.myLooper() == Looper.getMainLooper()) {
                    action.run();
                } else {
                    mainView.post(action);
                }
            }
        });

        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMessage.obj;
        transport.setWebView(popup);
        resultMessage.sendToTarget();
        return true;
    }
}

final class HistoryNavigator {
    private HistoryNavigator() {
    }

    static boolean goBackIfAllowed(
            WebView webView,
            StoreDestination destination,
            Runnable finishNormally) {
        WebBackForwardList history = webView.copyBackForwardList();
        int previousIndex = history.getCurrentIndex() - 1;
        if (previousIndex >= 0
                && history.getItemAtIndex(previousIndex) != null
                && destination != null
                && destination.allows(history.getItemAtIndex(previousIndex).getUrl())) {
            webView.goBack();
            return true;
        }
        finishNormally.run();
        return false;
    }
}
