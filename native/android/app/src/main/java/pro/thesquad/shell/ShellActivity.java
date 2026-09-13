package pro.thesquad.shell;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

public final class ShellActivity extends Activity
        implements ShellLifecycleController.Renderer, NavigationEvents {
    private StoreDestination destination;
    private ShellLifecycleController controller;
    private FrameLayout root;
    private LinearLayout statusPanel;
    private ProgressBar progress;
    private TextView title;
    private TextView message;
    private Button retry;
    private TextView blockedLink;
    private WebView webView;
    private OnBackInvokedCallback backCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();
        destination = StoreDestination.parse(BuildConfig.SQUAD_STORE_ORIGIN);
        buildInterface();
        controller = new ShellLifecycleController(
                destination,
                new StoreBootstrapClient(),
                this);
        retry.setOnClickListener(view -> controller.retry());
        registerBackHandler();
    }

    @Override
    protected void onResume() {
        super.onResume();
        controller.foreground();
    }

    @Override
    protected void onPause() {
        controller.background();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        controller.destroy();
        unregisterBackHandler();
        if (webView != null) {
            root.removeView(webView);
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    public void showNative(ShellLifecycleController.NativeState state) {
        webView.setVisibility(View.INVISIBLE);
        statusPanel.setVisibility(View.VISIBLE);
        blockedLink.setVisibility(View.GONE);
        progress.setVisibility(state == ShellLifecycleController.NativeState.CHECKING
                ? View.VISIBLE
                : View.GONE);
        message.setVisibility(state == ShellLifecycleController.NativeState.CHECKING
                ? View.GONE
                : View.VISIBLE);
        retry.setVisibility(
                state == ShellLifecycleController.NativeState.SETUP_REQUIRED
                                || state == ShellLifecycleController.NativeState.FAILED
                        ? View.VISIBLE
                        : View.GONE);

        if (state == ShellLifecycleController.NativeState.CHECKING) {
            title.setText(R.string.checking_title);
            message.setText("");
        } else if (state == ShellLifecycleController.NativeState.SETUP_REQUIRED) {
            title.setText(R.string.setup_title);
            message.setText(R.string.setup_message);
        } else if (state == ShellLifecycleController.NativeState.FAILED) {
            title.setText(R.string.failure_title);
            message.setText(R.string.failure_message);
        }
    }

    @Override
    public void showContent() {
        statusPanel.setVisibility(View.GONE);
        blockedLink.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
    }

    @Override
    public void loadDashboard(String url) {
        statusPanel.setVisibility(View.VISIBLE);
        webView.setVisibility(View.INVISIBLE);
        webView.loadUrl(url);
    }

    @Override
    public void blocked() {
        blockedLink.setVisibility(View.VISIBLE);
        blockedLink.announceForAccessibility(blockedLink.getText());
    }

    @Override
    public void pageFinished(String url) {
        controller.pageFinished(url);
    }

    @Override
    public void pageFailed() {
        controller.pageFailed();
    }

    @Override
    public void renderProcessGone() {
        controller.pageFailed();
        replaceWebView();
    }

    private void configureWindow() {
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        }
    }

    private void buildInterface() {
        root = new FrameLayout(this);
        root.setId(R.id.shell_root);
        root.setBackgroundColor(Color.WHITE);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            applyInsets(view, insets);
            return insets;
        });

        webView = createWebView();
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        statusPanel = new LinearLayout(this);
        statusPanel.setId(R.id.shell_status_panel);
        statusPanel.setOrientation(LinearLayout.VERTICAL);
        statusPanel.setGravity(Gravity.CENTER);
        int horizontalPadding = dp(32);
        statusPanel.setPadding(horizontalPadding, dp(24), horizontalPadding, dp(24));

        progress = new ProgressBar(this);
        progress.setId(R.id.shell_progress);
        progress.setIndeterminate(true);
        LinearLayout.LayoutParams progressLayout = new LinearLayout.LayoutParams(dp(48), dp(48));
        progressLayout.bottomMargin = dp(24);
        statusPanel.addView(progress, progressLayout);

        title = new TextView(this);
        title.setId(R.id.shell_title);
        title.setText(R.string.checking_title);
        title.setTextColor(Color.rgb(24, 28, 35));
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            title.setAccessibilityHeading(true);
        }
        statusPanel.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        message = new TextView(this);
        message.setId(R.id.shell_message);
        message.setTextColor(Color.rgb(70, 76, 87));
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageLayout = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        messageLayout.topMargin = dp(12);
        statusPanel.addView(message, messageLayout);

        retry = new Button(this);
        retry.setId(R.id.shell_retry);
        retry.setText(R.string.retry);
        retry.setAllCaps(false);
        retry.setTextSize(16);
        retry.setMinHeight(dp(48));
        retry.setMinWidth(dp(120));
        retry.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        LinearLayout.LayoutParams retryLayout = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        retryLayout.topMargin = dp(24);
        statusPanel.addView(retry, retryLayout);

        root.addView(statusPanel, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        blockedLink = new TextView(this);
        blockedLink.setId(R.id.shell_link_error);
        blockedLink.setText(R.string.blocked_link);
        blockedLink.setTextColor(Color.WHITE);
        blockedLink.setTextSize(15);
        blockedLink.setGravity(Gravity.CENTER);
        blockedLink.setBackgroundColor(Color.rgb(145, 16, 30));
        blockedLink.setPadding(dp(20), dp(14), dp(20), dp(14));
        blockedLink.setVisibility(View.GONE);
        blockedLink.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        FrameLayout.LayoutParams blockedLayout = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM);
        root.addView(blockedLink, blockedLayout);

        setContentView(root);
        root.requestApplyInsets();
    }

    private WebView createWebView() {
        WebView created = new WebView(this);
        created.setId(R.id.shell_web_view);
        created.setVisibility(View.INVISIBLE);
        ShellWebView.configure(created);
        if (destination != null) {
            created.setWebViewClient(new GuardedWebViewClient(destination, this));
            created.setWebChromeClient(new GuardedWebChromeClient(
                    destination,
                    this,
                    this::openAllowedNewWindow));
        }
        return created;
    }

    private void replaceWebView() {
        WebView failed = webView;
        root.removeView(failed);
        failed.destroy();
        webView = createWebView();
        root.addView(
                webView,
                0,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT));
    }

    private void openAllowedNewWindow(String url) {
        if (destination != null && destination.allows(url)) {
            webView.loadUrl(url);
        } else {
            blocked();
        }
    }

    private void handleBack() {
        HistoryNavigator.goBackIfAllowed(webView, destination, this::finish);
    }

    private void registerBackHandler() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    backCallback);
        }
    }

    private void unregisterBackHandler() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
            backCallback = null;
        }
    }

    private void applyInsets(View view, WindowInsets insets) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.graphics.Insets systemBars = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
            view.setPadding(
                    systemBars.left,
                    systemBars.top,
                    systemBars.right,
                    Math.max(systemBars.bottom, ime.bottom));
        } else {
            view.setPadding(
                    insets.getSystemWindowInsetLeft(),
                    insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(),
                    insets.getSystemWindowInsetBottom());
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
