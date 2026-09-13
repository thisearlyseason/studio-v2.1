import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let origin = Bundle.main.object(forInfoDictionaryKey: "SquadStoreOrigin") as? String ?? ""
    let controller = ShellViewController(
      destination: StoreDestination(origin: origin),
      bootstrap: StoreBootstrapClient()
    )
    let window = UIWindow(frame: UIScreen.main.bounds)
    window.rootViewController = controller
    window.makeKeyAndVisible()
    self.window = window
    return true
  }
}
