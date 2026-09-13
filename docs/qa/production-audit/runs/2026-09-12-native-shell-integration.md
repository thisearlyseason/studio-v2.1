# Native shell integration acceptance — 2026-09-12

Final-fix base: `85bb2b896f617c94ade614dd0643503d82fd5c61`. Scope was local native acceptance only; no deployment or hosted mutation was authorized.

## Result

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

The package diff contains native work plus this plan/evidence handoff; recorded comparison of the three pre-existing dirty web-file hashes remained byte-for-byte equal to the pre-package baseline. Web and policy tests were not rerun in the final-fix wave because those surfaces did not change. Controlled transport/WebView fixtures are not hosted authentication, provider, signing, release, store-submission or physical-device proof. Final scoped re-review and controller-owned device cleanup remain pending.
