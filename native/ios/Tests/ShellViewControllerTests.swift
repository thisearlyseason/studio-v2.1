import UIKit
import WebKit
import XCTest

@testable import SquadShell

/// Opt-in live acceptance: uses the app delegate's real controller and real QA backend.
@MainActor
final class HostedShellAcceptanceTests: XCTestCase {
  private var web: WKWebView!

  func testHostedExternalNavigationDenied() async throws {
    let input = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("hosted-qa.private.json")
    guard FileManager.default.fileExists(atPath: input.path) else { throw XCTSkip("Explicit hosted QA only") }
    guard Bundle.main.object(forInfoDictionaryKey: "SquadStoreOrigin") as? String ==
      "https://thesquadv2-native-store-qa-tylers-projects-5b59182e.vercel.app" else {
      throw NSError(domain: "HostedQA.WrongOrigin", code: 1)
    }
    let controller = (UIApplication.shared.delegate as! AppDelegate).window!.rootViewController!
    web = findSubview(WKWebView.self, in: controller.view)!
    try await waitFor("Hosted login", "location.pathname==='/login' && !!document.querySelector('#password')")
    try await visible()
    let url = web.url
    _ = try await js("(()=>{const a=document.createElement('a');a.href='https://example.com';document.body.append(a);a.click();return true})()")
    let message = viewWithAccessibilityID("shell-link-error", in: controller.view)!
    let end = Date().addingTimeInterval(5)
    while message.isHidden && Date() < end { try await Task.sleep(for: .milliseconds(100)) }
    XCTAssertFalse(message.isHidden, "External navigation must receive native denial")
    XCTAssertEqual(web.url, url)
    _ = try await js("(()=>{const a=document.createElement('a');a.href='https://example.com';a.target='_blank';document.body.append(a);a.click();return true})()")
    // Allow the asynchronous new-window delegate decision to finish before checking the live view.
    try await Task.sleep(for: .milliseconds(500))
    XCTAssertEqual(web.url, url)
    try await checkpoint("external-and-new-window-denied")
  }

  private func js(_ source: String) async throws -> Any? {
    try await web.evaluateJavaScript(source)
  }

  private func waitFor(_ label: String, _ expression: String) async throws {
    let end = Date().addingTimeInterval(40)
    while Date() < end {
      if (try? await js(expression)) as? Bool == true { return }
      try await Task.sleep(for: .milliseconds(250))
    }
    let path = try? await js("location.pathname")
    let text = try? await js("document.body.innerText.slice(0,1500)")
    print("HostedShellQA timeout \(label) path=\(String(describing:path)) text=\(String(describing:text))")
    XCTFail(label)
    throw NSError(domain: "HostedQA", code: 1)
  }

  private func visible() async throws {
    let end = Date().addingTimeInterval(35)
    while web.isHidden && Date() < end { try await Task.sleep(for: .milliseconds(250)) }
    XCTAssertFalse(web.isHidden, "Native shell must reveal verified hosted content")
  }

  private func quote(_ value: String) -> String {
    String(data: try! JSONSerialization.data(withJSONObject: [value]), encoding: .utf8)!
      .dropFirst().dropLast().description
  }

  private func click(_ text: String) async throws {
    let query = "[...document.querySelectorAll('a,button')].find(e=>e.textContent.trim().startsWith(\(quote(text))))"
    try await waitFor("Control: \(text)", "!!(\(query))")
    _ = try await js("(()=>{const e=\(query);e.scrollIntoView();e.click();return true})()")
  }

  private func checkpoint(_ name: String) async throws {
    try await visible()
    let image = UIGraphicsImageRenderer(bounds: web.window!.bounds).image { _ in
      web.window!.drawHierarchy(in: web.window!.bounds, afterScreenUpdates: true)
    }
    let attachment = XCTAttachment(image: image)
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
    print("HostedShellQA PASS \(name)")
  }

