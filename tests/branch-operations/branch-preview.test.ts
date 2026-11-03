import { expect, test } from "bun:test";
import preview from "../../src/demo/branch/branch-preview";

const env = {
  LOCAL_BRANCH_PREVIEW: "true",
  ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher,
};
test("review preview is local-only, visibly invented and refuses all financial/workflow writes", async () => {
  expect(
    (await preview.fetch(new Request("https://example.test/api/branch"), env))
      .status,
  ).toBe(403);
  expect(
    (
      await preview.fetch(new Request("http://localhost/api/branch"), {
        ...env,
        LOCAL_BRANCH_PREVIEW: "false",
      })
    ).status,
  ).toBe(403);
  const read = await preview.fetch(
    new Request("http://localhost/api/branch"),
    env,
  );
  expect(await read.json()).toMatchObject({ reviewFixture: true });
  for (const route of ["instruction", "decision", "assign"]) {
    const response = await preview.fetch(
      new Request(`http://localhost/api/branch/${route}`, { method: "POST" }),
      env,
    );
    expect(response.status).toBe(501);
  }
});
