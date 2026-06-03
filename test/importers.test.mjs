import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSnapshotFromRawSources,
  importFormerNamesCsv,
  importGoalscorersCsv,
  importInternationalResultsCsv,
  importFifaSquadsJson,
  importReepPeopleCsv,
  importReepTeamsCsv,
  importShootoutsCsv,
  importWikidataTeamsCsv,
  importWorldCupJson,
} from "../scripts/lib/importers.mjs";
import { buildPhaseAData } from "../scripts/lib/phase-a.mjs";

const openfootballFixture = {
  name: "World Cup 2026",
  rounds: [
    {
      name: "Matchday 1",
      matches: [
        {
          num: 1,
          date: "2026-06-11",
          time: "19:00",
          team1: "Mexico",
          team2: "South Africa",
          group: "Group A",
          stadium: "Estadio Azteca",
          city: "Mexico City",
          country: "Mexico",
        },
        {
          num: 2,
          date: "2026-06-13",
          time: "22:00",
          team1: "Brazil",
          team2: "Morocco",
          group: "Group C",
          stadium: "MetLife Stadium",
          city: "East Rutherford",
          country: "United States",
        },
      ],
    },
  ],
};

const internationalResultsCsv = `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
2010-06-11,South Africa,Mexico,1,1,FIFA World Cup,Johannesburg,South Africa,FALSE
2022-11-30,"South Africa",Mexico,2,1,Friendly,Doha,Qatar,TRUE
2023-03-25,Morocco,Brazil,2,1,Friendly,Tangier,Morocco,FALSE
`;

const registryFixture = [
  {
    teamId: "civ",
    fifaCode: "CIV",
    name: "Cote d'Ivoire",
    aliases: ["Cote d'Ivoire", "Côte d'Ivoire", "Ivory Coast"],
  },
  {
    teamId: "mex",
    fifaCode: "MEX",
    name: "Mexico",
    aliases: ["Mexico", "MEX"],
  },
];

const formerNamesCsv = `current,former,start_date,end_date
Cote d'Ivoire,Ivory Coast,1960-01-01,1985-01-01
Mexico,México,1900-01-01,2026-01-01
`;

const shootoutsCsv = `date,home_team,away_team,winner,first_shooter
2010-06-11,South Africa,Mexico,Mexico,South Africa
`;

const goalscorersCsv = `date,home_team,away_team,team,scorer,minute,own_goal,penalty
2010-06-11,South Africa,Mexico,Mexico,Rafael Marquez,79,FALSE,FALSE
2010-06-11,South Africa,Mexico,South Africa,Siphiwe Tshabalala,55,FALSE,FALSE
`;

const reepTeamsCsv = `reep_id,key_wikidata,name,country,key_transfermarkt,key_api_football
reep_t_mex,Q96,Mexico,Mexico,6303,16
reep_t_rsa,Q258,South Africa,South Africa,3806,403
reep_t_unrelated,Q1,Unrelated FC,Nowhere,9999,9999
`;

const reepPeopleCsv = `reep_id,key_wikidata,type,name,full_name,date_of_birth,nationality,position,key_transfermarkt,key_fbref,key_api_football
reep_p_lozano,Q2047110,player,Hirving Lozano,Hirving Rodrigo Lozano Bahena,1995-07-30,Mexico,left winger,316889,examplefbref,154
reep_p_lozano_sparse,,player,Hirving Lozano,,,,,,,
reep_p_marquez,Q281117,player,Rafael Marquez,Rafael Marquez Alvarez,1979-02-13,Mexico,centre back,4352,rafael-marquez,150
reep_p_unrelated,Q2,player,Unrelated Player,Unrelated Player,1990-01-01,Nowhere,forward,9999,unused,9999
`;

const wikidataTeamsCsv = `team,teamLabel,fifaCode
http://www.wikidata.org/entity/Q164089,Mexico men's national football team,MEX
Q258,South Africa men's national soccer team,RSA
Q1,Unrelated national football team,ZZZ
`;

