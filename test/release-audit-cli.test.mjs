import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("release audit CLI composes package gates for a generated package", async () => {
  const outDir = path.join(repoRoot, "dist/phase-a-release-audit-test");

  await rm(outDir, { recursive: true, force: true });
  try {
    await execFileAsync(process.execPath, [
      "scripts/generate-phase-a.mjs",
      "--out",
      outDir,
      "--openfootball-json",
      "test/fixtures/openfootball-worldcup.sample.json",
      "--international-results-csv",
      "test/fixtures/international-results.sample.csv",
      "--former-names-csv",
      "test/fixtures/former-names.sample.csv",
      "--shootouts-csv",
      "test/fixtures/shootouts.sample.csv",
      "--goalscorers-csv",
      "test/fixtures/goalscorers.sample.csv",
      "--team-registry",
      "input/team-registry.seed.json",
      "--generated-at",
      "2026-05-27T10:30:00.000Z",
      "--git-commit",
      "release-audit-test",
    ]);

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/audit-release.mjs",
      "--package",
      "dist/phase-a-release-audit-test",
      "--skip-readiness",
      "--skip-fifa",
      "--remote-paths",
      "data/metadata/source-inputs.json",
    ]);

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.checks.some((check) => check.name === "validate-package" && check.ok), true);
    assert.equal(result.checks.some((check) => check.name === "audit-source-inputs" && check.ok), true);
    assert.equal(result.checks.some((check) => check.name === "audit-fifa-squads-input" && check.ok), true);
    assert.equal(result.checks.some((check) => check.name === "audit-remote-latency" && check.ok), true);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("release audit final mode fails when completion blockers remain", async () => {
  const outDir = path.join(repoRoot, "dist/phase-a-release-final-audit-test");

  await rm(outDir, { recursive: true, force: true });
  try {
    await execFileAsync(process.execPath, [
      "scripts/generate-phase-a.mjs",
      "--out",
      outDir,
      "--openfootball-json",
      "test/fixtures/openfootball-worldcup.sample.json",
      "--international-results-csv",
      "test/fixtures/international-results.sample.csv",
      "--team-registry",
      "input/team-registry.seed.json",
      "--generated-at",
      "2026-05-27T10:30:00.000Z",
      "--git-commit",
      "release-final-audit-test",
    ]);

    await assert.rejects(
      execFileAsync(process.execPath, [
        "scripts/audit-release.mjs",
        "--package",
        "dist/phase-a-release-final-audit-test",
        "--final",
        "--skip-fifa",
        "--skip-remote",
        "--fifa-squads-input",
        "dist/missing-final-fifa-squads.json",
      ]),
      (error) => {
        const result = JSON.parse(error.stdout);
        assert.equal(result.ok, false);
        assert.equal(result.checks.some((check) => check.name === "audit-completion" && !check.ok), true);
        assert.equal(result.checks.some((check) => check.name === "audit-fifa-squads-input" && !check.ok), true);
        return true;
      },
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
