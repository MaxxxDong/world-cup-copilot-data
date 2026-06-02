import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditDataStageCompletion } from "./lib/completion-audit.mjs";
import { auditPackageBudget } from "./lib/package-budget.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageArg = getArg("--package") ?? process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const packageRoot = packageArg ? path.resolve(repoRoot, packageArg) : path.join(repoRoot, "dist/phase-a-demo");
const strict = process.argv.includes("--strict");

if (!packageRoot.startsWith(repoRoot)) {
  throw new Error(`Refusing to audit outside repository root: ${packageRoot}`);
}

const manifest = await readExpandedManifest(packageRoot);
const packageBudget = auditPackageBudget(manifest);
const result = auditDataStageCompletion({
  coverage: await readJson("data/metadata/coverage.json"),
  identityGaps: await readJson("data/metadata/identity-gaps.json"),
  layerIndex: await readJson("data/metadata/layer-index.json"),
  sourceAudit: await readJson("data/metadata/source-audit.json"),
  packageBudget,
  manifest,
});

console.log(JSON.stringify(result, null, 2));
if (!result.ok || (strict && !result.completionReady)) {
  process.exit(1);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(packageRoot, relativePath), "utf8"));
}

async function readExpandedManifest(rootDir) {
  const manifestText = await readFile(path.join(rootDir, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  const indexedFiles = [];
  for (const indexFile of manifest.fileIndexes ?? []) {
    const indexContent = JSON.parse(await readFile(path.join(rootDir, indexFile.path), "utf8"));
    indexedFiles.push(...expandIndexedFiles(indexContent));
  }
  return {
    ...manifest,
    rootManifestBytes: Buffer.byteLength(manifestText, "utf8"),
    files: [...(manifest.files ?? []), ...indexedFiles],
  };
}

function expandIndexedFiles(indexPayload) {
  const defaults = indexPayload.fileDefaults ?? {};
  return (indexPayload.files ?? []).map((file) => ({
    ...defaults,
    ...file,
  }));
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}
