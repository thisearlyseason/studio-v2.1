# Native Destination Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and test matching native destination guards before either permanent shell is allowed to load the store application.

**Architecture:** Pure Swift and Java policy modules validate an explicitly configured HTTPS store origin, navigation and decoded bootstrap metadata. Shared literal fixtures exercise both implementations. This package makes no network requests and does not constitute a native app.

**Tech Stack:** Swift Foundation, Java standard library, Node.js built-in test runner for compiler/fixture orchestration. Use installed toolchains; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-12-native-shell-design.md`, package 1. Packages 2–5 are separate work packages, not omitted tasks in this plan.

## Global Constraints

- Source goes under `native/`; do not modify `src/`, web dependencies, deployment settings, provider keys or subscriptions.
- Release destination is supplied explicitly. Missing/invalid configuration prevents use. No default to `thesquad.pro`, localhost, a demo host, or an invented production domain.
- Use Swift Foundation and Java standard library only. No additional package dependencies.
- Pure bootstrap interfaces receive `distribution: String?`/nullable `String`, not raw JSON. Do not claim these unit tests verify a network client or JSON decoder.
- Shared hand-written test vectors must run against both real implementations. A wrong-origin allowance, missing scheme check, redirect acceptance or web-mode bootstrap acceptance must cause a failed assertion.

## File map

- `native/policy/fixtures.json`: literal configuration, navigation and bootstrap cases consumed by both native test drivers.
- `native/ios/Policy/StoreDestination.swift`: immutable validated origin and bootstrap policy using Foundation URLComponents.
- `native/android/policy/pro/thesquad/shell/StoreDestination.java`: equivalent immutable policy using java.net.URI.
- `native/tests/PolicyProbe.swift`: test-only command-line adapter for Swift policy operations.
- `native/tests/PolicyProbe.java`: test-only command-line adapter for Java policy operations.
- `native/tests/destination-policy.test.mjs`: compiles adapters into a task-specific temporary directory, runs literal cases and asserts exit/output, then cleans only that directory.
- `native/README.md`: commands, interfaces, non-certification boundary and remaining shell integration requirements.

## Interfaces

Swift:

```swift
struct StoreDestination {
    init?(origin: String)
    let origin: String
    var bootstrapURL: String { get }
    func allows(_ candidate: String) -> Bool
    func acceptsBootstrap(status: Int, finalURL: String,
                          redirected: Bool, distribution: String?) -> Bool
}
```

Java:

```java
package pro.thesquad.shell;
public final class StoreDestination {
    public static StoreDestination parse(String origin); // null when invalid
    public String origin();
    public String bootstrapURL();
    public boolean allows(String candidate);
    public boolean acceptsBootstrap(int status, String finalURL,
                                    boolean redirected, String distribution);
}
```

Do not throw for untrusted input. The public configuration entry returns nil/null; navigation/bootstrap return false.

### Task 1: Implement and cross-check both destination policies

**Files:** all seven implementation/test/fixture paths in the file map; README belongs to Task 2.

**Consumes:** package 1 exact contract in the spec, installed Swift/JDK binaries.

**Produces:** the interfaces above and one focused test command: `node --test native/tests/destination-policy.test.mjs`.

- [x] **Step 1: Write literal fixtures and executable test drivers before policy implementations.**

Use the reserved test origin `https://store.example.test`; never contact it. The first cases are:

```json
{
  "configuration": [
    {"input":"https://store.example.test","want":"https://store.example.test"},
    {"input":"https://STORE.example.test:443/","want":"https://store.example.test"},
    {"input":"","want":null},
    {"input":"http://store.example.test","want":null},
    {"input":"https://store.example.test:444","want":null},
    {"input":"https://store.example.test/login","want":null},
    {"input":"https://user@store.example.test","want":null},
    {"input":"https://store.example.test?next=/login","want":null},
    {"input":"https://store.example.test#fragment","want":null},
    {"input":"https://localhost","want":null},
    {"input":"https://127.0.0.1","want":null},
    {"input":"https://[::1]","want":null},
    {"input":"https://store.example.test.","want":null},
    {"input":"https://%73tore.example.test","want":null},
    {"input":" https://store.example.test","want":null}
  ],
  "navigation": [
    {"input":"https://store.example.test/dashboard","want":true},
    {"input":"https://STORE.example.test:443/teams/join?code=QA%20ONLY#review","want":true},
    {"input":"https://store.example.test.evil.test/dashboard","want":false},
    {"input":"https://sub.store.example.test/dashboard","want":false},
    {"input":"https://store.example.test@evil.test/dashboard","want":false},
    {"input":"https://evil.test@store.example.test/dashboard","want":false},
    {"input":"https://store.example.test:444/dashboard","want":false},
    {"input":"//store.example.test/dashboard","want":false},
    {"input":"/dashboard","want":false},
    {"input":"http://store.example.test/dashboard","want":false},
    {"input":"javascript:alert(1)","want":false},
    {"input":"data:text/html,test","want":false},
    {"input":"file:///dashboard","want":false},
    {"input":"intent://dashboard","want":false},
    {"input":"https://store.example.test/%ZZ","want":false},
    {"input":"https://store.example.test/a b","want":false},
    {"input":"https://store.example.test\\@evil.test/","want":false},
    {"input":"https://store.example.test/\nlogin","want":false}
  ],
  "bootstrap": [
    {"status":200,"finalURL":"https://store.example.test/api/app-distribution","redirected":false,"distribution":"store","want":true},
    {"status":200,"finalURL":"https://store.example.test/api/app-distribution","redirected":false,"distribution":"web","want":false},
    {"status":200,"finalURL":"https://store.example.test/api/app-distribution","redirected":false,"distribution":null,"want":false},
    {"status":200,"finalURL":"https://store.example.test/api/app-distribution","redirected":false,"distribution":"STORE","want":false},
    {"status":200,"finalURL":"https://store.example.test/api/app-distribution","redirected":true,"distribution":"store","want":false},
    {"status":503,"finalURL":"https://store.example.test/api/app-distribution","redirected":false,"distribution":"store","want":false},
    {"status":200,"finalURL":"https://evil.test/api/app-distribution","redirected":false,"distribution":"store","want":false},
    {"status":200,"finalURL":"https://store.example.test/login","redirected":false,"distribution":"store","want":false},
    {"status":200,"finalURL":"https://store.example.test/api/app-distribution?redirect=1","redirected":false,"distribution":"store","want":false}
  ]
}
```

