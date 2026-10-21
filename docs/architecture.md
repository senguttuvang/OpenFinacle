# Domain Architecture

OpenFinacle separates its public product story, banking capabilities, synthetic demonstration data, runtime bindings and operator tooling. This document explains ownership and the executable rules that keep those responsibilities from spilling into route and repository roots.

## Ownership

```text
app/                         Next.js route, layout and error composition shells
src/
  site/                      Public product content and interactive assessment
    product/                 Landing story, evidence and article presentation
    assessment/              Capability comparison and implementation evidence
    build-story/             Development and investment comparison
    capabilities/            Connected banking capability story
    discover/                Public discovery entry
    roadmap/                 Future work and production boundaries
  platform/                  Banking capabilities, organized by business purpose
    account-opening/
    banking-workspace/
    branch-operations/
    cards/
    core-banking/
    customers/
    deposits/
    form-controls/
    household-planning/
    lending/
    navigation/
    observability/
    payments/
    service-requests/
  demo/                      Invented households/customers, scenarios and pilots
  runtime/                   HTTP composition, Worker bindings and workflow storage
  operations/                Maintained operator CLI and architecture verification
config/
  previews/                  Local-only Worker and browser preview configuration
  quality/                   Complexity and duplication configuration
migrations/                  Ordered, append-only workflow database history
tests/                       Capability-owned behavioral and architecture tests
e2e/                         Capability-owned browser journeys and shared fixtures
public/                      Served product images and static assets
infrastructure/              Banking-engine container build inputs
```

Within a banking capability, `domain` owns business models, invariants and service ports; `application` orchestrates them; `ui` owns presentation and browser API clients; `infrastructure` implements core integrations. A folder is created only when actual implementation needs it. Lending separates origination and repayment contracts. Planning groups its saved-source controls separately from its workspace views.

Domain models remain independent of UI, storage adapters, preview datasets and HTTP. Effect is the established domain/application runtime. Framework and provider types remain at their existing edges. Apache Fineract remains the financial system of record; workflow storage owns app decisions and history. Simulation workflows remain explicit. The reorganization does not change financial algorithms, schema migration order, API methods, route URLs, approval rules, idempotency keys or uncertainty/reconciliation behavior.

Cross-capability consumers use the explicit file entrypoints listed in `.agents/architecture.json` under `publicSurfaces`. A public surface can be a named model, service or workspace file; an `index.ts` barrel is not required. This avoids introducing artificial import cycles and eager browser bundles merely to standardize filenames. Internal implementation files are accessible to their owning capability and its tests; a new external entrypoint requires an explicit contract update. Dependency direction is defined in `arch-contract.yaml` and checked against resolved imports by dependency-cruiser.

## Maintainability Contract

Authored source, styles and tests are limited to 700 physical lines per file. Framework route shells are limited to 120 lines. Source directories have a maximum of 15 directly contained files. Ten to fifteen is a planning range, not a minimum: cohesive smaller directories are expected. Split at a meaningful business operation, lifecycle, presentation or adapter boundary. Do not create numbered fragments, empty folders or generic `helpers`, `utils`, `misc`, `temp` or session-based buckets.

The repository root has an explicit allowlist for required tool configuration, entry documentation and ownership directories. Generated build output, local environment files and vendor dependencies have separate named owners. Migration filenames preserve their ordered database history; migrations are an operational sequence rather than a capability directory to rebalance. Neither historical specs nor generated/vendor output are application implementation.

The architecture tests reject unknown roots, unknown capabilities, generic directories, route implementation spill, oversized files, crowded directories and undeclared cross-capability imports. A hostile temporary fixture proves that the active ArchContract rejects reversed dependencies and React-bound domain code. Analysis failures propagate to the normal check command. No violation baseline or silent exclusion is used.

## Quality Tools

The 1851 website-import repository supplied the reference patterns: semantic capability ownership, thin routes, executable architecture contracts, generated agent instructions checked for drift, dependency analysis and maintainability gates. The target keeps its established Next.js, Bun and Effect stack.

| Check | Purpose |
| --- | --- |
| TypeScript | Strict application, worker, CLI and test types |
| Biome | Formatting, accessibility and routine source/config lint |
| Oxlint | Additional fast code correctness checks |
| ESLint, Promise, RegExp, Security, SonarJS and Unicorn rules | Complexity at most 50, nesting at most six, file size, unsafe regex/eval, promise correctness and duplicate branch conditions |
| Knip | Reachable files, unused exports and dependency hygiene; the browser-built FormSelect fixture is an explicit entrypoint |
| ArchContract | Layer direction, framework independence and synchronized agent guidance |
| Architecture tests | Root/capability ownership, naming, density, route size and declared public imports, including negative fixtures |
| dependency-cruiser | Resolved import boundaries and circular dependencies across both `src` and `app` |
| Madge | Independent cycle verification |
| type-coverage | The existing minimum 95% typed coverage |
| jscpd | At most 1% duplicate production lines, with ten-line/100-token clone detection |
| cloc | Per-file LOC inventory via `bun run static:loc`; an informational report |
| Bun tests and Playwright | Behavioral and browser regression coverage |
| Next build and Wrangler dry run | Static route export and Worker/container build verification |

Nx/ManyPkg, Payload/Puck checks and their generated types are specific to 1851's monorepo and content platform. They do not apply to this single-package banking application. A remote SonarQube scanner requires a separately configured service; local SonarJS checks run without one. Tool count is not an architecture rule.

Run `bun run static:architecture` after structural edits and `bun run check` for the full local CI equivalent. Browser journeys use the existing Playwright commands and their selected local or deployed target. A Docker engine and strict SQLite verifier are prerequisites for the full check. Do not replace a failed container dry run with a skipped container build and report it as complete.

## Safe Refactoring

Relocation must update static and dynamic imports, CLI/config paths, framework client directives, static route exports, browser fixture build entrypoints and stylesheet imports. Stylesheet fragments preserve their original cascade order through their owning stylesheet entrypoint. UI state stays in hooks and views retain the original event handlers and financial API clients.

Record baseline failures separately from introduced failures. Work in an isolated feature worktree, preserve concurrent sessions and release ownership, reconcile their changes before integration, then rerun the exact-branch checks. Restore a pre-integration candidate by checking out its original revision in another worktree; do not reset or overwrite another session's checkout.
