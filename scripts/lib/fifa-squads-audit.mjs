import { importFifaSquadsJson } from "./importers.mjs";

const VALID_ROSTER_STATUSES = new Set(["provisional", "final", "simulated"]);

export function auditFifaSquadsInput({ fifaSquadsJson, teamRegistry = [], sourceId = "fifa-squad-announcements-2026", sourcePath = "fifa-squads.json", expectTeamCount, requireFinal = false }) {
  const errors = [];
  const warnings = [];
  let imported;

  try {
    imported = importFifaSquadsJson(fifaSquadsJson, { sourceId, sourcePath, teamRegistry });
  } catch (error) {
    return {
      ok: false,
      errors: [`fifa squads input cannot be imported: ${error.message}`],
      warnings,
      summary: emptySummary(),
    };
  }

  const teamCounts = new Map();
  for (const roster of imported.rosters) {
    teamCounts.set(roster.teamId, (teamCounts.get(roster.teamId) ?? 0) + 1);
    if (!VALID_ROSTER_STATUSES.has(roster.rosterStatus)) {
      errors.push(`${roster.teamId} has unsupported rosterStatus ${roster.rosterStatus}`);
    }
    if (requireFinal && roster.rosterStatus !== "final") {
      errors.push(`${roster.teamId} must be final before full data completion`);
    }
    if (!roster.sourceUrl) {
      errors.push(`${roster.teamId} is missing sourceUrl`);
    }
    if (!Array.isArray(roster.players) || roster.players.length === 0) {
      errors.push(`${roster.teamId} roster has no players`);
    }
    if (roster.rosterStatus === "final" && (roster.players.length < 23 || roster.players.length > 26)) {
      errors.push(`${roster.teamId} final roster has ${roster.players.length} players; expected 23-26`);
    }
  }

  const duplicateTeamIds = [...teamCounts.entries()].filter(([, count]) => count > 1).map(([teamId]) => teamId);
  for (const teamId of duplicateTeamIds) {
    errors.push(`${teamId} appears more than once in fifa squads input`);
  }

  const lowConfidenceTeams = imported.teams
    .filter((team) => team.identityConfidence !== "high" || team.identityStatus !== "registry")
    .map((team) => team.teamId);
  for (const teamId of lowConfidenceTeams) {
    errors.push(`${teamId} is not recognized by team registry`);
  }

  if (expectTeamCount !== undefined && imported.rosters.length !== expectTeamCount) {
    const message = `fifa squads input has ${imported.rosters.length} teams; expected ${expectTeamCount}`;
    if (requireFinal) errors.push(message);
    else warnings.push(message);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      teamCount: imported.rosters.length,
      playerCount: imported.rosters.reduce((sum, roster) => sum + roster.players.length, 0),
      finalTeamCount: imported.rosters.filter((roster) => roster.rosterStatus === "final").length,
      provisionalTeamCount: imported.rosters.filter((roster) => roster.rosterStatus === "provisional").length,
      duplicateTeamIds,
      lowConfidenceTeamIds: lowConfidenceTeams,
      missingSourceUrlTeamIds: imported.rosters.filter((roster) => !roster.sourceUrl).map((roster) => roster.teamId),
      emptyRosterTeamIds: imported.rosters.filter((roster) => !roster.players.length).map((roster) => roster.teamId),
    },
  };
}

function emptySummary() {
  return {
    teamCount: 0,
    playerCount: 0,
    finalTeamCount: 0,
    provisionalTeamCount: 0,
    duplicateTeamIds: [],
    lowConfidenceTeamIds: [],
    missingSourceUrlTeamIds: [],
    emptyRosterTeamIds: [],
  };
}
