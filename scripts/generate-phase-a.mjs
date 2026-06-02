import { createHash } from "node:crypto";
import { rm, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPhaseAData, validatePackage, writePackage } from "./lib/phase-a.mjs";
import { buildSnapshotFromRawSources } from "./lib/importers.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(getArg("--out") ?? path.join(repoRoot, "dist/phase-a-demo"));
const inputPath = getArg("--input");
const openfootballPath = getArg("--openfootball-json");
const internationalResultsPath = getArg("--international-results-csv");
const formerNamesPath = getArg("--former-names-csv");
const shootoutsPath = getArg("--shootouts-csv");
const goalscorersPath = getArg("--goalscorers-csv");
const reepTeamsPath = getArg("--reep-teams-csv");
const reepPeoplePath = getArg("--reep-people-csv");
const wikidataTeamsPath = getArg("--wikidata-teams-csv");
const fifaSquadsPath = getArg("--fifa-squads-json");
const simulateSquads = process.argv.includes("--simulate-squads");
const teamRegistryPath = getArg("--team-registry");
const venueRegistryPath = getArg("--venue-registry");
const providedDataVersion = getArg("--data-version");
const generatedAt = getArg("--generated-at") ?? new Date().toISOString();
const gitCommit = getArg("--git-commit") ?? "local";
const dataVersion = providedDataVersion ?? defaultDataVersion();
const inputProvenance = [];

if (!outDir.startsWith(repoRoot)) {
  throw new Error(`Refusing to write outside repository root: ${outDir}`);
}

const snapshot = await readSnapshot();
const files = buildPhaseAData({ snapshot, dataVersion, generatedAt, gitCommit, inputProvenance });

for (const generatedPath of ["data", "checksums", "indexes", "manifest.json"]) {
  await rm(path.join(outDir, generatedPath), { recursive: true, force: true });
}

await writePackage(outDir, files);
const validation = await validatePackage(outDir);
if (!validation.ok) {
  throw new Error(`Generated package failed validation:\n${validation.errors.join("\n")}`);
}

console.log(`Generated ${files.size} files into ${outDir}`);
console.log(`dataVersion=${dataVersion}`);

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function defaultDataVersion() {
  return openfootballPath && internationalResultsPath
    ? "2026.05.26+phase-a-raw"
    : "2026.05.26+phase-a-seed";
}

async function readSnapshot() {
  if (openfootballPath && internationalResultsPath) {
    return buildSnapshotFromRawSources({
      openfootballJson: await readJsonInput(openfootballPath, {
        inputRole: "schedule",
        sourceId: "openfootball-worldcup-json",
        sourcePath: "worldcup.json",
      }),
      internationalResultsCsv: await readTextInput(internationalResultsPath, {
        inputRole: "history-results",
        sourceId: "martj42-international-results",
        sourcePath: "results.csv",
      }),
      formerNamesCsv: formerNamesPath
        ? await readTextInput(formerNamesPath, {
            inputRole: "former-names",
            sourceId: "martj42-international-results",
            sourcePath: "former_names.csv",
          })
        : undefined,
      shootoutsCsv: shootoutsPath
        ? await readTextInput(shootoutsPath, {
            inputRole: "shootouts",
            sourceId: "martj42-international-results",
            sourcePath: "shootouts.csv",
          })
        : undefined,
      goalscorersCsv: goalscorersPath
        ? await readTextInput(goalscorersPath, {
            inputRole: "goalscorers",
            sourceId: "martj42-international-results",
            sourcePath: "goalscorers.csv",
          })
        : undefined,
      reepTeamsCsv: reepTeamsPath
        ? await readTextInput(reepTeamsPath, {
            inputRole: "team-identities",
            sourceId: "withqwerty-reep",
            sourcePath: "data/teams.csv",
          })
        : undefined,
      reepPeopleCsv: reepPeoplePath
        ? await readTextInput(reepPeoplePath, {
            inputRole: "player-identities",
            sourceId: "withqwerty-reep",
            sourcePath: "data/people.csv",
          })
        : undefined,
      wikidataTeamsCsv: wikidataTeamsPath
        ? await readTextInput(wikidataTeamsPath, {
            inputRole: "national-team-identities",
            sourceId: "wikidata-national-football-teams",
            sourcePath: "wikidata-national-football-teams.csv",
          })
        : undefined,
      fifaSquadsJson: fifaSquadsPath
        ? await readJsonInput(fifaSquadsPath, {
            inputRole: "official-rosters",
            sourceId: "fifa-squad-announcements-2026",
            sourcePath: "fifa-squads.json",
          })
        : undefined,
      simulateRosters: simulateSquads,
      teamRegistry: teamRegistryPath
        ? await readJsonInput(teamRegistryPath, {
            inputRole: "team-registry",
            sourceId: "world-cup-copilot-team-registry",
            sourcePath: "input/team-registry.seed.json",
          })
        : [],
      venueRegistry: venueRegistryPath
        ? await readJsonInput(venueRegistryPath, {
            inputRole: "venue-registry",
            sourceId: "world-cup-copilot-venue-registry",
            sourcePath: "input/venue-registry.seed.json",
          })
        : [],
      retrievedAt: generatedAt,
      sourceCommit: gitCommit,
    });
  }
  const resolvedInput = path.resolve(inputPath ?? path.join(repoRoot, "input/phase-a-seed.json"));
  return readJsonInput(resolvedInput, {
    inputRole: "demo-seed",
    sourceId: "world-cup-copilot-demo-seed",
    sourcePath: "input/phase-a-seed.json",
  });
}

async function readJsonInput(inputFilePath, metadata) {
  return JSON.parse(await readTextInput(inputFilePath, { ...metadata, format: "json" }));
}

async function readTextInput(inputFilePath, metadata) {
  const resolvedPath = path.resolve(inputFilePath);
  const content = await readFile(resolvedPath, "utf8");
  inputProvenance.push({
    ...metadata,
    format: metadata.format ?? (path.extname(resolvedPath).replace(/^\./, "") || "text"),
    path: publicInputPath(resolvedPath),
    sizeBytes: Buffer.byteLength(content, "utf8"),
    sha256: createHash("sha256").update(content).digest("hex"),
  });
  return content;
}

function publicInputPath(resolvedPath) {
  const relativePath = path.relative(repoRoot, resolvedPath).replace(/\\/g, "/");
  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) return relativePath;
  return path.basename(resolvedPath);
}
