"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Role } from "../src/domain/banking";
import { Cards } from "./cards";
import type { ServicePerform } from "./service-request-form";

const Replacements = dynamic(
  () => import("./card-replacements").then((module) => module.CardReplacements),
  { loading: () => <p role="status">Loading replacement workspace…</p> },
);
export function CardWorkspace(props: {
  bankId: string;
  role: Role;
  busy: boolean;
  perform: ServicePerform;
  openAccount: () => void;
}) {
  const [view, setView] = useState<"controls" | "replacements">("controls");
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>();
  return (
    <>
      <nav
        className="card-workspace deposit-product-switch"
        aria-label="Card workspace view"
      >
        <button
          type="button"
          disabled={props.busy}
          aria-pressed={view === "controls"}
          onClick={() => setView("controls")}
        >
          Card controls
        </button>
        <button
          type="button"
          disabled={props.busy}
          aria-pressed={view === "replacements"}
          onClick={() => setView("replacements")}
        >
          Replacement requests
        </button>
      </nav>
      {view === "controls" ? (
        <Cards {...props} selectedCardId={selectedCardId} />
      ) : (
        <Replacements
          {...props}
          openCard={(id) => {
            setSelectedCardId(id);
            setView("controls");
          }}
        />
      )}
    </>
  );
}
