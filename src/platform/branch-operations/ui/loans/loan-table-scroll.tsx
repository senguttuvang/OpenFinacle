import type { ReactNode } from "react";

export function LoanTableScroll({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Named overflow regions need focus for native arrow-key scrolling; see MDN CSS overflow accessibility.
    <section className="table-scroll" aria-label={label} tabIndex={0}>
      {children}
    </section>
  );
}
