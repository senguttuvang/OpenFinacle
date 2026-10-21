import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import contract from "../../../.agents/architecture.json";

export interface SourceFile {
  path: string;
  content: string;
}

export async function sourceInventory(root: string): Promise<SourceFile[]> {
  async function collect(directory: string): Promise<SourceFile[]> {
    const entries = await readdir(join(root, directory), {
      withFileTypes: true,
    });
    const result: SourceFile[] = [];
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.isSymbolicLink())
        throw new Error(`Source symlink requires ownership: ${path}`);
      if (entry.isDirectory()) result.push(...(await collect(path)));
      else if (contract.authoredExtensions.includes(extname(path)))
        result.push({
          path,
          content: await readFile(join(root, path), "utf8"),
        });
    }
    return result;
  }
  return (await Promise.all(contract.sourceRoots.map(collect))).flat();
}

export async function rootInventory(root: string) {
  return (await readdir(root, { withFileTypes: true })).map((entry) => ({
    name: entry.name,
    directory: entry.isDirectory(),
  }));
}
