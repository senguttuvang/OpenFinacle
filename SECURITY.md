# Security Policy

This policy explains how to report security issues in OpenFinacle and the security boundary of its public demonstration.

## Reporting a Vulnerability

Use the repository's [private vulnerability reporting page](https://github.com/senguttuvang/OpenFinacle/security/advisories/new) when GitHub displays **Report a vulnerability**. If private reporting is unavailable, use the contact options on [the maintainer's profile](https://github.com/senguttuvang) to arrange a private channel. A public issue may request a contact channel without including vulnerability details.

Include the affected revision or URL, expected and observed behaviour, a minimal synthetic reproduction and the potential impact. Remove credentials, cookies, personal information and live financial data. Do not publish an exploit, secret or customer record in an issue or pull request.

The project is maintained as a prototype, without a guaranteed security response or support SLA. Security fixes target the current `main` branch; there is no promise of backports to older snapshots.

## Demonstration Boundary

OpenFinacle uses persistent synthetic records and demonstration money. Demo persona switching is deliberately available; it is not production customer or employee authentication. The prototype does not establish production banking readiness, regulatory approval or protection for real funds.

Use a local fixture or an explicitly authorised sandbox for security tests. Public source access is not permission for load testing, disruptive probes, bulk seeding, administrative operations or access to other systems. Do not upload real identity documents or genuine bank details to the hosted demo.

Financial operations and uncertain outcomes require special care: preserve original references and inspect an unknown result before considering another instruction. Repeating a command to reproduce a response-loss problem can create a second financial outcome.

## Credentials and Releases

Keep provider credentials, the administration token and Core/database credentials in protected runtime configuration. `.env*`, `.dev.vars*`, private keys and credential exports are excluded from source control. Ignoring a file does not remove it from earlier Git history; rotate an exposed credential and privately arrange remediation.

Run a redacted secret scan across all reachable history before a public release, and review proposed files for private material. Maintainers should enable GitHub secret scanning, push protection and private vulnerability reporting when available for the repository. These controls complement review; a clean scanner result does not certify the application as secure.
