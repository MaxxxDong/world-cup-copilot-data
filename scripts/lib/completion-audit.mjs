import { auditDataReadiness } from "./readiness.mjs";

const REQUIRED_CLASSIFICATION_FILES = [
  "data/metadata/layer-index.json",
  "data/identification/matches.json",
  "data/schedule/worldcup-2026.json",
  "data/taxonomy/teams.json",
  "data/taxonomy/team-aliases.json",
  "data/market-mapping/polymarket-query-seeds.json",
];

const REQUIRED_CLASSIFICATION_CATEGORIES = [
  "metadata.layerIndex",
  "identification.matches",
  "schedule",
  "taxonomy.teams",
  "taxonomy.aliases",
  "marketMapping.polymarket",
];

const REQUIRED_LAYER_INDEX_LAYERS = [
  "startup",
  "match-detection",
  "match-analysis",
  "historical-player-analysis",
  "current-roster-analysis",
  "market-analysis",
  "developer-audit",
];

export function auditDataStageCompletion({ coverage, identityGaps, layerIndex, sourceAudit, packageBudget, manifest }) {
  const readiness = auditDataReadiness({ coverage, identityGaps, sourceAudit });
  const structure = auditStructure({ packageBudget });
  const classification = auditClassification({ coverage, identityGaps, layerIndex, manifest });
  const sourceSwitchReview = auditSourceSwitchReview({ sourceAudit });
  const dataCompletenessAndSources = {
    achieved: readiness.completionReady && sourceSwitchReview.achieved,
    phaseAReady: readiness.publishablePhaseA && readiness.ok,
    blockers: [...readiness.completionBlockers, ...sourceSwitchReview.blockers],
    warnings: [...readiness.warnings, ...sourceSwitchReview.warnings],
    evidence: {
      ...readiness.summary,
      nextGates: readiness.nextGates,
      sourceSwitchReview: sourceSwitchReview.evidence,
    },
  };

  const blockers = unique([
    ...dataCompletenessAndSources.blockers,
    ...structure.blockers,
    ...classification.blockers,
  ]);
  const warnings = unique([
    ...dataCompletenessAndSources.warnings,
    ...structure.warnings,
    ...classification.warnings,
  ]);

  return {
    ok: readiness.ok && structure.achieved && classification.achieved && sourceSwitchReview.achieved,
    publishablePhaseA: dataCompletenessAndSources.phaseAReady && structure.achieved && classification.achieved,
    completionReady: readiness.completionReady && structure.achieved && classification.achieved,
    sections: {
      dataCompletenessAndSources,
      databaseStructureAndPerformance: structure,
      classificationAndIdentifiability: classification,
    },
    blockers,
    warnings,
    summary: {
      ...readiness.summary,
      sourceDecision: readiness.summary.sourceDecision,
      totalBytes: packageBudget?.summary?.totalBytes ?? 0,
      requiredCoreBytes: packageBudget?.summary?.requiredCoreBytes ?? 0,
      coreBytes: packageBudget?.summary?.byTier?.core?.bytes ?? 0,
      requiredCoreHeadroomBytes: Math.max(0, (packageBudget?.summary?.budgets?.requiredCoreBytes ?? 0) - (packageBudget?.summary?.requiredCoreBytes ?? 0)),
      coreHeadroomBytes: Math.max(0, (packageBudget?.summary?.budgets?.tiers?.core?.totalBytes ?? 0) - (packageBudget?.summary?.byTier?.core?.bytes ?? 0)),
      hasMatchIdentificationIndex: classification.evidence.hasMatchIdentificationIndex,
      hasMarketMapping: classification.evidence.hasMarketMapping,
    },
  };
}

