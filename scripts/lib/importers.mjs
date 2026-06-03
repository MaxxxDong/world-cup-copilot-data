const KNOWN_FIFA_CODES = {
  Algeria: "ALG",
  Argentina: "ARG",
  Australia: "AUS",
  Austria: "AUT",
  Belgium: "BEL",
  "Bosnia & Herzegovina": "BIH",
  "Bosnia and Herzegovina": "BIH",
  Brazil: "BRA",
  Canada: "CAN",
  "Cape Verde": "CPV",
  Colombia: "COL",
  Croatia: "CRO",
  "Curaçao": "CUW",
  Curacao: "CUW",
  "Czech Republic": "CZE",
  Czechia: "CZE",
  "DR Congo": "COD",
  Ecuador: "ECU",
  Egypt: "EGY",
  England: "ENG",
  France: "FRA",
  Germany: "GER",
  Ghana: "GHA",
  Haiti: "HAI",
  Iran: "IRN",
  Iraq: "IRQ",
  Japan: "JPN",
  Jordan: "JOR",
  Mexico: "MEX",
  Morocco: "MAR",
  Netherlands: "NED",
  "New Zealand": "NZL",
  Norway: "NOR",
  Panama: "PAN",
  Paraguay: "PAR",
  Portugal: "POR",
  Qatar: "QAT",
  "Saudi Arabia": "KSA",
  Scotland: "SCO",
  Senegal: "SEN",
  "South Africa": "RSA",
  "South Korea": "KOR",
  "Korea Republic": "KOR",
  Spain: "ESP",
  Sweden: "SWE",
  Switzerland: "SUI",
  Tunisia: "TUN",
  Turkey: "TUR",
  Uruguay: "URU",
  "United States": "USA",
  USA: "USA",
  Uzbekistan: "UZB",
};

export function importWorldCupJson(worldCupJson, { sourceId, sourcePath, teamRegistry = [], formerNames = [], venueRegistry = [] }) {
  const rounds = Array.isArray(worldCupJson?.rounds)
    ? worldCupJson.rounds
    : [{ name: worldCupJson?.name ?? "World Cup", matches: worldCupJson?.matches ?? [] }];
  const teams = new Map();
  const venues = new Map();
  const schedule = [];

  for (const round of rounds) {
    const matches = Array.isArray(round.matches) ? round.matches : [];
    for (const match of matches) {
      const homeName = requireString(match.team1 ?? match.home_team ?? match.home, "match.team1");
      const awayName = requireString(match.team2 ?? match.away_team ?? match.away, "match.team2");
      const homeTeam = teamWithSource(teamFromName(homeName, { teamRegistry, formerNames }), sourceId, sourcePath);
      const awayTeam = teamWithSource(teamFromName(awayName, { teamRegistry, formerNames }), sourceId, sourcePath);
      teams.set(homeTeam.teamId, homeTeam);
      teams.set(awayTeam.teamId, awayTeam);

      const matchNumber = match.num ?? match.number ?? schedule.length + 1;
      const kickoffUtc = parseKickoffUtc(match.date, match.time);
      const localKickoff = parseLocalKickoff(match.date, match.time);
      const venueName = String(match.stadium ?? match.venue ?? match.ground ?? match.city ?? "unknown venue").trim();
      const venueId = slugify(venueName);
      const registryVenue = venueRegistry.find((venue) => venue.venueId === venueId);
      venues.set(venueId, {
        venueId,
        displayName: registryVenue?.displayName ?? venueName,
        city: match.city ? String(match.city) : undefined,
        country: match.country ? String(match.country) : undefined,
        aliases: uniqueStrings([venueName, registryVenue?.displayName, ...(registryVenue?.aliases ?? [])]),
        sourceRefs: [{ sourceId, path: sourcePath }],
      });
      schedule.push({
        matchId: `wc-2026-${String(matchNumber).padStart(3, "0")}-${homeTeam.teamId}-${awayTeam.teamId}`,
        competitionId: "fifa-world-cup-2026",
        stage: String(match.stage ?? match.round ?? round.name ?? "unknown"),
        group: match.group ? String(match.group) : undefined,
        kickoffUtc,
        localDate: localKickoff.localDate,
        localTime: localKickoff.localTime,
        timezone: localKickoff.timezone,
        homeTeamId: homeTeam.teamId,
        awayTeamId: awayTeam.teamId,
        venueId,
        city: match.city ? String(match.city) : undefined,
        country: match.country ? String(match.country) : undefined,
        sourceRefs: [{ sourceId, path: sourcePath }],
      });
    }
  }

  return {
    teams: sortTeams([...teams.values()]),
    venues: [...venues.values()].sort((a, b) => a.venueId.localeCompare(b.venueId)),
    schedule: schedule.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc)),
  };
}

