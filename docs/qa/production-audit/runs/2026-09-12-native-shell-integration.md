# Native shell integration acceptance — 2026-09-12

Final-fix base: `85bb2b896f617c94ade614dd0643503d82fd5c61`. Scope was local native acceptance only; no deployment or hosted mutation was authorized.

## Result

### Authorized native hosted acceptance (latest)

The user explicitly approved a temporary protection exception for **only** `thesquadv2-native-store-qa-tylers-projects-5b59182e.vercel.app`. No automation credential was embedded in either native app. The direct bootstrap returned HTTP 200 and `{"distribution":"store"}` on the existing QA deployment. Both development builds used a command-line QA origin override; checked-in origins remain empty and Release remains blocked.

| Remaining boundary | Fresh result |
| --- | --- |
| iOS real hosted bootstrap and coach/athlete email/password sign-in | PASS: actual app-delegate controller/WKWebView against the QA backend; manual coach startup also inspected |
| Android real hosted bootstrap and coach/athlete email/password sign-in | PASS: installed development app and instrumented real WebView against the QA backend |
| Both platforms: reload persistence | PASS: exact expected QA UID from the real server session after a new document loads |
| Both platforms: role-correct Schedule/Calendar, Roster/Profile, Chat, More/settings, logout | PASS: real form and link handlers, no mocked API responses or authentication shortcuts; server session becomes 401 after logout |
| Both platforms: foreground re-verification and retained chat | PASS: Android Activity lifecycle, iOS real hosted controller lifecycle notifications; manual iOS Home/reopen also preserved chat |
| Both platforms: external and new-window links | PASS: external navigation denied, current trusted page retained |
| Android offline → foreground → Retry → restored network | PASS: emulator Wi-Fi/data disabled, content hidden with Retry, connectivity restored and native Retry recovers hosted login |
| iOS failed hosted bootstrap → native Retry → reachable host | PASS: restored QA protection produced the native connection/Retry UI; temporarily reopening the same approved QA host and pressing Retry recovered the actual login page; protection was then restored again |
| iOS real transport loss/airplane mode | NOT VERIFIED: do on a physical iPhone; host-protection rejection is not an offline-radio test |
| iOS finger-scrolling of More menu | NOT VERIFIED: desktop simulator gesture control was unreliable. Programmatic link navigation passed, but it is not touch-scroll certification |

Evidence: `native/ios/.build/hosted-acceptance-3.xcresult` (1 hosted multi-role test passed), `native/ios/.build/hosted-external.xcresult` (1 guard test passed), `/tmp/squad-android-hosted-final.log` (1 multi-role instrumented test passed), and the separately passing Android external/offline instrumented test. These are focused scenario counts, not a claim to rerun the full feature audit. Screenshot/checkpoint artifacts are under `output/playwright/native-store-hosted-20260912/`, including `ios-attachments/` and `android-native-*.png`.

Only test code was added. Early harness failures were corrected without production-code changes: native-ready/reload timing, CSS-transformed text matching, and iOS's legitimate return to Settings after a prior Settings login redirect. Android screenshots were recaptured after waiting for visible animation completion. iOS automatic screenshots can capture entrance transitions; the manual coach screenshot provides settled UI evidence. A menu-geometry reading during the sheet entrance animation does not establish a layout defect.

Disposable fixture run `native-mtz9856a-c90fc9` used only `the-squad-audit-preview`; both Auth identities and all three owned Firestore root trees were removed. Native push/provider sign-in, signing, physical-device tests and store submission remain separate, unverified release work. No App Store/Play Store certification or production deployment is claimed.

Final cleanup verified: QA protection exception absent, unauthenticated bootstrap HTTP 302 again, project protection still `all_except_custom_domains`, production target still `dpl_9oA7gd96szxVA2PxYmjqCNoJ9Kja`. Owned development-app/test APK installs and their private credential caches were removed; both owned simulators stopped. The three pre-existing dirty web-file hashes match the baseline exactly. Normal website source/configuration, production aliases and existing customer data were not changed. Protection proof: `output/playwright/native-store-hosted-20260912/protection-restored.json`.

Physical follow-up once signed native builds are available: (1) on iPhone, open a signed-in page, disable Wi-Fi and cellular, background/reopen, confirm content hides and Retry appears, restore connectivity and confirm Retry recovers; (2) finger-scroll More to Profile & Settings and back on both phones. These checks do not certify unimplemented native push, provider sign-in or store release.

### Authorized cancellation follow-up (previous)

**Final follow-up result: cancellation repaired; hosted browser sign-in/navigation PASS. Native hosted/device acceptance remains separately blocked by deployment protection.**

Final QA target: `https://thesquadv2-native-store-qa-tylers-projects-5b59182e.vercel.app` → `dpl_3Zx2i9UUeazEDRwvpD41amTY3jD9` (`thesquadv2-7boy3rye2-tylers-projects-5b59182e.vercel.app`). Vercel status Ready; Next production compilation, lint/type checking and build completed (existing warnings retained). Build log: `output/playwright/native-store-hosted-20260912/aligned-build.log`.

