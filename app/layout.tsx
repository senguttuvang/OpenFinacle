import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "../src/platform/banking-workspace/styles/globals.css";
import "../src/platform/banking-workspace/styles/retail.css";
import "../src/platform/navigation/ui/command-menu.css";
import "../src/platform/branch-operations/ui/branch.css";
import "../src/platform/service-requests/ui/service-centre.css";
import "../src/platform/cards/ui/cards.css";
import "../src/platform/deposits/ui/deposits.css";
import "../src/platform/cards/ui/card-replacements.css";
import "../src/platform/deposits/ui/deposit-products.css";
import "../src/platform/banking-workspace/styles/banking-surfaces.css";
import "../src/platform/banking-workspace/styles/banking-design.css";
import "../src/platform/navigation/ui/persona-select.css";
import "../src/platform/lending/ui/loans.css";
export const metadata: Metadata = {
  title: "OpenFinacle — Everyday banking, connected",
  description: "A working banking sandbox powered by Apache Fineract.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
