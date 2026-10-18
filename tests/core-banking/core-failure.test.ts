import { expect, test } from "bun:test";
import { coreHttpFailure } from "../../src/platform/core-banking/infrastructure/core-failure";

test("core write conflicts are ambiguous while reads and definitive validation keep their established semantics", () => {
  for (const method of ["POST", "PUT", "DELETE"])
    expect(
      coreHttpFailure(method, 409, "Command still processing"),
    ).toMatchObject({
      status: 422,
      uncertain: true,
      message: "Command still processing",
    });
  expect(coreHttpFailure("GET", 409, "Read conflict")).toMatchObject({
    status: 422,
    uncertain: false,
  });
  expect(coreHttpFailure("POST", 503, "Core unavailable")).toMatchObject({
    status: 503,
    uncertain: true,
  });
  expect(coreHttpFailure("GET", 503, "Core unavailable")).toMatchObject({
    status: 503,
    uncertain: false,
  });
  for (const status of [400, 401, 403, 404, 422])
    expect(
      coreHttpFailure("POST", status, "Declined before completion"),
    ).toMatchObject({ status: 422, uncertain: false });
});
