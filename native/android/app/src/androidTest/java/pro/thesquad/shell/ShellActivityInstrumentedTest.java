package pro.thesquad.shell;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.view.View;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class ShellActivityInstrumentedTest {
    @Test
    public void emptyOriginShowsAccessibleSetupRetryWithoutLoadingWebContent() {
        try (ActivityScenario<ShellActivity> scenario =
                     ActivityScenario.launch(ShellActivity.class)) {
            scenario.onActivity(activity -> {
                TextView title = activity.findViewById(R.id.shell_title);
                TextView message = activity.findViewById(R.id.shell_message);
                Button retry = activity.findViewById(R.id.shell_retry);
                ProgressBar progress = activity.findViewById(R.id.shell_progress);
                WebView webView = activity.findViewById(R.id.shell_web_view);

                assertNotNull(title);
                assertNotNull(message);
                assertNotNull(retry);
                assertNotNull(progress);
                assertNotNull(webView);
                assertEquals("App setup required", title.getText().toString());
                assertEquals(
                        "A store-only app destination has not been configured.",
                        message.getText().toString());
                assertEquals("Try again", retry.getText().toString());
                assertTrue(retry.isClickable());
                assertTrue(retry.isEnabled());
                assertEquals(View.VISIBLE, retry.getVisibility());
                assertEquals(View.GONE, progress.getVisibility());
                assertEquals(View.INVISIBLE, webView.getVisibility());
                assertNull(webView.getUrl());

                retry.performClick();
                assertEquals("App setup required", title.getText().toString());
                assertEquals(View.INVISIBLE, webView.getVisibility());
                assertNull(webView.getUrl());
            });
        }
    }

    @Test
    public void developmentIdentityIsExplicitAndBackupsAreDisabled() throws Exception {
        PackageManager packages = InstrumentationRegistry.getInstrumentation()
                .getTargetContext()
                .getPackageManager();
        ApplicationInfo application = packages.getApplicationInfo(
                InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName(),
                0);

        assertEquals("pro.thesquad.shell.dev", application.packageName);
        assertEquals("Squad Development", packages.getApplicationLabel(application).toString());
        assertFalse((application.flags & ApplicationInfo.FLAG_ALLOW_BACKUP) != 0);
    }
}