function auditSourceSwitchReview({ sourceAudit }) {
  const comparisons = sourceAudit?.candidateComparisons ?? [];
  const blockers = [];
  const warnings = [];
  let candidateCount = 0;
  let switchNowCount = 0;
  let strictlyBetterButNotSwitchedCount = 0;

  if (!comparisons.length) {
    warnings.push("source candidate comparison matrix is missing; regenerate package with current source-audit metadata");
  }

  for (const layer of comparisons) {
    for (const candidate of layer.candidates ?? []) {
      candidateCount += 1;
      if (candidate.decision === "switch-now") switchNowCount += 1;
      if (candidate.strictlyBetterThanCurrent && candidate.decision !== "switch-now" && candidate.decision !== "import-when-available") {
        strictlyBetterButNotSwitchedCount += 1;
        blockers.push(`strictly-better-source-not-switched:${layer.layerId}:${candidate.sourceId}`);
      }
    }
  }

  return {
    achieved: blockers.length === 0,
    blockers,
    warnings,
    evidence: {
      candidateComparisonMatrixPresent: comparisons.length > 0,
      comparedLayerCount: comparisons.length,
      candidateCount,
      switchNowCount,
      strictlyBetterButNotSwitchedCount,
      currentDecision: sourceAudit?.switchPolicy?.currentDecision ?? "unknown",
      rule: sourceAudit?.switchPolicy?.rule ?? "unknown",
    },
  };
}

function auditStructure({ packageBudget }) {
  const blockers = [];
  const warnings = [...(packageBudget?.warnings ?? [])];
  if (!packageBudget?.ok) blockers.push(...(packageBudget?.errors ?? ["package-budget-not-available"]));

  return {
    achieved: packageBudget?.ok === true,
    blockers,
    warnings,
    evidence: {
      totalBytes: packageBudget?.summary?.totalBytes ?? 0,
      manifestBytes: packageBudget?.summary?.manifestBytes ?? 0,
      fileIndexBytes: packageBudget?.summary?.fileIndexBytes ?? 0,
      requiredCoreBytes: packageBudget?.summary?.requiredCoreBytes ?? 0,
      byTier: packageBudget?.summary?.byTier ?? {},
      budgets: packageBudget?.summary?.budgets ?? {},
    },
  };
}

function auditClassification({ coverage, identityGaps, layerIndex, manifest }) {
  const files = manifest?.files ?? [];
  const coverageLayers = new Map((coverage?.layers ?? []).map((layer) => [layer.layerId, layer]));
  const rosterStatus = coverageLayers.get("official-rosters")?.status;
  const keyPlayerStatus = coverageLayers.get("key-player-profiles")?.status;
  const conditionalFiles = [
    ...(isRosterLayerAvailable(rosterStatus) ? ["data/rosters/worldcup-2026/index.json"] : []),
    ...(isRosterLayerAvailable(keyPlayerStatus) ? ["data/profiles/key-players/current/index.json"] : []),
  ];
  const conditionalCategories = [
    ...(isRosterLayerAvailable(rosterStatus) ? ["rosters.worldcup2026.index"] : []),
    ...(isRosterLayerAvailable(keyPlayerStatus) ? ["profiles.keyPlayersCurrent.index"] : []),
  ];
  const missingFiles = [...REQUIRED_CLASSIFICATION_FILES, ...conditionalFiles].filter((filePath) => !hasFile(files, filePath));
  const missingCategories = [...REQUIRED_CLASSIFICATION_CATEGORIES, ...conditionalCategories].filter((category) => !hasCategory(files, category));
  const identitySummary = identityGaps?.summary ?? {};
  const identityGapsResolved =
    (identitySummary.lowConfidenceTeamCount ?? 0) === 0 &&
    (identitySummary.missingSourceRefTeamCount ?? 0) === 0 &&
    (identitySummary.duplicateFifaCodeCount ?? 0) === 0;
  const layerIndexAudit = auditLayerIndex({ layerIndex });
  const blockers = [
    ...missingFiles.map((filePath) => `missing-required-classification-file:${filePath}`),
    ...missingCategories.map((category) => `missing-required-classification-category:${category}`),
    ...layerIndexAudit.blockers,
    ...(identityGapsResolved ? [] : ["team-identity-gaps-remain"]),
  ];

  return {
    achieved: blockers.length === 0,
    blockers,
    warnings: [],
    evidence: {
      identityGapsResolved,
      lowConfidenceTeamCount: identitySummary.lowConfidenceTeamCount ?? 0,
      missingSourceRefTeamCount: identitySummary.missingSourceRefTeamCount ?? 0,
      duplicateFifaCodeCount: identitySummary.duplicateFifaCodeCount ?? 0,
      hasMatchIdentificationIndex: hasFile(files, "data/identification/matches.json"),
      hasSchedule: hasFile(files, "data/schedule/worldcup-2026.json"),
      hasTeamTaxonomy: hasFile(files, "data/taxonomy/teams.json"),
      hasTeamAliases: hasFile(files, "data/taxonomy/team-aliases.json"),
      hasMarketMapping: hasFile(files, "data/market-mapping/polymarket-query-seeds.json"),
      hasRosterIndex: hasFile(files, "data/rosters/worldcup-2026/index.json"),
      hasCurrentKeyPlayerProfileIndex: hasFile(files, "data/profiles/key-players/current/index.json"),
      layerIndex: layerIndexAudit.evidence,
      missingFiles,
      missingCategories,
    },
  };
}