  func testHostedRolesSessionNavigationAndLogout() async throws {
    let input = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("hosted-qa.private.json")
    guard FileManager.default.fileExists(atPath: input.path) else {
      throw XCTSkip("Hosted QA requires explicitly provisioned disposable fixture credentials")
    }
    let origin = "https://thesquadv2-native-store-qa-tylers-projects-5b59182e.vercel.app"
    guard Bundle.main.object(forInfoDictionaryKey: "SquadStoreOrigin") as? String == origin else {
      throw NSError(domain: "HostedQA.WrongOrigin", code: 1)
    }
    let state = try JSONSerialization.jsonObject(with: Data(contentsOf: input)) as! [String: Any]
    let controller = (UIApplication.shared.delegate as! AppDelegate).window!.rootViewController!
    web = findSubview(WKWebView.self, in: controller.view)!
    // The manual coach check may have left a session. Clear it through the real Sign Out UI.
    try await waitFor("Initial hosted document", "document.readyState==='complete' && !!document.querySelector('main h1,h1')")
    if web.url?.path != "/login" {
      web.load(URLRequest(url: URL(string: origin + "/settings")!))
      try await waitFor("Existing session settings", "location.pathname==='/settings' && /global settings/i.test(document.body.innerText)")
      try await click("Sign Out")
    }
    for who in state["identities"] as! [[String: Any]] {
      let role = who["role"] as! String
      try await waitFor("Hosted login", "location.pathname==='/login' && !!document.querySelector('#password')")
      _ = try await js("window.__qaOldLogin=true")
      web.load(URLRequest(url: URL(string: origin + "/login?returnTo=%2Fdashboard")!))
      try await waitFor("Explicit dashboard return", "!window.__qaOldLogin && document.readyState==='complete' && location.pathname==='/login' && !!document.querySelector('#password')")
      try await visible()
      let email = quote(who["email"] as! String), password = quote(state["password"] as! String)
      _ = try await js("(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const [id,value] of [['email',\(email)],['password',\(password)]]){const e=document.getElementById(id);set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}return true})()")
      try await click("Sign In")
      try await waitFor("Authenticated dashboard", "location.pathname==='/dashboard' && /next actions/i.test(document.body.innerText)")
      try await checkpoint(role + "-dashboard")
      _ = try await js("window.__qaBeforeReload=true")
      web.reload()
      try await waitFor("Reload dashboard", "!window.__qaBeforeReload && document.readyState==='complete' && location.pathname==='/dashboard' && /next actions/i.test(document.body.innerText)")
      _ = try await js("void fetch('/api/auth/session').then(async r=>window.__qaSession={status:r.status,body:await r.json()})")
      try await waitFor("Exact session identity", "window.__qaSession?.status===200 && window.__qaSession.body.uid===\(quote(who["uid"] as! String))")
      let routes = role == "coach" ? [("Schedule", "/events"), ("Roster", "/roster"), ("Chat", "/chats")]
        : [("Schedule", "/calendar"), ("Profile", "/roster"), ("Chat", "/chats")]
      for (name, path) in routes {
        try await click(name)
        try await waitFor("Navigation \(path)", "location.pathname===\(quote(path)) && !!document.querySelector('main h1')")
        let error = try await js("/Unable to load|permission.denied|Something went wrong|Failed to load/i.test(document.querySelector('main').innerText)") as? Bool
        XCTAssertEqual(error, false)
        try await checkpoint(role + path.replacingOccurrences(of: "/", with: "-"))
      }
      NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
      XCTAssertTrue(web.isHidden)
      NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
      try await checkpoint(role + "-foreground-chat")
      XCTAssertEqual(web.url?.path, "/chats")
      try await click("More")
      // Check scrollability geometrically; clicking an offscreen link alone cannot prove this.
      let scroll = try await js("(()=>{const v=document.querySelector('[role=dialog] [data-radix-scroll-area-viewport]');if(!v)return null;return {client:v.clientHeight,total:v.scrollHeight,bottom:v.getBoundingClientRect().bottom,height:innerHeight}})()")
      print("HostedShellQA scroll geometry \(String(describing: scroll))")
      try await click("Profile & Settings")
      try await waitFor("Settings", "location.pathname==='/settings' && /global settings/i.test(document.body.innerText)")
      let paymentControls = try await js("[...document.querySelectorAll('a,button')].some(e=>/Manage Subscription|Upgrade|Checkout/i.test(e.textContent))") as? Bool
      XCTAssertEqual(paymentControls, false)
      try await click("Sign Out")
      try await waitFor("Logout", "location.pathname==='/login' && !!document.querySelector('#password')")
      _ = try await js("void fetch('/api/auth/session').then(r=>window.__qaLogoutStatus=r.status)")
      try await waitFor("Server session cleared", "window.__qaLogoutStatus===401")
      try await checkpoint(role + "-logout")
    }
  }
}

@MainActor
final class ShellViewControllerTests: XCTestCase {
  private let destination = StoreDestination(origin: "https://store.example.com")!

