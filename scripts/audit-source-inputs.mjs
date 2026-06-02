import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditSourceInputs } from "./lib/source-inputs.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageArg = getArg("--package") ?? process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const sourceRootArg = getArg("--source-root");
const packageRoot = packageArg ? path.resolve(repoRoot, packageArg) : path.join(repoRoot, "dist/phase-a-demo");
const sourceRoot = sourceRootArg ? path.resolve(repoRoot, sourceRootArg) : repoRoot;

if (!packageRoot.startsWith(repoRoot)) {
  throw new Error(`Refusing to audit package outside repository root: ${packageRoot}`);
}
if (!sourceRoot.startsWith(repoRoot)) {
  throw new Error(`Refusing to audit source inputs outside repository root: ${sourceRoot}`);
}

const result = await auditSourceInputs({ packageRoot, sourceRoot });
console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exit(1);
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}