const fifaSquadsFixture = {
  squads: [
    {
      team: "Mexico",
      rosterStatus: "provisional",
      announcementDate: "2026-05-22",
      sourceUrl: "https://www.fifa.com/en/articles/mexico-squad-announcement",
      players: [
        { name: "Hirving Lozano", position: "Forward", club: "San Diego FC", shirtNumber: 22 },
        { name: "Rafael Marquez", position: "Defender", club: "Atlas", shirtNumber: 4 },
      ],
    },
  ],
};

test("imports openfootball World Cup JSON into normalized schedule and team taxonomy", () => {
  const result = importWorldCupJson(openfootballFixture, {
    sourceId: "openfootball-worldcup-json",
    sourcePath: "worldcup.json",
    venueRegistry: [
      {
        venueId: "estadio-azteca",
        displayName: "Estadio Azteca",
        aliases: ["Estadio Azteca", "Mexico City Stadium"],
      },
    ],
  });

  assert.deepEqual(
    result.teams.map((team) => [team.teamId, team.name]),
    [
      ["bra", "Brazil"],
      ["mar", "Morocco"],
      ["mex", "Mexico"],
      ["rsa", "South Africa"],
    ],
  );
  assert.equal(result.schedule[0].matchId, "wc-2026-001-mex-rsa");
  assert.equal(result.schedule[0].kickoffUtc, "2026-06-11T19:00:00.000Z");
  assert.equal(result.schedule[0].localDate, "2026-06-11");
  assert.equal(result.schedule[0].localTime, "19:00");
  assert.equal(result.schedule[0].timezone, "UTC");
  assert.deepEqual(result.venues[0], {
    venueId: "estadio-azteca",
    displayName: "Estadio Azteca",
    city: "Mexico City",
    country: "Mexico",
    aliases: ["Estadio Azteca", "Mexico City Stadium"],
    sourceRefs: [{ sourceId: "openfootball-worldcup-json", path: "worldcup.json" }],
  });
  assert.equal(result.schedule[0].sourceRefs[0].sourceId, "openfootball-worldcup-json");
});

test("imports real openfootball top-level matches with UTC offsets", () => {
  const result = importWorldCupJson(
    {
      name: "World Cup 2026",
      matches: [
        {
          round: "Matchday 1",
          date: "2026-06-11",
          time: "13:00 UTC-6",
          team1: "Mexico",
          team2: "South Africa",
          group: "Group A",
          ground: "Mexico City",
        },
      ],
    },
    {
      sourceId: "openfootball-worldcup-json",
      sourcePath: "worldcup.json",
      teamRegistry: registryFixture,
    },
  );

  assert.equal(result.schedule[0].matchId, "wc-2026-001-mex-rsa");
  assert.equal(result.schedule[0].kickoffUtc, "2026-06-11T19:00:00.000Z");
  assert.equal(result.schedule[0].venueId, "mexico-city");
  assert.equal(result.schedule[0].localTime, "13:00");
  assert.equal(result.schedule[0].timezone, "UTC-6");
});

test("uses stable FIFA codes for schedule teams instead of naive three-letter fallback", () => {
  const result = importWorldCupJson(
    {
      matches: [
        { date: "2026-06-11", team1: "Austria", team2: "Australia" },
        { date: "2026-06-12", team1: "Iran", team2: "Iraq" },
        { date: "2026-06-13", team1: "Japan", team2: "South Korea" },
      ],
    },
    {
      sourceId: "openfootball-worldcup-json",
      sourcePath: "worldcup.json",
    },
  );

  const codes = Object.fromEntries(result.teams.map((team) => [team.name, team.fifaCode]));
  const ids = Object.fromEntries(result.teams.map((team) => [team.name, team.teamId]));
  assert.equal(codes.Austria, "AUT");
  assert.equal(codes.Australia, "AUS");
  assert.equal(codes.Iran, "IRN");
  assert.equal(codes.Iraq, "IRQ");
  assert.equal(codes.Japan, "JPN");
  assert.equal(codes["South Korea"], "KOR");
  assert.equal(ids.Austria, "austria");
  assert.equal(ids.Australia, "australia");
  assert.equal(ids.Iran, "iran");
  assert.equal(ids.Iraq, "iraq");
  assert.equal(ids.Japan, "japan");
  assert.equal(ids["South Korea"], "south-korea");
});

