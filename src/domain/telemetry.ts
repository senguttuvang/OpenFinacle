// Only static route templates and diagnostic metadata may cross telemetry boundaries.
const routes = new Set([
  "/api/health",
  "/api/ready",
  "/api/telemetry-config",
  "/api/session",
  "/api/session/end",
  "/api/session/role",
  "/api/dashboard",
  "/api/application",
  "/api/application/review",
  "/api/beneficiaries",
  "/api/beneficiaries/confirm",
  "/api/commands",
  "/api/commands/approve",
  "/api/commands/reject",
  "/api/documents",
  "/api/statement",
  "/api/service-catalog",
  "/api/cards",
  "/api/profile",
  "/api/cards/action",
  "/api/service-cases",
  "/api/service-cases/action",
  "/api/requests",
  "/api/requests/resolve",
  "/api/admin/telemetry-probe",
]);
export const safeRoute = (path: string) =>
  routes.has(path)
    ? path
    : path.startsWith("/api/documents/")
      ? "/api/documents/:id"
      : path.startsWith("/api/admin/")
        ? "/api/admin/:operation"
        : "/unknown";
export const safeCoreRoute = (path: string) => {
  const base = path.split("?")[0];
  const parts = base.split("/");
  const resources = new Set([
    "offices",
    "clients",
    "savingsaccounts",
    "savingsproducts",
    "accounttransfers",
    "transactions",
    "users",
  ]);
  return parts.map((p) => (resources.has(p) ? p : ":id")).join("/");
};
export interface Diagnostic {
  requestId: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  uncertain?: boolean;
}
