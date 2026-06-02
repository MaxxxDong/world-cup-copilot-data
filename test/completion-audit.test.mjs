import test from "node:test";
import assert from "node:assert/strict";

import { auditDataStageCompletion } from "../scripts/lib/completion-audit.mjs";

test("completion audit accepts publishable Phase A while reporting external completion blockers", () => {
  const result = auditDataStageCompletion(baseInput());

  assert.equal(result.ok, true);
  assert.equal(result.publishablePhaseA, true);
  assert.equal(result.completionReady, false);
  assert.equal(result.sections.dataCompletenessAndSources.phaseAReady, true);
  assert.equal(result.sections.databaseStructureAndPerformance.achieved, true);
  assert.equal(result.sections.classificationAndIdentifiability.achieved, true);
  assert.equal(result.summary.requiredCoreHeadroomBytes, 524288 - 300);
  assert.equal(result.summary.coreHeadroomBytes, 524288 - 300);
  assert.deepEqual(result.blockers, ["official-rosters-not-available", "key-player-profiles-not-available"]);
});

test("completion audit fails when the match identification index is missing", () => {
  const input = baseInput();
  input.manifest.files = input.manifest.files.filter((file) => file.path !== "data/identification/matches.json");

  const result = auditDataStageCompletion(input);

  assert.equal(result.ok, false);
  assert.equal(result.publishablePhaseA, false);
  assert.equal(result.sections.classificationAndIdentifiability.achieved, false);
  assert.ok(result.blockers.includes("missing-required-classification-file:data/identification/matches.json"));
});

test("completion audit requires roster and current profile indexes when coverage advertises them", () => {
  const input = baseInput();
  for (const layer of input.coverage.layers) {
    if (layer.layerId === "official-rosters" || layer.layerId === "key-player-profiles") {
      layer.status = "available-provisional";
    }
  }

  const result = auditDataStageCompletion(input);

  assert.equal(result.ok, false);
  assert.equal(result.sections.classificationAndIdentifiability.achieved, false);
  assert.ok(result.blockers.includes("missing-required-classification-file:data/rosters/worldcup-2026/index.json"));
  assert.ok(result.blockers.includes("missing-required-classification-file:data/profiles/key-players/current/index.json"));
});

test("completion audit validates required layer-index navigation entries", () => {
  const input = baseInput();
  input.layerIndex.layers = input.layerIndex.layers.filter((layer) => layer.layerId !== "match-detection");
  input.layerIndex.layers.find((layer) => layer.layerId === "current-roster-analysis").categories = ["rosters.worldcup2026"];

  const result = auditDataStageCompletion(input);

  assert.equal(result.ok, false);
  assert.equal(result.sections.classificationAndIdentifiability.achieved, false);
  assert.ok(result.blockers.includes("layer-index-missing-layer:match-detection"));
  assert.ok(result.blockers.includes("layer-index-missing-category:current-roster-analysis:profiles.keyPlayersCurrent"));
});

test("completion audit blocks ignored strictly better source decisions", () => {
  const input = baseInput();
  input.sourceAudit.candidateComparisons = [
    {
      layerId: "schedule",
      candidates: [
        {
          decision: "keep-current",
          sourceId: "better-source",
          strictlyBetterThanCurrent: true,
        },
      ],
    },
  ];

  const result = auditDataStageCompletion(input);

  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes("strictly-better-source-not-switched:schedule:better-source"));
});

test("completion audit passes strict readiness when final rosters and current key-player profiles are available", () => {
  const input = baseInput();
  for (const layer of input.coverage.layers) {
    if (layer.layerId === "official-rosters" || layer.layerId === "key-player-profiles") {
      layer.status = "available";
    }
  }
  input.manifest.files.push(
    file("data/rosters/worldcup-2026/index.json", "rosters.worldcup2026.index"),
    file("data/profiles/key-players/current/index.json", "profiles.keyPlayersCurrent.index"),
  );

  const result = auditDataStageCompletion(input);

  assert.equal(result.ok, true);
  assert.equal(result.publishablePhaseA, true);
  assert.equal(result.completionReady, true);
  assert.deepEqual(result.blockers, []);
});

