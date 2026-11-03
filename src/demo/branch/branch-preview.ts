import type { Dashboard } from "../../platform/banking-workspace/domain/view";
import { branchDayFixture } from "./branch-day-fixture";

type PreviewEnvironment = { ASSETS: Fetcher; LOCAL_BRANCH_PREVIEW: string };
const day = branchDayFixture();
const first = day.relationships[0];
const dashboard: Dashboard = {
  bank: {
    id: first.customer.bank_id,
    journey: "existing",
    created_at: "2026-11-03",
  },
  role: "officer",
  account: first.account,
  customer: {
    id: first.customer.id,
    display_name: first.customer.display_name,
    reference: first.customer.reference,
    account_suffix: first.customer.account_no.slice(-4),
  },
  recipient: {
    id: 2,
    accountNo: "REVIEW-ONLY",
    clientName: "Synthetic review recipient",
  },
  employer: null,
  application: null,
  beneficiaries: [],
  commands: [],
  audit: [],
  documents: [],
  requests: [],
  businessDate: day.businessDate,
  core: {
    engine: "STATIC REVIEW FIXTURE",
    version: "not connected",
    connected: false,
    cached: true,
    syncedAt: day.observedAt,
  },
};
export default {
  async fetch(request: Request, env: PreviewEnvironment) {
    const url = new URL(request.url);
    if (
      env.LOCAL_BRANCH_PREVIEW !== "true" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      return new Response("Local review fixture only", { status: 403 });
    if (url.pathname === "/")
      return Response.redirect(`${url.origin}/overview`, 302);
    if (request.method !== "GET")
      return Response.json(
        {
          error:
            "Read-only static review fixture. No instructions, approvals or assignments are saved.",
          uncertain: false,
        },
        { status: 501 },
      );
    if (url.pathname === "/api/telemetry-config") return Response.json({});
    if (url.pathname === "/api/dashboard") return Response.json(dashboard);
    if (url.pathname === "/api/branch") return Response.json(day);
    if (url.pathname === "/api/branch/accounting")
      return Response.json({
        observedAt: day.observedAt,
        chart: null,
        journals: null,
        product: null,
        errors: [
          "STATIC REVIEW FIXTURE. No Fineract journal, GL or reconciliation evidence is connected.",
        ],
      });
    if (url.pathname.startsWith("/api/"))
      return Response.json(
        { error: "Outside this read-only branch review fixture" },
        { status: 404 },
      );
    return env.ASSETS.fetch(request);
  },
};
