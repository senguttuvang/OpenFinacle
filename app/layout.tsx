import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./globals.css";
import "./retail.css";
import "./command-menu.css";
import "./branch.css";
import "./service-centre.css";
import "./cards.css";
import "./banking-surfaces.css";
import "./banking-design.css";
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
