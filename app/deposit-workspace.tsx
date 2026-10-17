"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Role } from "../src/domain/banking";
import { Deposits } from "./deposits";
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
}) {
  const [product, setProduct] = useState<"fixed" | "recurring">("fixed");
  return (
    <>
      <nav
        className="card-workspace deposit-product-switch"
        aria-label="Deposit products"
      >
        <button
          type="button"
          disabled={props.busy}
          aria-pressed={product === "fixed"}
          onClick={() => setProduct("fixed")}
        >
          Fixed deposits
        </button>
        <button
          type="button"
          disabled={props.busy}
          aria-pressed={product === "recurring"}
          onClick={() => setProduct("recurring")}
        >
          Recurring deposits
        </button>
      </nav>
      {product === "fixed" ? (
        <Deposits key={props.bankId + props.role} {...props} />
      ) : (
        <Recurring key={props.bankId + props.role} {...props} />
      )}
    </>
  );
}