test("completion audit passes current stage with simulated rosters and current key-player profiles", () => {
  const input = baseInput();
  for (const layer of input.coverage.layers) {
    if (layer.layerId === "official-rosters" || layer.layerId === "key-player-profiles") {
      layer.status = "available-simulated";
    }
  }
  input.manifest.files.push(
    file("data/rosters/worldcup-2026/index.json", "rosters.worldcup2026.index"),
    file("data/profiles/key-players/current/index.json", "profiles.keyPlayersCurrent.index"),
  );

  const result = auditDataStageCompletion(input);

  assert.equal(result.ok, true);
  assert.equal(result.completionReady, true);
  assert.deepEqual(result.blockers, []);
});

function baseInput() {
  return {
    coverage: {
      packagePhase: "phase-a",
      layers: [
        { layerId: "schedule", status: "available" },
        { layerId: "official-rosters", status: "pending-official-final-list" },
        { layerId: "team-profiles", status: "available" },
        { layerId: "key-player-profiles", status: "pending-final-rosters-and-profile-generator" },
      ],
      qualitySignals: {
        scheduleMatches: 104,
        historicalMatches: 49257,
        playerIdentities: { count: 13229 },
      },
    },
    identityGaps: {
      summary: {
        duplicateFifaCodeCount: 0,
        lowConfidenceTeamCount: 0,
        missingSourceRefTeamCount: 0,
      },
    },
    sourceAudit: {
      switchPolicy: { currentDecision: "keep-layered-stack" },
      candidateComparisons: [
        {
          layerId: "schedule",
          candidates: [{ decision: "keep-current", sourceId: "current-source", strictlyBetterThanCurrent: false }],
        },
      ],
      layers: [
        { layerId: "schedule", status: "usable" },
        { layerId: "national-team-history", status: "usable" },
      ],
    },
    layerIndex: {
      layers: [
        layer("startup", ["metadata.coverage", "metadata.layerIndex"]),
        layer("match-detection", ["identification.matches", "schedule", "taxonomy.teams", "taxonomy.aliases", "marketMapping.polymarket"]),
        layer("match-analysis", ["history.headToHead", "history.form", "profiles.teams"]),
        layer("historical-player-analysis", ["history.goalscorers.byPlayer", "profiles.keyPlayersHistorical"]),
        layer("current-roster-analysis", ["rosters.worldcup2026", "profiles.keyPlayersCurrent"]),
        layer("market-analysis", ["marketMapping.polymarket"]),
        layer("developer-audit", ["checksums", "metadata.sourceInputs"]),
      ],
    },
    packageBudget: {
      ok: true,
      errors: [],
      warnings: [],
      summary: {
        totalBytes: 1000,
        manifestBytes: 100,
        fileIndexBytes: 200,
        requiredCoreBytes: 300,
        byTier: { core: { files: 5, bytes: 300 } },
        budgets: { requiredCoreBytes: 524288, tiers: { core: { totalBytes: 524288 } } },
      },
    },
    manifest: {
      files: [
        file("data/metadata/layer-index.json", "metadata.layerIndex"),
        file("data/identification/matches.json", "identification.matches"),
        file("data/schedule/worldcup-2026.json", "schedule"),
        file("data/taxonomy/teams.json", "taxonomy.teams"),
        file("data/taxonomy/team-aliases.json", "taxonomy.aliases"),
        file("data/market-mapping/polymarket-query-seeds.json", "marketMapping.polymarket"),
      ],
    },
  };
}

function layer(layerId, categories) {
  return {
    categories,
    downloadTiers: ["core"],
    layerId,
    useWhen: `Use ${layerId}.`,
  };
}

function file(path, category) {
  return { path, category, sizeBytes: 10, downloadTier: "core", required: true };
}