  func testMissingConfigurationShowsSetupWithoutLoadingPage() {
    let bootstrap = ControlledBootstrap()
    let controller = ShellViewController(destination: nil, bootstrap: bootstrap)
    controller.loadViewIfNeeded()
    controller.viewDidAppear(false)

    XCTAssertEqual(labelText("shell-title", in: controller), "App setup required")
    XCTAssertEqual(
      labelText("shell-message", in: controller),
      "A store-only app destination has not been configured.")
    XCTAssertNotNil(viewWithAccessibilityID("shell-retry", in: controller.view))
    XCTAssertNil(findSubview(WKWebView.self, in: controller.view)?.url)
    XCTAssertTrue(findSubview(WKWebView.self, in: controller.view)?.isHidden == true)
    XCTAssertTrue(bootstrap.checks.isEmpty)
  }

  func testFailedCheckShowsRetryAndRetryStartsNewGeneration() {
    let bootstrap = ControlledBootstrap()
    let controller = ShellViewController(destination: destination, bootstrap: bootstrap)
    controller.loadViewIfNeeded()
    controller.viewDidAppear(false)
    XCTAssertEqual(labelText("shell-title", in: controller), "Checking app…")

    bootstrap.checks[0].completion(false)
    XCTAssertEqual(labelText("shell-title", in: controller), "Unable to open The Squad")
    XCTAssertFalse(
      (viewWithAccessibilityID("shell-retry", in: controller.view) as! UIButton).isHidden)

    (viewWithAccessibilityID("shell-retry", in: controller.view) as! UIButton).sendActions(
      for: .touchUpInside)
    XCTAssertEqual(bootstrap.checks.count, 2)
    XCTAssertEqual(labelText("shell-title", in: controller), "Checking app…")
  }

  func testStaleSuccessCannotReplaceNewerFailure() {
    let bootstrap = ControlledBootstrap()
    let controller = ShellViewController(destination: destination, bootstrap: bootstrap)
    controller.loadViewIfNeeded()
    controller.viewDidAppear(false)
    NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)
    XCTAssertTrue(bootstrap.checks[0].cancellation.isCancelled)
    NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
    XCTAssertEqual(bootstrap.checks.count, 2)

    bootstrap.checks[1].completion(false)
    bootstrap.checks[0].completion(true)