test("keeps derived short codes separate from official FIFA codes", () => {
  const result = importInternationalResultsCsv(
    "date,home_team,away_team,home_score,away_score,tournament,city,country,neutral\n2024-01-01,Belarus,Belize,1,1,Friendly,Minsk,Belarus,FALSE\n",
    {
      sourceId: "martj42-international-results",
      sourcePath: "results.csv",
    },
  );

  const byName = Object.fromEntries(result.teams.map((team) => [team.name, team]));
  assert.equal(byName.Belarus.fifaCode, undefined);
  assert.equal(byName.Belarus.derivedCode, "BEL");
  assert.equal(byName.Belarus.identityStatus, "source-derived");
  assert.equal(byName.Belize.fifaCode, undefined);
  assert.equal(byName.Belize.derivedCode, "BEL");
  assert.equal(byName.Belize.aliases.includes("BEL"), false);
});

test("imports openfootball knockout placeholders as non-real teams", () => {
  const result = importWorldCupJson(
    {
      name: "World Cup 2026",
      matches: [
        {
          num: 103,
          round: "Third place play-off",
          date: "2026-07-18",
          time: "18:00 UTC-4",
          team1: "L10",
          team2: "L10",
          ground: "Hard Rock Stadium",
        },
        {
          num: 74,
          round: "Round of 32",
          date: "2026-06-29",
          time: "16:30 UTC-4",
          team1: "1E",
          team2: "3A/B/C/D/F",
          ground: "Boston (Foxborough)",
        },
      ],
    },
    {
      sourceId: "openfootball-worldcup-json",
      sourcePath: "worldcup.json",
    },
  );

  const thirdPlace = result.schedule.find((match) => match.matchId.startsWith("wc-2026-103-"));
  const roundOf32 = result.schedule.find((match) => match.matchId.startsWith("wc-2026-074-"));
  assert.equal(thirdPlace.matchId, "wc-2026-103-placeholder-l10-placeholder-l10");
  assert.equal(thirdPlace.homeTeamId, "placeholder-l10");
  assert.equal(roundOf32.matchId, "wc-2026-074-placeholder-1e-placeholder-3a-b-c-d-f");
  assert.equal(roundOf32.homeTeamId, "placeholder-1e");
  assert.equal(roundOf32.awayTeamId, "placeholder-3a-b-c-d-f");
  assert.equal(result.teams.every((team) => team.isPlaceholder), true);
  assert.equal(result.teams.every((team) => team.fifaCode === "TBD"), true);
  assert.equal(result.teams.every((team) => team.identityStatus === "placeholder"), true);
  assert.equal(result.teams.every((team) => team.identityConfidence === "placeholder"), true);
});

test("uses team registry and former names for stable team identity", () => {
  const formerNames = importFormerNamesCsv(formerNamesCsv, {
    sourceId: "martj42-international-results",
    sourcePath: "former_names.csv",
    teamRegistry: registryFixture,
  });
  const result = importInternationalResultsCsv(
    "date,home_team,away_team,home_score,away_score,tournament,city,country,neutral\n2024-01-01,Ivory Coast,Mexico,1,0,Friendly,Abidjan,Cote d'Ivoire,FALSE\n",
    {
      sourceId: "martj42-international-results",
      sourcePath: "results.csv",
      teamRegistry: registryFixture,
      formerNames: formerNames.formerNames,
    },
  );

  assert.equal(result.teams.find((team) => team.teamId === "civ").name, "Cote d'Ivoire");
  assert.equal(result.teams.find((team) => team.teamId === "civ").identityStatus, "registry");
  assert.equal(result.teams.find((team) => team.teamId === "civ").identityConfidence, "high");
  assert.equal(result.internationalResults[0].homeTeamId, "civ");
  assert.deepEqual(
    formerNames.formerNames.map((entry) => [entry.teamId, entry.formerName]),
    [
      ["civ", "Ivory Coast"],
      ["mex", "México"],
    ],
  );
});

