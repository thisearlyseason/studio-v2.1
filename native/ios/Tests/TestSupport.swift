import Foundation
import UIKit
import XCTest

@testable import SquadShell

final class ControlledURLProtocol: URLProtocol {
  enum Fixture {
    case response(status: Int, contentType: String?, chunks: [Data])
    case redirect(URL)
    case failure(URLError)
    case pending
  }

  private static let lock = NSLock()
  private static var fixture: Fixture = .pending
  private static var requests: [URLRequest] = []
  private static var stopped = 0

  static func prepare(_ fixture: Fixture) {
    lock.withLock {
      self.fixture = fixture
      requests = []
      stopped = 0
    }
  }

  static var capturedRequests: [URLRequest] { lock.withLock { requests } }
  static var stopCount: Int { lock.withLock { stopped } }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    let selected = Self.lock.withLock { () -> Fixture in
      Self.requests.append(request)
      return Self.fixture
    }
    switch selected {
    case .response(let status, let contentType, let chunks):
      var headers: [String: String] = [:]
      if let contentType { headers["Content-Type"] = contentType }
      let response = HTTPURLResponse(
        url: request.url!, statusCode: status,
        httpVersion: "HTTP/1.1", headerFields: headers
      )!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      for chunk in chunks {
        client?.urlProtocol(self, didLoad: chunk)
      }
      client?.urlProtocolDidFinishLoading(self)
    case .redirect(let destination):
      let response = HTTPURLResponse(
        url: request.url!, statusCode: 302,
        httpVersion: "HTTP/1.1", headerFields: ["Location": destination.absoluteString]
      )!
      client?.urlProtocol(
        self, wasRedirectedTo: URLRequest(url: destination), redirectResponse: response)
    case .failure(let error):
      client?.urlProtocol(self, didFailWithError: error)
    case .pending:
      break
    }
  }

  override func stopLoading() {
    Self.lock.withLock { Self.stopped += 1 }
  }
}

final class ControlledBootstrap: StoreBootstrapChecking {
  final class Cancellation: BootstrapCancellation {
    private(set) var isCancelled = false
    func cancel() { isCancelled = true }
  }

  struct Check {
    let destination: StoreDestination
    let completion: (Bool) -> Void
    let cancellation: Cancellation
  }

  private(set) var checks: [Check] = []

  @discardableResult
  func check(
    _ destination: StoreDestination,
    completion: @escaping (Bool) -> Void
  ) -> BootstrapCancellation {
    let cancellation = Cancellation()
    checks.append(
      Check(destination: destination, completion: completion, cancellation: cancellation))
    return cancellation
  }
}

extension NSLock {
  fileprivate func withLock<T>(_ body: () -> T) -> T {
    lock()
    defer { unlock() }
    return body()
  }
}

func fixtureConfiguration() -> URLSessionConfiguration {
  let configuration = StoreBootstrapClient.makeProductionConfiguration()
  configuration.protocolClasses = [ControlledURLProtocol.self]
  return configuration
}

func findSubview<T: UIView>(_ type: T.Type, in view: UIView) -> T? {
  if let result = view as? T { return result }
  for child in view.subviews {
    if let result = findSubview(type, in: child) { return result }
  }
  return nil
}

func viewWithAccessibilityID(_ identifier: String, in view: UIView) -> UIView? {
  if view.accessibilityIdentifier == identifier { return view }
  for child in view.subviews {
    if let result = viewWithAccessibilityID(identifier, in: child) { return result }
  }
  return nil
}
