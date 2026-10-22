# Native legacy compiler maintenance

This private Node 24 build dependency preserves the existing Tailwind 3 CSS/browser baseline. It is not an upstream release or advisory exemption. The owner approved maintaining this reviewed repair on October 22, 2026. Do not publish the package to a registry.

Before each native-host release, check the official GHSA-vfj7-8cjw-p6xm advisory, upstream micromatch/braces source and npm braces version for a supported patch. Record the result in release evidence. Do not automatically update or remove this override. When an official fix exists, independently review its behavior, run the upstream compatibility and application CSS comparisons, and retire the fork through a reviewed lockfile change. If a new relevant advisory or incompatible consumer appears, block release pending review.

Use the committed lockfile and Node 24. Run npm ci, npm run verify:legacy-compiler, the full required CI and the compiler security tests. The prebuild hook verifies source, installed bytes, tarball and lock routing. Never use direct next build to bypass this hook. Changes require re-review, deterministic repacking, new hashes and updated provenance.

The patch limits nesting and rejects unsupported direct AST shapes/cycles. Width, shared-DAG work and expansion cardinality remain separate risks. Current Tailwind inputs are repository-controlled fixed globs; this is not a general-purpose untrusted-pattern safety guarantee. Registry audit does not independently certify a private version. Keep the advisory and this threat model explicit in security review.

Closing legacy tabs is separate from compiler compatibility. Do not clear browser storage or force reload unsaved work. Compatibility logout requires the disclosed end-user choice to retain unencrypted saved copies and pending edits; no silent data migration or deletion is authorized.

Official sources:
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/micromatch/braces
- https://tailwindcss.com/docs/compatibility
