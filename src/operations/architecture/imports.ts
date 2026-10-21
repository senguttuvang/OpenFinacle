import { dirname, posix } from "node:path";
import ts from "typescript";
import contract from "../../../.agents/architecture.json";
import type { SourceFile } from "./inventory";

export function moduleSpecifiers(file: SourceFile) {
  const ast = ts.createSourceFile(
    file.path,
    file.content,
    ts.ScriptTarget.Latest,
    true,
    file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specs: string[] = [];
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specs.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      specs.push(node.arguments[0].text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      specs.push(node.argument.literal.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return specs;
}

export function capabilityPublicViolations(files: SourceFile[]) {
  const paths = new Set(files.map((f) => f.path));
  const surfaces = contract.publicSurfaces as Record<string, string[]>;
  const violations: string[] = [];
  for (const file of files.filter((f) => /\.[cm]?[jt]sx?$/.test(f.path))) {
    const fromCapability = file.path.startsWith("src/platform/")
      ? file.path.split("/")[2]
      : undefined;
    for (const spec of moduleSpecifiers(file)) {
      if (!spec.startsWith(".")) continue;
      const base = posix.normalize(posix.join(dirname(file.path), spec));
      const target = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}/index.ts`,
      ].find((p) => paths.has(p));
      if (!target?.startsWith("src/platform/")) continue;
      const capability = target.split("/")[2]!;
      if (
        fromCapability === capability ||
        file.path.startsWith("tests/") ||
        file.path.startsWith("e2e/")
      )
        continue;
      if (!surfaces[capability]?.includes(target))
        violations.push(
          `${file.path} -> ${target}: private capability implementation; use a declared public surface`,
        );
    }
  }
  return violations.sort();
}