test("uses team registry for openfootball schedule teams", () => {
  const result = importWorldCupJson(
    {
      rounds: [
        {
          name: "Matchday 1",
          matches: [
            {
              num: 3,
              date: "2026-06-14",
              time: "18:00",
              team1: "Côte d'Ivoire",
              team2: "Mexico",
              stadium: "Test Stadium",
              city: "Test City",
              country: "United States",
            },
          ],
        },
      ],
    },
    {
      sourceId: "openfootball-worldcup-json",
      sourcePath: "worldcup.json",
      teamRegistry: registryFixture,
    },
  );

  assert.equal(result.schedule[0].homeTeamId, "civ");
  assert.equal(result.schedule[0].matchId, "wc-2026-003-civ-mex");
  assert.equal(result.teams.find((team) => team.teamId === "civ").identityStatus, "registry");
});

test("imports international_results CSV with quoted fields and neutral booleans", () => {
  const result = importInternationalResultsCsv(internationalResultsCsv, {
    sourceId: "martj42-international-results",
    sourcePath: "results.csv",
  });

  assert.equal(result.internationalResults.length, 3);
  assert.deepEqual(result.teams.map((team) => team.teamId), ["bra", "mar", "mex", "rsa"]);
  assert.equal(result.internationalResults[1].matchId, "int-2022-11-30-rsa-mex");
  assert.equal(result.internationalResults[1].neutral, true);
  assert.equal(result.internationalResults[2].homeScore, 2);
});

test("skips future international fixtures with NA scores", () => {
  const result = importInternationalResultsCsv(
    `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
2026-06-11,Mexico,South Africa,NA,NA,FIFA World Cup,Mexico City,Mexico,FALSE
2023-03-25,Morocco,Brazil,2,1,Friendly,Tangier,Morocco,FALSE
`,
    {
      sourceId: "martj42-international-results",
      sourcePath: "results.csv",
    },
  );

  assert.equal(result.internationalResults.length, 1);
  assert.equal(result.internationalResults[0].matchId, "int-2023-03-25-mar-bra");
});

test("keeps same-day duplicate international fixtures with stable sequence IDs", () => {
  const result = importInternationalResultsCsv(
    `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
1974-02-17,Tahiti,New Caledonia,2,1,Friendly,Papeete,Tahiti,FALSE
1974-02-17,Tahiti,New Caledonia,1,2,Friendly,Papeete,Tahiti,FALSE
`,
    {
      sourceId: "martj42-international-results",
      sourcePath: "results.csv",
    },
  );

  assert.deepEqual(
    result.internationalResults.map((match) => match.matchId),
    ["int-1974-02-17-tahiti-new-caledonia", "int-1974-02-17-tahiti-new-caledonia-2"],
  );
});

test("imports shootouts and goalscorers with source references", () => {
  const shootouts = importShootoutsCsv(shootoutsCsv, {
    sourceId: "martj42-international-results",
    sourcePath: "shootouts.csv",
  });
  const goalscorers = importGoalscorersCsv(goalscorersCsv, {
    sourceId: "martj42-international-results",
    sourcePath: "goalscorers.csv",
  });

  assert.deepEqual(shootouts.shootouts[0], {
    matchKey: "2010-06-11-rsa-mex",
    date: "2010-06-11",
    homeTeamId: "rsa",
    awayTeamId: "mex",
    winnerTeamId: "mex",
    firstShooterTeamId: "rsa",
    sourceRefs: [{ sourceId: "martj42-international-results", path: "shootouts.csv" }],
  });
  assert.equal(goalscorers.goalscorers.length, 2);
  assert.equal(goalscorers.goalscorers[0].scorer, "Rafael Marquez");
  assert.equal(goalscorers.goalscorers[0].penalty, false);
});

