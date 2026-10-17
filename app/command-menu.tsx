"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command, defaultFilter } from "cmdk";
import { ArrowUpRight, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomerJourney, Role } from "../src/domain/banking";
import { navigationFor, type View } from "./navigation";

export function CommandMenu({
  role,
  journey,
  busy,
  navigate,
}: {
  role: Role;
  journey: CustomerJourney;
  busy: boolean;
  navigate: (view: View) => void;
}) {
  const [open, setOpen] = useState(false);
  const entries = navigationFor(role, journey);
  const origin = useRef<HTMLElement | null>(null);
  const changeOpen = useCallback(
    (next: boolean) => {
      if (next && busy) return;
      if (next)
        origin.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      setOpen(next);
    },
    [busy],
  );
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        !event.isComposing &&
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        changeOpen(!open);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [changeOpen, open]);

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="command-trigger"
          aria-label="Find a screen"
          disabled={busy}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search size={16} />
          <span>Find a screen</span>
          <kbd>⌘ / Ctrl K</kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="command-overlay" />
        <Dialog.Content
          className="command-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            origin.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">
            Navigate banking workspace
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Search screens{role !== "customer" ? " or menu codes" : ""}. Arrow
            keys select, Enter opens, Escape closes. Commands only navigate.
          </Dialog.Description>
          <Command
            label="Banking screens"
            loop
            filter={(value, search, keywords) => {
              const exactCode = entries.find(
                (item) =>
                  item.alias?.toLowerCase() === search.trim().toLowerCase(),
              );
              return exactCode
                ? Number(value === exactCode.label)
                : defaultFilter(value, search, keywords);
            }}
          >
            <div className="command-search">
              <Search size={20} />
              <Command.Input
                placeholder={
                  role === "customer"
                    ? "Where would you like to go?"
                    : "Search a screen or menu code…"
                }
                aria-label="Search banking screens"
              />
              <Dialog.Close asChild>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Close command menu"
                >
                  <X size={17} />
                </button>
              </Dialog.Close>
            </div>
            <Command.List>
              <Command.Empty>
                No matching screen. Try accounts, services or statements.
              </Command.Empty>
              <Command.Group
                heading={
                  role === "customer" ? "Personal banking" : "Branch workspace"
                }
              >
                {entries.map((item) => (
                  <Command.Item
                    key={item.view}
                    value={item.label}
                    keywords={[item.alias ?? "", item.view]}
                    disabled={busy}
                    onSelect={() => {
                      if (busy) return;
                      navigate(item.view);
                      changeOpen(false);
                    }}
                  >
                    <ArrowUpRight size={17} />
                    <span>{item.label}</span>
                    {item.alias && <kbd>{item.alias}</kbd>}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
            <div className="command-footer">
              <span>↑ ↓ Navigate</span>
              <span>↵ Open screen</span>
              <span>esc Close</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
