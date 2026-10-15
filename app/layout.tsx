import type { Metadata } from "next";
import "./globals.css";
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
