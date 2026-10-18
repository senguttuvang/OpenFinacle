# Third-Party Notices

OpenFinacle's original application code and documentation are licensed under [MIT](LICENSE). Dependencies, fonts and the separately built banking engine retain their own copyrights and licenses; the root MIT license does not replace them.

## Banking Engine

[Apache Fineract](https://fineract.apache.org/) is the financial engine, not an OpenFinacle implementation of a new banking core. The [container build](infrastructure/fineract/Dockerfile) uses the official **1.15.0** distribution with its pinned SHA-512. Fineract is under [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0), together with the notices and individual third-party licenses in its distribution.

The Docker image preserves the upstream `LICENSE`, `NOTICE` and `licenses/` directory under `/app/`. Preserve these files when redistributing that image or an altered distribution. The release's [upstream notice](https://github.com/apache/fineract/blob/d5636847ac556c30b437254c353f05526d172b97/NOTICE_RELEASE) identifies Apache Fineract, copyright 2008–2025 The Apache Software Foundation, and its bundled third-party resources. The Java runtime also retains the notices provided by the Eclipse Temurin image.

## Application Dependencies

This is a navigation aid to the main direct dependencies, based on the committed lockfile. It is not a substitute for the full license/notice files installed with each dependency or an exhaustive transitive software bill of materials. Preserve applicable notices when redistributing source, browser bundles, Worker bundles or images.

| Component | License | Upstream |
| --- | --- | --- |
| Next.js | MIT | [vercel/next.js](https://github.com/vercel/next.js) |
| React and React DOM | MIT | [facebook/react](https://github.com/facebook/react) |
| Effect, Effect CLI/platform/schema | MIT | [Effect-TS/effect](https://github.com/Effect-TS/effect) |
| Radix UI primitives | MIT | [radix-ui/primitives](https://github.com/radix-ui/primitives) |
| cmdk | MIT | [pacocoursey/cmdk](https://github.com/pacocoursey/cmdk) |
| Lucide React | ISC; some Feather-derived icons retain MIT notices | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) |
| Sentry JavaScript SDKs | MIT | [getsentry/sentry-javascript](https://github.com/getsentry/sentry-javascript) |
| Cloudflare Containers | MIT OR Apache-2.0 | [cloudflare/containers](https://github.com/cloudflare/containers) |
| Fontsource Manrope and IBM Plex Sans | SIL Open Font License 1.1 | [Fontsource](https://github.com/fontsource/font-files) |
| Postgres.js | Unlicense | [porsager/postgres](https://github.com/porsager/postgres) |

Development tools, including Bun, TypeScript, Playwright, Wrangler, Biome and static-analysis packages, have their own licenses. Install the committed versions with `bun install --frozen-lockfile`; `bun pm licenses` lists installed package license metadata. Metadata alone does not replace review of bundled third-party notices, native components or licenses within an upstream distribution. Recheck attribution whenever the lockfile or copied assets change.

## Fonts and Screenshots

The local fonts retain their complete notices: [Manrope OFL](public/font-licenses/Manrope-OFL.txt) and [IBM Plex Sans OFL](public/font-licenses/IBM-Plex-Sans-OFL.txt). Keep those notices with redistributed font files.

The images in `public/product/` are OpenFinacle acceptance-fixture screenshots, using synthetic names, balances and transactions. They illustrate this application's interface; they are not screenshots of a customer's real bank account or evidence of a commercial bank deployment.

## Inspiration and Names

[Finacle](https://www.finacle.com/solution/core-banking-solution/) is an independent product inspiration and public reference, not a dependency, upstream source repository or sponsor. OpenFinacle is not affiliated with or endorsed by Infosys, EdgeVerve or Finacle and does not claim product equivalence or trademark clearance. Third-party names and marks remain with their owners.

[PhotoCraft](https://github.com/storytold/photocraft) is credited as a reference for independently exploring familiar software. It is not an Adobe project or a dependency of OpenFinacle. Referencing a project does not relicense its code or assets.
