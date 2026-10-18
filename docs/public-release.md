# Public Source Release

This guide records the scope and repeatable checks for publishing OpenFinacle's application source under MIT. Publishing source does not certify a banking system for production use.

## What Is Licensed

The root [MIT license](../LICENSE) applies to the original application code and documentation. The separate Apache Fineract engine, installed dependencies and fonts retain their own licenses. [Third-party notices](../THIRD_PARTY_NOTICES.md) identify the main components and the retained upstream notice locations. Synthetic acceptance screenshots illustrate this application; no real customer records or bank screenshots belong in a release.

The package remains marked `private` to prevent accidental npm publication. That setting is separate from both the source license and GitHub repository visibility.

## Source and History Review

Before a public release, fetch the repository's intended refs, inspect tracked files and scan all reachable history with redaction enabled:

```sh
git fetch origin
gitleaks git --log-opts='--all --full-history' --redact
git status --short --branch
```

Use the installed Gitleaks CLI or another explicitly reviewed scanner. For a separate current-tree scan, scan an exported Git snapshot rather than installed dependencies or generated build output. Keep detailed scanner reports private; a report can expose a matched value if redaction is misconfigured. Review staged and untracked files, credential files, customer exports, screenshots, private correspondence, operational logs and unrelated project material directly as well. Current ignore rules do not erase earlier history. Any history rewrite and credential rotation need a deliberate recovery plan; do not silently rewrite published commits.

Cloud account IDs, resource IDs and public demo routes in the deployment configuration are identifiers, not credentials. A fork must configure its own account, resources, routes and protected credentials before cloud operations. Do not publish the maintainer's runtime secrets or reuse hosted administration access.

The October 2026 preparation removed machine-specific Docker socket paths and unrelated private-workspace provenance from the current specifications. Earlier commits still retain their historical text; the preparation does not claim that history was rewritten or that a scanner proves the absence of every sensitive item.

## Dependency Review

Run these alongside the [contribution checks](../CONTRIBUTING.md):

```sh
bun install --frozen-lockfile
bun pm licenses
bun audit
bun run check
```

The installed graph includes licenses beyond MIT, including Apache-2.0, ISC, BSD, OFL and the LGPL-licensed native libvips component used by Sharp. Preserve the applicable upstream terms if redistributing those components; the root license does not turn the whole installed dependency graph into MIT software. Review the actual target platform and distribution rather than assuming browser, Worker and development artifacts contain the same packages.

At the 18 October 2026 review, `bun audit` reported **GHSA-vfj7-8cjw-p6xm / CVE-2026-93687** in `braces@3.0.3`. The installed path is `type-coverage` (development) → `type-coverage-core` → `fast-glob` → `micromatch` → `braces`. The [GitHub advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version, and the registry's latest version was 3.0.3 at review time. This remains an open development-tool dependency finding; the audit is not clean and has not been suppressed. Repository-controlled build globs are different from bank API inputs, but that distinction does not close the advisory. Recheck upstream before the next dependency update, and avoid processing untrusted brace patterns with the affected toolchain.

## Publication and Maintenance

Review the final GitHub diff, documentation links, license recognition, issues and branch contents before changing access. After publication, verify anonymous source access and enable GitHub secret scanning, push protection and private vulnerability reporting where available. Confirm that the README, demo link, screenshots and security-reporting route work for a visitor who is not signed in.

Maintainers should state known limitations and measured evidence separately from plans or estimates. In particular, public source access, token usage, prototype breadth and passing tests do not establish production identity, regulatory acceptance, operational reconciliation or bank readiness.
