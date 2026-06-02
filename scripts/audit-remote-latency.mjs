import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { auditRemoteLatency } from "./lib/remote-latency.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultManifestUrl = pathToFileURL(path.join(repoRoot, "dist/phase-a-real/manifest.json")).toString();
const manifestUrl = getArg("--manifest-url") ?? defaultManifestUrl;
const explicitPaths = splitArg(getArg("--paths") ?? "");
const tiersArg = getArg("--tiers");
const tiers = splitArg(tiersArg ?? (explicitPaths.length ? "core" : "core,match-context,player-context"));
const failOnWarning = process.argv.includes("--fail-on-warning");

const result = await auditRemoteLatency({
  manifestUrl,
  tiers,
  explicitPaths,
});

console.log(JSON.stringify(result.summary, null, 2));
if (result.warnings.length) {
  console.warn(result.warnings.join("\n"));
}
if (!result.ok || (failOnWarning && result.warnings.length)) {
  if (result.errors.length) console.error(result.errors.join("\n"));
  process.exit(1);
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function splitArg(value) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
