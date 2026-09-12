# The Squad native shell — approved architecture

Status: user approved the separate native-shell approach on 2026-09-12. This is design approval, not native implementation, deployment, signing, or store certification.

## Architecture and preservation boundary

Use a Swift/UIKit/WKWebView iOS shell and an Android platform WebView shell around a separately deployed store-mode version of the existing Next.js application. Keep the Firebase backend and server-enforced roles/entitlements. The ordinary website remains web distribution, including its current Stripe flows. The Squad remains the primary app; Scheduler remains a secondary PWA.

This supersedes only the Capacitor-shell selection in `2026-09-12-native-companion-foundation-design.md`. Its free signup, purchase restrictions, entitlement, moderation, deletion, privacy and release requirements remain binding. Do not ship the ignored QA prototype, a static-export rewrite, or Capacitor's development-oriented `server.url` configuration.

Web changes can reach the companion after the shared revision is tested and released to its separate store deployment. Native SDK/configuration changes require a separately built native release. The website deployment must not automatically change native release configuration.

## Packages and ordering

1. **Native destination policy:** independently testable Swift and Java policy modules, with matching literal acceptance cases. They validate configuration, same-origin navigation and bootstrap response metadata. No web source edits, SDK additions, network calls or native credentials are needed.
2. **Shell integration:** normal maintained Xcode and Android projects consume the policies. Add native loading/error/retry screens, safe areas, keyboard/back handling, and an HTTPS store-target bootstrap. Compile and run on both installed simulators, followed by hosted store-target checks. The policy library alone is not a functioning app.
3. **Native authentication:** native provider SDKs and a separately threat-reviewed, bounded identity handoff to the existing Firebase web client. The web client's Firestore authentication must be established, not merely its server cookie. Do not embed Google OAuth, inject long-lived credentials, or change existing web auth. Until implemented, retain the honest unavailable provider controls and existing email/password flow.
4. **Native notifications and links:** native APNs/FCM registration, current-account token binding, refresh, permission changes, opt-out, logout/account switch, membership removal, badges and authorized tap-through. Preserve working PWA push registrations and keys. No broad JavaScript bridge or wildcard message origins. Downloads/share, deep links and external navigation get explicit native handlers and abuse tests.
5. **Release acceptance:** hosted multi-role/tenant checks, moderation/deletion/privacy requirements, signing, actual iPhone/Android testing and store review. Simulator evidence does not complete these gates.

Packages 2–5 require their own detailed implementation plans. They must not be represented as covered by package 1 tests.

## Package 1 exact contract

- Source goes under `native/`; do not modify `src/`, web dependencies, deployment settings, provider keys or subscriptions.
- Release destination is supplied explicitly. Missing/invalid configuration prevents use. No default to `thesquad.pro`, localhost, a demo host, or an invented production domain.
- Configuration is an absolute HTTPS origin with an ASCII DNS hostname. Reject credentials, query, fragment, non-root path, IP literals, localhost, control characters, whitespace, backslashes, percent-encoded authority, and non-default ports. Accept explicit port 443 and canonicalize it away. DNS case is insensitive; reject a trailing dot to keep the configured origin unambiguous.
- Navigation accepts only absolute HTTPS URLs with the configured hostname and effective port 443, without credentials, malformed escapes, whitespace, backslashes or control characters. Accept paths, queries, fragments and correctly escaped path/query values on the approved origin. Deny lookalike suffixes, subdomains, protocol-relative URLs, userinfo tricks, HTTP, `javascript:`, `data:`, `file:` and `intent:`.
- The policy does not grant permissions or replace the store application's server purchase guards. It also does not decide which external links may open outside the app; that belongs to shell integration.
- Bootstrap request URL is the configured origin plus `/api/app-distribution`. Accept a result only when status is exactly 200, no redirect occurred, final URL is exactly that endpoint, and a successfully decoded JSON object's `distribution` value is the string `store`. Missing/non-string/unknown/web values fail closed. Transport, size limit, timeout, JSON parsing and content-type enforcement belong to package 2 and must be tested there.
- Pure bootstrap interfaces receive `distribution: String?`/nullable `String`, not raw JSON. Do not claim these unit tests verify a network client or JSON decoder.
- Use Swift Foundation and Java standard library only. No additional package dependencies.
- Shared hand-written test vectors must run against both real implementations. A wrong-origin allowance, missing scheme check, redirect acceptance or web-mode bootstrap acceptance must cause a failed assertion.

## Shell integration acceptance boundary

Before loading credentials or protected web content, fetch the bootstrap endpoint using an ephemeral/non-cookie-bearing native client, normal TLS validation, no redirects, a bounded response size and timeout. Parse JSON and enforce response type. On failure, show a native retry screen; never fall back to the ordinary website. Recheck on a cold start and foreground resume before restoring protected content. This is a build-target guard, not authentication or protection against a compromised approved host.

Top-level redirects, `target=_blank`, history restoration, deep links and navigation callbacks must all use the native destination policy. Unknown destinations are blocked in the first integration package, with a clear message. Subresource requirements are inventoried separately; do not solve Firebase compatibility by allowing arbitrary top-level origins or weakening production CSP/TLS. Disable WebView inspection in release builds. Do not add a JavaScript/native bridge in the shell-only package.

Use native-owned state for loading, retry and offline errors. Android Back navigates history when safe; otherwise it exits normally. Use native safe-area/keyboard layout and accessible controls. Sensitive state must not appear in logs. Provider integrations must be independently reviewed before adding capabilities to the trusted page.

## External configuration still required

An actual store deployment origin, bundle/application IDs, Apple and Google developer accounts, signing identities and platform-specific Firebase/APNs/provider configuration must be supplied and verified before release. No credentials are requested in chat. Keep provider-backed and physical-device rows blocked until fresh evidence exists.

## References

- [Capacitor configuration: remote server URL is not intended for production](https://capacitorjs.com/docs/config).
- [Android WebView native bridge risks and origin restrictions](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges).
- [Apple WKNavigationDelegate](https://developer.apple.com/documentation/webkit/wknavigationdelegate).
