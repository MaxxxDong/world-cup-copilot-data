import path from "node:path";
import { fileURLToPath } from "node:url";

import { refreshPackageMetadata, validatePackage } from "./lib/phase-a.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageArg = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? ".";
const packageRoot = path.resolve(repoRoot, packageArg);

if (!packageRoot.startsWith(repoRoot)) {
  throw new Error(`Refusing to refresh package outside repository root: ${packageRoot}`);
}

const result = await refreshPackageMetadata(packageRoot);
const validation = await validatePackage(packageRoot);
if (!validation.ok) {
  throw new Error(`Refreshed package failed validation:\n${validation.errors.join("\n")}`);
}

console.log(JSON.stringify({ ok: true, packageRoot: path.relative(repoRoot, packageRoot) || ".", ...result }, null, 2));
