import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditPackageBudget } from "./lib/package-budget.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = process.argv[2] ? path.resolve(repoRoot, process.argv[2]) : path.join(repoRoot, "dist/phase-a-demo");

if (!packageRoot.startsWith(repoRoot)) {
  throw new Error(`Refusing to audit outside repository root: ${packageRoot}`);
}

const manifest = await readExpandedManifest(packageRoot);
const result = auditPackageBudget(manifest);

console.log(JSON.stringify(result.summary, null, 2));
if (result.warnings.length) {
  console.warn(result.warnings.join("\n"));
}
if (!result.ok) {
  console.error(result.errors.join("\n"));
  process.exit(1);
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
