# Native destination policy

This package contains a tested native policy library for validating an explicitly configured store origin, same-host navigation, and store-distribution bootstrap metadata. It is not a native app and does not certify a hosted or provider integration.

The matching policy interfaces are [Swift `StoreDestination`](ios/Policy/StoreDestination.swift) and [Java `StoreDestination`](android/policy/pro/thesquad/shell/StoreDestination.java). Run the shared literal fixtures against both implementations with:

```sh
node --test native/tests/destination-policy.test.mjs
```

The test runner uses the installed Swift 6.3.3 toolchain and Android Studio JDK 25.0.3. Compile-only checks also succeeded for the iPhoneSimulator 26.5 SDK and Android API 36. The reserved `store.example.test` origin appears only in fixtures; the suite makes no network requests.

These tests verify destination policy only. They do not verify a WebView, network bootstrap, native authentication, notification delivery, signing or store acceptance.

## Remaining integration work

- Add and maintain the actual Xcode and Android app projects.
- Implement a bounded, nonredirecting bootstrap client and native loading, error, and retry UI.
- Connect every WebView navigation consumer to the policy.
- Define offline and foreground handling.
- Complete simulator and hosted acceptance checks.
- Configure the real store origin, application IDs, and signing/provider settings; these remain unconfigured.