The initial preview exposed a configuration mismatch, not an authentication-code regression: password authentication returned 200 for `the-squad-v2-staging`, while `/api/auth/session` returned 401 `auth/project-mismatch`; runtime logs identified the existing preview Admin credential's project as `the-squad-audit-preview`. The corrected deployment explicitly aligns public configuration/runtime project IDs with that existing QA backend and sets the stable QA app origin. No credential rotation, production setting change, token-validation bypass or new service-account key was needed.

Fresh Playwright evidence on the corrected host:

| Check | Result |
| --- | --- |
| Protected bootstrap with existing authorized automation credential | PASS: HTTP 200, `distribution: store`; credential used only for the QA host |
| Coach and adult-athlete real email/password sign-in | PASS: both reach dashboard even with a stale pricing return URL |
| Reload/session persistence | PASS: server session returns 200 and exact expected QA UID for each role |
| Desktop Schedule/Roster/Chat navigation | PASS for both roles; no uncaught page errors or observed 5xx responses |
| Mobile navigation at 390×844 | PASS: coach Schedule/Roster/Chat; athlete Calendar/Profile/Chat; no horizontal overflow; screenshots inspected |
| More → Profile & Settings | PASS for both; purchase links absent |
| Logout and signed-out dashboard | PASS: session becomes 401; dashboard redirects to login |
| Public/legal/free-signup routes | PASS: privacy/signup 200 |
| Purchase guards | PASS: pricing/checkout/billing 403; checkout POST 403 |
| Native unauthenticated bootstrap | BLOCKED: Vercel returns 302; native guard correctly cannot accept this protected host |

Artifacts under `output/playwright/native-store-hosted-20260912/`: role `*-navigation.json`, `*-mobile-logout.json`, `*-mobile.png`, `public-results.json`, cleanup records, and reproducible `runner.mjs`. The first athlete mobile harness assumed coach destinations; inspection showed intended athlete `/calendar` and Profile navigation, so only the harness was corrected. No app repair was needed. The Vercel feedback overlay script is blocked by the existing CSP; CSP was not relaxed. Passing application-navigation checks exclude that hosting-toolbar diagnostic and intentional 403/401 negative responses.

Cleanup removed both initial staging test identities and their three owned root trees, then both audit-preview identities and their three root trees. No customer data was removed; these synthetic fixtures are regenerable. The browser and owned simulator were closed. Native and website hashes/diff boundaries were preserved; production deployment remains `dpl_9oA7gd96szxVA2PxYmjqCNoJ9Kja`, with unchanged protection settings.

The user explicitly authorized the remaining repair and hosted QA deployment. Current provisional/committed cancellation now retires the failed navigation, invalidates pending verification and shows Retry; obsolete/nil cancellations remain harmless. Failure persists across foreground verification until explicit Retry.

- RED: fresh derived-data build, `cancellation-fresh-red.xcresult`: 18 controller tests, 2 failed exactly on the new cancellation recovery assertions. An initial reused-derived-data attempt ran only the older 15 tests and is excluded from proof.
- GREEN: `cancellation-green.xcresult`: all 27 XCTest tests passed, zero failures/skips. Debug build and matching install passed. Added tests cover provisional/committed cancellation, stale finish, foreground persistence, explicit Retry and obsolete cancellation during a replacement navigation.
- Independent focused review: GO, no actionable regressions; source/test diff only. Web diff and baseline hashes remain identical; Android/policy were unchanged and not rerun.
- These are controller tests with real navigation identities and controlled delegate/bootstrap outcomes, not hosted/native-device sign-in proof.
- Approved QA preview created: `dpl_vtQgnAWSVvJJg5Smv8RrxLUNaAkg`, `https://thesquadv2-l44ngkya4-tylers-projects-5b59182e.vercel.app`. Build-time/runtime distribution is explicitly store; public Firebase config and project IDs target `the-squad-v2-staging`. Existing preview-only Admin credentials remain inside Vercel; no production settings/alias changes. Hosted build and browser acceptance pending. Vercel browser sign-in requested without weakening deployment protection.

The older open cancellation finding below is superseded by this repair; hosted/release limitations are not superseded.

**Local handoff remains incomplete; release is not approved.** Final scoped review closed the three original findings but identified one Important iOS cancellation-recovery defect at `ShellViewController.swift:373`. A cancelled current `WKNavigation` remains retained with Retry hidden; successful foreground verification continues waiting for that cancelled document. This is a code-path finding, not a newly reproduced simulator failure. Next repair must ignore obsolete cancellations while retiring terminal current cancellation into a recoverable state, with a regression covering subsequent foreground verification. Existing passing tests do not cover this case.

