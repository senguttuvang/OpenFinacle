"use client";

import { ChevronDown, ChevronRight, Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  type RetailMenuItem,
  retailMenu,
} from "../src/domain/retail-navigation";
import type { View } from "./navigation";
import "./retail-navigation.css";

export function RetailNavigation({
  view,
  activeItemId,
  busy = false,
  onSelect,
}: {
  view: View;
  activeItemId?: string;
  busy?: boolean;
  onSelect: (item: RetailMenuItem) => void;
}) {
  const uid = useId();
  const nav = useRef<HTMLElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const cancelClose = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !nav.current?.contains(event.target)
      ) {
        setOpen(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const focusItem = (index: number, last = false) => {
    setOpen(index);
    // State must commit before focus moves into the newly disclosed list.
    requestAnimationFrame(() => {
      const buttons = nav.current?.querySelectorAll<HTMLButtonElement>(
        `[data-family="${index}"] .retail-menu-leaf`,
      );
      buttons?.[last ? buttons.length - 1 : 0]?.focus();
    });
  };
  const activeFamily = activeItemId
    ? retailMenu.findIndex((family) =>
        family.items.some((item) => item.id === activeItemId),
      )
    : retailMenu.findIndex(
        (family) =>
          family.id === view ||
          family.items.some(
            (item) =>
              item.destination.kind === "workspace" &&
              item.destination.view === view,
          ),
      );
  return (
    <nav
      ref={nav}
      className="retail-menu"
      aria-label="Main navigation"
      onPointerEnter={cancelClose}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse")
          timer.current = setTimeout(() => setOpen(null), 180);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (open !== null) triggers.current[open]?.focus();
          else {
            nav.current
              ?.querySelector<HTMLButtonElement>(".retail-menu-toggle")
              ?.focus();
            setMobileOpen(false);
          }
          setOpen(null);
        }
      }}
    >
      <button
        className="retail-menu-toggle"
        type="button"
        aria-expanded={mobileOpen}
        aria-controls={`${uid}-families`}
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <Menu size={22} aria-hidden="true" /> Banking menu{" "}
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <ul
        id={`${uid}-families`}
        className={`retail-menu-families${mobileOpen ? " is-open" : ""}`}
      >
        {retailMenu.map((family, index) => (
          <li
            key={family.id}
            data-family={index}
            className={
              activeFamily === index
                ? "retail-menu-family is-current"
                : "retail-menu-family"
            }
            onPointerEnter={(event) => {
              if (
                !busy &&
                event.pointerType === "mouse" &&
                window.matchMedia("(min-width: 901px)").matches
              ) {
                cancelClose();
                setOpen(index);
              }
            }}
          >
            <button
              type="button"
              ref={(element) => {
                triggers.current[index] = element;
              }}
              className="retail-menu-trigger"
              disabled={busy}
              aria-expanded={open === index}
              aria-controls={`${uid}-${family.id}`}
              onClick={() => {
                cancelClose();
                setOpen(open === index ? null : index);
              }}
              onKeyDown={(event) => {
                if (
                  ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? retailMenu.length - 1
                        : (index +
                            (event.key === "ArrowDown" ? 1 : -1) +
                            retailMenu.length) %
                          retailMenu.length;
                  triggers.current[next]?.focus();
                  if (open !== null) setOpen(next);
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  focusItem(index);
                }
              }}
            >
              <span>{family.label}</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <div
              id={`${uid}-${family.id}`}
              className="retail-menu-panel"
              hidden={open !== index}
            >
              <div className="retail-menu-panel-heading">
                <strong>{family.label}</strong>
                <button
                  type="button"
                  aria-label={`Close ${family.label}`}
                  onClick={() => {
                    setOpen(null);
                    triggers.current[index]?.focus();
                  }}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              <ul>
                {family.items.map((item, leafIndex) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="retail-menu-leaf"
                      disabled={busy}
                      aria-current={
                        activeItemId === item.id ? "page" : undefined
                      }
                      onKeyDown={(event) => {
                        if (
                          ["ArrowDown", "ArrowUp", "Home", "End"].includes(
                            event.key,
                          )
                        ) {
                          event.preventDefault();
                          const next =
                            event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? family.items.length - 1
                                : (leafIndex +
                                    (event.key === "ArrowDown" ? 1 : -1) +
                                    family.items.length) %
                                  family.items.length;
                          event.currentTarget
                            .closest("ul")
                            ?.querySelectorAll<HTMLButtonElement>(
                              ".retail-menu-leaf",
                            )
                            [next]?.focus();
                        } else if (event.key === "ArrowLeft") {
                          event.preventDefault();
                          setOpen(null);
                          triggers.current[index]?.focus();
                        }
                      }}
                      onClick={() => {
                        cancelClose();
                        setOpen(null);
                        setMobileOpen(false);
                        if (window.matchMedia("(max-width: 900px)").matches)
                          nav.current
                            ?.querySelector<HTMLButtonElement>(
                              ".retail-menu-toggle",
                            )
                            ?.focus();
                        else triggers.current[index]?.focus();
                        onSelect(item);
                      }}
                    >
                      <span>{item.label}</span>
                      {item.destination.kind === "unavailable" && (
                        <small>Not available in demo</small>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function RetailUnavailable({
  item,
  navigate,
}: {
  item: RetailMenuItem;
  navigate: (view: View) => void;
}) {
  const destination = item.destination;
  const related =
    destination.kind === "unavailable" ? destination.related : undefined;
  return (
    <section className="retail-unavailable" aria-label={item.label}>
      <h2>{item.label}</h2>
      <p>This service is not available in this demonstration.</p>
      <p>
        OpenFinacle does not connect to this bank service. Your saved
        demonstration records remain available.
      </p>
      {related && (
        <button
          type="button"
          className="primary"
          onClick={() => navigate(related)}
        >
          Explore{" "}
          {related === "planning"
            ? "wealth and planning"
            : related === "services"
              ? "service requests"
              : related === "transfer"
                ? "supported transfers"
                : related}
        </button>
      )}
      <button
        type="button"
        className="secondary"
        onClick={() => navigate("overview")}
      >
        Back to overview
      </button>
    </section>
  );
}
