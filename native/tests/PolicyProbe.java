import pro.thesquad.shell.StoreDestination;

public final class PolicyProbe {
    private static void fail(String message) {
        System.err.println(message);
        System.exit(2);
    }

    public static void main(String[] arguments) {
        if (arguments.length < 2) {
            fail("usage: PolicyProbe <operation> <configured-origin> [operation-inputs]");
        }

        String operation = arguments[0];
        String configuredOrigin = arguments[1];

        switch (operation) {
            case "configuration" -> {
                if (arguments.length != 2) {
                    fail("invalid configuration arguments");
                }
                StoreDestination destination = StoreDestination.parse(configuredOrigin);
                System.out.println(destination == null ? "INVALID" : destination.origin());
            }
            case "navigation" -> {
                if (arguments.length != 3) {
                    fail("invalid navigation arguments");
                }
                StoreDestination destination = StoreDestination.parse(configuredOrigin);
                System.out.println(destination != null && destination.allows(arguments[2]));
            }
            case "bootstrap" -> {
                if (arguments.length != 6) {
                    fail("invalid bootstrap arguments");
                }
                int status;
                try {
                    status = Integer.parseInt(arguments[2]);
                } catch (NumberFormatException exception) {
                    fail("invalid bootstrap status");
                    return;
                }
                if (!arguments[4].equals("true") && !arguments[4].equals("false")) {
                    fail("invalid redirected value");
                }
                String distribution = arguments[5].equals("NULL") ? null : arguments[5];
                StoreDestination destination = StoreDestination.parse(configuredOrigin);
                boolean accepted = destination != null && destination.acceptsBootstrap(
                    status,
                    arguments[3],
                    Boolean.parseBoolean(arguments[4]),
                    distribution
                );
                System.out.println(accepted);
            }
            default -> fail("unknown operation");
        }
    }
}