| Boundary | Status | Evidence |
| --- | --- | --- |
| Shared policy | PASS | `node --test native/tests/destination-policy.test.mjs`: 134 passed, 0 failed/skipped. Existing Swift/Java policy sources are referenced, not copied. |
| iOS Debug/XCTest | PASS | Fresh final-fix package: 24/24. `build-for-testing`, matching Debug-app install, then `test-without-building` used the same derived data and destination. Result bundle: `native/ios/.build/final-fix-full.xcresult`. |
| iOS actual UI | PASS (local simulator) | Safe empty-origin setup, retry, portrait and landscape were inspected; no web content was visible. |
| Android Debug/lint/instrumentation | PASS | Fresh final-fix combined gate with `--rerun-tasks`: build success; lint 0 errors/1 pinned-Gradle advisory; 47/47 tests with 0 failures/errors/skips on owned `emulator-5554`. Compiler deprecated-API note remains; Gradle assignment warnings are fixed. XML: `native/android/app/build/outputs/androidTest-results/connected/debug/TEST-Squad_QA_Pixel_8_API_36(AVD) - 16-_app-.xml`. |
| Android actual UI | PASS (local emulator) | Installed matching APK showed the accessible empty-origin setup/retry UI, unloaded WebView and readable portrait/landscape layout. A real attached hidden WebView also proved the controlled same-origin HTTPS commit callback path. |
| Release | BLOCKED BY DESIGN | iOS Release preflight fails explicitly and Android exposes no `assembleRelease`; production identity, origin, signing/provider and store configuration are absent. |
| Hosted store flow | BLOCKED | No answer authorized a QA deployment, and no configured store-only target or approved QA session exists. Bootstrap, sign-in, navigation, foreground and offline hosted checks were not run. |

The Android native shell requires both trusted commit and finish within 30 seconds for a current main-frame navigation. A legitimate slower page requires Retry; TLS validation and ordinary web behavior are unchanged.

## Reproduction

```sh
node --test native/tests/destination-policy.test.mjs

SQUAD_IOS_SIMULATOR='75AA0D3B-56B4-4F1E-8CBF-0A7264DC58FF'
xcrun simctl boot "$SQUAD_IOS_SIMULATOR" 2>/dev/null || true
xcrun simctl bootstatus "$SQUAD_IOS_SIMULATOR" -b
xcodebuild -quiet -project native/ios/SquadShell.xcodeproj -scheme SquadShell \
  -configuration Debug -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$SQUAD_IOS_SIMULATOR" \
  -derivedDataPath native/ios/.build/task1-derived-data CODE_SIGNING_ALLOWED=NO \
  build-for-testing
xcrun simctl install "$SQUAD_IOS_SIMULATOR" \
  native/ios/.build/task1-derived-data/Build/Products/Debug-iphonesimulator/SquadShell.app
xcodebuild -quiet -project native/ios/SquadShell.xcodeproj -scheme SquadShell \
  -configuration Debug -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$SQUAD_IOS_SIMULATOR" \
  -derivedDataPath native/ios/.build/task1-derived-data CODE_SIGNING_ALLOWED=NO \
  test-without-building

JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
ANDROID_HOME='/Users/tylerans/Library/Android/sdk' \
ANDROID_SERIAL='emulator-5554' \
native/android/gradlew -p native/android \
  :app:assembleDebug :app:lintDebug :app:connectedDebugAndroidTest --rerun-tasks

/Users/tylerans/Library/Android/sdk/platform-tools/adb -s emulator-5554 install -r \
  native/android/app/build/outputs/apk/debug/app-debug.apk
/Users/tylerans/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell am start -W \
  -n pro.thesquad.shell.dev/pro.thesquad.shell.ShellActivity
```

Artifacts: `/tmp/squad-native-policy-package2.log`, `native/ios/.build/package2-verification-retry.log`, `native/ios/.build/package2-landscape-setup.png`, `native/ios/.build/final-fix-full.xcresult`, `native/android/app/build/reports/lint-results-debug.html`, `native/android/app/build/outputs/androidTest-results/connected/debug/TEST-Squad_QA_Pixel_8_API_36(AVD) - 16-_app-.xml`, and the matching Debug APK.

Controller independently rebuilt and retested `28282dd3`: iOS 24/24 passed with 0 failures/skips (`native/ios/.build/controller-final.xcresult`); Android build/lint and all 47 instrumentation tests passed with `--rerun-tasks --warning-mode all`, 74 tasks executed. The pinned-Gradle advisory and compiler deprecated-API note remain. These passing suites do not override the uncovered review defect.

The web diff and three pre-existing dirty web-file hashes still match the pre-package baseline byte-for-byte. Web and policy tests were not rerun after native-only fixes. Controlled fixtures are not hosted authentication, provider, signing, release, store or physical-device proof. Final scoped review is complete with one Important finding open; owned test devices were shut down and confirmed stopped. Commits and worktree remain local; no deployment or production changes occurred.

Review-cap ruling: retain the cancellation finding as a release-blocking follow-up after the single final fix/re-review wave. It is a real recovery defect; the cost is incomplete local acceptance until targeted repair and verification, not a risk accepted for release.
