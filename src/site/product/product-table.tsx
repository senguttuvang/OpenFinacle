import type { ReactNode } from "react";
export function ProductTable({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: labelled scroll region needs keyboard access
    <section className="magazine-table-scroll" aria-label={label} tabIndex={0}>
      {children}
    </section>
  );
}
