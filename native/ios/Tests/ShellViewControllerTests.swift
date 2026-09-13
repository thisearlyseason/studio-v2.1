import UIKit
import WebKit
import XCTest

@testable import SquadShell

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

  func testWebProcessFailureDuringForegroundVerificationRejectsLateBootstrapSuccess() {
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
