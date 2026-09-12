import Foundation

@main
enum PolicyProbe {
    private static func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data("\(message)\n".utf8))
        exit(2)
    }

    static func main() {
        let arguments = CommandLine.arguments
        guard arguments.count >= 3 else {
            fail("usage: PolicyProbe <operation> <configured-origin> [operation-inputs]")
        }

        let operation = arguments[1]
        let configuredOrigin = arguments[2]

        switch operation {
        case "configuration":
            guard arguments.count == 3 else { fail("invalid configuration arguments") }
            print(StoreDestination(origin: configuredOrigin)?.origin ?? "INVALID")
        case "navigation":
            guard arguments.count == 4 else { fail("invalid navigation arguments") }
            print(StoreDestination(origin: configuredOrigin)?.allows(arguments[3]) ?? false)
        case "bootstrap":
            guard arguments.count == 7,
                  let status = Int(arguments[3]),
                  arguments[5] == "true" || arguments[5] == "false" else {
                fail("invalid bootstrap arguments")
            }
            let distribution = arguments[6] == "NULL" ? nil : arguments[6]
            let accepted = StoreDestination(origin: configuredOrigin)?.acceptsBootstrap(
                status: status,
                finalURL: arguments[4],
                redirected: arguments[5] == "true",
                distribution: distribution
            ) ?? false
            print(accepted)
        default:
            fail("unknown operation")
        }
    }
}
