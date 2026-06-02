import path from "node:path";
import { fileURLToPath } from "node:url";

import { validatePackage } from "./lib/phase-a.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = process.argv[2] ? path.resolve(repoRoot, process.argv[2]) : path.join(repoRoot, "dist/phase-a-demo");

if (!packageRoot.startsWith(repoRoot)) {
  throw new Error(`Refusing to validate outside repository root: ${packageRoot}`);
}

const result = await validatePackage(packageRoot);
if (!result.ok) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}

console.log(`Valid data package: ${packageRoot}`);
