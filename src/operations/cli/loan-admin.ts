import { lstat } from "node:fs/promises";
import { Effect, Schema } from "effect";

export const loanAdminOrigin = (value: string) =>
  Effect.try({
    try: () => {
      const url = new URL(value);
      const local = url.hostname === "localhost" && url.protocol === "http:";
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        (!local && url.origin !== "https://openfinacle.plts.in")
      )
        throw new Error("Invalid target");
      return url.origin;
    },
    catch: () =>
      new Error(
        "Use the exact OpenFinacle HTTPS origin or an HTTP localhost origin; credentials will not be sent elsewhere.",
      ),
  });
const git = (args: string[]) =>
  Effect.tryPromise({
    try: async () => {
      const child = Bun.spawn(["git", ...args], {
        stdout: "pipe",
        stderr: "ignore",
        stdin: "ignore",
      });
      const output = await new Response(child.stdout).text();
      if ((await child.exited) !== 0) throw new Error("Git check failed");
      return output.trim();
    },
    catch: () =>
      new Error(
        "Could not verify the local OpenFinacle source. Run from its clean checked checkout.",
      ),
  });
export const loanAdminRevision = () =>
  Effect.gen(function* () {
    const remote = yield* git(["remote", "get-url", "origin"]);
    if (
      ![
        "https://github.com/senguttuvang/OpenFinacle.git",
        "git@github.com:senguttuvang/OpenFinacle.git",
      ].includes(remote)
    )
      return yield* Effect.fail(
        new Error(
          "Loan administration requires the verified OpenFinacle checkout.",
        ),
      );
    if (
      (yield* git(["status", "--porcelain", "--untracked-files=normal"])) !== ""
    )
      return yield* Effect.fail(
        new Error(
          "Commit, review and verify this source before loan administration; the checkout must be clean.",
        ),
      );
    return yield* git(["rev-parse", "HEAD"]);
  });
export const loanAdminToken = (path: string) =>
  Effect.gen(function* () {
    const metadata = yield* Effect.tryPromise({
      try: () => lstat(path),
      catch: () =>
        new Error(
          "Could not inspect the protected administrative secrets file.",
        ),
    });
    if (
      !metadata.isFile() ||
      (metadata.mode & 0o077) !== 0 ||
      metadata.uid !== process.getuid?.()
    )
      return yield* Effect.fail(
        new Error(
          "Use an owned regular administrative secrets file with no group/other access.",
        ),
      );
    const raw = yield* Effect.tryPromise({
      try: () => Bun.file(path).text(),
      catch: () =>
        new Error("Could not read the protected administrative secrets file."),
    });
    const lines = raw
      .split("\n")
      .filter((line) => line.startsWith("ADMIN_TOKEN="));
    if (lines.length !== 1)
      return yield* Effect.fail(
        new Error(
          "The protected file must contain exactly one ADMIN_TOKEN entry.",
        ),
      );
    return yield* Schema.decodeUnknown(Schema.parseJson(Schema.NonEmptyString))(
      lines[0].slice("ADMIN_TOKEN=".length),
    ).pipe(
      Effect.mapError(
        () =>
          new Error(
            "The protected administrative token is invalid; its value is suppressed.",
          ),
      ),
    );
  });
