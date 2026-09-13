import Foundation
import XCTest

@testable import SquadShell

final class StoreBootstrapClientTests: XCTestCase {
  private let destination = StoreDestination(origin: "https://store.example.com")!

  private func checkFixture(
    status: Int,
    contentType: String?,
    body: Data
  ) async -> Bool {
    ControlledURLProtocol.prepare(
      .response(status: status, contentType: contentType, chunks: [body]))
    let client = StoreBootstrapClient(configuration: fixtureConfiguration())
    return await withCheckedContinuation { continuation in
      client.check(destination) { continuation.resume(returning: $0) }
    }
  }

  func testStringStoreObjectAllowsLoading() async {
    let parameterized = await checkFixture(
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: Data(#"{"distribution":"store"}"#.utf8)
    )
    XCTAssertTrue(parameterized)

    let mixedCase = await checkFixture(
      status: 200,
      contentType: "Application/JSON",
      body: Data(#"{"distribution":"store"}"#.utf8)
    )
    XCTAssertTrue(mixedCase)

    var boundaryBody = Data(#"{"distribution":"store"}"#.utf8)
    boundaryBody.append(Data(repeating: 0x20, count: 4096 - boundaryBody.count))
    let boundary = await checkFixture(
      status: 200,
      contentType: "application/json",
      body: boundaryBody
    )
    XCTAssertTrue(boundary)
  }

  func testWebDistributionNeverAllowsLoading() async {
    let result = await checkFixture(
      status: 200,
      contentType: "application/json",
      body: Data(#"{"distribution":"web"}"#.utf8)
    )
    XCTAssertFalse(result)
  }

  func testInvalidResponsesFailClosed() async {
    let fixtures: [(Int, String?, Data)] = [
      (503, "application/json", Data(#"{"distribution":"store"}"#.utf8)),
      (200, "application/json", Data(#"{"distribution":"unknown"}"#.utf8)),
      (200, "application/json", Data(#"{}"#.utf8)),
      (200, "application/json", Data(#"{"distribution":null}"#.utf8)),
      (200, "application/json", Data(#"{"distribution":1}"#.utf8)),
      (200, "application/json", Data(#"[]"#.utf8)),
      (200, "application/json", Data(#"{"distribution""#.utf8)),
      (200, "text/plain", Data(#"{"distribution":"store"}"#.utf8)),
      (200, "application/json", Data(repeating: 0x20, count: 4097)),
    ]
    for (status, contentType, body) in fixtures {
      let result = await checkFixture(status: status, contentType: contentType, body: body)
      XCTAssertFalse(result)
    }
  }

  func testRedirectFailsClosed() async {
    ControlledURLProtocol.prepare(.redirect(URL(string: "https://store.example.com/login")!))
    let client = StoreBootstrapClient(configuration: fixtureConfiguration())
    let result = await withCheckedContinuation { continuation in
      client.check(destination) { continuation.resume(returning: $0) }
    }
    XCTAssertFalse(result)
    XCTAssertEqual(ControlledURLProtocol.capturedRequests.count, 1)
  }

  func testTransportAndTimeoutErrorsFailClosed() async {
    for code in [URLError.timedOut, URLError.notConnectedToInternet] {
      ControlledURLProtocol.prepare(.failure(URLError(code)))
      let client = StoreBootstrapClient(configuration: fixtureConfiguration())
      let result = await withCheckedContinuation { continuation in
        client.check(destination) { continuation.resume(returning: $0) }
      }
      XCTAssertFalse(result)
    }
  }

  func testCancellationCompletesFalseExactlyOnce() {
    ControlledURLProtocol.prepare(.pending)
    let client = StoreBootstrapClient(configuration: fixtureConfiguration())
    let completed = expectation(description: "cancel completion")
    completed.assertForOverFulfill = true
    let secondCompletion = expectation(description: "no second completion")
    secondCompletion.isInverted = true
    var results: [Bool] = []
    let cancellation = client.check(destination) {
      results.append($0)
      if results.count == 1 {
        completed.fulfill()
      } else {
        secondCompletion.fulfill()
      }
    }
    cancellation.cancel()
    wait(for: [completed], timeout: 1)
    wait(for: [secondCompletion], timeout: 0.2)
    XCTAssertEqual(results, [false])
  }

  func testRequestIsExactNonCredentialedUncachedGET() async {
    _ = await checkFixture(
      status: 200,
      contentType: "application/json",
      body: Data(#"{"distribution":"store"}"#.utf8)
    )
    let request = try! XCTUnwrap(ControlledURLProtocol.capturedRequests.first)
    XCTAssertEqual(request.url?.absoluteString, "https://store.example.com/api/app-distribution")
    XCTAssertEqual(request.httpMethod, "GET")
    XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
    XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
    XCTAssertEqual(request.cachePolicy, .reloadIgnoringLocalCacheData)
    XCTAssertEqual(request.timeoutInterval, 10)
  }

  func testProductionConfigurationIsEphemeralAndIsolated() {
    let configuration = StoreBootstrapClient.makeProductionConfiguration()
    XCTAssertFalse(configuration.httpShouldSetCookies)
    XCTAssertNil(configuration.httpCookieStorage)
    XCTAssertNil(configuration.urlCredentialStorage)
    XCTAssertNil(configuration.urlCache)
    XCTAssertEqual(configuration.timeoutIntervalForRequest, 10)
    XCTAssertEqual(configuration.timeoutIntervalForResource, 10)
    XCTAssertEqual(configuration.requestCachePolicy, .reloadIgnoringLocalCacheData)
  }

  func testChunkedBodyOverLimitFailsClosed() async {
    ControlledURLProtocol.prepare(
      .response(
        status: 200,
        contentType: "application/json",
        chunks: [Data(repeating: 0x20, count: 4090), Data(repeating: 0x20, count: 7)]
      ))
    let client = StoreBootstrapClient(configuration: fixtureConfiguration())
    let result = await withCheckedContinuation { continuation in
      client.check(destination) { continuation.resume(returning: $0) }
    }
    XCTAssertFalse(result)
  }
}
