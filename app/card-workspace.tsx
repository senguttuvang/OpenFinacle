"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Role } from "../src/domain/banking";
import { Cards } from "./cards";
import { followPortalLink } from "./portal-location";
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
  routeTab?: "controls" | "replacements";
  navigate?: (path: string) => void;
}) {
  const [localView, setView] = useState<"controls" | "replacements">(
    "controls",
  );
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>();
  const view = props.navigate ? (props.routeTab ?? "controls") : localView;
  return (
    <>
      <nav
        className="card-workspace deposit-product-switch"
        aria-label="Card workspace view"
      >
        <a
          href="/cards/controls"
          aria-disabled={props.busy}
          aria-current={view === "controls" ? "page" : undefined}
          onClick={(event) => {
            if (props.busy) {
              event.preventDefault();
              return;
            }
            followPortalLink(event, () => {
              setView("controls");
              props.navigate?.("/cards/controls");
            });
          }}
        >
          Card controls
        </a>
        <a
          href="/cards/replacements"
          aria-disabled={props.busy}
          aria-current={view === "replacements" ? "page" : undefined}
          onClick={(event) => {
            if (props.busy) {
              event.preventDefault();
              return;
            }
            followPortalLink(event, () => {
              setView("replacements");
              props.navigate?.("/cards/replacements");
            });
          }}
        >
          Replacement requests
        </a>
      </nav>
      {view === "controls" ? (
        <Cards {...props} selectedCardId={selectedCardId} />
      ) : (
        <Replacements
          {...props}
          openCard={(id) => {
            setSelectedCardId(id);
            setView("controls");
            props.navigate?.("/cards/controls");
          }}
        />
      )}
    </>
  );
}
