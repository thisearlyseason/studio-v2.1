package pro.thesquad.shell;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

import android.graphics.Bitmap;
import android.view.View;
import android.webkit.WebView;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Opt-in hosted smoke test. No production hooks, mocked responses, or auth shortcuts. */
@RunWith(AndroidJUnit4.class)
public final class HostedShellAcceptanceTest {
    private ActivityScenario<ShellActivity> scenario;

    private void shell(String command) throws Exception {
        try(android.os.ParcelFileDescriptor descriptor=InstrumentationRegistry.getInstrumentation()
                .getUiAutomation().executeShellCommand(command);
            java.io.FileInputStream in=new java.io.FileInputStream(descriptor.getFileDescriptor())) {
            while(in.read()!=-1) { /* Wait for emulator-only command completion. */ }
        }
    }

    @Test public void hostedExternalLinksAndOfflineRetry() throws Exception {
        assumeTrue("Explicit hosted opt-in only", "true".equals(
                InstrumentationRegistry.getArguments().getString("hostedQA")));
        assertEquals("https://thesquadv2-native-store-qa-tylers-projects-5b59182e.vercel.app", BuildConfig.SQUAD_STORE_ORIGIN);
        try(ActivityScenario<ShellActivity> run=ActivityScenario.launch(ShellActivity.class)) {
            scenario=run;
            until("Hosted signed-out page", "location.pathname==='/login' && !!document.querySelector('#password')");
            visible();
            js("(()=>{const a=document.createElement('a');a.href='https://example.com';document.body.append(a);a.click();return true})()");
            long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
            AtomicReference<Boolean> blocked=new AtomicReference<>(false);
            while(System.nanoTime()<end && !blocked.get()) {
                scenario.onActivity(a->blocked.set(a.findViewById(R.id.shell_link_error).getVisibility()==View.VISIBLE));
                Thread.sleep(100);
            }
            assertTrue("External navigation receives native denial",blocked.get());
            assertEquals("\"/login\"",js("location.pathname"));
            js("(()=>{const a=document.createElement('a');a.href='https://example.com';a.target='_blank';document.body.append(a);a.click();return true})()");
            assertEquals("\"/login\"",js("location.pathname"));
            checkpoint("external-and-new-window-denied");
            try {
                shell("svc wifi disable");
                shell("svc data disable");
                scenario.moveToState(Lifecycle.State.CREATED);
                scenario.moveToState(Lifecycle.State.RESUMED);
                end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
                AtomicReference<Boolean> failed=new AtomicReference<>(false);
                while(System.nanoTime()<end && !failed.get()) {
                    scenario.onActivity(a->failed.set(a.findViewById(R.id.shell_retry).getVisibility()==View.VISIBLE));
                    Thread.sleep(250);
                }
                assertTrue("Offline foreground exposes Retry",failed.get());
                scenario.onActivity(a->assertEquals(View.INVISIBLE,a.findViewById(R.id.shell_web_view).getVisibility()));
                android.util.Log.i("HostedShellQA","PASS offline-foreground-hidden-retry");
            } finally {
                shell("svc wifi enable");
                shell("svc data enable");
            }
            // Retry the actual native control after connectivity returns, without injected responses.
            Thread.sleep(2000);
            scenario.onActivity(a->a.findViewById(R.id.shell_retry).performClick());
            visible();
            until("Recovered login", "location.pathname==='/login' && !!document.querySelector('#password')");
            checkpoint("online-retry-recovered");
        }
    }