export function importInternationalResultsCsv(csvText, { sourceId, sourcePath, teamRegistry = [], formerNames = [] }) {
  const rows = parseCsv(csvText);
  const header = rows.shift();
  if (!header?.length) {
    throw new Error("international results CSV is empty");
  }
  const columnIndex = Object.fromEntries(header.map((column, index) => [column, index]));
  const requiredColumns = ["date", "home_team", "away_team", "home_score", "away_score", "tournament", "neutral"];
  for (const column of requiredColumns) {
    if (!(column in columnIndex)) {
      throw new Error(`international results CSV missing column ${column}`);
    }
  }

  const teams = new Map();
  const internationalResults = [];
  const matchIdCounts = new Map();
  for (const row of rows) {
    if (row.length === 1 && row[0] === "") continue;
    const homeName = readCell(row, columnIndex, "home_team");
    const awayName = readCell(row, columnIndex, "away_team");
    const homeTeam = teamWithSource(teamFromName(homeName, { teamRegistry, formerNames }), sourceId, sourcePath);
    const awayTeam = teamWithSource(teamFromName(awayName, { teamRegistry, formerNames }), sourceId, sourcePath);
    teams.set(homeTeam.teamId, homeTeam);
    teams.set(awayTeam.teamId, awayTeam);

    const date = readCell(row, columnIndex, "date");
    const homeScoreCell = readCell(row, columnIndex, "home_score");
    const awayScoreCell = readCell(row, columnIndex, "away_score");
    if (isMissingScore(homeScoreCell) || isMissingScore(awayScoreCell)) {
      continue;
    }
    const homeScore = parseScore(homeScoreCell, date, homeName, awayName);
    const awayScore = parseScore(awayScoreCell, date, homeName, awayName);

    const matchIdBase = `int-${date}-${homeTeam.teamId}-${awayTeam.teamId}`;
    const matchIdCount = (matchIdCounts.get(matchIdBase) ?? 0) + 1;
    matchIdCounts.set(matchIdBase, matchIdCount);

    internationalResults.push({
      matchId: matchIdCount === 1 ? matchIdBase : `${matchIdBase}-${matchIdCount}`,
      date,
      homeTeamId: homeTeam.teamId,
      awayTeamId: awayTeam.teamId,
      homeScore,
      awayScore,
      tournament: readCell(row, columnIndex, "tournament"),
      city: columnIndex.city === undefined ? undefined : readCell(row, columnIndex, "city"),
      country: columnIndex.country === undefined ? undefined : readCell(row, columnIndex, "country"),
      neutral: parseBoolean(readCell(row, columnIndex, "neutral")),
      sourceRefs: [{ sourceId, path: sourcePath }],
    });
  }

  return {
    teams: sortTeams([...teams.values()]),
    internationalResults: internationalResults.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function importFormerNamesCsv(csvText, { sourceId, sourcePath, teamRegistry = [] }) {
  const rows = parseCsv(csvText);
  const header = rows.shift();
  if (!header?.length) throw new Error("former names CSV is empty");
  const columnIndex = Object.fromEntries(header.map((column, index) => [column, index]));
  const currentColumn = columnIndex.current ?? columnIndex.current_name ?? columnIndex.team;
  const formerColumn = columnIndex.former ?? columnIndex.former_name;
  if (currentColumn === undefined || formerColumn === undefined) {
    throw new Error("former names CSV missing current/former columns");
  }
  const formerNames = [];
  const teams = new Map();
  for (const row of rows) {
    if (row.length === 1 && row[0] === "") continue;
    const currentName = requireString(row[currentColumn], "current");
    const formerName = requireString(row[formerColumn], "former");
    const team = teamWithSource(teamFromName(currentName, { teamRegistry }), sourceId, sourcePath);
    teams.set(team.teamId, team);
    formerNames.push({
      teamId: team.teamId,
      currentName: team.name,
      formerName,
      normalizedFormerName: normalizeAlias(formerName),
      startDate: columnIndex.start_date === undefined ? undefined : row[columnIndex.start_date],
      endDate: columnIndex.end_date === undefined ? undefined : row[columnIndex.end_date],
      sourceRefs: [{ sourceId, path: sourcePath }],
    });
  }
  return { teams: sortTeams([...teams.values()]), formerNames };
}

export function importShootoutsCsv(csvText, { sourceId, sourcePath, teamRegistry = [], formerNames = [] }) {
  const rows = parseCsv(csvText);
  const header = rows.shift();
  if (!header?.length) throw new Error("shootouts CSV is empty");
  const columnIndex = Object.fromEntries(header.map((column, index) => [column, index]));
  for (const column of ["date", "home_team", "away_team", "winner"]) {
    if (!(column in columnIndex)) throw new Error(`shootouts CSV missing column ${column}`);
  }
  const teams = new Map();
  const shootouts = [];
  for (const row of rows) {
    if (row.length === 1 && row[0] === "") continue;
    const date = readCell(row, columnIndex, "date");
    const homeTeam = teamWithSource(teamFromName(readCell(row, columnIndex, "home_team"), { teamRegistry, formerNames }), sourceId, sourcePath);
    const awayTeam = teamWithSource(teamFromName(readCell(row, columnIndex, "away_team"), { teamRegistry, formerNames }), sourceId, sourcePath);
    const winnerTeam = teamWithSource(teamFromName(readCell(row, columnIndex, "winner"), { teamRegistry, formerNames }), sourceId, sourcePath);
    const firstShooter = columnIndex.first_shooter === undefined || !row[columnIndex.first_shooter]
      ? undefined
      : teamWithSource(teamFromName(row[columnIndex.first_shooter], { teamRegistry, formerNames }), sourceId, sourcePath);
    for (const team of [homeTeam, awayTeam, winnerTeam, firstShooter].filter(Boolean)) teams.set(team.teamId, team);
    shootouts.push({
      matchKey: `${date}-${homeTeam.teamId}-${awayTeam.teamId}`,
      date,
      homeTeamId: homeTeam.teamId,
      awayTeamId: awayTeam.teamId,
      winnerTeamId: winnerTeam.teamId,
      firstShooterTeamId: firstShooter?.teamId,
      sourceRefs: [{ sourceId, path: sourcePath }],
    });
  }
  return { teams: sortTeams([...teams.values()]), shootouts: shootouts.sort((a, b) => a.date.localeCompare(b.date)) };
}

export function importGoalscorersCsv(csvText, { sourceId, sourcePath, teamRegistry = [], formerNames = [] }) {
  const rows = parseCsv(csvText);
  const header = rows.shift();
  if (!header?.length) throw new Error("goalscorers CSV is empty");
  const columnIndex = Object.fromEntries(header.map((column, index) => [column, index]));
  for (const column of ["date", "home_team", "away_team", "team", "scorer", "minute"]) {
    if (!(column in columnIndex)) throw new Error(`goalscorers CSV missing column ${column}`);
  }
  const teams = new Map();
  const goalscorers = [];
  for (const row of rows) {
    if (row.length === 1 && row[0] === "") continue;
    const date = readCell(row, columnIndex, "date");
    const homeTeam = teamWithSource(teamFromName(readCell(row, columnIndex, "home_team"), { teamRegistry, formerNames }), sourceId, sourcePath);
    const awayTeam = teamWithSource(teamFromName(readCell(row, columnIndex, "away_team"), { teamRegistry, formerNames }), sourceId, sourcePath);
    const scoringTeam = teamWithSource(teamFromName(readCell(row, columnIndex, "team"), { teamRegistry, formerNames }), sourceId, sourcePath);
    for (const team of [homeTeam, awayTeam, scoringTeam]) teams.set(team.teamId, team);
    goalscorers.push({
      goalId: `goal-${date}-${homeTeam.teamId}-${awayTeam.teamId}-${goalscorers.length + 1}`,
      matchKey: `${date}-${homeTeam.teamId}-${awayTeam.teamId}`,
      date,
      homeTeamId: homeTeam.teamId,
      awayTeamId: awayTeam.teamId,
      teamId: scoringTeam.teamId,
      scorer: readCell(row, columnIndex, "scorer"),
      minute: parseOptionalInteger(readCell(row, columnIndex, "minute")),
      ownGoal: columnIndex.own_goal === undefined ? false : parseBoolean(row[columnIndex.own_goal]),
      penalty: columnIndex.penalty === undefined ? false : parseBoolean(row[columnIndex.penalty]),
      sourceRefs: [{ sourceId, path: sourcePath }],
    });
  }
  return { teams: sortTeams([...teams.values()]), goalscorers };
}

export function importReepTeamsCsv(csvText, { sourceId, sourcePath, teamRegistry = [], targetTeamIds } = {}) {
  const rows = parseCsv(csvText);
  const header = rows.shift();
  if (!header?.length) throw new Error("Reep teams CSV is empty");
  const columnIndex = Object.fromEntries(header.map((column, index) => [column, index]));
  for (const column of ["reep_id", "name"]) {
    if (!(column in columnIndex)) throw new Error(`Reep teams CSV missing column ${column}`);
  }

  const targetSet = targetTeamIds ? new Set(targetTeamIds) : undefined;
  const teamIdentities = new Map();
  for (const row of rows) {
    if (row.length === 1 && row[0] === "") continue;
    const name = readCell(row, columnIndex, "name");
    const team = teamFromName(name, { teamRegistry });
    if (targetSet && !targetSet.has(team.teamId)) continue;
    const identity = {
      teamId: team.teamId,
      reepId: readCell(row, columnIndex, "reep_id"),
      name,
      providerIds: providerIdsFromRow(row, columnIndex),
      sourceRefs: [{ sourceId, path: sourcePath }],
    };
    const existing = teamIdentities.get(identity.teamId);
    if (!existing || providerIdCount(identity) > providerIdCount(existing)) {
      teamIdentities.set(identity.teamId, identity);
    }
  }
  return { teamIdentities: [...teamIdentities.values()].sort((a, b) => a.teamId.localeCompare(b.teamId)) };
}

export function importReepPeopleCsv(csvText, { sourceId, sourcePath, targetPlayerKeys } = {}) {
  const rows = parseCsv(csvText);
  const header = rows.shift();
  if (!header?.length) throw new Error("Reep people CSV is empty");
  const columnIndex = Object.fromEntries(header.map((column, index) => [column, index]));
  for (const column of ["reep_id", "name"]) {
    if (!(column in columnIndex)) throw new Error(`Reep people CSV missing column ${column}`);
  }

  const targetSet = targetPlayerKeys ? new Set(targetPlayerKeys) : undefined;
  const playerIdentities = new Map();
  for (const row of rows) {
    if (row.length === 1 && row[0] === "") continue;
    const type = columnIndex.type === undefined ? "player" : row[columnIndex.type];
    if (type && type !== "player") continue;
    const name = readCell(row, columnIndex, "name");
    const playerKey = playerKeyFor(name);
    if (targetSet && !targetSet.has(playerKey)) continue;
    const identity = {
      playerKey,
      reepId: readCell(row, columnIndex, "reep_id"),
      name,
      fullName: optionalCell(row, columnIndex, "full_name"),
      dateOfBirth: optionalCell(row, columnIndex, "date_of_birth"),
      nationality: optionalCell(row, columnIndex, "nationality"),
      position: optionalCell(row, columnIndex, "position"),
      providerIds: providerIdsFromRow(row, columnIndex),
      sourceRefs: [{ sourceId, path: sourcePath }],
    };
    const existing = playerIdentities.get(identity.playerKey);
    if (!existing || identityQualityScore(identity) > identityQualityScore(existing)) {
      playerIdentities.set(identity.playerKey, identity);
    }
  }
  return { playerIdentities: [...playerIdentities.values()].sort((a, b) => a.playerKey.localeCompare(b.playerKey)) };
}

export function importWikidataTeamsCsv(csvText, { sourceId, sourcePath, teamRegistry = [], targetTeamIds } = {}) {
  const rows = parseCsv(csvText);
  const header = rows.shift();
  if (!header?.length) throw new Error("Wikidata teams CSV is empty");
  const columnIndex = Object.fromEntries(header.map((column, index) => [column, index]));
  const wikidataColumn = firstDefinedColumn(columnIndex, ["wikidata_id", "wikidataId", "qid", "team", "item"]);
  const nameColumn = firstDefinedColumn(columnIndex, ["name", "label", "teamLabel"]);
  const fifaCodeColumn = firstDefinedColumn(columnIndex, ["fifa_code", "fifaCode", "code"]);
  if (wikidataColumn === undefined || nameColumn === undefined) {
    throw new Error("Wikidata teams CSV missing wikidata/name columns");
  }

  const targetSet = targetTeamIds ? new Set(targetTeamIds) : undefined;
  const teamIdentities = new Map();
  for (const row of rows) {
    if (row.length === 1 && row[0] === "") continue;
    const name = requireString(row[nameColumn], "wikidata team name");
    const team = teamFromName(normalizeWikidataTeamName(name), { teamRegistry });
    if (targetSet && !targetSet.has(team.teamId)) continue;
    const wikidataId = normalizeWikidataId(row[wikidataColumn]);
    if (!wikidataId) continue;
    const providerIds = { wikidataNationalTeam: wikidataId };
    const fifaCode = fifaCodeColumn === undefined ? undefined : optionalCell(row, columnIndex, header[fifaCodeColumn]);
    if (fifaCode) providerIds.fifaCountryCode = fifaCode;
    const identity = {
      teamId: team.teamId,
      name,
      providerIds,
      sourceRefs: [{ sourceId, path: sourcePath }],
    };
    const existing = teamIdentities.get(identity.teamId);
    if (!existing || providerIdCount(identity) > providerIdCount(existing)) {
      teamIdentities.set(identity.teamId, identity);
    }
  }
  return { teamIdentities: [...teamIdentities.values()].sort((a, b) => a.teamId.localeCompare(b.teamId)) };
}

export function importFifaSquadsJson(fifaSquadsJson, { sourceId, sourcePath, teamRegistry = [] } = {}) {
  const squads = Array.isArray(fifaSquadsJson) ? fifaSquadsJson : fifaSquadsJson?.squads;
  if (!Array.isArray(squads)) throw new Error("FIFA squads JSON must be an array or contain squads array");
  const rosters = [];
  const teams = new Map();

  for (const squad of squads) {
    const teamName = requireString(squad.team ?? squad.teamName ?? squad.country, "squad.team");
    const team = teamFromName(teamName, { teamRegistry });
    teams.set(team.teamId, team);
    const players = squad.players;
    if (!Array.isArray(players)) throw new Error(`${teamName} squad must contain players array`);
    rosters.push({
      teamId: team.teamId,
      teamName: team.name,
      rosterStatus: squad.rosterStatus ?? squad.status ?? "provisional",
      announcementDate: squad.announcementDate,
      sourceUrl: squad.sourceUrl,
      players: players.map((player, index) => {
        const name = requireString(typeof player === "string" ? player : player.name, `${teamName} player.name`);
        const normalizedPlayer = {
          playerKey: playerKeyFor(name),
          name,
          shirtNumber: typeof player === "string" ? undefined : parseOptionalInteger(player.shirtNumber ?? player.number),
          position: typeof player === "string" ? undefined : player.position,
          club: typeof player === "string" ? undefined : player.club,
          order: index + 1,
        };
        if (typeof player !== "string") {
          assignIfPresent(normalizedPlayer, "firstNames", player.firstNames);
          assignIfPresent(normalizedPlayer, "lastNames", player.lastNames);
          assignIfPresent(normalizedPlayer, "officialPlayerName", player.officialPlayerName);
          assignIfPresent(normalizedPlayer, "nameOnShirt", player.nameOnShirt);
          assignIfPresent(normalizedPlayer, "dateOfBirth", player.dateOfBirth);
          assignIfPresent(normalizedPlayer, "heightCm", parseOptionalInteger(player.heightCm));
        }
        return normalizedPlayer;
      }),
      sourceRefs: [{ sourceId, path: sourcePath, url: squad.sourceUrl }],
    });
  }

  return {
    teams: sortTeams([...teams.values()]),
    rosters: rosters.sort((a, b) => a.teamId.localeCompare(b.teamId)),
  };
}

export function buildSnapshotFromRawSources({
  openfootballJson,
  internationalResultsCsv,
  formerNamesCsv,
  shootoutsCsv,
  goalscorersCsv,
  reepTeamsCsv,
  reepPeopleCsv,
  wikidataTeamsCsv,
  fifaSquadsJson,
  simulateRosters = false,
  teamRegistry = [],
  venueRegistry = [],
  retrievedAt,
  sourceCommit,
}) {
  const openfootballSourceId = "openfootball-worldcup-json";
  const internationalResultsSourceId = "martj42-international-results";
  const scheduleImport = importWorldCupJson(openfootballJson, {
    sourceId: openfootballSourceId,
    sourcePath: "worldcup.json",
    teamRegistry,
    venueRegistry,
  });
  const formerNamesImport = formerNamesCsv
    ? importFormerNamesCsv(formerNamesCsv, {
        sourceId: internationalResultsSourceId,
        sourcePath: "former_names.csv",
        teamRegistry,
      })
    : { teams: [], formerNames: [] };
  const resultsImport = importInternationalResultsCsv(internationalResultsCsv, {
    sourceId: internationalResultsSourceId,
    sourcePath: "results.csv",
    teamRegistry,
    formerNames: formerNamesImport.formerNames,
  });
  const shootoutsImport = shootoutsCsv
    ? importShootoutsCsv(shootoutsCsv, {
        sourceId: internationalResultsSourceId,
        sourcePath: "shootouts.csv",
        teamRegistry,
        formerNames: formerNamesImport.formerNames,
      })
    : { teams: [], shootouts: [] };
  const goalscorersImport = goalscorersCsv
    ? importGoalscorersCsv(goalscorersCsv, {
        sourceId: internationalResultsSourceId,
        sourcePath: "goalscorers.csv",
        teamRegistry,
        formerNames: formerNamesImport.formerNames,
      })
    : { teams: [], goalscorers: [] };
  const baseTeams = mergeTeams(
    tagRegistryTeams(teamRegistry, "world-cup-copilot-team-registry"),
    scheduleImport.teams,
    formerNamesImport.teams,
    resultsImport.teams,
    shootoutsImport.teams,
    goalscorersImport.teams,
  );
  const targetPlayerKeys = new Set(goalscorersImport.goalscorers.map((goal) => playerKeyFor(goal.scorer)));
  const reepTeamImport = reepTeamsCsv
    ? importReepTeamsCsv(reepTeamsCsv, {
        sourceId: "withqwerty-reep",
        sourcePath: "data/teams.csv",
        teamRegistry,
        targetTeamIds: teamRegistry.map((team) => team.teamId),
      })
    : { teamIdentities: [] };
  const reepPeopleImport = reepPeopleCsv
    ? importReepPeopleCsv(reepPeopleCsv, {
        sourceId: "withqwerty-reep",
        sourcePath: "data/people.csv",
        targetPlayerKeys,
      })
    : { playerIdentities: [] };
  const wikidataTeamImport = wikidataTeamsCsv
    ? importWikidataTeamsCsv(wikidataTeamsCsv, {
        sourceId: "wikidata-national-football-teams",
        sourcePath: "wikidata-national-football-teams.csv",
        teamRegistry: baseTeams,
        targetTeamIds: baseTeams.map((team) => team.teamId),
      })
    : { teamIdentities: [] };
  const fifaSquadsImport = fifaSquadsJson
    ? importFifaSquadsJson(fifaSquadsJson, {
        sourceId: "fifa-squad-announcements-2026",
        sourcePath: "fifa-squads.json",
        teamRegistry: baseTeams,
      })
    : { teams: [], rosters: [] };
  return {
    sources: [
      ...(teamRegistry.length
        ? [
            {
              sourceId: "world-cup-copilot-team-registry",
              name: "World Cup Copilot curated team registry seed",
              publisher: "world-cup-copilot-data",
              url: "input/team-registry.seed.json",
              license: "project-curated-attributed",
              accessMethod: "local-seed",
              retrievedAt,
              sourceCommit,
              rightsNote: "Curated registry seed used to stabilize teamId, FIFA code, and aliases for known World Cup teams. It must be reconciled with Wikidata/FIFA IDs before being treated as a full national-team authority.",
            },
          ]
        : []),
      {
        sourceId: openfootballSourceId,
        name: "openfootball/worldcup.json",
        publisher: "openfootball",
        url: "https://github.com/openfootball/worldcup.json",
        license: "CC0-1.0",
        accessMethod: "github",
        retrievedAt,
        sourceCommit,
        rightsNote: "Public domain / CC0 project data. Used for World Cup schedule structure.",
      },
      {
        sourceId: internationalResultsSourceId,
        name: "martj42/international_results",
        publisher: "martj42",
        url: "https://github.com/martj42/international_results",
        license: "CC0-1.0",
        accessMethod: "github",
        retrievedAt,
        sourceCommit,
        rightsNote: "CC0 international results dataset. Used to derive head-to-head and form summaries.",
      },
      ...(reepTeamsCsv || reepPeopleCsv
        ? [
            {
              sourceId: "withqwerty-reep",
              name: "withqwerty/reep",
              publisher: "withqwerty",
              url: "https://github.com/withqwerty/reep",
              license: "CC0-1.0",
              accessMethod: "github",
              retrievedAt,
              sourceCommit,
              rightsNote: "Football entity register used for stable team and player identity mappings.",
            },
          ]
        : []),
      ...(wikidataTeamsCsv
        ? [
            {
              sourceId: "wikidata-national-football-teams",
              name: "Wikidata national football teams export",
              publisher: "Wikidata",
              url: "https://www.wikidata.org/",
              license: "CC0-1.0",
              accessMethod: "sparql-export",
              retrievedAt,
              sourceCommit,
              rightsNote: "Wikidata-derived national-team identity export. Use for QIDs and FIFA country-code reconciliation; do not promote team facts without sourceRefs.",
            },
          ]
        : []),
      ...(fifaSquadsJson
        ? [
            {
              sourceId: "fifa-squad-announcements-2026",
              name: "FIFA World Cup 2026 squad announcements",
              publisher: "FIFA",
              url: "https://www.fifa.com/en/articles/all-world-cup-squad-announcements",
              license: "official-public-page-attributed",
              accessMethod: "official-page-derived-json",
              retrievedAt,
              sourceCommit,
              rightsNote: "FIFA official squad announcement pages. Squads may remain provisional until FIFA confirms final lists; preserve rosterStatus and sourceUrl.",
            },
          ]
        : []),
    ],
    teams: mergeTeams(baseTeams, fifaSquadsImport.teams),
    venues: scheduleImport.venues,
    formerNames: formerNamesImport.formerNames,
    schedule: scheduleImport.schedule,
    internationalResults: resultsImport.internationalResults,
    shootouts: shootoutsImport.shootouts,
    goalscorers: goalscorersImport.goalscorers,
    teamIdentities: mergeTeamIdentities(reepTeamImport.teamIdentities, wikidataTeamImport.teamIdentities),
    playerIdentities: reepPeopleImport.playerIdentities,
    rosters: fifaSquadsImport.rosters,
    simulateRosters,
  };
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((cells) => cells.map((value) => value.trim()));
}

function teamFromName(name, { teamRegistry = [], formerNames = [] } = {}) {
  const cleanName = String(name).trim();
  if (isPlaceholderTeamName(cleanName)) {
    const placeholderId = `placeholder-${slugify(cleanName)}`;
    return {
      teamId: placeholderId,
      fifaCode: "TBD",
      name: cleanName,
      aliases: [cleanName, placeholderId],
      isPlaceholder: true,
      identityConfidence: "placeholder",
      identityStatus: "placeholder",
    };
  }
  const normalized = normalizeAlias(cleanName);
  const formerNameMatch = formerNames.find((entry) => entry.normalizedFormerName === normalized);
  const registryMatch = teamRegistry.find(
    (team) =>
      normalizeAlias(team.name) === normalized ||
      team.teamId === normalized ||
      team.fifaCode?.toLowerCase() === normalized ||
      (team.aliases ?? []).some((alias) => normalizeAlias(alias) === normalized) ||
      team.teamId === formerNameMatch?.teamId,
  );
  if (registryMatch) {
    return {
      teamId: registryMatch.teamId,
      fifaCode: registryMatch.fifaCode,
      name: registryMatch.name,
      aliases: [...new Set([registryMatch.name, registryMatch.fifaCode, ...(registryMatch.aliases ?? []), cleanName].filter(Boolean))],
      identityConfidence: "high",
      identityStatus: "registry",
      sourceRefs: registrySourceRefs(registryMatch),
      isPlaceholder: registryMatch.isPlaceholder === true,
    };
  }
  const knownFifaCode = KNOWN_FIFA_CODES[cleanName];
  const derivedCode = slugify(cleanName).slice(0, 3).toUpperCase();
  return {
    teamId: teamIdFromName(cleanName),
    fifaCode: knownFifaCode,
    derivedCode,
    name: cleanName,
    aliases: [cleanName, knownFifaCode].filter(Boolean),
    identityConfidence: "low",
    identityStatus: "inferred",
  };
}

function tagRegistryTeams(teamRegistry, sourceId) {
  return teamRegistry.map((team) => ({
    ...team,
    identityConfidence: team.identityConfidence ?? "high",
    identityStatus: team.identityStatus ?? "registry",
    sourceRefs: team.sourceRefs?.length ? team.sourceRefs : [{ sourceId, path: "input/team-registry.seed.json" }],
  }));
}

function teamWithSource(team, sourceId, sourcePath) {
  const sourceRef = { sourceId, path: sourcePath };
  if (team.identityStatus === "inferred" && team.identityConfidence === "low") {
    return {
      ...team,
      identityConfidence: "medium",
      identityStatus: "source-derived",
      sourceRefs: uniqueSourceRefs([...(team.sourceRefs ?? []), sourceRef]),
    };
  }
  if (team.identityStatus === "registry" || team.identityStatus === "reconciled") {
    return team;
  }
  return {
    ...team,
    sourceRefs: uniqueSourceRefs([...(team.sourceRefs ?? []), sourceRef]),
  };
}

function registrySourceRefs(team) {
  return team.sourceRefs?.length
    ? team.sourceRefs
    : [{ sourceId: "world-cup-copilot-team-registry", path: "input/team-registry.seed.json" }];
}

function teamIdFromName(name) {
  const stableIds = {
    Argentina: "arg",
    "Bosnia & Herzegovina": "bosnia-and-herzegovina",
    "Bosnia and Herzegovina": "bosnia-and-herzegovina",
    Brazil: "bra",
    "Cape Verde": "cape-verde",
    "Czech Republic": "czech-republic",
    Czechia: "czech-republic",
    "DR Congo": "dr-congo",
    France: "fra",
    Mexico: "mex",
    Morocco: "mar",
    "New Zealand": "new-zealand",
    "Saudi Arabia": "saudi-arabia",
    "South Africa": "rsa",
    "South Korea": "south-korea",
    "Korea Republic": "south-korea",
    "United States": "usa",
    USA: "usa",
  };
  if (stableIds[name]) return stableIds[name];
  return slugify(name);
}

function isPlaceholderTeamName(name) {
  return /^(?:[wl]\d+|ru\d+|[123][a-l](?:\/[a-l])*)$/i.test(String(name).trim());
}

function mergeTeams(...teamLists) {
  const teams = new Map();
  for (const team of teamLists.flat()) {
    const existing = teams.get(team.teamId);
    if (!existing) {
      teams.set(team.teamId, { ...team });
    } else {
      const betterIdentity = identitySourceScore(team) > identitySourceScore(existing) ? team : existing;
      teams.set(team.teamId, {
        ...existing,
        derivedCode: existing.derivedCode ?? team.derivedCode,
        identityConfidence: betterIdentity.identityConfidence ?? existing.identityConfidence,
        identityStatus: betterIdentity.identityStatus ?? existing.identityStatus,
        sourceRefs: uniqueSourceRefs([...(existing.sourceRefs ?? []), ...(team.sourceRefs ?? [])]),
        aliases: [...new Set([...(existing.aliases ?? []), ...(team.aliases ?? [])])],
        isPlaceholder: existing.isPlaceholder === true || team.isPlaceholder === true,
      });
    }
  }
  return sortTeams([...teams.values()]);
}

function identitySourceScore(team) {
  const confidenceScore = { high: 40, medium: 30, low: 10, placeholder: 0 }[team.identityConfidence] ?? 0;
  const statusScore = { registry: 40, reconciled: 35, "source-derived": 25, inferred: 10, placeholder: 0 }[team.identityStatus] ?? 0;
  return confidenceScore + statusScore + (team.sourceRefs?.length ? 5 : 0);
}

function sortTeams(teams) {
  return teams.sort((a, b) => a.teamId.localeCompare(b.teamId));
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function parseKickoffUtc(date, time) {
  const dateText = requireString(date, "match.date");
  const timeText = time ? String(time).trim() : "00:00";
  const offsetMatch = timeText.match(/^(\d{1,2}:\d{2})(?:\s+UTC([+-]\d{1,2}))?$/);
  if (!offsetMatch) return new Date(`${dateText}T00:00:00.000Z`).toISOString();
  const [, normalizedTime, offsetHoursText] = offsetMatch;
  if (!offsetHoursText) return new Date(`${dateText}T${normalizedTime}:00.000Z`).toISOString();
  const [hours, minutes] = normalizedTime.split(":").map((part) => Number.parseInt(part, 10));
  const offsetHours = Number.parseInt(offsetHoursText, 10);
  const utcMillis = Date.UTC(...dateText.split("-").map((part, index) => Number.parseInt(part, 10) - (index === 1 ? 1 : 0)), hours - offsetHours, minutes);
  return new Date(utcMillis).toISOString();
}

function parseLocalKickoff(date, time) {
  const localDate = requireString(date, "match.date");
  const timeText = time ? String(time).trim() : "00:00";
  const offsetMatch = timeText.match(/^(\d{1,2}:\d{2})(?:\s+UTC([+-]\d{1,2}))?$/);
  if (!offsetMatch) {
    return { localDate, localTime: "00:00", timezone: "UTC" };
  }
  const [, localTime, offsetHoursText] = offsetMatch;
  return {
    localDate,
    localTime,
    timezone: offsetHoursText ? `UTC${offsetHoursText}` : "UTC",
  };
}

function parseScore(value, date, homeName, awayName) {
  const score = Number.parseInt(value, 10);
  if (!Number.isInteger(score) || score < 0) {
    throw new Error(`Invalid score ${value} for ${date} ${homeName} vs ${awayName}`);
  }
  return score;
}

function isMissingScore(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !normalized || normalized === "na" || normalized === "nan";
}

function parseOptionalInteger(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function parseBoolean(value) {
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function readCell(row, columnIndex, columnName) {
  return requireString(row[columnIndex[columnName]], columnName);
}

function optionalCell(row, columnIndex, columnName) {
  if (columnIndex[columnName] === undefined) return undefined;
  const value = String(row[columnIndex[columnName]] ?? "").trim();
  return value || undefined;
}

function assignIfPresent(target, key, value) {
  if (value !== undefined && value !== null && value !== "") {
    target[key] = value;
  }
}

function providerIdsFromRow(row, columnIndex) {
  const providerIds = {};
  for (const [column, index] of Object.entries(columnIndex)) {
    if (!column.startsWith("key_")) continue;
    const value = String(row[index] ?? "").trim();
    if (!value) continue;
    providerIds[column.slice(4)] = value;
  }
  return providerIds;
}

function firstDefinedColumn(columnIndex, names) {
  return names.map((name) => columnIndex[name]).find((index) => index !== undefined);
}

function normalizeWikidataId(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/Q\d+$/i);
  return match ? match[0].toUpperCase() : text.toUpperCase();
}

function normalizeWikidataTeamName(name) {
  return String(name)
    .replace(/\s+(?:men's|women's)\s+national\s+(?:association\s+)?(?:football|soccer)\s+team$/i, "")
    .replace(/\s+national\s+(?:association\s+)?(?:football|soccer)\s+team$/i, "")
    .trim();
}

function mergeTeamIdentities(...identityLists) {
  const identities = new Map();
  for (const identity of identityLists.flat()) {
    const existing = identities.get(identity.teamId);
    if (!existing) {
      identities.set(identity.teamId, identity);
      continue;
    }
    identities.set(identity.teamId, {
      ...existing,
      name: existing.name || identity.name,
      providerIds: {
        ...(existing.providerIds ?? {}),
        ...(identity.providerIds ?? {}),
      },
      sourceRefs: uniqueSourceRefs([...(existing.sourceRefs ?? []), ...(identity.sourceRefs ?? [])]),
    });
  }
  return [...identities.values()].sort((a, b) => a.teamId.localeCompare(b.teamId));
}

function uniqueSourceRefs(refs) {
  const byKey = new Map();
  for (const ref of refs.filter(Boolean)) {
    byKey.set(`${ref.sourceId}:${ref.path ?? ""}`, ref);
  }
  return [...byKey.values()].sort((a, b) => `${a.sourceId}:${a.path ?? ""}`.localeCompare(`${b.sourceId}:${b.path ?? ""}`));
}

function providerIdCount(identity) {
  return Object.keys(identity.providerIds ?? {}).length;
}

function identityQualityScore(identity) {
  return (
    providerIdCount(identity) * 10 +
    (identity.fullName ? 3 : 0) +
    (identity.dateOfBirth ? 2 : 0) +
    (identity.nationality ? 1 : 0) +
    (identity.position ? 1 : 0)
  );
}

function requireString(value, label) {
  const result = String(value ?? "").trim();
  if (!result) {
    throw new Error(`Missing ${label}`);
  }
  return result;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function playerKeyFor(value) {
  return normalizeAlias(value).replace(/\s+/g, "-") || "unknown-player";
}
