import Foundation

struct StoreDestination {
    let origin: String
    private let hostname: String

    init?(origin: String) {
        guard let parsed = Self.parseHTTPSURL(origin),
              parsed.components.percentEncodedPath.isEmpty
                || parsed.components.percentEncodedPath == "/",
              parsed.components.percentEncodedQuery == nil,
              parsed.components.percentEncodedFragment == nil else {
            return nil
        }

        self.origin = "https://\(parsed.hostname)"
        self.hostname = parsed.hostname
    }

    var bootstrapURL: String {
        "\(origin)/api/app-distribution"
    }

    func allows(_ candidate: String) -> Bool {
        guard let parsed = Self.parseHTTPSURL(candidate) else {
            return false
        }
        return parsed.hostname == hostname
    }

    func acceptsBootstrap(
        status: Int,
        finalURL: String,
        redirected: Bool,
        distribution: String?
    ) -> Bool {
        status == 200 && !redirected && distribution == "store"
            && finalURL == bootstrapURL
    }

    private struct ParsedURL {
        let components: URLComponents
        let hostname: String
    }

    private static func parseHTTPSURL(_ value: String) -> ParsedURL? {
        guard passesRawInputChecks(value),
              let rawAuthority = rawAuthority(in: value),
              rawAuthority.unicodeScalars.allSatisfy(\.isASCII),
              !rawAuthority.contains("%"),
              let components = URLComponents(string: value),
              components.url != nil,
              components.scheme?.lowercased() == "https",
              components.user == nil,
              components.password == nil,
              let rawHostname = components.host else {
            return nil
        }

        let hostname = rawHostname.lowercased()
        guard isValidDNSHostname(hostname),
              components.port == nil || components.port == 443 else {
            return nil
        }

        let expectedAuthority = components.port == 443
            ? "\(hostname):443"
            : hostname
        guard rawAuthority.lowercased() == expectedAuthority else {
            return nil
        }

        return ParsedURL(components: components, hostname: hostname)
    }

    private static func passesRawInputChecks(_ value: String) -> Bool {
        guard !value.isEmpty else {
            return false
        }

        let scalars = Array(value.unicodeScalars)
        var index = 0
        while index < scalars.count {
            let scalar = scalars[index]
            if scalar.value <= 0x20 || scalar.value == 0x7F || scalar.value == 0x5C {
                return false
            }
            if scalar.value == 0x25 {
                guard index + 2 < scalars.count,
                      isASCIIHexDigit(scalars[index + 1]),
                      isASCIIHexDigit(scalars[index + 2]) else {
                    return false
                }
                index += 2
            }
            index += 1
        }
        return true
    }

    private static func rawAuthority(in value: String) -> String? {
        guard let separator = value.range(of: "://") else {
            return nil
        }
        let authorityStart = separator.upperBound
        let authorityEnd = value[authorityStart...].firstIndex { character in
            character == "/" || character == "?" || character == "#"
        } ?? value.endIndex
        let authority = String(value[authorityStart..<authorityEnd])
        return authority.isEmpty ? nil : authority
    }

    private static func isValidDNSHostname(_ hostname: String) -> Bool {
        guard hostname != "localhost", !isNumericIPAddress(hostname) else {
            return false
        }

        let labels = hostname.split(separator: ".", omittingEmptySubsequences: false)
        guard !labels.isEmpty else {
            return false
        }

        return labels.allSatisfy { label in
            guard let first = label.unicodeScalars.first,
                  let last = label.unicodeScalars.last,
                  isASCIIAlphanumeric(first),
                  isASCIIAlphanumeric(last) else {
                return false
            }
            return label.unicodeScalars.allSatisfy { scalar in
                isASCIIAlphanumeric(scalar) || scalar.value == 0x2D
            }
        }
    }

    private static func isNumericIPAddress(_ hostname: String) -> Bool {
        let labels = hostname.split(separator: ".", omittingEmptySubsequences: false)
        return !labels.isEmpty && labels.allSatisfy { label in
            let scalars = Array(label.unicodeScalars)
            if scalars.allSatisfy({ $0.value >= 0x30 && $0.value <= 0x39 }) {
                return !scalars.isEmpty
            }
            return scalars.count > 2
                && scalars[0].value == 0x30
                && (scalars[1].value == 0x78 || scalars[1].value == 0x58)
                && scalars.dropFirst(2).allSatisfy(isASCIIHexDigit)
        }
    }

    private static func isASCIIAlphanumeric(_ scalar: Unicode.Scalar) -> Bool {
        (scalar.value >= 0x30 && scalar.value <= 0x39)
            || (scalar.value >= 0x41 && scalar.value <= 0x5A)
            || (scalar.value >= 0x61 && scalar.value <= 0x7A)
    }

    private static func isASCIIHexDigit(_ scalar: Unicode.Scalar) -> Bool {
        (scalar.value >= 0x30 && scalar.value <= 0x39)
            || (scalar.value >= 0x41 && scalar.value <= 0x46)
            || (scalar.value >= 0x61 && scalar.value <= 0x66)
    }
}
