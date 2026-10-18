# Contributing to OpenFinacle

This guide explains how to contribute to OpenFinacle's MIT-licensed application while preserving the financial-core boundary and keeping demonstration data synthetic.

## Start With a Small Change

Use GitHub issues for bugs and proposals. Describe the customer or branch journey, expected outcome and a small reproducible example. Discuss changes to financial workflows, identity, schema or infrastructure before implementing them. Report vulnerabilities through [the security policy](SECURITY.md), rather than a public issue.

Fork the repository, create a focused branch and open a pull request. Maintainers also use the local Beads ledger described in [AGENTS.md](AGENTS.md); a first-time contributor does not need the maintainer's local issue database, cloud account or agent configuration.

## Local Development

Install Bun 1.4.2, then run:

```sh
bun install --frozen-lockfile
bun run dev
```

The UI starts at `http://localhost:3048`. The Next.js server alone does not provide the banking API. No hosted credentials or customer records are needed to inspect the source or work on deterministic fixtures.

For resource-free workspace browser tests, install Playwright's Chromium and build the static assets:

```sh
bunx playwright install chromium
bun run build
bunx wrangler dev --config retail-navigation-worker.wrangler.jsonc --port 8811
```

With that server running, use a separate terminal:

```sh
BASE_URL=http://127.0.0.1:8811 bunx playwright test --project=workspace
```

This project intercepts API responses with synthetic acceptance fixtures. It does not prove a Fineract financial posting. Other browser projects can change persistent demonstration records; inspect their configuration and explicitly choose an authorised sandbox before running them. The default browser-test URL is the hosted demo, so keep `BASE_URL` explicit.

## Checks Before a Pull Request

Run the full repository gate from the branch being reviewed:

```sh
bun run check
```

It includes types, formatting/lint, static analysis, unit/integration tests, production export and a Worker/container dry run. Docker must be running and SQLite 3.38+ must support safe mode and JSON. Configure your Docker context or `DOCKER_HOST` for your own machine. The container build downloads the checksum-pinned Apache Fineract distribution; its first build needs network access.

For a behavioural fix, add a regression that fails on the old behaviour. For UI work, check keyboard interaction, narrow screens and large text. Explain what changed, why, how it was verified and any remaining limitation in the PR.

## Protect Data and Financial Outcomes

- Use invented names, documents, accounts and money. Do not contribute customer exports, real banking screenshots, browser storage, cookies, credentials, logs containing secrets or private working notes.
- Keep Fineract as the financial system of record. Workflow records and simulated products are separate models.
- Preserve original command identities and uncertain outcomes. Do not automatically retry a financial instruction whose result is unknown.
- Keep customer scope, independent approval and consent checks intact. Opening a URL must not grant a role or submit a financial command.
- Schema changes require the [protected release procedure](docs/workflow-release.md). Never reset shared financial data to make a test pass.

The committed production configuration describes the hosted demonstration. Before deploying a fork, replace account/resource identifiers, routes and names with resources in your own account and configure your own protected credentials. Do not run provisioning, seed or administration commands against the shared hosted demo. See [development and operations](docs/development-and-operations.md) for the bootstrap boundary.

## Licensing and Attribution

Submit only material you have permission to contribute. Contributions to the original application are offered under [MIT](LICENSE), unless a different arrangement is explicitly agreed. Preserve the notices and licenses of third-party material; the application license does not relicense Fineract, fonts or dependencies. See [third-party notices](THIRD_PARTY_NOTICES.md).
