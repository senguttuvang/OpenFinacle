"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Role } from "../src/domain/banking";
import { Deposits } from "./deposits";
import { followPortalLink } from "./portal-location";
import type { ServicePerform } from "./service-request-form";

const Recurring = dynamic(
  () =>
    import("./recurring-deposits").then((module) => module.RecurringDeposits),
  { loading: () => <p role="status">Loading recurring workspace…</p> },
);
export function DepositWorkspace(props: {
  bankId: string;
  role: Role;
  busy: boolean;
  perform: ServicePerform;
  accountOpened: boolean;
  openAccount: () => void;
  initialProduct?: "fixed" | "recurring";
  navigate?: (path: string) => void;
}) {
  const [localProduct, setProduct] = useState<"fixed" | "recurring">(
    props.initialProduct ?? "fixed",
  );
  const product = props.navigate
    ? (props.initialProduct ?? "fixed")
    : localProduct;
  return (
    <>
      <nav
        className="card-workspace deposit-product-switch"
        aria-label="Deposit products"
      >
        <a
          href="/deposits/fixed"
          aria-disabled={props.busy}
          aria-current={product === "fixed" ? "page" : undefined}
          onClick={(event) => {
            if (props.busy) {
              event.preventDefault();
              return;
            }
            followPortalLink(event, () => {
              setProduct("fixed");
              props.navigate?.("/deposits/fixed");
            });
          }}
        >
          Fixed deposits
        </a>
        <a
          href="/deposits/recurring"
          aria-disabled={props.busy}
          aria-current={product === "recurring" ? "page" : undefined}
          onClick={(event) => {
            if (props.busy) {
              event.preventDefault();
              return;
            }
            followPortalLink(event, () => {
              setProduct("recurring");
              props.navigate?.("/deposits/recurring");
            });
          }}
        >
          Recurring deposits
        </a>
      </nav>
      {product === "fixed" ? (
        <Deposits key={props.bankId + props.role} {...props} />
      ) : (
        <Recurring key={props.bankId + props.role} {...props} />
      )}
    </>
  );
}
