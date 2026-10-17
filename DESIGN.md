# OpenFinacle design

Operate mode: customers and branch staff must read financial values, understand state, and complete familiar banking tasks. The user requested a modern, colorful professional experience alongside Xero and Payoneer, with comfortable large text and an extra-large option.

The shared system uses a light workspace, white navigation, cobalt actions and account summaries, with restrained mint, amber and lilac sections. Values and status remain legible without relying on hue. Account enquiry separates available funds, customer identity and account facts. Branch overview colors identify different kinds of work; counts always come from existing records.

## Tokens and use

- Body: IBM Plex Sans, 18px at the browser's normal 16px setting; extra-large 22px. Headings and prominent values: locally served Manrope.
- Type uses rem units; headings approximately 36px, section headings 22px, main controls 17–18px, supporting information 15–17px. Minor system metadata may be smaller.
- Ink `#172b4d`, secondary `#52627a`, action `#2458d3`, account surface `#173d86`, workspace `#f2f5fc`, rule `#dae2ef`.
- Account surface secondary text `#d4e3ff`; normal colored status labels retain explicit words/icons.
- Major panels: 16px corners, 24–28px spacing, simple borders. Primary controls at least 50px high; horizontal navigation scrolls within its own container on narrow screens.
- Reading size persists on this device. If browser storage fails, the selection still works for the visit and discloses that limitation.
- The demo persona picker uses Radix Select, matching the existing Radix dialogs. Its portal avoids sidebar clipping, options have 50px targets and a selected checkmark, and the busy state prevents role changes. Keep keyboard navigation, typeahead, Escape and focus return.
- Responsive account facts stack, dashboard columns collapse, forms use one column, and action controls wrap. Preserve local fonts, reduced-motion support and visible keyboard focus.

## Public visual research

Reviewed October 17, 2026. These are public marketing/product images, not authenticated access or full product audits. Their assets are references only and are not shipped.

- [Xero dashboard](https://www.xero.com/ae/accounting-software/dashboard/) and [new homepage](https://www.xero.com/ca/campaign/new-homepage-navigation/): prominent financial summaries and direct task access. Retain those useful hierarchies without inventing charts.
- [Payoneer](https://www.payoneer.com/): published desktop dashboard image shows grouped balances, clear transaction rows and distinct work areas.
- [Wise team finances](https://wise.com/ca/business/manage-team): clear permissions, approval and spending controls; its public imagery separates identity from actionable settings. A public [demo entry](https://wise.com/business-demo) is available; no claim of a full demo walkthrough.

The product remains an explicit synthetic banking demonstration. This presentation change does not claim reference parity or introduce financial/product capabilities.
