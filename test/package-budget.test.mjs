import test from "node:test";
import assert from "node:assert/strict";

import { auditPackageBudget } from "../scripts/lib/package-budget.mjs";

const manifest = {
  files: [
    {
      path: "data/sources/sources.json",
      downloadTier: "core",
      required: true,
      sizeBytes: 100,
    },
    {
      path: "data/taxonomy/teams.json",
      downloadTier: "core",
      required: true,
      sizeBytes: 200,
    },
    {
      path: "data/history/head-to-head/arg__bra.json",
      downloadTier: "match-context",
      required: false,
      sizeBytes: 300,
    },
    {
      path: "data/history/goalscorers/by-player/lionel-messi.json",
      downloadTier: "player-context",
      required: false,
      sizeBytes: 400,
    },
  ],
};

test("audits package tiers against byte budgets", () => {
  const result = auditPackageBudget(manifest, {
    totalBytes: 2_000,
    manifestBytesWarning: 10_000,
    fileIndexBytesWarning: 10_000,
    requiredCoreBytes: 500,
    tiers: {
      core: { totalBytes: 500, maxFileBytes: 250 },
      "match-context": { totalBytes: 500, maxFileBytes: 500 },
      "player-context": { totalBytes: 500, maxFileBytes: 500 },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.totalBytes, 1_000);
  assert.equal(result.summary.manifestBytes > 0, true);
  assert.equal(result.summary.fileIndexBytes, 0);
  assert.equal(result.summary.requiredCoreBytes, 300);
  assert.equal(result.summary.byTier.core.files, 2);
  assert.equal(result.summary.byTier.core.largestFile.path, "data/taxonomy/teams.json");
});

test("reports budget violations with actionable file paths", () => {
  const result = auditPackageBudget(manifest, {
    totalBytes: 900,
    manifestBytesWarning: 10_000,
    fileIndexBytesWarning: 10_000,
    requiredCoreBytes: 250,
    tiers: {
      core: { totalBytes: 250, maxFileBytes: 150 },
      "match-context": { totalBytes: 250, maxFileBytes: 250 },
      "player-context": { totalBytes: 300, maxFileBytes: 300 },
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /total package bytes/);
  assert.match(result.errors.join("\n"), /required core bytes/);
  assert.match(result.errors.join("\n"), /data\/taxonomy\/teams\.json/);
  assert.match(result.errors.join("\n"), /data\/history\/head-to-head\/arg__bra\.json/);
  assert.match(result.errors.join("\n"), /data\/history\/goalscorers\/by-player\/lionel-messi\.json/);
});

test("warns when manifest itself is too large for the startup path", () => {
  const result = auditPackageBudget(manifest, {
    totalBytes: 2_000,
    manifestBytesWarning: 10,
    fileIndexBytesWarning: 10_000,
    requiredCoreBytes: 500,
    tiers: {
      core: { totalBytes: 500, maxFileBytes: 250 },
      "match-context": { totalBytes: 500, maxFileBytes: 500 },
      "player-context": { totalBytes: 500, maxFileBytes: 500 },
    },
  });

  assert.equal(result.ok, true);
  assert.match(result.warnings.join("\n"), /manifest bytes/);
});
