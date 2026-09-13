# Native development shells

This package contains maintained iOS and Android development apps plus the shared destination-policy fixtures. Both apps reference their existing policy source directly; neither policy implementation is copied. The apps keep web content hidden until an explicitly configured origin passes the bounded `store` bootstrap check, and the default origin is empty.

The identifiers `pro.thesquad.shell.dev` and `Squad Development` are development-only. Release builds are deliberately blocked. No production identity, origin, signing configuration, provider integration, native authentication, push, payment SDK, deep-link association, store submission or physical-device certification is supplied here.

## Local verification

The iOS current-document cancellation follow-up is repaired and independently reviewed: terminal cancellation exposes Retry, obsolete cancellations are ignored, and foreground verification cannot revive a failed page. Fresh iOS verification passed 27/27 tests. Hosted acceptance remains separate; see the [acceptance record](../docs/qa/production-audit/runs/2026-09-12-native-shell-integration.md).

Run the shared policy regression once from the repository root:

```sh
node --test native/tests/destination-policy.test.mjs
```

The accepted package result was 134 passed, 0 failed and 0 skipped. The fixtures make no network requests and do not establish hosted acceptance.

For iOS, explicitly boot the owned simulator, wait for it to finish booting and install the matching Debug product before launch or test. This avoids a stale `Dead`/temporary simulator container being mistaken for a code failure:

```sh
SQUAD_IOS_SIMULATOR='75AA0D3B-56B4-4F1E-8CBF-0A7264DC58FF'
xcrun simctl boot "$SQUAD_IOS_SIMULATOR" 2>/dev/null || true
xcrun simctl bootstatus "$SQUAD_IOS_SIMULATOR" -b
xcodebuild -quiet \
  -project native/ios/SquadShell.xcodeproj \
  -scheme SquadShell \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$SQUAD_IOS_SIMULATOR" \
  -derivedDataPath native/ios/.build/task1-derived-data \
  CODE_SIGNING_ALLOWED=NO build-for-testing
xcrun simctl install "$SQUAD_IOS_SIMULATOR" \
  native/ios/.build/task1-derived-data/Build/Products/Debug-iphonesimulator/SquadShell.app
xcodebuild -quiet \
  -project native/ios/SquadShell.xcodeproj \
  -scheme SquadShell \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$SQUAD_IOS_SIMULATOR" \
  -derivedDataPath native/ios/.build/task1-derived-data \
  CODE_SIGNING_ALLOWED=NO test-without-building
xcrun simctl launch "$SQUAD_IOS_SIMULATOR" pro.thesquad.shell.dev
```

The latest accepted result is 27 XCTest passes (`native/ios/.build/cancellation-green.xcresult`). A first cold managed-test attempt crashed before tests connected because the simulator referenced a stale temporary container and could not find `SquadShell.debug.dylib`; explicit boot status plus building for testing, reinstalling the matching app, and testing without rebuilding resolves that runner state without a code change. Use a fresh derived-data directory if the result omits newly added tests. The actual app showed the safe no-origin setup and retry UI in portrait and landscape with no web content exposed. Controller regressions use real `WKNavigation` identities from `WKWebView`, while directly driving delegate outcomes; they are not hosted-navigation proof.

For Android, use the pinned toolchain and the explicitly owned emulator:

```sh
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
ANDROID_HOME='/Users/tylerans/Library/Android/sdk' \
ANDROID_SERIAL='emulator-5554' \
native/android/gradlew -p native/android \
  :app:assembleDebug :app:lintDebug :app:connectedDebugAndroidTest \
  --rerun-tasks
```

The accepted result was a successful Debug build, lint with 0 errors and 1 deliberate pinned-Gradle 9.3.1 newer-version advisory, and 47/47 instrumentation tests with 0 failures, errors or skips. Compilation also emits a transparent deprecated-API note; the former Gradle assignment deprecation warnings were fixed. Instrumentation includes a real attached hidden WebView reaching a controlled same-origin HTTPS commit callback; it is not hosted or authenticated proof.

Install and inspect the matching APK with:

```sh
/Users/tylerans/Library/Android/sdk/platform-tools/adb -s emulator-5554 install -r \
  native/android/app/build/outputs/apk/debug/app-debug.apk
/Users/tylerans/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell am force-stop \
  pro.thesquad.shell.dev
/Users/tylerans/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell am start -W \
  -n pro.thesquad.shell.dev/pro.thesquad.shell.ShellActivity
```

The actual Activity showed the accessible setup message and `Try again`, with an unloaded WebView and readable portrait/landscape layout.

Android gives each current main-frame navigation 30 seconds to reach both trusted commit and finish. If a legitimate page takes longer, the native shell requires Retry. This is a native recovery bound; it does not weaken TLS validation or alter normal website behavior.

## Deliberate release and hosted boundaries

The iOS Release preflight fails with the explicit non-releasable-app error, and Android has no `assembleRelease` task. These are verified safeguards, not release successes. Production signing, identities, origin and provider/store work remain unconfigured.

Hosted **Playwright browser** acceptance now passes on the approved protected store QA preview: coach and athlete email/password sign-in, session reload, desktop/mobile navigation, settings, logout and purchase-route guards. The target is `https://thesquadv2-native-store-qa-tylers-projects-5b59182e.vercel.app`, deployment `dpl_3Zx2i9UUeazEDRwvpD41amTY3jD9`, using only `the-squad-audit-preview` Firebase data. Tests used an existing automation protection credential without changing project protection. Disposable accounts/data were removed.

Hosted **native-shell** sign-in, foreground and offline acceptance remain BLOCKED: an unauthenticated bootstrap request receives Vercel's 302 authentication redirect. The native bootstrap intentionally sends no credential/cookie and rejects redirects. Do not embed the automation credential in either app or weaken that guard. A directly reachable, explicitly approved store host is required for native acceptance; browser proof is not native-device or store certification. Production website configuration is unchanged.
