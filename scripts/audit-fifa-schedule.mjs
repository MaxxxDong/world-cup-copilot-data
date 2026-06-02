import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditFifaSchedule } from "./lib/schedule-audit.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageArg = getArg("--package");
const packageRoot = packageArg ? path.resolve(repoRoot, packageArg) : path.join(repoRoot, "dist/phase-a-real");
const fixturePath = path.resolve(getArg("--fixture") ?? path.join(repoRoot, "input/audit/fifa-schedule.group-stage.json"));

const [schedule, teams, venues, fixture] = await Promise.all([
  readJson(path.join(packageRoot, "data/schedule/worldcup-2026.json")),
  readJson(path.join(packageRoot, "data/taxonomy/teams.json")),
  readJson(path.join(packageRoot, "data/taxonomy/venues.json")),
  readJson(fixturePath),
]);

const result = auditFifaSchedule({ schedule, teams, venues, fixture });
console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exitCode = 1;
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
