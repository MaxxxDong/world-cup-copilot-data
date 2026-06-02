import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageArg = getArg("--package") ?? process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const packageRoot = packageArg ? path.resolve(repoRoot, packageArg) : path.join(repoRoot, "dist/phase-a-real");
const sourceRoot = getArg("--source-root") ?? ".";
const strictCompletion = process.argv.includes("--strict-completion") || process.argv.includes("--final");
const skipFifa = process.argv.includes("--skip-fifa");
const skipFifaSquads = process.argv.includes("--skip-fifa-squads");
const requireFinalFifaSquads = process.argv.includes("--require-final-fifa-squads") || strictCompletion;
const skipRemote = process.argv.includes("--skip-remote");
const skipReadiness = process.argv.includes("--skip-readiness");
const skipCompletion = process.argv.includes("--skip-completion") || skipReadiness;
const fifaSquadsInput = getArg("--fifa-squads-input") ?? "input/raw/fifa-squads.json";
const fifaSquadsExpectedTeamCount = getArg("--fifa-squads-expected-team-count") ?? "48";
const remotePaths = splitArg("--remote-paths") ?? [
  "data/metadata/source-inputs.json",
  "data/profiles/key-players/historical/arg/index.json",
  "data/profiles/key-players/historical/arg/lionel-messi.json",
  "data/profiles/teams/mex.json",
  "data/history/head-to-head/mex__rsa.json",
  "data/players/identities/lionel-messi.json",
];
const fifaFixtures = splitArg("--fifa-fixtures") ?? [
  "input/audit/fifa-schedule.group-stage.json",
  "input/audit/fifa-schedule.knockout.json",
  "input/audit/fifa-schedule.group-a.json",
];

if (!packageRoot.startsWith(repoRoot)) {
  throw new Error(`Refusing to audit package outside repository root: ${packageRoot}`);
}

const packageRel = path.relative(repoRoot, packageRoot) || ".";
const checks = [];

await runCheck("validate-package", ["scripts/validate-package.mjs", packageRel]);
await runCheck("audit-source-inputs", ["scripts/audit-source-inputs.mjs", "--package", packageRel, "--source-root", sourceRoot]);
await runCheck("audit-package-budget", ["scripts/audit-package-budget.mjs", packageRel]);
if (!skipReadiness) {
  await runCheck("audit-readiness", ["scripts/audit-readiness.mjs", packageRel]);
}
if (!skipCompletion) {
  await runCheck("audit-completion", [
    "scripts/audit-completion.mjs",
    "--package",
    packageRel,
    ...(strictCompletion ? ["--strict"] : []),
  ]);
}

if (!skipFifaSquads) {
  await runCheck("audit-fifa-squads-input", [
    "scripts/audit-fifa-squads-input.mjs",
    "--input",
    fifaSquadsInput,
    "--expect-team-count",
    fifaSquadsExpectedTeamCount,
    ...(requireFinalFifaSquads ? ["--require-final"] : ["--allow-missing"]),
  ]);
}

if (!skipFifa) {
  for (const fixture of fifaFixtures) {
    await runCheck(`audit-fifa-schedule:${fixture}`, ["scripts/audit-fifa-schedule.mjs", "--package", packageRel, "--fixture", fixture]);
  }
}

if (!skipRemote) {
  await runCheck("audit-remote-latency", [
    "scripts/audit-remote-latency.mjs",
    "--manifest-url",
    pathToFileUrl(path.join(packageRoot, "manifest.json")),
    "--paths",
    remotePaths.join(","),
  ]);
}

const failed = checks.filter((check) => !check.ok);
const result = {
  ok: failed.length === 0,
  packageRoot: packageRel.replace(/\\/g, "/"),
  checks,
};
console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exit(1);

async function runCheck(name, args) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    checks.push({
      name,
      ok: true,
      stdout: compactOutput(stdout),
      stderr: compactOutput(stderr),
    });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      exitCode: error.code,
      stdout: compactOutput(error.stdout ?? ""),
      stderr: compactOutput(error.stderr ?? error.message ?? ""),
    });
  }
}

function compactOutput(value) {
  const text = String(value ?? "").trim();
  if (text.length <= 2_000) return text;
  return `${text.slice(0, 1_000)}\n...\n${text.slice(-1_000)}`;
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function splitArg(name) {
  const value = getArg(name);
  if (value === undefined) return undefined;
  if (!value.trim()) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function pathToFileUrl(filePath) {
  return new URL(`file:///${path.resolve(filePath).replace(/\\/g, "/")}`).toString();
}
