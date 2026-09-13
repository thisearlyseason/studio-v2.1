# Native Shell Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create maintained iOS and Android development apps that consume the verified destination policies and keep web content hidden until a bounded native bootstrap confirms a store deployment.

**Architecture:** Separate native app projects reuse the policy sources without duplicating them. Native networking and lifecycle state own loading/error/retry; authenticated application content remains in a same-origin WebView. Web source and production configuration remain unchanged. Hosted acceptance requires a separately authorized QA deployment.

**Tech Stack:** Swift/UIKit/WebKit/URLSession/XCTest; Java/platform Android UI/WebView/OkHttp 5.3.0; Android Gradle Plugin 9.1.1, Gradle 9.3.1, installed SDK 36/build tools 36.0.0. Android instrumentation uses AndroidX runner 1.6.2 and ext-junit 1.2.1. These are native-only build/network/test dependencies; the existing policy libraries remain dependency-free.

**Spec:** `docs/superpowers/specs/2026-09-12-native-shell-design.md`, package 2 and shell integration acceptance boundary.

## Global Constraints

- Source goes under `native/`; do not modify `src/`, web dependencies, deployment settings, provider keys or subscriptions.
- Release destination is supplied explicitly. Missing/invalid configuration prevents use. No default to `thesquad.pro`, localhost, a demo host, or an invented production domain.
- Disable WebView inspection in release builds. Do not add a JavaScript/native bridge in the shell-only package.
- Sensitive state must not appear in logs.
- No native provider sign-in, push, payment SDK, deep-link association, signing identity or release submission in this package.
- Development-only app identifier: `pro.thesquad.shell.dev`; display name: `Squad Development`. This is not a selected release identity. Production store origin remains empty until explicitly configured.
- iOS deployment target 17.0; Android minSdk 26, compileSdk/targetSdk 36. Test on the existing iPhone17Pro simulator and Pixel8 API36 emulator. These are implementation floors, not App Store certification.
- No TLS bypass, global certificate trust change, HTTP production exception, cookie/credential copying from the website, or arbitrary external top-level navigation.
- Dependencies may be downloaded from official package repositories for the declared native build. Do not modify global shell configuration or install unrelated tools.

## Shared behavior contract

The initial native screen is `Checking app…`. Missing/invalid origin shows `App setup required` with `A store-only app destination has not been configured.` and a `Try again` button; no WebView is loaded. A transport/metadata failure shows `Unable to open The Squad` with `Check your connection and try again.` and `Try again`. Do not display raw URLs, JSON, server errors or credentials.

Before any initial WebView load, fetch the policy's exact bootstrap URL using GET, no cookies, no credential storage/authenticator, no cached response, no automatic redirects, a 10-second overall timeout, and at most 4096 response bytes. Require HTTP200, media type `application/json` (case-insensitive, optional parameters), a JSON object, and a string-valued `distribution`. Use the existing `acceptsBootstrap` method for final URL/status/redirect/distribution checks. Array/null/non-string/malformed/oversized bodies fail. Do not stringify arbitrary JSON values.

On success load `origin + /dashboard`; normal app auth can redirect to same-origin login. A completed, permitted page replaces the loading screen. A main-frame load/TLS/process error returns to native retry UI. Subresource failures do not indiscriminately blank a successfully loaded page. JavaScript and DOM storage are needed by the web app; native bridges, file/content URL access, mixed content, popups and unsolicited new windows are not.

Android applies a bounded 30-second deadline for the current main-frame navigation to reach both trusted commit and finish. A legitimate navigation that exceeds the bound requires native Retry. This recovery rule does not bypass TLS or alter normal website behavior.

Every top-level navigation decision, new-window request and history action uses `StoreDestination.allows`. Reject untrusted destinations and display `This link cannot be opened in the app.` without sending the user to an external browser in this package. An allowed same-origin new-window request is loaded in the existing WebView. No launch/deep-link intent may choose a different origin.

Backgrounding hides protected content. Foreground activation and retries invalidate the previous bootstrap attempt, create a new generation and keep content hidden until verified. Late callbacks from an earlier generation cannot reveal content or replace a newer error/success. Preserve an existing permitted page/session on a successful foreground recheck; reload only for initial load or explicit retry of a failed page. Cancel work when the owning screen is destroyed.

Native controls use safe areas/insets, accessible labels, scalable text and keyboard resizing. Android Back first navigates to a permitted previous entry, otherwise exits normally. Release builds are deliberately disabled until explicit release identity/configuration and later native acceptance work are supplied; debug builds must not be presented as releasable.

### Task 1: iOS maintained app, bootstrap client and lifecycle UI

