export function auditDataReadiness({ coverage, identityGaps, sourceAudit }) {
  const errors = [];
  const warnings = [];
  const nextGates = [];

  if (!coverage || typeof coverage !== "object") errors.push("missing coverage metadata");
  if (!identityGaps || typeof identityGaps !== "object") errors.push("missing identity gaps metadata");
  if (!sourceAudit || typeof sourceAudit !== "object") errors.push("missing source audit metadata");

  const coverageLayers = new Map((coverage?.layers ?? []).map((layer) => [layer.layerId, layer]));
  const identitySummary = identityGaps?.summary ?? {};
  const identityGapsResolved =
    (identitySummary.lowConfidenceTeamCount ?? 0) === 0 &&
    (identitySummary.missingSourceRefTeamCount ?? 0) === 0 &&
    (identitySummary.duplicateFifaCodeCount ?? 0) === 0;

  for (const layer of sourceAudit?.layers ?? []) {
    if (layer.status?.startsWith("missing")) {
      errors.push(`${layer.layerId} source status is ${layer.status}`);
    }
    if (layer.nextGate) nextGates.push({ layerId: layer.layerId, nextGate: layer.nextGate });
  }

  const rosterLayer = coverageLayers.get("official-rosters");
  if (!isCompletionAvailable(rosterLayer?.status)) {
    warnings.push(`official-rosters status is ${rosterLayer?.status ?? "missing"}`);
  }
  const teamProfileLayer = coverageLayers.get("team-profiles");
  if (teamProfileLayer?.status !== "available") {
    warnings.push(`team-profiles status is ${teamProfileLayer?.status ?? "missing"}`);
  }
  const keyPlayerProfileLayer = coverageLayers.get("key-player-profiles");
  if (!isCompletionAvailable(keyPlayerProfileLayer?.status)) {
    warnings.push(`key-player-profiles status is ${keyPlayerProfileLayer?.status ?? "missing"}`);
  }
  const historicalKeyPlayerProfileLayer = coverageLayers.get("historical-key-player-profiles");
  if ((identitySummary.lowConfidenceTeamCount ?? 0) > 0) {
    warnings.push(`low-confidence teams remain: ${identitySummary.lowConfidenceTeamCount}`);
  }
  if ((identitySummary.duplicateFifaCodeCount ?? 0) > 0) {
    warnings.push(`duplicate FIFA-code groups remain: ${identitySummary.duplicateFifaCodeCount}`);
  }

  const completionBlockers = [
    ...(isCompletionAvailable(rosterLayer?.status) ? [] : ["official-rosters-not-available"]),
    ...(teamProfileLayer?.status === "available" ? [] : ["team-profiles-not-available"]),
    ...(isCompletionAvailable(keyPlayerProfileLayer?.status) ? [] : ["key-player-profiles-not-available"]),
    ...(identityGapsResolved ? [] : ["team-identity-gaps-remain"]),
  ];

  return {
    ok: errors.length === 0,
    publishablePhaseA: errors.length === 0,
    completionReady: errors.length === 0 && completionBlockers.length === 0,
    errors,
    warnings,
    completionBlockers,
    summary: {
      packagePhase: coverage?.packagePhase ?? "unknown",
      sourceDecision: sourceAudit?.switchPolicy?.currentDecision ?? "unknown",
      scheduleMatches: coverage?.qualitySignals?.scheduleMatches ?? 0,
      historicalMatches: coverage?.qualitySignals?.historicalMatches ?? 0,
      lowConfidenceTeamCount: identitySummary.lowConfidenceTeamCount ?? 0,
      missingSourceRefTeamCount: identitySummary.missingSourceRefTeamCount ?? 0,
      duplicateFifaCodeCount: identitySummary.duplicateFifaCodeCount ?? 0,
      identityGapsResolved,
      playerIdentityCount: coverage?.qualitySignals?.playerIdentities?.count ?? 0,
      rosterStatus: rosterLayer?.status ?? "missing",
      teamProfileStatus: teamProfileLayer?.status ?? "missing",
      historicalKeyPlayerProfileStatus: historicalKeyPlayerProfileLayer?.status ?? "missing",
      keyPlayerProfileStatus: keyPlayerProfileLayer?.status ?? "missing",
    },
    nextGates,
  };
}

function isCompletionAvailable(status) {
  return ["available", "available-final", "available-provisional", "available-simulated"].includes(status);
}