test("imports Reep team identities against local team registry", () => {
  const result = importReepTeamsCsv(reepTeamsCsv, {
    sourceId: "withqwerty-reep",
    sourcePath: "data/teams.csv",
    teamRegistry: registryFixture,
    targetTeamIds: ["mex"],
  });

  assert.equal(result.teamIdentities.length, 1);
  assert.deepEqual(result.teamIdentities[0], {
    teamId: "mex",
    reepId: "reep_t_mex",
    name: "Mexico",
    providerIds: {
      api_football: "16",
      transfermarkt: "6303",
      wikidata: "Q96",
    },
    sourceRefs: [{ sourceId: "withqwerty-reep", path: "data/teams.csv" }],
  });
});

test("imports Reep player identities as player-context records", () => {
  const result = importReepPeopleCsv(reepPeopleCsv, {
    sourceId: "withqwerty-reep",
    sourcePath: "data/people.csv",
    targetPlayerKeys: new Set(["hirving-lozano"]),
  });

  assert.equal(result.playerIdentities.length, 1);
  assert.deepEqual(result.playerIdentities[0], {
    playerKey: "hirving-lozano",
    reepId: "reep_p_lozano",
    name: "Hirving Lozano",
    fullName: "Hirving Rodrigo Lozano Bahena",
    dateOfBirth: "1995-07-30",
    nationality: "Mexico",
    position: "left winger",
    providerIds: {
      api_football: "154",
      fbref: "examplefbref",
      transfermarkt: "316889",
      wikidata: "Q2047110",
    },
    sourceRefs: [{ sourceId: "withqwerty-reep", path: "data/people.csv" }],
  });
});

test("imports Wikidata national-team identities against package teams", () => {
  const result = importWikidataTeamsCsv(wikidataTeamsCsv, {
    sourceId: "wikidata-national-football-teams",
    sourcePath: "wikidata-national-football-teams.csv",
    teamRegistry: [
      ...registryFixture,
      { teamId: "rsa", fifaCode: "RSA", name: "South Africa", aliases: ["South Africa", "South Africa men's national soccer team"] },
    ],
    targetTeamIds: ["mex", "rsa"],
  });

  assert.deepEqual(result.teamIdentities, [
    {
      teamId: "mex",
      name: "Mexico men's national football team",
      providerIds: {
        fifaCountryCode: "MEX",
        wikidataNationalTeam: "Q164089",
      },
      sourceRefs: [{ sourceId: "wikidata-national-football-teams", path: "wikidata-national-football-teams.csv" }],
    },
    {
      teamId: "rsa",
      name: "South Africa men's national soccer team",
      providerIds: {
        fifaCountryCode: "RSA",
        wikidataNationalTeam: "Q258",
      },
      sourceRefs: [{ sourceId: "wikidata-national-football-teams", path: "wikidata-national-football-teams.csv" }],
    },
  ]);
});

test("imports FIFA squad announcement JSON as provisional roster facts", () => {
  const result = importFifaSquadsJson(fifaSquadsFixture, {
    sourceId: "fifa-squad-announcements-2026",
    sourcePath: "fifa-squads.json",
    teamRegistry: registryFixture,
  });

  assert.equal(result.teams[0].teamId, "mex");
  assert.deepEqual(result.rosters[0], {
    teamId: "mex",
    teamName: "Mexico",
    rosterStatus: "provisional",
    announcementDate: "2026-05-22",
    sourceUrl: "https://www.fifa.com/en/articles/mexico-squad-announcement",
    players: [
      { playerKey: "hirving-lozano", name: "Hirving Lozano", shirtNumber: 22, position: "Forward", club: "San Diego FC", order: 1 },
      { playerKey: "rafael-marquez", name: "Rafael Marquez", shirtNumber: 4, position: "Defender", club: "Atlas", order: 2 },
    ],
    sourceRefs: [
      {
        sourceId: "fifa-squad-announcements-2026",
        path: "fifa-squads.json",
        url: "https://www.fifa.com/en/articles/mexico-squad-announcement",
      },
    ],
  });
});

