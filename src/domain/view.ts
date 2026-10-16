import type {
  Account,
  Application,
  Audit,
  BankingCommand,
  Beneficiary,
  CustomerJourney,
  DocumentRecord,
  Role,
  ServiceRequest,
} from "./banking";
export interface Dashboard {
  bank: { id: string; created_at: string; journey: CustomerJourney };
  role: Role;
  account: Account | null;
  recipient: {
    id: number;
    accountNo: string;
    clientName: string;
    summary?: Account["summary"];
  };
  employer: Account | null;
  application: Application | null;
  beneficiaries: Beneficiary[];
  commands: BankingCommand[];
  audit: Audit[];
  documents: Omit<DocumentRecord, "bank_id" | "object_key">[];
  requests: ServiceRequest[];
  core: { engine: string; version: string; connected: boolean };
  businessDate: string;
}
