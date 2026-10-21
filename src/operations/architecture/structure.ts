import { basename, dirname, extname } from "node:path";
import contract from "../../../.agents/architecture.json";
import type { SourceFile } from "./inventory";

export function rootViolations(
  entries: { name: string; directory: boolean }[],
) {
  return entries.flatMap(({ name, directory }) => {
    const allowed = directory
      ? contract.rootDirectories
      : [...contract.rootFiles, ...contract.localFiles];
    return allowed.includes(name)
      ? []
      : [
          `${name}: unowned root entry; move it to its purpose-specific owner or declare required tool ownership`,
        ];
  });
}

export function structureViolations(files: SourceFile[]) {
  const violations: string[] = [];
  const counts = new Map<string, number>();
  for (const { path, content } of files) {
    const directory = dirname(path);
    counts.set(directory, (counts.get(directory) ?? 0) + 1);
    const parts = path.split("/");
    const lines = content.split("\n").length - Number(content.endsWith("\n"));
    if (lines > contract.maxFileLines)
      violations.push(
        `${path}: ${lines} lines exceed ${contract.maxFileLines}; extract a cohesive responsibility`,
      );
    if (parts[0] === "src" && !contract.sourceAreas.includes(parts[1]!))
      violations.push(`${path}: unknown source area`);
    if (
      parts[1] === "platform" &&
      !contract.platformCapabilities.includes(parts[2]!)
    )
      violations.push(`${path}: unknown banking capability`);
    if (parts[1] === "site" && !contract.siteCapabilities.includes(parts[2]!))
      violations.push(`${path}: unknown product-site capability`);
    for (const part of parts.slice(0, -1))
      if (
        contract.forbiddenDirectoryNames.includes(part) ||
        /^(?:phase|session|part)-?\d+$/i.test(part)
      )
        violations.push(`${path}: directory '${part}' hides business purpose`);
    if (parts[0] === "app") {
      if (!contract.routeFiles.includes(basename(path)))
        violations.push(`${path}: app owns framework route shells only`);
      if (lines > contract.maxRouteLines)
        violations.push(
          `${path}: route shell exceeds ${contract.maxRouteLines} lines`,
        );
    } else if (!/^[a-z0-9]+(?:[-.][a-z0-9]+)*\.[a-z]+$/.test(basename(path)))
      violations.push(
        `${path}: use a descriptive lowercase kebab-case filename`,
      );
    if (
      parts[0] === "src" &&
      parts.length === 2 &&
      contract.authoredExtensions.includes(extname(path))
    )
      violations.push(`${path}: implementation needs a capability owner`);
  }
  for (const [directory, count] of counts)
    if (count > contract.maxDirectFiles)
      violations.push(
        `${directory}: ${count} direct files exceed ${contract.maxDirectFiles}; split by responsibility`,
      );
  return violations.sort();
}