**Files:**
- Create `native/ios/SquadShell.xcodeproj/project.pbxproj`, shared `SquadShell.xcscheme` and `SquadShellTests` test scheme/target configuration as needed.
- Create `native/ios/App/AppDelegate.swift`, `Info.plist`, `ShellViewController.swift`, `StoreBootstrapClient.swift`.
- Create `native/ios/Tests/StoreBootstrapClientTests.swift`, `ShellViewControllerTests.swift`, and test-only URLProtocol/controlled-client helpers in `Tests/`.
- Consume `native/ios/Policy/StoreDestination.swift` in the app target by file reference; do not copy or rewrite it.
- Create `native/ios/.gitignore` for local Xcode state/build output if needed.

**Interfaces:**

```swift
protocol BootstrapCancellation { func cancel() }
protocol StoreBootstrapChecking {
    @discardableResult
    func check(_ destination: StoreDestination,
               completion: @escaping (Bool) -> Void) -> BootstrapCancellation
}
final class StoreBootstrapClient: StoreBootstrapChecking { /* URLSession delegate owner */ }
@MainActor final class ShellViewController: UIViewController {
    init(destination: StoreDestination?, bootstrap: StoreBootstrapChecking)
}
```

These constructor dependencies are used by the app and tests; do not add methods solely for tests to production classes. AppDelegate reads `SquadStoreOrigin` from Info.plist (empty by default) and constructs the real client/controller. Use native lifecycle notifications or the scene/app delegate, avoiding duplicate foreground work on initial appearance.

- [x] **Step 1: Establish project and failing tests.**

Use a normal buildable Xcode project with app and XCTest targets, no project-generator dependency. Set Debug bundle ID/display name above, Swift language mode 5, automatic signing disabled for simulator checks. `SquadStoreOrigin` comes from an explicit `SQUAD_STORE_ORIGIN` build setting, default empty. Add a Release build preflight that fails clearly rather than exporting this development app.

Write tests against the interfaces and actual UIKit controls. Use URLProtocol only in the test target to supply controlled remote responses to a real URLSession client; keep networking/JSON/state handling real. The injected test session must not change production TLS configuration. Representative assertions:

```swift
func testWebDistributionNeverAllowsLoading() async {
    let result = await checkFixture(status: 200,
        contentType: "application/json", body: Data(#"{"distribution":"web"}"#.utf8))
    XCTAssertFalse(result)
}
func testStringStoreObjectAllowsLoading() async {
    let result = await checkFixture(status: 200,
        contentType: "application/json; charset=utf-8", body: Data(#"{"distribution":"store"}"#.utf8))
    XCTAssertTrue(result)
}
```

Define `checkFixture(status:contentType:body:) async -> Bool` in test helpers using a real destination and real client, with a test URLProtocol response. Add literal cases: status503, web/unknown/missing/null/numeric distribution, top-level array, malformed JSON, wrong content type, 4097-byte body, redirected response, timeout/error/cancellation. Assert the emitted request is exact GET without Cookie/Authorization and that completion occurs at most once. Test production session configuration is ephemeral with nil cookie/credential stores and redirect refusal through its delegate path.

UI/controller tests instantiate the real controller with a controlled bootstrap dependency: setup error has no loaded page; failed check shows retry; stale success after a newer failure cannot reveal a WebView; background hides content until foreground recheck. Direct policy callback tests cover same-origin navigation, external navigation/new windows and retry state. Do not assert mock existence.

Compile minimal interface stubs only after tests are written. Run the XCTest target, confirm actual assertion RED (not solely a project/compiler setup failure), then implement.

- [x] **Step 2: Implement the smallest production client and controller.**

Use `URLSessionConfiguration.ephemeral`, `httpShouldSetCookies = false`, nil cookie storage/credential storage/cache, request/resource timeout10 seconds, and `.reloadIgnoringLocalCacheData`. A session data delegate rejects redirects, validates headers, counts bytes before appending and cancels when over4096. Keep completion/cancellation exactly-once; invalidate sessions to break delegate ownership cycles. Marshal controller completion onto the main actor/queue.

```swift
guard response.statusCode == 200,
      response.mimeType?.lowercased() == "application/json",
      bytes.count <= 4096,
      let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
      let distribution = object["distribution"] as? String else {
    finish(false); return
}
finish(destination.acceptsBootstrap(status: response.statusCode,
    finalURL: response.url?.absoluteString ?? "", redirected: false,
    distribution: distribution))
```

`finish` is a private exactly-once completion method owned by the client, not a test helper. Redirect callbacks finish false and return no redirect request. Never handle TLS challenge with unconditional trust.

