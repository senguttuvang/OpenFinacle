import type { CustomerJourney, Role } from "../src/domain/banking";
import {
  type RetailMenuItem,
  retailMenu,
} from "../src/domain/retail-navigation";
import { navigationFor, type View, viewLabels } from "./navigation";

export const viewPaths: Record<View, string> = {
  overview: "/overview",
  accounts: "/accounts",
  profile: "/profile",
  application: "/account-opening",
  transfer: "/payments/transfer",
  statements: "/statements",
  services: "/customer-service",
  cards: "/cards",
  deposits: "/deposits",
  loans: "/loans",
  planning: "/wealth-planning",
  cash: "/branch/cash",
  approvals: "/branch/approvals",
  operations: "/branch/operations",
  audit: "/branch/activity",
};
const leafPaths: Record<string, string> = {
  "funds-transfer": "/payments/transfer",
  "fixed-deposits": "/deposits/fixed",
  "recurring-deposits": "/deposits/recurring",
};
export const retailPath = (item: RetailMenuItem): string => {
  const family = retailMenu.find((group) =>
    group.items.some((leaf) => leaf.id === item.id),
  );
  if (!family) throw new Error(`Unknown banking menu item: ${item.id}`);
  return leafPaths[item.id] ?? `/${family.id}/${item.id}`;
};
export const planningSections = {
  Overview: "overview",
  "Cash flow": "cash-flow",
  "Goals & retirement": "goals-retirement",
  "Scenario lab": "scenarios",
  Insights: "insights",
} as const;
export type PlanningTab = keyof typeof planningSections;
export const servicePaths = {
  directory: "/customer-service/directory",
  requests: "/customer-service/requests",
  deliveries: "/customer-service/deliveries",
} as const;
export interface PortalRoute {
  path: string;
  title: string;
  view?: View;
  planningTab?: PlanningTab;
  cardTab?: "controls" | "replacements";
  serviceTab?: keyof typeof servicePaths;
  serviceSearch?: string;
  item?: RetailMenuItem;
  family?: (typeof retailMenu)[number];
}
/** Finite public screen inventory. Paths contain no customer IDs, commands or credentials. */
export const portalRoutes: readonly PortalRoute[] = [
  { path: "/demo", title: "Banking demo", view: "overview" },
  ...Object.entries(viewPaths).map(([view, path]) => ({
    path,
    title: viewLabels[view as View],
    view: view as View,
  })),
  ...Object.entries(planningSections).map(([title, slug]) => ({
    path: `/wealth-planning/${slug}`,
    title,
    view: "planning" as const,
    planningTab: title as PlanningTab,
  })),
  ...Object.entries(servicePaths).map(([tab, path]) => ({
    path,
    title: `Service ${tab}`,
    view: "services" as const,
    serviceTab: tab as keyof typeof servicePaths,
  })),
  {
    path: "/cards/controls",
    title: "Card controls",
    view: "cards",
    cardTab: "controls",
  },
  {
    path: "/cards/replacements",
    title: "Replacement requests",
    view: "cards",
    cardTab: "replacements",
  },
  ...[
    { slug: "debit-card", search: "replacement debit card" },
    { slug: "chequebook", search: "chequebook" },
    { slug: "address", search: "address" },
  ].map(({ slug, search }) => ({
    path: `/customer-service/${slug}`,
    title: `Service request: ${search}`,
    view: "services" as const,
    serviceTab: "directory" as const,
    serviceSearch: search,
  })),
  ...retailMenu.flatMap((family) =>
    family.items.map((item) => ({
      path: retailPath(item),
      title: item.label,
      item,
      ...(item.destination.kind === "workspace"
        ? { view: item.destination.view }
        : {}),
    })),
  ),
  ...retailMenu
    .filter((family) => !Object.values(viewPaths).includes(`/${family.id}`))
    .map((family) => ({ path: `/${family.id}`, title: family.label, family })),
];
// The transfer leaf and workspace deliberately share one destination; prefer leaf metadata.
export const exportedPortalPaths = [
  ...new Set(portalRoutes.map((route) => route.path)),
];
export function resolvePortalRoute(path: string): PortalRoute | undefined {
  const normalized = path.replace(/\/$/, "") || "/";
  return portalRoutes.findLast((route) => route.path === normalized);
}
export function routeAllowed(
  route: PortalRoute,
  role: Role,
  journey: CustomerJourney,
): boolean {
  if (route.family || route.item?.destination.kind === "unavailable")
    return role === "customer" && journey === "existing";
  return Boolean(
    route.view &&
      navigationFor(role, journey).some((item) => item.view === route.view),
  );
}