    private String js(String expression) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(a -> ((WebView)a.findViewById(R.id.shell_web_view))
                .evaluateJavascript(expression, value -> { result.set(value); done.countDown(); }));
        assertTrue("JavaScript callback timed out", done.await(5, TimeUnit.SECONDS));
        return result.get();
    }

    private void until(String description, String expression) throws Exception {
        long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(40);
        while (System.nanoTime() < end) {
            if ("true".equals(js(expression))) return;
            Thread.sleep(250);
        }
        fail(description + ": path=" + js("location.pathname")
                + ", heading=" + js("document.querySelector('h1')?.textContent"));
    }

    private void visible() throws Exception {
        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(35);
        AtomicReference<Boolean> shown=new AtomicReference<>(false);
        while(System.nanoTime()<end && !shown.get()) {
            scenario.onActivity(a->shown.set(a.findViewById(R.id.shell_web_view).getVisibility()==View.VISIBLE));
            if(!shown.get()) Thread.sleep(250);
        }
        scenario.onActivity(a -> assertEquals("Native shell must reveal verified content",
                View.VISIBLE, a.findViewById(R.id.shell_web_view).getVisibility()));
    }

    private void checkpoint(String name) throws Exception {
        visible();
        until("Heading visibly painted: " + name, "(()=>{let e=document.querySelector('main h1,h1');if(!e)return false;const r=e.getBoundingClientRect();if(r.height<=0||r.bottom<=0||r.top>=innerHeight)return false;for(;e;e=e.parentElement){const s=getComputedStyle(e);if(Number(s.opacity)<0.95||s.visibility==='hidden'||s.display==='none')return false;}return true})()");
        js("window.__qaPainted=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__qaPainted=true));true");
        until("Rendered frame", "window.__qaPainted===true");
        File dir = InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir();
        try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot()
                    .compress(Bitmap.CompressFormat.PNG, 100, out);
        }
        android.util.Log.i("HostedShellQA", "PASS " + name);
    }

    private void clickText(String text) throws Exception {
        String q = JSONObject.quote(text);
        until("Control available: " + text,
                "[...document.querySelectorAll('a,button')].some(e=>e.textContent.trim().startsWith("+q+"))");
        assertEquals("Control clicked", "true", js("(()=>{const e=[...document.querySelectorAll('a,button')]"
                + ".find(e=>e.textContent.trim().startsWith("+q+"));if(!e)return false;e.scrollIntoView();e.click();return true})()"));
    }

    @Test public void hostedRolesKeepSessionNavigateAndLogout() throws Exception {
        assumeTrue("Explicit hosted opt-in only", "true".equals(
                InstrumentationRegistry.getArguments().getString("hostedQA")));
        assertEquals("Only the approved QA deployment may be tested",
                "https://thesquadv2-native-store-qa-tylers-projects-5b59182e.vercel.app", BuildConfig.SQUAD_STORE_ORIGIN);
        File config = new File(InstrumentationRegistry.getInstrumentation()
                .getTargetContext().getCacheDir(), "hosted-qa.private.json");
        JSONObject state = new JSONObject(new String(Files.readAllBytes(config.toPath()), java.nio.charset.StandardCharsets.UTF_8));
        JSONArray identities = state.getJSONArray("identities");
        for (int index=0; index<identities.length(); index++) {
            JSONObject who = identities.getJSONObject(index);
            String role = who.getString("role");
            try (ActivityScenario<ShellActivity> run = ActivityScenario.launch(ShellActivity.class)) {
                scenario = run;
                until("Hosted login page", "location.pathname==='/login' && !!document.querySelector('#password')");
                visible();
                String email = JSONObject.quote(who.getString("email"));
                String password = JSONObject.quote(state.getString("password"));
                js("(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;"
                        + "for(const [id,value] of [['email',"+email+"],['password',"+password+"]]){"
                        + "const e=document.getElementById(id);set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}})()");
                clickText("Sign In");
                until("Authenticated dashboard", "location.pathname==='/dashboard' && !!document.querySelector('main h1')");
                checkpoint(role+"-dashboard");
                js("window.__qaBeforeReload=true");
                scenario.onActivity(a -> ((WebView)a.findViewById(R.id.shell_web_view)).reload());
                until("Reload retained dashboard", "!window.__qaBeforeReload && document.readyState==='complete' && location.pathname==='/dashboard' && /next actions/i.test(document.body.innerText)");
                visible();
                js("fetch('/api/auth/session').then(async r=>window.__qaSession={status:r.status,body:await r.json()})");
                until("Reload retained exact identity", "window.__qaSession?.status===200 && window.__qaSession.body.uid==="+JSONObject.quote(who.getString("uid")));
                String[][] routes = role.equals("coach")
                        ? new String[][]{{"Schedule","/events"},{"Roster","/roster"},{"Chat","/chats"}}
                        : new String[][]{{"Schedule","/calendar"},{"Profile","/roster"},{"Chat","/chats"}};
                for (String[] route: routes) {
                    clickText(route[0]);
                    until("Navigation "+route[1], "location.pathname==="+JSONObject.quote(route[1])+" && !!document.querySelector('main h1')");
                    assertEquals("No page load error", "false", js("/Unable to load|permission.denied|Something went wrong|Failed to load/i.test(document.querySelector('main').innerText)"));
                    checkpoint(role+route[1].replace('/', '-'));
                }
                scenario.moveToState(Lifecycle.State.CREATED);
                scenario.moveToState(Lifecycle.State.RESUMED);
                until("Foreground preserves chat", "location.pathname==='/chats' && !!document.querySelector('main h1')");
                // Native verification is asynchronous even when the current DOM already exists.
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
                AtomicReference<Boolean> shown=new AtomicReference<>(false);
                while(System.nanoTime()<deadline && !shown.get()) {
                    scenario.onActivity(a->shown.set(a.findViewById(R.id.shell_web_view).getVisibility()==View.VISIBLE));
                    Thread.sleep(250);
                }
                checkpoint(role+"-foreground-chat");
                clickText("More");
                clickText("Profile & Settings");
                until("Settings", "location.pathname==='/settings' && /global settings/i.test(document.body.innerText)");
                assertEquals("No payment controls", "false", js("[...document.querySelectorAll('a,button')].some(e=>/Manage Subscription|Upgrade|Checkout/i.test(e.textContent))"));
                clickText("Sign Out");
                until("Logout", "location.pathname==='/login' && !!document.querySelector('#password')");
                js("fetch('/api/auth/session').then(r=>window.__qaLogoutStatus=r.status)");
                until("Server logout", "window.__qaLogoutStatus===401");
                checkpoint(role+"-logout");
            }
        }
    }
}
