import { expect, test } from "bun:test";
import {
  loanAdminHttpFailure,
  loanSetupReport,
} from "../../../src/operations/cli/loan-setup-report";
import type { LoanSetupState } from "../../../src/platform/lending/domain/origination/loan-setup";

const failed: LoanSetupState = {
  version: 1,
  events: [
    {
      step: { kind: "product" },
      key: "invented-key",
      status: "failed",
      resource_id: null,
      at: 1,
      message:
        "The parameter(s) isRatesEnabled, isFloatingInterestRateCalculationAllowed are not supported. Token private-example-value JDBC another-private-example",
    },
  ],
};

test("setup diagnostics identify public validation fields/checks without emitting saved prose or values", () => {
  const result = loanSetupReport(failed);
  expect(result).toMatchObject({
    version: 1,
    complete: false,
    pending: null,
    last_status: "failed",
    validation_fields: [
      "isFloatingInterestRateCalculationAllowed",
      "isRatesEnabled",
    ],
    validation_checks: ["unsupported-parameter"],
  });
  const output = JSON.stringify(result);
  expect(output).not.toContain("private-example-value");
  expect(output).not.toContain("another-private-example");
  expect(output).not.toContain("Token");
  expect(output).not.toContain("JDBC");
  expect(output).not.toContain(failed.events[0].message);
  expect(
    loanSetupReport({
      ...failed,
      events: [
        {
          ...failed.events[0],
          message:
            "minPrincipal must be greater than zero; repaymentStartDateType is required",
        },
      ],
    }),
  ).toMatchObject({
    validation_fields: ["minPrincipal", "repaymentStartDateType"],
    validation_checks: ["required-field", "invalid-value"],
  });
});

test("empty, confirmed and uncertain setup outcomes never emit validation detail or retry guidance", () => {
  expect(loanSetupReport({ version: 0, events: [] })).toMatchObject({
    last_status: null,
    validation_fields: [],
    validation_checks: [],
  });
  for (const status of ["executing", "uncertain", "confirmed"] as const) {
    const result = loanSetupReport({
      ...failed,
      events: [
        {
          ...failed.events[0],
          status,
          resource_id: status === "confirmed" ? 9 : null,
        },
      ],
    });
    expect(result).toMatchObject({
      last_status: status,
      validation_fields: [],
      validation_checks: [],
    });
    expect(JSON.stringify(result)).not.toContain("private-example-value");
  }
});

test("HTTP quote failures preserve status and public validation hints without exposing response values or uncertain details", () => {
  const body = {
    error:
      "loanType and submittedOnDate are required. Authorization: invented-private-value",
    uncertain: false,
  };
  const error = loanAdminHttpFailure(422, body);
  expect(error.message).toContain("HTTP 422");
  expect(error.message).toContain(
    '"validation_fields":["loanType","submittedOnDate"]',
  );
  expect(error.message).toContain("required-field");
  expect(error.message).not.toContain("invented-private-value");
  expect(error.message).not.toContain("Authorization");
  expect(error.message).not.toContain(body.error);
  const uncertain = loanAdminHttpFailure(503, { ...body, uncertain: true });
  expect(uncertain.message).toContain('"uncertain":true');
  expect(uncertain.message).toContain('"validation_fields":[]');
  expect(uncertain.message).not.toContain("loanType");
  for (const input of [
    null,
    undefined,
    "invented-private-value",
    { error: { secret: "invented-private-value" } },
  ]) {
    const result = loanAdminHttpFailure(503, input);
    expect(result.message).toContain('"validation_fields":[]');
    expect(result.message).not.toContain("invented-private-value");
  }
});
