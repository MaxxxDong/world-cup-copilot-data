export function auditFifaSchedule({ schedule, teams, venues, fixture }) {
  const teamById = new Map(teams.map((team) => [team.teamId, team]));
  const venueById = new Map(venues.map((venue) => [venue.venueId, venue]));
  const matchByNumber = new Map(
    schedule.matches.map((match) => [matchNumberFromId(match.matchId), match])
  );
  const matchesByFixtureKey = new Map();
  for (const match of schedule.matches) {
    matchesByFixtureKey.set(fixtureKey(match), match);
  }
  const mismatches = [];
  const warnings = [];
  const fieldCoverage = {
    expectedPlaceholder: 0,
    localDate: 0,
    stage: 0,
    teamPairing: 0,
    venueAlias: 0,
  };

  for (const expected of fixture.matches) {
    const expectedNumber = expected.matchNumber ?? expected.officialMatchNumber;
    const actual = expected.matchNumber
      ? matchByNumber.get(expected.matchNumber)
      : matchesByFixtureKey.get(fixtureKey(expected));
    const label = expectedNumber ? `match ${expectedNumber}` : fixtureKey(expected);
    if (!actual) {
      mismatches.push(`${label}: missing from data package schedule`);
      continue;
    }

    if (expected.localDate) {
      fieldCoverage.localDate += 1;
    }
    if (expected.localDate && actual.localDate !== expected.localDate) {
      mismatches.push(`${label}: localDate expected ${expected.localDate}, got ${actual.localDate ?? "<missing>"}`);
    }

    if (expected.stage) {
      fieldCoverage.stage += 1;
      if (actual.stage !== expected.stage) {
        mismatches.push(`${label}: stage expected ${expected.stage}, got ${actual.stage ?? "<missing>"}`);
      }
    }

    const expectedTeams = [expected.homeTeamId, expected.awayTeamId].sort();
    const actualTeams = [actual.homeTeamId, actual.awayTeamId].sort();
    fieldCoverage.teamPairing += 1;
    if (expectedTeams.join("|") !== actualTeams.join("|")) {
      mismatches.push(`${label}: teams expected ${expectedTeams.join(" v ")}, got ${actualTeams.join(" v ")}`);
    } else if (actual.homeTeamId !== expected.homeTeamId || actual.awayTeamId !== expected.awayTeamId) {
      warnings.push(`${label}: team pairing matches but home/away order differs from FIFA fixture`);
    }

    for (const teamId of expectedTeams) {
      if (!teamById.has(teamId)) mismatches.push(`${label}: team ${teamId} missing from taxonomy`);
    }

    if (expected.expectedPlaceholder === true) {
      fieldCoverage.expectedPlaceholder += 1;
      for (const teamId of expectedTeams) {
        const team = teamById.get(teamId);
        if (team?.isPlaceholder !== true) {
          mismatches.push(`${label}: team ${teamId} is not marked as a placeholder`);
        }
      }
    }

    if (!expected.venueAlias) continue;
    fieldCoverage.venueAlias += 1;
    const venue = venueById.get(actual.venueId);
    if (!venue) {
      mismatches.push(`${label}: venue ${actual.venueId} missing from taxonomy`);
      continue;
    }
    const normalizedAliases = new Set((venue.aliases ?? []).map(normalizeAlias));
    if (!normalizedAliases.has(normalizeAlias(expected.venueAlias))) {
      mismatches.push(`${label}: venue ${actual.venueId} missing FIFA alias ${expected.venueAlias}`);
    }
  }

  return {
    checkedMatches: fixture.matches.length,
    fieldCoverage,
    mismatches,
    warnings,
    ok: mismatches.length === 0
  };
}

function fixtureKey(match) {
  return [
    match.group ?? "",
    ...[match.homeTeamId, match.awayTeamId].sort(),
  ].join("|");
}

function matchNumberFromId(matchId) {
  const match = String(matchId).match(/^wc-\d{4}-(\d{3})-/);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function normalizeAlias(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
