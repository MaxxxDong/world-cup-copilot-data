import test from "node:test";
import assert from "node:assert/strict";

import { auditDataReadiness } from "../scripts/lib/readiness.mjs";

const readyBase = {
  coverage: {
    packagePhase: "phase-a",
    qualitySignals: {
      scheduleMatches: 104,
      historicalMatches: 49257,
      playerIdentities: { count: 13229 },
    },
    layers: [
      { layerId: "official-rosters", status: "pending-official-final-list" },
      { layerId: "team-profiles", status: "available" },
      { layerId: "historical-key-player-profiles", status: "available" },
      { layerId: "key-player-profiles", status: "pending-final-rosters-and-profile-generator" },
    ],
  },
  identityGaps: {
    summary: {
      lowConfidenceTeamCount: 288,
      missingSourceRefTeamCount: 288,
      duplicateFifaCodeCount: 49,
    },
  },
  sourceAudit: {
    switchPolicy: { currentDecision: "keep-layered-stack" },
    layers: [
      { layerId: "schedule", status: "usable", nextGate: "Run FIFA audit." },
      { layerId: "team-identity", status: "usable-with-gaps", decision: "await-wikidata-export" },
    ],
  },
};

test("readiness audit distinguishes publishable Phase A from complete data stage", () => {
  const result = auditDataReadiness(readyBase);

  assert.equal(result.ok, true);
  assert.equal(result.publishablePhaseA, true);
  assert.equal(result.completionReady, false);
  assert.equal(result.summary.sourceDecision, "keep-layered-stack");
  assert.equal(result.summary.teamProfileStatus, "available");
  assert.equal(result.summary.historicalKeyPlayerProfileStatus, "available");
  assert.equal(result.summary.identityGapsResolved, false);
  assert.equal(result.completionBlockers.includes("official-rosters-not-available"), true);
  assert.equal(result.completionBlockers.includes("key-player-profiles-not-available"), true);
  assert.equal(result.completionBlockers.includes("team-profiles-not-available"), false);
  assert.equal(result.completionBlockers.includes("team-identity-gaps-remain"), true);
  assert.equal(result.nextGates.length, 1);
});

test("readiness audit does not require Wikidata when identity gaps are already resolved", () => {
  const result = auditDataReadiness({
    ...readyBase,
    identityGaps: {
      summary: {
        lowConfidenceTeamCount: 0,
        missingSourceRefTeamCount: 0,
        duplicateFifaCodeCount: 0,
      },
    },
  });

  assert.equal(result.summary.identityGapsResolved, true);
  assert.equal(result.completionBlockers.includes("team-identity-gaps-remain"), false);
  assert.equal(result.completionBlockers.includes("wikidata-team-reconciliation-not-applied"), false);
});

test("readiness audit accepts clearly labelled simulated rosters for current data stage", () => {
  const result = auditDataReadiness({
    ...readyBase,
    coverage: {
      ...readyBase.coverage,
      layers: readyBase.coverage.layers.map((layer) =>
        ["official-rosters", "key-player-profiles"].includes(layer.layerId)
          ? { ...layer, status: "available-simulated" }
          : layer,
      ),
    },
    identityGaps: {
      summary: {
        lowConfidenceTeamCount: 0,
        missingSourceRefTeamCount: 0,
        duplicateFifaCodeCount: 0,
      },
    },
  });

  assert.equal(result.completionReady, true);
  assert.deepEqual(result.completionBlockers, []);
});

test("readiness audit reports missing primary source layers as errors", () => {
  const result = auditDataReadiness({
    ...readyBase,
    sourceAudit: {
      switchPolicy: { currentDecision: "keep-layered-stack" },
      layers: [{ layerId: "schedule", status: "missing-primary" }],
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /schedule source status is missing-primary/);
});