test("builds a generated package from raw source imports", () => {
  const snapshot = buildSnapshotFromRawSources({
    openfootballJson: openfootballFixture,
    internationalResultsCsv,
    formerNamesCsv,
    shootoutsCsv,
    goalscorersCsv,
    reepTeamsCsv,
    reepPeopleCsv,
    wikidataTeamsCsv,
    fifaSquadsJson: fifaSquadsFixture,
    teamRegistry: registryFixture,
    retrievedAt: "2026-05-26T00:00:00Z",
    sourceCommit: "fixture",
  });
  const packageFiles = buildPhaseAData({
    snapshot,
    dataVersion: "2026.05.26+import-test",
    generatedAt: "2026-05-26T12:00:00Z",
    gitCommit: "fixture",
  });

  const headToHead = JSON.parse(packageFiles.get("data/history/head-to-head/mex__rsa.json"));
  const mexicoForm = JSON.parse(packageFiles.get("data/history/form/mex.json"));
  const formerNames = JSON.parse(packageFiles.get("data/taxonomy/former-names.json"));
  const shootouts = JSON.parse(packageFiles.get("data/history/shootouts.json"));
  const goalscorersIndex = JSON.parse(packageFiles.get("data/history/goalscorers/index.json"));
  const mexicoGoals = JSON.parse(packageFiles.get("data/history/goalscorers/by-team/mex.json"));
  const teamIdentities = JSON.parse(packageFiles.get("data/taxonomy/team-identities.json"));
  const playerIndex = JSON.parse(packageFiles.get("data/players/players-index.json"));
  const marquezIdentity = JSON.parse(packageFiles.get("data/players/identities/rafael-marquez.json"));
  const rosterIndex = JSON.parse(packageFiles.get("data/rosters/worldcup-2026/index.json"));
  const mexicoRoster = JSON.parse(packageFiles.get("data/rosters/worldcup-2026/mex.json"));
  const currentKeyPlayerIndex = JSON.parse(packageFiles.get("data/profiles/key-players/current/index.json"));
  const mexicoCurrentKeyPlayerIndex = JSON.parse(packageFiles.get("data/profiles/key-players/current/mex/index.json"));
  const marquezCurrentProfile = JSON.parse(packageFiles.get("data/profiles/key-players/current/mex/rafael-marquez.json"));
  const layerIndex = JSON.parse(packageFiles.get("data/metadata/layer-index.json"));
  const coverage = JSON.parse(packageFiles.get("data/metadata/coverage.json"));
  const sourceAudit = JSON.parse(packageFiles.get("data/metadata/source-audit.json"));

  assert.equal(snapshot.sources.length, 6);
  assert.equal(snapshot.sources.some((source) => source.sourceId === "world-cup-copilot-team-registry"), true);
  assert.deepEqual(snapshot.teams.find((team) => team.teamId === "mex").sourceRefs, [
    { sourceId: "world-cup-copilot-team-registry", path: "input/team-registry.seed.json" },
  ]);
  assert.equal(headToHead.allTime.matches, 2);
  assert.deepEqual(mexicoForm.windows.last5, {
    matches: 2,
    wins: 0,
    draws: 1,
    losses: 1,
    goalsFor: 2,
    goalsAgainst: 3,
  });
  assert.equal(formerNames.length, 2);
  assert.equal(shootouts[0].winnerTeamId, "mex");
  assert.equal(goalscorersIndex.goalCount, 2);
  assert.equal(mexicoGoals.topScorers[0].scorer, "Rafael Marquez");
  assert.equal(teamIdentities.find((identity) => identity.teamId === "mex").providerIds.wikidata, "Q96");
  assert.equal(teamIdentities.find((identity) => identity.teamId === "mex").providerIds.fifaCountryCode, "MEX");
  assert.equal(teamIdentities.find((identity) => identity.teamId === "mex").providerIds.wikidataNationalTeam, "Q164089");
  assert.equal(teamIdentities.find((identity) => identity.teamId === "mex").sourceRefs.length, 2);
  assert.equal(playerIndex.playerCount, 1);
  assert.equal(marquezIdentity.reepId, "reep_p_marquez");
  assert.equal(rosterIndex.rosterCount, 1);
  assert.equal(mexicoRoster.rosterStatus, "provisional");
  assert.equal(mexicoRoster.players[0].playerKey, "hirving-lozano");
  assert.equal(currentKeyPlayerIndex.profileCount, 2);
  assert.equal(layerIndex.layers.some((layer) => layer.layerId === "match-detection" && layer.categories.includes("identification.matches")), true);
  assert.equal(layerIndex.layers.some((layer) => layer.layerId === "current-roster-analysis" && layer.categories.includes("profiles.keyPlayersCurrent")), true);
  assert.equal(mexicoCurrentKeyPlayerIndex.profileStatus, "available-provisional");
  assert.equal(mexicoCurrentKeyPlayerIndex.profiles[0].playerKey, "rafael-marquez");
  assert.equal(marquezCurrentProfile.profileStatus, "available-provisional");
  assert.equal(marquezCurrentProfile.historicalNationalTeamGoals, 1);
  assert.equal(marquezCurrentProfile.roster.sourceUrl, "https://www.fifa.com/en/articles/mexico-squad-announcement");
  assert.equal(coverage.qualitySignals.rosters.status, "available-provisional");
  assert.equal(coverage.layers.find((layer) => layer.layerId === "official-rosters").status, "available-provisional");
  assert.equal(coverage.layers.find((layer) => layer.layerId === "key-player-profiles").status, "available-provisional");
  assert.equal(sourceAudit.layers.find((layer) => layer.layerId === "official-rosters").status, "provisional-packaged");
  assert.equal(sourceAudit.switchPolicy.comparisonDimensions.includes("redistributability"), true);
  assert.equal(sourceAudit.candidateComparisons.some((layer) => layer.layerId === "official-rosters"), true);
  assert.equal(
    sourceAudit.candidateComparisons.flatMap((layer) => layer.candidates).some((candidate) => candidate.strictlyBetterThanCurrent),
    false,
  );
});

test("final FIFA rosters do not expose simulated roster candidates in source audit", () => {
  const finalSquadsFixture = structuredClone(fifaSquadsFixture);
  for (const squad of finalSquadsFixture.squads) {
    squad.rosterStatus = "final";
  }
  const snapshot = buildSnapshotFromRawSources({
    openfootballJson: openfootballFixture,
    internationalResultsCsv,
    fifaSquadsJson: finalSquadsFixture,
    teamRegistry: registryFixture,
    retrievedAt: "2026-06-03T00:00:00Z",
    sourceCommit: "fixture",
  });
  const packageFiles = buildPhaseAData({
    snapshot,
    dataVersion: "2026.06.03+final-audit-test",
    generatedAt: "2026-06-03T02:23:00.000Z",
    gitCommit: "fixture",
  });
  const sourceAudit = JSON.parse(packageFiles.get("data/metadata/source-audit.json"));
  const officialRosters = sourceAudit.layers.find((layer) => layer.layerId === "official-rosters");

  assert.equal(officialRosters.status, "final-packaged");
  assert.deepEqual(officialRosters.primarySourceIds, ["fifa-squad-announcements-2026"]);
  assert.deepEqual(officialRosters.candidateSourceIds, ["fifa-squad-announcements-2026"]);
});