    XCTAssertEqual(labelText("shell-title", in: controller), "Unable to open The Squad")
    XCTAssertTrue(findSubview(WKWebView.self, in: controller.view)?.isHidden == true)
    XCTAssertNil(findSubview(WKWebView.self, in: controller.view)?.url)
  }

  func testBackgroundHidesContentUntilForegroundRecheck() {
    let bootstrap = ControlledBootstrap()
    let (controller, webView, _) = makeControllerWithSuccessfulPage(bootstrap: bootstrap)
    defer { withExtendedLifetime(controller) {} }

    NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
    XCTAssertTrue(webView.isHidden)
    NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
    XCTAssertEqual(bootstrap.checks.count, 2)
    XCTAssertTrue(webView.isHidden)
    bootstrap.checks[1].completion(true)
    XCTAssertFalse(webView.isHidden)
  }

  func testPageFinishingDuringForegroundCheckStaysHidden() {
    let bootstrap = ControlledBootstrap()
    let controller = ShellViewController(destination: destination, bootstrap: bootstrap)
    controller.loadViewIfNeeded()
    controller.viewDidAppear(false)
    bootstrap.checks[0].completion(true)
    let webView = findSubview(WKWebView.self, in: controller.view)!
    let navigation = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/dashboard")

    NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
    NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
    controller.webView(webView, didFinish: navigation)

    XCTAssertTrue(webView.isHidden)
    bootstrap.checks[1].completion(true)
    XCTAssertFalse(webView.isHidden)
  }

  func testNavigationPolicyAllowsOnlyConfiguredOrigin() {
    let controller = ShellViewController(destination: destination, bootstrap: ControlledBootstrap())
    controller.loadViewIfNeeded()
    XCTAssertEqual(
      controller.navigationPolicy(for: URL(string: "https://store.example.com/team/1")), .allow)
    XCTAssertEqual(
      controller.navigationPolicy(for: URL(string: "https://evil.example/team/1")), .cancel)
    XCTAssertEqual(
      controller.navigationPolicy(for: URL(string: "http://store.example.com/team/1")), .cancel)
  }

  func testNewWindowUsesExistingWebViewOnlyForSameOrigin() {
    let controller = ShellViewController(destination: destination, bootstrap: ControlledBootstrap())
    controller.loadViewIfNeeded()
    XCTAssertTrue(controller.handleNewWindow(url: URL(string: "https://store.example.com/team/1")))
    XCTAssertFalse(controller.handleNewWindow(url: URL(string: "https://evil.example/team/1")))
    XCTAssertFalse((viewWithAccessibilityID("shell-link-error", in: controller.view)!).isHidden)
    XCTAssertEqual(
      labelText("shell-link-error", in: controller), "This link cannot be opened in the app.")
  }

  func testCancelledBlockedNavigationDoesNotHideTrustedPage() {
    let bootstrap = ControlledBootstrap()
    let (controller, webView, _) = makeControllerWithSuccessfulPage(bootstrap: bootstrap)

    controller.webView(
      webView,
      didFailProvisionalNavigation: nil,
      withError: URLError(.cancelled)
    )

    XCTAssertFalse(webView.isHidden)
  }

  func testProvisionalCurrentCancellationRemainsRecoverableAcrossForeground() {
    assertCurrentCancellationRecovers(provisional: true)
  }

  func testCommittedCurrentCancellationRemainsRecoverableAcrossForeground() {
    assertCurrentCancellationRecovers(provisional: false)
  }

  func testObsoleteCancellationDoesNotInterruptReplacementNavigation() {
    let bootstrap = ControlledBootstrap()
    let (controller, webView, _) = makeControllerWithSuccessfulPage(bootstrap: bootstrap)
    let obsolete = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/teams")
    let replacement = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/dashboard")
    controller.webView(webView, didFailProvisionalNavigation: obsolete, withError: URLError(.cancelled))
    controller.webView(webView, didFinish: replacement)
    XCTAssertFalse(webView.isHidden)
  }

  private func assertCurrentCancellationRecovers(provisional: Bool) {
    let bootstrap = ControlledBootstrap()
    let (controller, webView, _) = makeControllerWithSuccessfulPage(bootstrap: bootstrap)
    let cancelled = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/teams")
    NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
    NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
    if provisional {
      controller.webView(webView, didFailProvisionalNavigation: cancelled, withError: URLError(.cancelled))
    } else {
      controller.webView(webView, didFail: cancelled, withError: URLError(.cancelled))
    }
    bootstrap.checks[1].completion(true)
    controller.webView(webView, didFinish: cancelled)
    XCTAssertEqual(labelText("shell-title", in: controller), "Unable to open The Squad")
    XCTAssertFalse(viewWithAccessibilityID("shell-retry", in: controller.view)!.isHidden)
    XCTAssertTrue(webView.isHidden)

    NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
    NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
    bootstrap.checks[2].completion(true)
    XCTAssertEqual(labelText("shell-title", in: controller), "Unable to open The Squad")
    XCTAssertFalse(viewWithAccessibilityID("shell-retry", in: controller.view)!.isHidden)

    tapRetry(in: controller)
    bootstrap.checks[3].completion(true)
    let replacement = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/dashboard")
    controller.webView(webView, didFinish: replacement)
    XCTAssertFalse(webView.isHidden)
  }

  func testProcessFailureDuringForegroundVerificationRejectsLateBootstrapSuccess() {
    let bootstrap = ControlledBootstrap()
    let (controller, webView, _) = makeControllerWithSuccessfulPage(bootstrap: bootstrap)

    NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
    NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
    XCTAssertEqual(bootstrap.checks.count, 2)

    controller.webViewWebContentProcessDidTerminate(webView)
    XCTAssertTrue(bootstrap.checks[1].cancellation.isCancelled)
    bootstrap.checks[1].completion(true)

    XCTAssertEqual(labelText("shell-title", in: controller), "Unable to open The Squad")
    XCTAssertTrue(webView.isHidden)
  }

  func testObsoleteCompletionAfterRetryCannotRevealNewPage() {
    let bootstrap = ControlledBootstrap()
    let (controller, webView, _) = makeControllerWithSuccessfulPage(bootstrap: bootstrap)
    let failedNavigation = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/teams")
    controller.webView(
      webView,
      didFailProvisionalNavigation: failedNavigation,
      withError: URLError(.cannotConnectToHost)
    )

    tapRetry(in: controller)
    bootstrap.checks[1].completion(true)
    controller.webView(webView, didFinish: failedNavigation)

    XCTAssertTrue(webView.isHidden)
    XCTAssertEqual(labelText("shell-title", in: controller), "Checking app…")
  }

  func testObsoleteStartAndCompletionAfterRetryCannotReplaceCurrentNavigation() {
    let bootstrap = ControlledBootstrap()
    let (controller, webView, _) = makeControllerWithSuccessfulPage(bootstrap: bootstrap)
    let failedNavigation = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/teams")
    controller.webView(
      webView,
      didFailProvisionalNavigation: failedNavigation,
      withError: URLError(.cannotConnectToHost)
    )

    tapRetry(in: controller)
    bootstrap.checks[1].completion(true)
    let delegate: WKNavigationDelegate = controller
    delegate.webView?(webView, didStartProvisionalNavigation: failedNavigation)
    controller.webView(webView, didFinish: failedNavigation)

    XCTAssertTrue(webView.isHidden)
    XCTAssertEqual(labelText("shell-title", in: controller), "Checking app…")
  }

  func testObsoleteFailureAfterRetryCannotHideNewSuccessfulPage() {
    let bootstrap = ControlledBootstrap()
    let (controller, webView, _) = makeControllerWithSuccessfulPage(bootstrap: bootstrap)
    let failedNavigation = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/teams")
    controller.webView(
      webView,
      didFailProvisionalNavigation: failedNavigation,
      withError: URLError(.cannotConnectToHost)
    )

    tapRetry(in: controller)
    bootstrap.checks[1].completion(true)
    let replacementNavigation = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/dashboard")
    controller.webView(webView, didFinish: replacementNavigation)
    controller.webView(
      webView,
      didFail: failedNavigation,
      withError: URLError(.networkConnectionLost)
    )

    XCTAssertFalse(webView.isHidden)
  }

  func testNonCancellationMainFrameFailureShowsRetry() {
    let bootstrap = ControlledBootstrap()
    let (controller, webView, _) = makeControllerWithSuccessfulPage(bootstrap: bootstrap)
    let navigation = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/teams")

    controller.webView(
      webView,
      didFailProvisionalNavigation: navigation,
      withError: URLError(.cannotConnectToHost)
    )

    XCTAssertEqual(labelText("shell-title", in: controller), "Unable to open The Squad")
    XCTAssertTrue(webView.isHidden)
  }

  func testNewMainFrameNavigationHidesCompletedPageUntilItFinishes() {
    let bootstrap = ControlledBootstrap()
    let (controller, webView, _) = makeControllerWithSuccessfulPage(bootstrap: bootstrap)

    let navigation = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/teams")

    XCTAssertTrue(webView.isHidden)
    XCTAssertEqual(labelText("shell-title", in: controller), "Checking app…")

    controller.webView(webView, didFinish: navigation)
    XCTAssertFalse(webView.isHidden)
  }

  func testUnfinishedPageStaysHiddenAcrossForegroundRecheck() {
    let bootstrap = ControlledBootstrap()
    let (controller, webView, _) = makeControllerWithSuccessfulPage(bootstrap: bootstrap)
    let unfinishedNavigation = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/teams")

    NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
    NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
    bootstrap.checks[1].completion(true)
    XCTAssertTrue(webView.isHidden)
    controller.webView(webView, didFinish: unfinishedNavigation)

    XCTAssertFalse(webView.isHidden)
  }

  private func makeControllerWithSuccessfulPage(
    bootstrap: ControlledBootstrap
  ) -> (ShellViewController, WKWebView, WKNavigation) {
    let controller = ShellViewController(destination: destination, bootstrap: bootstrap)
    controller.loadViewIfNeeded()
    controller.viewDidAppear(false)
    bootstrap.checks[0].completion(true)
    let webView = findSubview(WKWebView.self, in: controller.view)!
    let navigation = startNavigation(
      in: controller, webView: webView, url: "https://store.example.com/dashboard")
    controller.webView(webView, didFinish: navigation)
    XCTAssertFalse(webView.isHidden)
    return (controller, webView, navigation)
  }

  private func startNavigation(
    in controller: ShellViewController,
    webView: WKWebView,
    url: String
  ) -> WKNavigation {
    let navigation = webView.load(URLRequest(url: URL(string: url)!))!
    let delegate: WKNavigationDelegate = controller
    delegate.webView?(webView, didStartProvisionalNavigation: navigation)
    return navigation
  }

  private func tapRetry(in controller: ShellViewController) {
    (viewWithAccessibilityID("shell-retry", in: controller.view) as! UIButton).sendActions(
      for: .touchUpInside)
  }

  private func labelText(_ identifier: String, in controller: UIViewController) -> String? {
    (viewWithAccessibilityID(identifier, in: controller.view) as? UILabel)?.text
  }
}
