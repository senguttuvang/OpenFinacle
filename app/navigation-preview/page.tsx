"use client";

import { useState } from "react";
import type { RetailMenuItem } from "../../src/domain/retail-navigation";
import type { View } from "../navigation";
import { ReadingSize } from "../reading-size";
import { RetailNavigation, RetailUnavailable } from "../retail-navigation";
import "./preview.css";

/** Isolated interaction harness. This route never opens a banking session. */
export default function NavigationPreview() {
  const [view, setView] = useState<View>("overview");
  const [selected, setSelected] = useState<RetailMenuItem>();
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  return (
    <div className="navigation-preview">
      <header>
        <strong>OpenFinacle</strong>
        <span>Navigation preview · synthetic UI only</span>
        <ReadingSize />
      </header>
      <div className="navigation-preview-layout">
        <RetailNavigation
          key={revision}
          view={view}
          activeItemId={selected?.id}
          busy={busy}
          onSelect={(item) => {
            setSelected(item);
            if (item.destination.kind === "workspace")
              setView(item.destination.view);
          }}
        />
        <main>
          <h1>Banking navigation preview</h1>
          <p>
            This isolated harness verifies menu interactions. Workspace
            integration is verified separately.
          </p>
          <label>
            <input
              type="checkbox"
              checked={busy}
              onChange={(event) => setBusy(event.target.checked)}
            />{" "}
            Banking request in progress
          </label>
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Restart menu preview
          </button>
          {selected?.destination.kind === "unavailable" ? (
            <RetailUnavailable
              item={selected}
              navigate={(target) => {
                setSelected(undefined);
                setView(target);
              }}
            />
          ) : (
            <section aria-label="Selected destination">
              <h2>{selected?.label ?? "My View"}</h2>
              <p data-testid="destination">
                {view}
                {selected?.destination.kind === "workspace" &&
                selected.destination.section
                  ? ` / ${selected.destination.section}`
                  : ""}
              </p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
