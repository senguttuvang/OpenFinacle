import type { Dashboard } from "../../src/domain/view";

export const savedWorkspace = (): Dashboard => ({
  bank: {
    id: "synthetic-workspace",
    created_at: "2026-10-17",
    journey: "existing",
  },
  role: "customer",
  account: {
    id: 1,
    accountNo: "DEMO-001",
    clientId: 1,
    clientName: "Mira Krishnan",
    status: { id: 300, value: "Active", active: true },
    summary: { accountBalance: 120000, availableBalance: 120000 },
    transactions: [],
  },
  recipient: {
    id: 2,
    accountNo: "DEMO-002",
    clientName: "Arjun Raman",
    summary: { accountBalance: 5000 },
  },
  employer: null,
  application: null,
  beneficiaries: [],
  commands: [],
  audit: [],
  documents: [],
  requests: [],
  core: {
    engine: "Fineract",
    version: "1.15.0",
    connected: false,
    cached: true,
    syncedAt: 1792195200000,
  },
  businessDate: "17 October 2026",
});
