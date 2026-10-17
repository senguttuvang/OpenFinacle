"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Effect } from "effect";
import {
  ArrowRight,
  ClipboardList,
  Package,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CaseDetail, ServiceCase } from "../src/domain/service-cases";
import type { ServiceDefinition } from "../src/domain/services";
import type { Dashboard } from "../src/domain/view";
import { api } from "./api";
import { serviceCaseApi } from "./service-case-api";
import {
  ServiceCaseDetail,
  serviceReference,
  serviceStatus,
} from "./service-case-detail";
import {
  pendingStorageKey,
  type ServicePerform,
  ServiceRequestForm,
} from "./service-request-form";

type Tab = "directory" | "requests" | "deliveries";
type Popup =
  | { type: "new"; definition: ServiceDefinition }
  | { type: "case"; detail: CaseDetail }
  | { type: "loading" };
interface CasePage {
  requests: ServiceCase[];
  total: number;
  offset: number;
  limit: number;
}

export function ServiceCentre({
  data,
  busy,
  perform,
  openAccount,
  initialSearch = "",
  initialRequest = "",
}: {
  data: Dashboard;
  busy: boolean;
  perform: ServicePerform;
  openAccount: () => void;
  initialSearch?: string;
  initialRequest?: string;
}) {
  const customer = data.role === "customer";
  const [tab, setTab] = useState<Tab>(
    initialRequest ? "requests" : customer ? "directory" : "requests",
  );
  const [catalog, setCatalog] = useState<readonly ServiceDefinition[]>([]);
  const [category, setCategory] = useState("All services");
  const [directoryQuery, setDirectoryQuery] = useState(initialSearch);
  const [query, setQuery] = useState(initialRequest);
  const [search, setSearch] = useState(initialRequest);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [listing, setListing] = useState<CasePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [popupError, setPopupError] = useState("");
  const [popup, setPopup] = useState<Popup | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (initialRequest) heading.current?.focus();
  }, [initialRequest]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void Effect.runPromise(
      Effect.all(
        {
          services: api<{ services: readonly ServiceDefinition[] }>(
            "/service-catalog",
          ),
          cases: api<CasePage>(
            `/service-cases?offset=${offset}&query=${encodeURIComponent(search)}&refresh=${revision}${tab === "deliveries" ? "&view=deliveries" : ""}`,
          ),
        },
        { concurrency: "unbounded" },
      ).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (!active) return;
            if (
              !Array.isArray(result.services.services) ||
              !Array.isArray(result.cases.requests) ||
              !Number.isSafeInteger(result.cases.total)
            ) {
              setError(
                "The service directory could not be read. Reload it before continuing.",
              );
              return;
            }
            setCatalog(result.services.services);
            setListing(result.cases);
          }),
        ),
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (active) setError(failure.message);
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (active) setLoading(false);
          }),
        ),
      ),
    );
    return () => {
      active = false;
    };
  }, [offset, search, tab, revision]);
  const changeTab = (next: Tab) => {
    setTab(next);
    setOffset(0);
    setQuery("");
    setSearch("");
  };
  const open = (next: Popup, element: HTMLElement) => {
    trigger.current = element;
    setPopupError("");
    setPopup(next);
  };
  const inspect = (id: string, element: HTMLElement) => {
    open({ type: "loading" }, element);
    perform(
      serviceCaseApi(`/service-cases?id=${encodeURIComponent(id)}`).pipe(
        Effect.tap((detail) =>
          Effect.sync(() => setPopup({ type: "case", detail })),
        ),
        Effect.tapError((failure) =>
          Effect.sync(() => setPopupError(failure.message)),
        ),
      ),
      "Request loaded.",
      false,
    );
  };
  const complete = (detail: CaseDetail) => {
    try {
      sessionStorage.removeItem(pendingStorageKey(data.bank.id));
    } catch {
      /* The retained key safely resolves to this same recorded case. */
    }
    setPopup({ type: "case", detail });
    setRevision((value) => value + 1);
  };
  const categories = [
    "All services",
    ...new Set(catalog.map((item) => item.category)),
  ];
  const filtered = catalog.filter(
    (item) =>
      (category === "All services" || item.category === category) &&
      `${item.title} ${item.description} ${item.group} ${item.category}`
        .toLowerCase()
        .includes(directoryQuery.trim().toLowerCase()),
  );
  const groups = [...new Set(filtered.map((item) => item.group))];
  return (
    <div className="service-centre">
      <div className="centre-heading">
        <div>
          <span className="eyebrow">
            {customer ? "HERE TO HELP" : "BRANCH SERVICE DESK"}
          </span>
          <h2 ref={heading} tabIndex={-1}>
            {customer ? "Customer service" : "Customer service queue"}
          </h2>
          <p>
            {customer
              ? "Manage everyday requests and follow their progress."
              : "Review this relationship’s requests, supporting details and processing history."}
          </p>
        </div>
      </div>
      <nav className="centre-entrypoints" aria-label="Service centre views">
        {(
          [
            {
              id: "requests" as const,
              icon: ClipboardList,
              title: "Check your service requests",
              label: "Track your requests",
            },
            {
              id: "deliveries" as const,
              icon: Package,
              title: "Check your deliverables",
              label: "Track your deliverables",
            },
            ...(customer
              ? [
                  {
                    id: "directory" as const,
                    icon: Plus,
                    title: "Raise a new request",
                    label: "Explore services",
                  },
                ]
              : []),
          ] as const
        ).map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={tab === item.id}
            disabled={busy}
            onClick={() => changeTab(item.id)}
          >
            <item.icon size={21} aria-hidden="true" />
            <strong>{item.title}</strong>
            <span>
              {item.label}
              <ArrowRight size={15} aria-hidden="true" />
            </span>
          </button>
        ))}
      </nav>
      {error && (
        <div className="centre-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy || loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            Reload services
          </button>
        </div>
      )}
      {loading && <p role="status">Loading service records…</p>}
      {!error && tab === "directory" && (
        <section
          className="panel centre-directory"
          aria-label="Service directory"
          aria-busy={loading}
        >
          <div className="centre-directory-header">
            <div>
              <h3>Raise a new request</h3>
              <p>Select a service to review the details required.</p>
            </div>
            <label className="centre-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search services</span>
              <input
                type="search"
                value={directoryQuery}
                maxLength={80}
                onChange={(event) => setDirectoryQuery(event.target.value)}
                placeholder="Search services"
                disabled={busy}
              />
            </label>
          </div>
          {!data.account && (
            <div className="centre-note">
              You can explore services now. Open your account before submitting
              a request.{" "}
              <button type="button" className="text-link" onClick={openAccount}>
                Open account application
              </button>
            </div>
          )}
          <div className="centre-directory-body">
            <nav aria-label="Service categories">
              {categories.map((item) => (
                <button
                  type="button"
                  key={item}
                  disabled={busy}
                  aria-pressed={category === item}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </nav>
            <div className="centre-groups">
              {groups.map((group) => (
                <section key={group}>
                  <h3>{group}</h3>
                  <ul>
                    {filtered
                      .filter((item) => item.group === group)
                      .map((item) => (
                        <li key={item.code}>
                          <button
                            type="button"
                            disabled={busy || !data.account || loading}
                            onClick={(event) =>
                              open(
                                { type: "new", definition: item },
                                event.currentTarget,
                              )
                            }
                          >
                            <span>
                              <strong>{item.title}</strong>
                              <small>{item.description}</small>
                            </span>
                            <ArrowRight size={17} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
              {!loading && !filtered.length && (
                <div className="empty-state">
                  <h3>No matching services</h3>
                  <p>Try another service name or category.</p>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      setDirectoryQuery("");
                      setCategory("All services");
                    }}
                  >
                    Clear service filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      {!error && tab !== "directory" && (
        <section className="panel centre-requests" aria-busy={loading}>
          <div className="centre-directory-header">
            <div>
              <h3>
                {tab === "deliveries" ? "Deliverables" : "Service requests"}
              </h3>
              <p>
                {tab === "deliveries"
                  ? "Delivery and collection progress for requested items. All dispatches are simulated."
                  : "Open a request to see its details, history and available actions."}
              </p>
            </div>
            <button
              type="button"
              className="secondary"
              disabled={busy || loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              Refresh list
            </button>
          </div>
          <form
            className="centre-list-search"
            onSubmit={(event) => {
              event.preventDefault();
              setOffset(0);
              setSearch(query);
            }}
          >
            <label>
              <span className="sr-only">
                Search request references or details
              </span>
              <input
                type="search"
                placeholder="Search reference or details"
                maxLength={80}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={busy || loading}
              />
            </label>
            <button
              type="submit"
              className="secondary"
              disabled={busy || loading}
            >
              Search requests
            </button>
          </form>
          {!loading && listing && (
            <>
              <ul className="centre-case-list">
                {listing.requests.map((item) => (
                  <li key={item.id}>
                    <div>
                      <code>{serviceReference(item.id)}</code>
                      <h3>
                        {catalog.find((service) => service.code === item.kind)
                          ?.title ?? item.kind.replaceAll("_", " ")}
                      </h3>
                      <span
                        className={`centre-status centre-status-${item.status}`}
                      >
                        {serviceStatus(item.status)}
                      </span>
                      {tab === "deliveries" && (
                        <p>{serviceStatus(item.delivery_status)}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      aria-label={`View request ${serviceReference(item.id)}`}
                      onClick={(event) => inspect(item.id, event.currentTarget)}
                    >
                      View request <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              {!listing.requests.length && (
                <div className="empty-state">
                  <h3>
                    {search
                      ? "No matching requests"
                      : tab === "deliveries"
                        ? "No deliverables yet"
                        : "No service requests yet"}
                  </h3>
                  <p>
                    {search
                      ? "Try another reference or request detail."
                      : "Your requests and their progress will appear here."}
                  </p>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      if (search) {
                        setSearch("");
                        setQuery("");
                        setOffset(0);
                      } else if (customer) changeTab("directory");
                      else setRevision((value) => value + 1);
                    }}
                  >
                    {search
                      ? "Clear request search"
                      : customer
                        ? "Explore services"
                        : "Refresh requests"}
                  </button>
                </div>
              )}
              <div className="centre-pagination">
                <span>
                  {listing.total
                    ? `${offset + 1}–${offset + listing.requests.length} of ${listing.total}`
                    : "0 requests"}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || offset === 0}
                  onClick={() => setOffset((value) => Math.max(0, value - 25))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={
                    busy || offset + listing.requests.length >= listing.total
                  }
                  onClick={() => setOffset((value) => value + 25)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </section>
      )}
      <Dialog.Root
        open={popup !== null}
        onOpenChange={(value) => {
          if (!value && !busy) setPopup(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="centre-overlay" />
          <Dialog.Content
            className="centre-dialog"
            aria-busy={busy}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (busy) event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (trigger.current?.isConnected) trigger.current.focus();
              else heading.current?.focus();
            }}
          >
            <div className="centre-dialog-heading">
              <Dialog.Title>
                {popup?.type === "new"
                  ? "Raise a service request"
                  : "Service request"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="centre-close"
                  aria-label="Close service request"
                  disabled={busy}
                >
                  <X size={21} />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Review service details and processing history.
            </Dialog.Description>
            {popupError && (
              <p className="centre-error" role="alert">
                {popupError}
              </p>
            )}
            {popup?.type === "loading" && !popupError && (
              <p role="status">Loading request history…</p>
            )}
            {popup?.type === "new" && (
              <ServiceRequestForm
                definition={popup.definition}
                catalog={catalog}
                bank={data.bank.id}
                busy={busy}
                perform={perform}
                complete={complete}
              />
            )}
            {popup?.type === "case" && (
              <ServiceCaseDetail
                key={popup.detail.request.id}
                initial={popup.detail}
                definition={catalog.find(
                  (item) => item.code === popup.detail.request.kind,
                )}
                busy={busy}
                perform={perform}
                changed={() => setRevision((value) => value + 1)}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
