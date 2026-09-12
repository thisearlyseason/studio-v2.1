package pro.thesquad.shell;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

public final class StoreDestination {
    private final String origin;
    private final String hostname;

    private StoreDestination(String origin, String hostname) {
        this.origin = origin;
        this.hostname = hostname;
    }

    public static StoreDestination parse(String origin) {
        ParsedURL parsed = parseHTTPSURL(origin);
        if (parsed == null) {
            return null;
        }

        String path = parsed.uri.getRawPath();
        if (path != null && !path.isEmpty() && !path.equals("/")) {
            return null;
        }
        if (parsed.uri.getRawQuery() != null || parsed.uri.getRawFragment() != null) {
            return null;
        }

        String normalizedOrigin = "https://" + parsed.hostname;
        return new StoreDestination(normalizedOrigin, parsed.hostname);
    }

    public String origin() {
        return origin;
    }

    public String bootstrapURL() {
        return origin + "/api/app-distribution";
    }

    public boolean allows(String candidate) {
        ParsedURL parsed = parseHTTPSURL(candidate);
        return parsed != null && parsed.hostname.equals(hostname);
    }

    public boolean acceptsBootstrap(
            int status,
            String finalURL,
            boolean redirected,
            String distribution) {
        return status == 200 && !redirected && "store".equals(distribution)
            && bootstrapURL().equals(finalURL);
    }

    private static ParsedURL parseHTTPSURL(String value) {
        if (!passesRawInputChecks(value)) {
            return null;
        }

        final URI uri;
        try {
            uri = new URI(value);
        } catch (URISyntaxException exception) {
            return null;
        }

        String rawAuthority = uri.getRawAuthority();
        String rawHostname = uri.getHost();
        if (!uri.isAbsolute()
                || uri.isOpaque()
                || uri.getScheme() == null
                || !uri.getScheme().equalsIgnoreCase("https")
                || rawAuthority == null
                || rawAuthority.isEmpty()
                || !isASCII(rawAuthority)
                || rawAuthority.contains("%")
                || uri.getRawUserInfo() != null
                || rawHostname == null) {
            return null;
        }

        String hostname = rawHostname.toLowerCase(Locale.ROOT);
        int port = uri.getPort();
        if (!isValidDNSHostname(hostname) || (port != -1 && port != 443)) {
            return null;
        }

        String expectedAuthority = port == 443 ? hostname + ":443" : hostname;
        if (!rawAuthority.toLowerCase(Locale.ROOT).equals(expectedAuthority)) {
            return null;
        }

        return new ParsedURL(uri, hostname);
    }

    private static boolean passesRawInputChecks(String value) {
        if (value == null || value.isEmpty()) {
            return false;
        }
        int index = 0;
        while (index < value.length()) {
            int codePoint = value.codePointAt(index);
            if (Character.isWhitespace(codePoint)
                    || Character.isSpaceChar(codePoint)
                    || Character.getType(codePoint) == Character.CONTROL
                    || codePoint == '\\') {
                return false;
            }
            if (codePoint == '%') {
                if (index + 2 >= value.length()
                        || !isASCIIHexDigit(value.charAt(index + 1))
                        || !isASCIIHexDigit(value.charAt(index + 2))) {
                    return false;
                }
                index += 3;
                continue;
            }
            index += Character.charCount(codePoint);
        }
        return true;
    }

    private static boolean isASCII(String value) {
        for (int index = 0; index < value.length(); index++) {
            if (value.charAt(index) > 0x7F) {
                return false;
            }
        }
        return true;
    }

    private static boolean isValidDNSHostname(String hostname) {
        if (hostname.equals("localhost")
                || hostname.endsWith(".localhost")
                || isNumericIPAddress(hostname)) {
            return false;
        }

        String[] labels = hostname.split("\\.", -1);
        if (labels.length == 0) {
            return false;
        }
        for (String label : labels) {
            if (label.isEmpty()
                    || !isASCIIAlphanumeric(label.charAt(0))
                    || !isASCIIAlphanumeric(label.charAt(label.length() - 1))) {
                return false;
            }
            for (int index = 0; index < label.length(); index++) {
                char character = label.charAt(index);
                if (!isASCIIAlphanumeric(character) && character != '-') {
                    return false;
                }
            }
        }
        return true;
    }

    private static boolean isNumericIPAddress(String hostname) {
        String[] labels = hostname.split("\\.", -1);
        if (labels.length == 0) {
            return false;
        }
        for (String label : labels) {
            if (label.isEmpty()) {
                return false;
            }
            boolean decimal = true;
            for (int index = 0; index < label.length(); index++) {
                char character = label.charAt(index);
                if (character < '0' || character > '9') {
                    decimal = false;
                    break;
                }
            }
            boolean hexadecimal = label.length() > 2
                && label.charAt(0) == '0'
                && (label.charAt(1) == 'x' || label.charAt(1) == 'X')
                && isASCIIHexString(label, 2);
            if (!decimal && !hexadecimal) {
                return false;
            }
        }
        return true;
    }

    private static boolean isASCIIAlphanumeric(char character) {
        return (character >= '0' && character <= '9')
            || (character >= 'A' && character <= 'Z')
            || (character >= 'a' && character <= 'z');
    }

    private static boolean isASCIIHexDigit(int character) {
        return (character >= '0' && character <= '9')
            || (character >= 'A' && character <= 'F')
            || (character >= 'a' && character <= 'f');
    }

    private static boolean isASCIIHexString(String value, int startIndex) {
        for (int index = startIndex; index < value.length(); index++) {
            if (!isASCIIHexDigit(value.charAt(index))) {
                return false;
            }
        }
        return startIndex < value.length();
    }

    private static final class ParsedURL {
        private final URI uri;
        private final String hostname;

        private ParsedURL(URI uri, String hostname) {
            this.uri = uri;
            this.hostname = hostname;
        }
    }
}
