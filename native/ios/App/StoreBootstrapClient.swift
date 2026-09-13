import Foundation

protocol BootstrapCancellation {
  func cancel()
}

protocol StoreBootstrapChecking {
  @discardableResult
  func check(
    _ destination: StoreDestination,
    completion: @escaping (Bool) -> Void
  ) -> BootstrapCancellation
}

final class StoreBootstrapClient: StoreBootstrapChecking {
  private let configuration: URLSessionConfiguration

  init(configuration: URLSessionConfiguration = StoreBootstrapClient.makeProductionConfiguration())
  {
    self.configuration = configuration.copy() as! URLSessionConfiguration
  }

  static func makeProductionConfiguration() -> URLSessionConfiguration {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpShouldSetCookies = false
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.urlCache = nil
    configuration.timeoutIntervalForRequest = 10
    configuration.timeoutIntervalForResource = 10
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    return configuration
  }

  @discardableResult
  func check(
    _ destination: StoreDestination,
    completion: @escaping (Bool) -> Void
  ) -> BootstrapCancellation {
    let operation = BootstrapOperation(
      configuration: configuration,
      destination: destination,
      completion: completion
    )
    operation.start()
    return operation
  }
}

private final class BootstrapOperation: NSObject, BootstrapCancellation, URLSessionDataDelegate {
  private let lock = NSLock()
  private let destination: StoreDestination
  private var completion: ((Bool) -> Void)?
  private var bytes = Data()
  private var response: HTTPURLResponse?
  private var isFinished = false
  private var session: URLSession!
  private var task: URLSessionDataTask!

  init(
    configuration: URLSessionConfiguration,
    destination: StoreDestination,
    completion: @escaping (Bool) -> Void
  ) {
    self.destination = destination
    self.completion = completion
    super.init()

    session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    var request = URLRequest(
      url: URL(string: destination.bootstrapURL)!,
      cachePolicy: .reloadIgnoringLocalCacheData,
      timeoutInterval: 10
    )
    request.httpMethod = "GET"
    task = session.dataTask(with: request)
  }

  func start() {
    task.resume()
  }

  func cancel() {
    task.cancel()
    finish(false)
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard let response = response as? HTTPURLResponse,
      response.statusCode == 200,
      response.mimeType?.lowercased() == "application/json",
      response.expectedContentLength <= 4096
    else {
      completionHandler(.cancel)
      finish(false)
      return
    }
    self.response = response
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    let exceedsLimit = lock.withLock { () -> Bool in
      guard !isFinished else { return false }
      guard bytes.count + data.count <= 4096 else { return true }
      bytes.append(data)
      return false
    }
    if exceedsLimit {
      dataTask.cancel()
      finish(false)
    }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
    finish(false)
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    guard error == nil, let response else {
      finish(false)
      return
    }
    let body = lock.withLock { bytes }
    guard body.count <= 4096,
      let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
      let distribution = object["distribution"] as? String
    else {
      finish(false)
      return
    }
    finish(
      destination.acceptsBootstrap(
        status: response.statusCode,
        finalURL: response.url?.absoluteString ?? "",
        redirected: false,
        distribution: distribution
      ))
  }

  private func finish(_ result: Bool) {
    let callback = lock.withLock { () -> ((Bool) -> Void)? in
      guard !isFinished else { return nil }
      isFinished = true
      let callback = completion
      completion = nil
      return callback
    }
    guard let callback else { return }
    session.invalidateAndCancel()
    callback(result)
  }
}

extension NSLock {
  fileprivate func withLock<T>(_ body: () -> T) -> T {
    lock()
    defer { unlock() }
    return body()
  }
}
