import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditFifaSquadsInput } from "./lib/fifa-squads-audit.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputArg = getArg("--input") ?? "input/official/fifa-squads.2026-final.json";
const teamRegistryArg = getArg("--team-registry") ?? "input/team-registry.seed.json";
const expectTeamCountArg = getArg("--expect-team-count");
const requireFinal = process.argv.includes("--require-final");
const allowMissing = process.argv.includes("--allow-missing");
const inputPath = path.resolve(repoRoot, inputArg);
const teamRegistryPath = path.resolve(repoRoot, teamRegistryArg);

assertInsideRepo(inputPath, "input");
assertInsideRepo(teamRegistryPath, "team registry");

let result;
try {
  const fifaSquadsJson = JSON.parse(await readFile(inputPath, "utf8"));
  const teamRegistry = JSON.parse(await readFile(teamRegistryPath, "utf8"));
  result = auditFifaSquadsInput({
    fifaSquadsJson,
    teamRegistry,
    sourcePath: publicPath(inputPath),
    expectTeamCount: expectTeamCountArg === undefined ? undefined : Number(expectTeamCountArg),
    requireFinal,
  });
} catch (error) {
  if (allowMissing && error.code === "ENOENT") {
    result = {
      ok: true,
      errors: [],
      warnings: [`${publicPath(inputPath)} is not present`],
      summary: {
        teamCount: 0,
        playerCount: 0,
        finalTeamCount: 0,
        provisionalTeamCount: 0,
        duplicateTeamIds: [],
        lowConfidenceTeamIds: [],
        missingSourceUrlTeamIds: [],
        emptyRosterTeamIds: [],
      },
    };
  } else {
    result = {
      ok: false,
      errors: [`fifa squads input cannot be read: ${error.message}`],
      warnings: [],
      summary: {
        teamCount: 0,
        playerCount: 0,
        finalTeamCount: 0,
        provisionalTeamCount: 0,
        duplicateTeamIds: [],
        lowConfidenceTeamIds: [],
        missingSourceUrlTeamIds: [],
        emptyRosterTeamIds: [],
      },
    };
  }
}

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exit(1);
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function assertInsideRepo(resolvedPath, label) {
  if (!resolvedPath.startsWith(repoRoot)) {
    throw new Error(`Refusing to audit ${label} outside repository root: ${resolvedPath}`);
  }
}

function publicPath(resolvedPath) {
  return path.relative(repoRoot, resolvedPath).replace(/\\/g, "/");
}
