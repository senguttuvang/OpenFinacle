import { Schema } from "effect";
import { coreDate } from "./branch-day";
import { SavingsStatement } from "./savings-statement";

const cell = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '""';
  const text =
    typeof value === "string" &&
    (value.charCodeAt(0) <= 31 ||
      value.trimStart().charCodeAt(0) <= 31 ||
      /^[=+@-]/.test(value.trimStart()))
      ? `'${value}`
      : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};
export const statementCsv = (value: SavingsStatement): string | null => {
  if (!Schema.is(SavingsStatement)(value) || value.query.mode !== "export")
    return null;
  const header = [
    "Record kind",
    "Source",
    "Servicing branch",
    "Customer reference",
    "Native client ID",
    "Native account ID",
    "Account number",
    "Native client office ID",
    "Currency",
    "From native value date",
    "To native value date",
    "Read started UTC",
    "Read completed UTC",
    "Native matching total",
    "Returned rows",
    "Transaction ID",
    "Native value date",
    "Native transaction type",
    "Native entry type",
    "Native amount",
    "Native running balance",
    "Reversed",
  ];
  const context = [
    value.source,
    value.branchId,
    value.customerReference,
    value.account.clientId,
    value.account.id,
    value.account.accountNo,
    value.account.clientOfficeId,
    value.account.currency.code,
    value.query.from,
    value.query.to,
    new Date(value.startedAt).toISOString(),
    new Date(value.observedAt).toISOString(),
    value.total,
    value.rows.length,
  ];
  const lines: (string | number | null | undefined)[][] = [
    header,
    ["enquiry", ...context, null, null, null, null, null, null, null],
    ...value.rows.map((r) => [
      "transaction",
      ...context,
      r.id,
      coreDate(r.date),
      r.transactionType.value,
      r.entryType,
      r.amount,
      r.runningBalance,
      r.reversed === undefined || r.reversed === null
        ? null
        : String(r.reversed),
    ]),
  ];
  return lines.map((row) => row.map(cell).join(",")).join("\r\n");
};