The adapters accept command-line arguments: operation (`configuration`, `navigation`, `bootstrap`), configured origin, then operation inputs. Print normalized origin or `INVALID` for configuration and `true`/`false` for decisions; no diagnostic output on stdout. Use a dedicated `NULL` adapter argument for missing distribution; this sentinel is test-only.

The Node runner uses `mkdtempSync(join(tmpdir(), 'squad-native-policy-'))`, `spawnSync` with argument arrays and bounded timeouts, and `assert.strictEqual` on output. Compile once per suite. Resolve Swift with `xcrun --find swiftc`; resolve Java from explicit `JAVA_HOME` or the installed Android Studio JDK. Fail rather than skip if a compiler is missing. Use a `finally` hook to remove only the created temporary directory. Never construct commands with interpolated test input.

```js
for (const [platform, probe] of probes) {
  for (const row of fixtures.navigation) {
    test(`${platform} denies or permits navigation: ${JSON.stringify(row.input)}`, () => {
      assert.equal(probe(['navigation', 'https://store.example.test', row.input]), String(row.want));
    });
  }
}
```

- [x] **Step 2: Establish a real red failure.**

First run the command and record missing implementation as setup evidence. Create minimal compilable policy shells that return nil/null/false, rerun, and require the valid-origin/navigation/bootstrap assertions to fail. Compilation failure alone is not TDD proof. Keep the test adapters out of production classes.

- [x] **Step 3: Implement minimal real URL validation.**

Use native parsers, not string-prefix matching. Before parsing, reject ASCII whitespace/control characters, backslashes and malformed percent escape sequences. Validate authority has no userinfo or percent escapes. Validate DNS labels as ASCII letters/digits with interior hyphens, no empty labels, no leading/trailing hyphen, no trailing dot, and no IP/localhost destination. Configuration permits only empty/root pathname and no query/fragment. Normalize scheme/host case and default port.

Swift decision structure:

```swift
func acceptsBootstrap(status: Int, finalURL: String,
                      redirected: Bool, distribution: String?) -> Bool {
    status == 200 && !redirected && distribution == "store"
        && finalURL == bootstrapURL
}
```

Java decision structure:

```java
public boolean acceptsBootstrap(int status, String finalURL,
                                boolean redirected, String distribution) {
    return status == 200 && !redirected && "store".equals(distribution)
        && bootstrapURL().equals(finalURL);
}
```

Navigation validates the same parsed authority but permits valid path/query/fragment. Reject invalid configurations before constructing either immutable object. Add literal fixtures for any additional boundary exposed by the native parser, without computing expectations using the implementation.

- [x] **Step 4: Run the complete policy suite and focused mutation checks.**

Run `node --test native/tests/destination-policy.test.mjs`. Require all fixtures to pass on both implementations. In a temporary copy only, remove the exact-host comparison, then independently permit `web` bootstrap; each mutant must make the corresponding tests fail. Never modify the user's active implementation merely to run mutation checks.

- [x] **Step 5: Review and commit only package files.**

Request a scoped spec/code review including parser parity, rejection cases and test evidence. Resolve important findings. Stage `native/policy`, `native/ios/Policy`, `native/android/policy` and `native/tests` explicitly and commit `feat: add native store destination guards`. Preserve pre-existing UI cleanup and audit files.

### Task 2: Document the verified boundary and hand off shell integration

**Files:** create `native/README.md`; update this plan's checkboxes only after evidence exists.

**Consumes:** both policy implementations and their fresh test/review evidence.

**Produces:** a reproducible package command and an honest remaining-work checklist, without native release claims.

- [x] **Step 1: Write the short package guide.**

Include these exact interfaces by linking the two policy source files. Record the test command, supported installed toolchains, fixture-only domain and the fact that no network is used. State: “These tests verify destination policy only. They do not verify a WebView, network bootstrap, native authentication, notification delivery, signing or store acceptance.”

- [x] **Step 2: Verify no ordinary web changes were introduced by this package.**

Compare package commit paths against the recorded base. Run `git diff --check`. Do not rerun the full web audit or web production builds for native-only policy files; the preceding store-settings cleanup already has separate evidence.

- [x] **Step 3: Record next integration requirements.**

List actual maintained Xcode/Android projects, bounded nonredirecting bootstrap client, native loading/error/retry UI, WebView navigation consumers, offline/foreground handling and simulator/hosted acceptance as remaining. List the real store origin, application IDs and signing/provider configuration as unconfigured rather than selecting them silently. These entries are scope boundaries, not permission to mark shell integration complete.

- [ ] **Step 4: Commit guide, obtain whole-package review and finish without deployment.**

Commit only `native/README.md` and this plan's evidence-backed checkbox updates. Report policy completion separately from pending shell integration. Use the development-branch finishing skill; no push, merge, DNS/provider update or deployment is part of this package.