function auditLayerIndex({ layerIndex }) {
  const blockers = [];
  const layers = Array.isArray(layerIndex?.layers) ? layerIndex.layers : [];
  const byLayerId = new Map(layers.map((layer) => [layer.layerId, layer]));
  if (!layers.length) {
    blockers.push("layer-index-missing-layers");
  }
  for (const layerId of REQUIRED_LAYER_INDEX_LAYERS) {
    const layer = byLayerId.get(layerId);
    if (!layer) {
      blockers.push(`layer-index-missing-layer:${layerId}`);
      continue;
    }
    if (!Array.isArray(layer.downloadTiers) || !layer.downloadTiers.length) {
      blockers.push(`layer-index-missing-download-tiers:${layerId}`);
    }
    if (!Array.isArray(layer.categories) || !layer.categories.length) {
      blockers.push(`layer-index-missing-categories:${layerId}`);
    }
    if (!layer.useWhen) {
      blockers.push(`layer-index-missing-use-when:${layerId}`);
    }
  }
  requireLayerCategory(byLayerId, blockers, "match-detection", "identification.matches");
  requireLayerCategory(byLayerId, blockers, "match-analysis", "profiles.teams");
  requireLayerCategory(byLayerId, blockers, "historical-player-analysis", "profiles.keyPlayersHistorical");
  requireLayerCategory(byLayerId, blockers, "current-roster-analysis", "profiles.keyPlayersCurrent");
  requireLayerCategory(byLayerId, blockers, "market-analysis", "marketMapping.polymarket");

  return {
    blockers,
    evidence: {
      present: layers.length > 0,
      layerCount: layers.length,
      requiredLayerCount: REQUIRED_LAYER_INDEX_LAYERS.length,
      missingLayerIds: REQUIRED_LAYER_INDEX_LAYERS.filter((layerId) => !byLayerId.has(layerId)),
    },
  };
}

function isRosterLayerAvailable(status) {
  return ["available", "available-final", "available-provisional", "available-simulated"].includes(status);
}

function requireLayerCategory(byLayerId, blockers, layerId, category) {
  const layer = byLayerId.get(layerId);
  if (layer && !layer.categories?.includes(category)) {
    blockers.push(`layer-index-missing-category:${layerId}:${category}`);
  }
}

function hasFile(files, filePath) {
  return files.some((file) => file.path === filePath);
}

function hasCategory(files, category) {
  return files.some((file) => file.category === category || file.categories?.includes(category));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
