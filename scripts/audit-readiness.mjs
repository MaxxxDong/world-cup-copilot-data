import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditDataReadiness } from "./lib/readiness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRootArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const packageRoot = packageRootArg
  ? path.resolve(repoRoot, packageRootArg)
  : path.join(repoRoot, "dist/phase-a-demo");
const strict = process.argv.includes("--strict");

if (!packageRoot.startsWith(repoRoot)) {
  throw new Error(`Refusing to audit outside repository root: ${packageRoot}`);
}

const result = auditDataReadiness({
  coverage: await readJson("data/metadata/coverage.json"),
  identityGaps: await readJson("data/metadata/identity-gaps.json"),
  sourceAudit: await readJson("data/metadata/source-audit.json"),
});

console.log(JSON.stringify(result, null, 2));
if (!result.ok || (strict && !result.completionReady)) {
  process.exit(1);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(packageRoot, relativePath), "utf8"));
}