The controller owns WKWebView and native loading/error UI. Use persistent WKWebsiteDataStore for normal session persistence, no injected scripts or handlers. Set `isInspectable = false`. Apply the policy before loading requests, in WKNavigationDelegate, in WKUIDelegate new-window handling and history restoration. Use a generation counter and cancellation handle for foreground/retry races. Display only validated pages after their main-frame load succeeds. Link rejection must not change a trusted current page or open another app.

- [x] **Step 3: Run focused iOS tests and simulator checks.**

Run `xcodebuild -project native/ios/SquadShell.xcodeproj -scheme SquadShell -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,id=75AA0D3B-56B4-4F1E-8CBF-0A7264DC58FF' CODE_SIGNING_ALLOWED=NO test`, using a task-specific derived-data path under ignored output. Correct the scheme's XCTest wiring rather than bypassing tests. Build and launch the actual debug app in the existing simulator with no configured destination; inspect the native setup/retry UI. Stop only the simulator processes started for this task. Record mocked-transport tests versus real simulator UI separately. No hosted login PASS without a real store target.

- [x] **Step 4: Self-review and commit iOS files only.**

Record RED/GREEN commands/results, actual app build/launch proof, remaining hosted checks and exact touched files. No whole web audit. Commit `feat: add guarded iOS development shell`; controller performs independent review.

### Task 2: Android maintained app, isolated bootstrap and lifecycle UI

**Files:**
- Create `native/android/settings.gradle`, root `build.gradle`, `gradle.properties`, official Gradle wrapper files and local build ignores.
- Create `native/android/app/build.gradle`, `app/src/main/AndroidManifest.xml`, `app/src/main/res/values/strings.xml` and minimal themes/resources.
- Create `native/android/app/src/main/java/pro/thesquad/shell/StoreBootstrapClient.java`, `ShellActivity.java` and a small lifecycle controller/state class if needed to keep Activity focused.
- Create actual instrumentation tests under `app/src/androidTest/java/pro/thesquad/shell/` for bootstrap response handling and native UI/lifecycle.
- Consume `native/android/policy` as a source directory; do not copy or rewrite the validated policy.

**Interfaces:**

```java
interface BootstrapCancellation { void cancel(); }
interface StoreBootstrapChecking {
    BootstrapCancellation check(StoreDestination destination, java.util.function.Consumer<Boolean> completion);
}
final class StoreBootstrapClient implements StoreBootstrapChecking { /* isolated OkHttp client */ }
```

Production uses a fresh private OkHttpClient with `CookieJar.NO_COOKIES`, `Authenticator.NONE` for server/proxy, null cache, followRedirects/followSslRedirects false, call timeout10 seconds and normal TLS. Test-only call factories may supply controlled responses; production never accepts a trust-bypass setting. Keep callback dispatch/cancellation explicit.

- [x] **Step 1: Establish reproducible Gradle project and assertion RED.**

Use AGP9.1.1, Gradle9.3.1 (official wrapper and distribution checksum), Java17 source compatibility, minSdk26 and compile/targetSdk36. The installed Studio JDK25 can run Gradle9.3.1. Use repositories `google()` and `mavenCentral()`. Pin native dependencies:

```groovy
dependencies {
    implementation 'com.squareup.okhttp3:okhttp:5.3.0'
    androidTestImplementation 'androidx.test:runner:1.6.2'
    androidTestImplementation 'androidx.test.ext:junit:1.2.1'
}
```

The debug identifier/display name are the stated development values. `SquadStoreOrigin`/BuildConfig origin is empty unless an explicit `squadStoreOrigin` Gradle property is supplied; escape values through the build configuration rather than interpolating executable script content. Disable Release variants for this development-only package. Do not create or copy production signing keys. Set `usesCleartextTraffic=false`, no backup, INTERNET permission only, Activity `adjustResize`; disable WebView debugging.

Instrumentation tests run the actual Android JSONObject and native UI. Test helpers implement controlled OkHttp Calls/Responses rather than bypassing the client's validation. Representative response cases and request contract are the same literal list as Task1, repeated in the Java tests. Include oversize streaming bodies and cancellation/exactly-once behavior.

```java
@Test public void rejectsWebDistribution() {
    assertFalse(checkFixture(200, "application/json", "{\"distribution\":\"web\"}"));
}
@Test public void acceptsStringStoreObject() {
    assertTrue(checkFixture(200, "application/json; charset=utf-8", "{\"distribution\":\"store\"}"));
}
```

`checkFixture(int,String,String)` lives in androidTest and invokes the real client's validation through a controlled Call.Factory. No production method is added solely for tests. The real Activity's initial no-origin screen and accessible retry button are checked with instrumentation on the existing Pixel8 emulator. Lifecycle state tests verify stale success cannot override newer failure and no content is exposed during foreground verification. Capture only local fixture content.

