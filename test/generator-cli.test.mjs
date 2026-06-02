import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("generator CLI records source input provenance", async () => {
  const outDir = path.join(repoRoot, "dist/phase-a-cli-provenance-test");

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
      "2026-05-27T10:00:00.000Z",
      "--git-commit",
      "cli-test",
    ]);

    const sourceInputs = JSON.parse(await readFile(path.join(outDir, "data/metadata/source-inputs.json"), "utf8"));
    assert.equal(sourceInputs.inputCount, 6);
    assert.equal(sourceInputs.inputs.every((input) => input.sha256 && input.sizeBytes > 0), true);
    assert.equal(sourceInputs.inputs.some((input) => input.path === "test/fixtures/openfootball-worldcup.sample.json"), true);
    assert.equal(sourceInputs.inputs.some((input) => input.path.includes("\\")), false);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("generator CLI removes stale split indexes before writing a package", async () => {
  const outDir = path.join(repoRoot, "dist/phase-a-cli-clean-indexes-test");
  const staleIndexDir = path.join(outDir, "indexes");
  const staleIndexPath = path.join(staleIndexDir, "files-player-context.json");

  await rm(outDir, { recursive: true, force: true });
  try {
    await mkdir(staleIndexDir, { recursive: true });
    await writeFile(staleIndexPath, '{"stale":true}\n', "utf8");

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
      "2026-05-27T10:00:00.000Z",
      "--git-commit",
      "cli-clean-indexes-test",
    ]);

    const manifest = JSON.parse(await readFile(path.join(outDir, "manifest.json"), "utf8"));
    const indexNames = await readdir(path.join(outDir, "indexes"));
    assert.equal(indexNames.includes("files-player-context.json"), false);
    assert.equal(indexNames.length, manifest.fileIndexes.length);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
