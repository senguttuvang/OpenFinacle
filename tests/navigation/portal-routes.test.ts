import { describe, expect, test } from "bun:test";

const requiredRoute = (path: string) => {
  const route = resolvePortalRoute(path);
  if (!route) throw Error(`Missing ${path}`);
  return route;
};

import { retailMenu } from "../../src/platform/navigation/domain/retail-navigation";
import {
  exportedPortalPaths,
  planningSections,
  portalRoutes,
  resolvePortalRoute,
  retailPath,
  routeAllowed,
  viewPaths,
} from "../../src/platform/navigation/ui/portal-routes";

describe("public screen routing contract", () => {
  test("every retail submenu has a unique readable bookmark, including unavailable services", () => {
    const leaves = retailMenu.flatMap((family) => family.items);
    const paths = leaves.map(retailPath);
    expect(new Set(paths).size).toBe(leaves.length);
    for (const [index, path] of paths.entries()) {
      expect(path).toMatch(/^\/[a-z-]+\/[a-z-]+$/);
      expect(resolvePortalRoute(path)?.item?.id).toBe(leaves[index]?.id);
      expect(exportedPortalPaths).toContain(path);
    }
  });
  test("every family and workspace resolves without taking over public routes", () => {
    for (const path of Object.values(viewPaths))
      expect(resolvePortalRoute(path)?.view).toBeDefined();
    for (const family of retailMenu)
      expect(resolvePortalRoute(`/${family.id}`)).toBeDefined();
    for (const path of [
      "/",
      "/planning",
      "/open-account",
      "/discover",
      "/assessment",
      "/api/commands",
    ])
      expect(resolvePortalRoute(path)).toBeUndefined();
  });
  test("customer URLs cannot grant branch authority and approver cannot enter planning", () => {
    for (const view of ["cash", "approvals", "operations", "audit"] as const) {
      const route = requiredRoute(viewPaths[view]);
      expect(routeAllowed(route, "customer", "existing")).toBe(false);
      expect(routeAllowed(route, "officer", "existing")).toBe(true);
    }
    expect(
      routeAllowed(requiredRoute("/wealth-planning"), "approver", "existing"),
    ).toBe(false);
    expect(
      routeAllowed(requiredRoute("/wealth-planning"), "officer", "existing"),
    ).toBe(true);
    expect(
      routeAllowed(requiredRoute("/payments/pay-bills"), "officer", "existing"),
    ).toBe(false);
  });
  test("unknown and encoded paths never turn into arbitrary views", () => {
    for (const path of [
      "/made-up",
      "/branch/cash/extra",
      "/%61ccounts",
      "/api",
      "//accounts",
    ])
      expect(resolvePortalRoute(path)).toBeUndefined();
    expect(resolvePortalRoute("/statements/")?.view).toBe("statements");
  });
  test("product and planning sections have distinct stable destinations", () => {
    expect(
      resolvePortalRoute("/deposits/recurring")?.item?.destination,
    ).toEqual({ kind: "workspace", view: "deposits", section: "recurring" });
    expect(resolvePortalRoute("/cards/replacements")?.cardTab).toBe(
      "replacements",
    );
    for (const [tab, slug] of Object.entries(planningSections))
      expect(
        String(resolvePortalRoute(`/wealth-planning/${slug}`)?.planningTab),
      ).toBe(tab);
    expect(resolvePortalRoute("/customer-service/requests")?.serviceTab).toBe(
      "requests",
    );
  });
  test("only the explicit transfer workspace and its leaf share a path", () => {
    const duplicates = portalRoutes.filter(
      (r, i) => portalRoutes.findIndex((other) => other.path === r.path) !== i,
    );
    expect(duplicates.map((r) => r.path)).toEqual(["/payments/transfer"]);
  });
});
