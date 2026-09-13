import UIKit
import WebKit

@MainActor
final class ShellViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
  private let destination: StoreDestination?
  private let bootstrap: StoreBootstrapChecking
  private let titleLabel = UILabel()
  private let messageLabel = UILabel()
  private let retryButton = UIButton(type: .system)
  private let spinner = UIActivityIndicatorView(style: .large)
  private let stateStack = UIStackView()
  private let blockedLinkLabel = UILabel()
  private let webView: WKWebView

  private var verification: BootstrapCancellation?
  private var generation = 0
  private var hasAppeared = false
  private var wasBackgrounded = false
  private var hasSuccessfulPage = false
  private var bootstrapAccepted = false
  private var currentNavigation: WKNavigation?
  private let retiredNavigations = NSHashTable<WKNavigation>.weakObjects()

  init(destination: StoreDestination?, bootstrap: StoreBootstrapChecking) {
    self.destination = destination
    self.bootstrap = bootstrap
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.userContentController = WKUserContentController()
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    webView = WKWebView(frame: .zero, configuration: configuration)
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func loadView() {
    let root = UIView()
    root.backgroundColor = .systemBackground

    webView.translatesAutoresizingMaskIntoConstraints = false
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.isInspectable = false
    webView.isHidden = true
    root.addSubview(webView)

    spinner.hidesWhenStopped = true
    spinner.accessibilityLabel = "Checking app"

    titleLabel.font = .preferredFont(forTextStyle: .title2)
    titleLabel.adjustsFontForContentSizeCategory = true
    titleLabel.numberOfLines = 0
    titleLabel.textAlignment = .center
    titleLabel.accessibilityIdentifier = "shell-title"

    messageLabel.font = .preferredFont(forTextStyle: .body)
    messageLabel.adjustsFontForContentSizeCategory = true
    messageLabel.numberOfLines = 0
    messageLabel.textAlignment = .center
    messageLabel.textColor = .secondaryLabel
    messageLabel.accessibilityIdentifier = "shell-message"

    retryButton.setTitle("Try again", for: .normal)
    retryButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    retryButton.titleLabel?.adjustsFontForContentSizeCategory = true
    retryButton.accessibilityIdentifier = "shell-retry"
    retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

    stateStack.axis = .vertical
    stateStack.alignment = .center
    stateStack.spacing = 16
    stateStack.translatesAutoresizingMaskIntoConstraints = false
    [spinner, titleLabel, messageLabel, retryButton].forEach(stateStack.addArrangedSubview)
    root.addSubview(stateStack)

    blockedLinkLabel.text = "This link cannot be opened in the app."
    blockedLinkLabel.font = .preferredFont(forTextStyle: .footnote)
    blockedLinkLabel.adjustsFontForContentSizeCategory = true
    blockedLinkLabel.numberOfLines = 0
    blockedLinkLabel.textAlignment = .center
    blockedLinkLabel.textColor = .systemRed
    blockedLinkLabel.backgroundColor = .secondarySystemBackground
    blockedLinkLabel.accessibilityIdentifier = "shell-link-error"
    blockedLinkLabel.isHidden = true
    blockedLinkLabel.translatesAutoresizingMaskIntoConstraints = false
    root.addSubview(blockedLinkLabel)

    NSLayoutConstraint.activate([
      webView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: root.trailingAnchor),
      webView.topAnchor.constraint(equalTo: root.topAnchor),
      webView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
      stateStack.centerXAnchor.constraint(equalTo: root.safeAreaLayoutGuide.centerXAnchor),
      stateStack.centerYAnchor.constraint(equalTo: root.safeAreaLayoutGuide.centerYAnchor),
      stateStack.leadingAnchor.constraint(
        greaterThanOrEqualTo: root.safeAreaLayoutGuide.leadingAnchor, constant: 24),
      stateStack.trailingAnchor.constraint(
        lessThanOrEqualTo: root.safeAreaLayoutGuide.trailingAnchor, constant: -24),
      blockedLinkLabel.leadingAnchor.constraint(
        equalTo: root.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      blockedLinkLabel.trailingAnchor.constraint(
        equalTo: root.safeAreaLayoutGuide.trailingAnchor, constant: -16),
      blockedLinkLabel.bottomAnchor.constraint(
        equalTo: root.safeAreaLayoutGuide.bottomAnchor, constant: -12),
    ])

    view = root
    showChecking()
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(didEnterBackground),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(didEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(didBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !hasAppeared else { return }
    hasAppeared = true
    beginVerification()
  }

  deinit {
    verification?.cancel()
    NotificationCenter.default.removeObserver(self)
  }

  func navigationPolicy(for url: URL?) -> WKNavigationActionPolicy {
    guard let candidate = url?.absoluteString,
      destination?.allows(candidate) == true
    else {
      return .cancel
    }
    return .allow
  }

  @discardableResult
  func handleNewWindow(url: URL?) -> Bool {
    guard navigationPolicy(for: url) == .allow, let url else {
      showBlockedLink()
      return false
    }
    webView.load(URLRequest(url: url))
    return true
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard navigationAction.targetFrame?.isMainFrame != false else {
      decisionHandler(.allow)
      return
    }
    let policy = navigationPolicy(for: navigationAction.request.url)
    if policy == .cancel { showBlockedLink() }
    decisionHandler(policy)
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationResponse: WKNavigationResponse,
    decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
  ) {
    guard navigationResponse.isForMainFrame else {
      decisionHandler(.allow)
      return
    }
    let allowed = navigationPolicy(for: navigationResponse.response.url) == .allow
    if !allowed { showBlockedLink() }
    decisionHandler(allowed ? .allow : .cancel)
  }

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    _ = handleNewWindow(url: navigationAction.request.url)
    return nil
  }

  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    guard let navigation else { return }
    beginPageNavigation(navigation)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard isCurrentNavigation(navigation) else { return }
    guard navigationPolicy(for: webView.url) == .allow else {
      showPageFailure()
      return
    }

    retireCurrentNavigation(stopping: false)
    hasSuccessfulPage = true
    guard bootstrapAccepted, !wasBackgrounded else {
      webView.isHidden = true
      return
    }
    stateStack.isHidden = true
    webView.isHidden = false
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    handleNavigationFailure(navigation, error: error)
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    handleNavigationFailure(navigation, error: error)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    showPageFailure()
  }

  @objc private func retryTapped() {
    beginVerification(retiringCurrentPage: true)
  }

  @objc private func didEnterBackground() {
    guard hasAppeared, !wasBackgrounded else { return }
    wasBackgrounded = true
    generation += 1
    verification?.cancel()
    verification = nil
    webView.isHidden = true
    showChecking()
  }

  @objc private func didBecomeActive() {
    guard hasAppeared, wasBackgrounded else { return }
    wasBackgrounded = false
    beginVerification()
  }

  private func beginVerification() {
    beginVerification(retiringCurrentPage: false)
  }

  private func beginVerification(retiringCurrentPage: Bool) {
    generation += 1
    let currentGeneration = generation
    bootstrapAccepted = false
    verification?.cancel()
    verification = nil
    blockedLinkLabel.isHidden = true
    webView.isHidden = true
    if retiringCurrentPage {
      retireCurrentNavigation(stopping: true)
      hasSuccessfulPage = false
    }

    guard let destination else {
      showSetupRequired()
      return
    }

    showChecking()
    verification = bootstrap.check(destination) { [weak self] accepted in
      if Thread.isMainThread {
        self?.completeVerification(accepted, generation: currentGeneration)
      } else {
        DispatchQueue.main.async {
          self?.completeVerification(accepted, generation: currentGeneration)
        }
      }
    }
  }

  private func completeVerification(_ accepted: Bool, generation completedGeneration: Int) {
    guard completedGeneration == generation, !wasBackgrounded else { return }
    verification = nil
    guard accepted else {
      showUnableToOpen()
      return
    }
    bootstrapAccepted = true

    if hasSuccessfulPage,
      navigationPolicy(for: webView.url) == .allow
    {
      stateStack.isHidden = true
      webView.isHidden = false
      return
    }

    if currentNavigation != nil {
      showChecking()
      return
    }

    guard let destination,
      let dashboardURL = URL(string: destination.origin + "/dashboard"),
      navigationPolicy(for: dashboardURL) == .allow
    else {
      showUnableToOpen()
      return
    }
    showChecking()
    guard let navigation = webView.load(URLRequest(url: dashboardURL)) else {
      showPageFailure()
      return
    }
    beginPageNavigation(navigation)
  }

  private func showChecking() {
    stateStack.isHidden = false
    spinner.startAnimating()
    titleLabel.text = "Checking app…"
    messageLabel.text = nil
    retryButton.isHidden = true
  }

  private func showSetupRequired() {
    stateStack.isHidden = false
    spinner.stopAnimating()
    titleLabel.text = "App setup required"
    messageLabel.text = "A store-only app destination has not been configured."
    retryButton.isHidden = false
    webView.isHidden = true
  }

  private func showUnableToOpen() {
    stateStack.isHidden = false
    spinner.stopAnimating()
    titleLabel.text = "Unable to open The Squad"
    messageLabel.text = "Check your connection and try again."
    retryButton.isHidden = false
    webView.isHidden = true
  }

  private func showPageFailure() {
    generation += 1
    verification?.cancel()
    verification = nil
    bootstrapAccepted = false
    hasSuccessfulPage = false
    retireCurrentNavigation(stopping: true)
    showUnableToOpen()
  }

  private func handleNavigationFailure(_ navigation: WKNavigation?, error: Error) {
    let error = error as NSError
    guard !(error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled) else {
      return
    }
    guard isCurrentNavigation(navigation) else { return }
    showPageFailure()
  }

  private func beginPageNavigation(_ navigation: WKNavigation) {
    guard !retiredNavigations.contains(navigation) else { return }
    if let currentNavigation {
      guard currentNavigation !== navigation else { return }
      retiredNavigations.add(currentNavigation)
    }
    currentNavigation = navigation
    hasSuccessfulPage = false
    webView.isHidden = true
    showChecking()
  }

  private func isCurrentNavigation(_ navigation: WKNavigation?) -> Bool {
    guard let navigation, let currentNavigation else { return false }
    return navigation === currentNavigation
  }

  private func retireCurrentNavigation(stopping: Bool) {
    if let currentNavigation {
      retiredNavigations.add(currentNavigation)
      self.currentNavigation = nil
    }
    if stopping {
      webView.stopLoading()
    }
  }

  private func showBlockedLink() {
    blockedLinkLabel.isHidden = false
  }
}