- [x] **Step 2: Implement client and Activity without native bridges.**

Use bounded response streaming, close all bodies, enforce exactly-once completion and distinguish cancelled generations. Validate JSON with Android JSONObject and `object.opt("distribution") instanceof String`; do not use `optString` coercion. Delegate metadata acceptance to the existing policy.

```java
Object distribution = object.opt("distribution");
boolean accepted = distribution instanceof String
    && destination.acceptsBootstrap(response.code(), response.request().url().toString(),
        response.priorResponse() != null, (String) distribution);
```

The Activity owns native state, hides the WebView while checking or backgrounded, preserves permitted sessions after success and ignores stale callbacks. Use WebViewClient for main-frame navigation/error handling, WebChromeClient for new windows, and `StoreDestination.allows` for every top-level load/history destination. JavaScript/DOM storage enabled; file/content access and mixed content disabled; no addJavascriptInterface or external intents. Support modern Android Back behavior, including permitted history inspection, and content insets on API36 without clipped native controls. Release remains disabled; this is not a store submission artifact.

- [x] **Step 3: Build and run the focused Android tests.**

Use explicit `JAVA_HOME` for the installed Studio JDK and `ANDROID_HOME=/Users/tylerans/Library/Android/sdk`, without changing global profiles. Run `native/android/gradlew -p native/android :app:assembleDebug :app:lintDebug`, then `:app:connectedDebugAndroidTest` against only `Squad_QA_Pixel_8_API_36`. Use the exact emulator serial, not arbitrary attached phones. Observe real setup/retry UI; do not claim hosted flow verification from controlled response tests.

- [x] **Step 4: Self-review and commit Android files only.**

Record actual RED/GREEN, compiler/lint/instrumentation results, dependency downloads and remaining hosted checks. Commit `feat: add guarded Android development shell`; controller performs independent review.

### Task 3: Focused cross-platform acceptance and evidence

**Files:** update `native/README.md`, this plan's checkboxes and one concise run record under `docs/qa/production-audit/runs/`.

**Consumes:** reviewed native builds/tests from Tasks1–2 and the previously verified destination-policy suite.

**Produces:** accurate local completion status, hosted result or specific blocker, and reproducible native build/test commands.

- [x] **Step 1: Run the policy suite once as a shared-component regression.**

Run `node --test native/tests/destination-policy.test.mjs`. Confirm policy source was referenced, not duplicated. Compare package diff and baseline web-file hashes; no web behavior/build reruns for native-only changes.

- [x] **Step 2: Inspect both actual simulator app screens.**

Verify native setup/error/retry presentation, no background content exposure in supported local tests, readable portrait/landscape sizing and expected startup with absent configuration. Preserve screenshots and separate mocked external response tests from real UI observation. Fix only package-caused failures and recheck their exact paths.

- [ ] **Step 3: Perform hosted store checks only if separately authorized and available.**

**BLOCKED:** no separately authorized/configured store-only QA target or approved QA session is available; the deployment-approval question received no answer. No host was guessed and no provider, authentication, signing, release or store claim is made.

If the user approves the separate QA deployment, first establish an actual isolated target without changing the production alias or its settings. Verify its `/api/app-distribution` returns store before configuring either development app. Use existing approved QA fixtures/accounts, not real-user destructive changes. Check successful bootstrap, initial same-origin sign-in, permitted navigation, denied external/new-window navigation, app foreground recheck, and offline recovery. If no target/QA credentials are available, mark these BLOCKED with the exact missing prerequisite and do not present local substitute tests as hosted PASS.

- [ ] **Step 4: Final review and local handoff.**

Local handoff evidence is recorded. The combined final-fix wave now correlates iOS page callbacks to real `WKNavigation` identities, invalidates pending verification on current page/process failure, hides later full-page navigation on both platforms, and preserves a viable pending or completed document across a foreground recheck. Fresh local gates are 24/24 XCTest and Android Debug/lint plus 47/47 instrumentation. Final scoped re-review and test-device cleanup remain pending for the controller; the owned iPhone 17 Pro simulator and only `emulator-5554` were intentionally left running for that review.

Record passed/failed/blocked distinctions, known warnings and native-provider/release work remaining. Obtain final review and fresh focused verification after fixes. Keep commits local; production deployment and app-store publishing are excluded. Shut down only test services/devices started by this work.

## References for pinned native tooling

- [AGP9.1.1 compatibility: Gradle9.3.1, Build Tools36.0.0](https://developer.android.com/build/releases/agp-9-1-0-release-notes).
- [OkHttp official project and 5.3.0 dependency](https://github.com/square/okhttp).
- [Gradle Java compatibility](https://docs.gradle.org/current/userguide/compatibility.html).
