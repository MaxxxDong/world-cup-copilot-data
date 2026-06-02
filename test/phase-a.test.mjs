import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPhaseAData,
  validatePackage,
  writePackage,
} from "../scripts/lib/phase-a.mjs";

const fixture = {
  sources: [
    {
      sourceId: "openfootball-worldcup-json",
      name: "openfootball/worldcup.json",
      publisher: "openfootball",
      url: "https://github.com/openfootball/worldcup.json",
      license: "CC0-1.0",
      accessMethod: "github",
      retrievedAt: "2026-05-26T00:00:00Z",
      sourceCommit: "fixture",
      rightsNote: "Public domain / CC0 project data.",
    },
    {
      sourceId: "martj42-international-results",
      name: "martj42/international_results",
      publisher: "martj42",
      url: "https://github.com/martj42/international_results",
      license: "CC0-1.0",
      accessMethod: "github",
      retrievedAt: "2026-05-26T00:00:00Z",
      sourceCommit: "fixture",
      rightsNote: "International results dataset used for derived summaries.",
    },
    {
      sourceId: "withqwerty-reep",
      name: "withqwerty/reep",
      publisher: "withqwerty",
      url: "https://github.com/withqwerty/reep",
      license: "CC0-1.0",
      accessMethod: "github",
      retrievedAt: "2026-05-26T00:00:00Z",
      sourceCommit: "fixture",
      rightsNote: "Football entity register used for identity mappings.",
    },
  ],
  teams: [
    { teamId: "arg", fifaCode: "ARG", name: "Argentina", aliases: ["Argentina", "ARG"] },
    { teamId: "bra", fifaCode: "BRA", name: "Brazil", aliases: ["Brazil", "BRA"] },
    { teamId: "fra", fifaCode: "FRA", name: "France", aliases: ["France", "FRA"] },
  ],
  schedule: [
    {
      matchId: "wc-2026-sample-arg-bra",
      competitionId: "fifa-world-cup-2026",
      stage: "group",
      kickoffUtc: "2026-06-12T01:00:00Z",
      homeTeamId: "arg",
      awayTeamId: "bra",
      venueId: "metlife-stadium",
      city: "East Rutherford",
      country: "United States",
      sourceRefs: [{ sourceId: "openfootball-worldcup-json", path: "worldcup.json" }],
    },
  ],
  venues: [
    {
      venueId: "metlife-stadium",
      displayName: "MetLife Stadium",
      city: "East Rutherford",
      country: "United States",
      aliases: ["MetLife Stadium"],
      sourceRefs: [{ sourceId: "openfootball-worldcup-json", path: "worldcup.json" }],
    },
  ],
  internationalResults: [
    {
      matchId: "int-2022-06-11-bra-arg",
      date: "2022-06-11",
      homeTeamId: "bra",
      awayTeamId: "arg",
      homeScore: 1,
      awayScore: 0,
      tournament: "Friendly",
      neutral: true,
      sourceRefs: [{ sourceId: "martj42-international-results", path: "results.csv" }],
    },
    {
      matchId: "int-2022-12-18-arg-fra",
      date: "2022-12-18",
      homeTeamId: "arg",
      awayTeamId: "fra",
      homeScore: 3,
      awayScore: 3,
      tournament: "FIFA World Cup",
      neutral: true,
      sourceRefs: [{ sourceId: "martj42-international-results", path: "results.csv" }],
    },
    {
      matchId: "int-2023-11-21-bra-arg",
      date: "2023-11-21",
      homeTeamId: "bra",
      awayTeamId: "arg",
      homeScore: 0,
      awayScore: 1,
      tournament: "FIFA World Cup qualification",
      neutral: false,
      sourceRefs: [{ sourceId: "martj42-international-results", path: "results.csv" }],
    },
  ],
  shootouts: [
    {
      matchKey: "2022-12-18-arg-fra",
      date: "2022-12-18",
      homeTeamId: "arg",
      awayTeamId: "fra",
      winnerTeamId: "arg",
      firstShooterTeamId: "fra",
      sourceRefs: [{ sourceId: "martj42-international-results", path: "shootouts.csv" }],
    },
  ],
  goalscorers: [
    {
      goalId: "goal-2022-12-18-arg-fra-1",
      matchKey: "2022-12-18-arg-fra",
      date: "2022-12-18",
      homeTeamId: "arg",
      awayTeamId: "fra",
      teamId: "arg",
      scorer: "Lionel Messi",
      minute: 23,
      ownGoal: false,
      penalty: true,
      sourceRefs: [{ sourceId: "martj42-international-results", path: "goalscorers.csv" }],
    },
    {
      goalId: "goal-2022-12-18-arg-fra-2",
      matchKey: "2022-12-18-arg-fra",
      date: "2022-12-18",
      homeTeamId: "arg",
      awayTeamId: "fra",
      teamId: "fra",
      scorer: "Kylian Mbappe",
      minute: 80,
      ownGoal: false,
      penalty: true,
      sourceRefs: [{ sourceId: "martj42-international-results", path: "goalscorers.csv" }],
    },
  ],
  teamIdentities: [
    {
      teamId: "arg",
      reepId: "reep_t_arg",
      name: "Argentina",
      providerIds: { wikidata: "Q414", transfermarkt: "3437" },
      sourceRefs: [{ sourceId: "withqwerty-reep", path: "data/teams.csv" }],
    },
  ],
  playerIdentities: [
    {
      playerKey: "lionel-messi",
      reepId: "reep_p_messi",
      name: "Lionel Messi",
      fullName: "Lionel Andres Messi",
      dateOfBirth: "1987-06-24",
      nationality: "Argentina",
      position: "right winger",
      providerIds: { wikidata: "Q615", transfermarkt: "28003" },
      sourceRefs: [{ sourceId: "withqwerty-reep", path: "data/people.csv" }],
    },
  ],
};

test("builds a valid Phase A package with manifest hashes and source refs", async () => {
  const packageFiles = buildPhaseAData({
    snapshot: fixture,
    dataVersion: "2026.05.26+test",
    generatedAt: "2026-05-26T12:00:00Z",
    gitCommit: "testcommit",
    inputProvenance: [
      {
        inputRole: "schedule",
        sourceId: "openfootball-worldcup-json",
        sourcePath: "worldcup.json",
        format: "json",
        path: "input/raw/worldcup-2026.json",
        sizeBytes: 123,
        sha256: "abc123",
      },
    ],
  });
  const tempRoot = await mkdtemp(path.join(tmpdir(), "world-cup-data-"));

  try {
    await writePackage(tempRoot, packageFiles);
    const result = await validatePackage(tempRoot);
    assert.equal(result.ok, true, result.errors.join("\n"));

    const manifest = JSON.parse(await readFile(path.join(tempRoot, "manifest.json"), "utf8"));
    const indexedFiles = await readManifestIndexFiles(tempRoot, manifest);
    const allManifestFiles = [...manifest.files, ...manifest.fileIndexes, ...indexedFiles];
    assert.equal(manifest.dataVersion, "2026.05.26+test");
    assert.equal(allManifestFiles.every((file) => file.sha256 && file.sizeBytes > 0), true);
    assert.equal(manifest.files.find((file) => file.path === "data/sources/sources.json").downloadTier, "core");
    assert.equal(manifest.files.find((file) => file.path === "checksums/sha256.txt"), undefined);
    assert.equal(manifest.fileIndexes.find((file) => file.indexesTier === "audit").downloadTier, "audit");
    assert.equal(manifest.fileIndexes.every((file) => Array.isArray(file.pathPrefixes)), true);
    assert.equal(manifest.fileIndexes.some((file) => file.pathPrefixes.includes("data/history/head-to-head/a")), true);
    assert.equal(manifest.fileIndexes.some((file) => file.pathPrefixes.includes("data/history/goalscorers/by-player/l")), true);
    const goalscorerIndexEntry = manifest.fileIndexes.find((file) => file.pathPrefixes.includes("data/history/goalscorers/by-player/l"));
    const goalscorerIndex = JSON.parse(await readFile(path.join(tempRoot, goalscorerIndexEntry.path), "utf8"));
    assert.equal(goalscorerIndex.fileDefaults.category, "history.goalscorers.byPlayer");
    assert.equal(goalscorerIndex.files.every((file) => file.category === undefined && file.downloadTier === undefined), true);
    assert.deepEqual(
      allManifestFiles.filter((file) => file.category !== "indexes.files").map((file) => file.category).sort(),
      [
        "checksums",
        "history.form",
        "history.form",
        "history.form",
        "history.goalscorers.byPlayer",
        "history.goalscorers.byPlayer",
        "history.goalscorers.byTeam",
        "history.goalscorers.byTeam",
        "history.goalscorers.index",
        "history.headToHead",
        "history.headToHead",
        "history.index",
        "history.shootouts",
        "identification.matches",
        "marketMapping.polymarket",
        "metadata.coverage",
        "metadata.identityGaps",
        "metadata.layerIndex",
        "metadata.sourceInputs",
        "metadata.sourceAudit",
        "players.identities",
        "players.index",
        "profiles.keyPlayersHistorical",
        "profiles.keyPlayersHistorical",
        "profiles.keyPlayersHistorical",
        "profiles.keyPlayersHistorical",
        "profiles.keyPlayersHistorical.index",
        "profiles.teams",
        "profiles.teams",
        "profiles.teams",
        "profiles.teams.index",
        "schedule",
        "sources",
        "taxonomy.aliases",
        "taxonomy.teamIdentities",
        "taxonomy.teamQuality",
        "taxonomy.teams",
        "taxonomy.venues",
      ].sort(),
    );
    const venues = JSON.parse(await readFile(path.join(tempRoot, "data/taxonomy/venues.json"), "utf8"));
    assert.equal(venues[0].venueId, "metlife-stadium");
    assert.equal(venues[0].displayName, "MetLife Stadium");
    const teamIdentities = JSON.parse(await readFile(path.join(tempRoot, "data/taxonomy/team-identities.json"), "utf8"));
    assert.equal(teamIdentities[0].providerIds.wikidata, "Q414");
    const teamQuality = JSON.parse(await readFile(path.join(tempRoot, "data/taxonomy/team-quality.json"), "utf8"));
    assert.equal(teamQuality.byStatus.reconciled, 1);
    assert.equal(teamQuality.byStatus.inferred, 2);
    assert.equal(teamQuality.byConfidence.medium, 1);
    assert.equal(teamQuality.byConfidence.low, 2);
    const coverageEntry = manifest.files.find((file) => file.path === "data/metadata/coverage.json");
    assert.equal(coverageEntry.required, true);
    assert.equal(coverageEntry.downloadTier, "core");
    assert.equal(coverageEntry.category, "metadata.coverage");
    const coverage = JSON.parse(await readFile(path.join(tempRoot, "data/metadata/coverage.json"), "utf8"));
    assert.equal(coverage.qualitySignals.scheduleMatches, 1);
    assert.equal(coverage.qualitySignals.historicalMatches, 3);
    const identityGapsEntry = manifest.files.find((file) => file.path === "data/metadata/identity-gaps.json");
    assert.equal(identityGapsEntry.required, true);
    assert.equal(identityGapsEntry.downloadTier, "core");
    assert.equal(identityGapsEntry.category, "metadata.identityGaps");
    const identityGaps = JSON.parse(await readFile(path.join(tempRoot, "data/metadata/identity-gaps.json"), "utf8"));
    assert.equal(identityGaps.summary.lowConfidenceTeamCount, 2);
    assert.equal(identityGaps.lowConfidenceTeams.some((team) => team.teamId === "arg"), false);
    assert.equal(coverage.qualitySignals.teamIdentity.lowConfidenceTeamCount, 2);
    assert.equal(coverage.layers.find((layer) => layer.layerId === "official-rosters").status, "pending-official-final-list");
    assert.equal(coverage.layers.find((layer) => layer.layerId === "team-profiles").status, "available");
    assert.equal(coverage.layers.find((layer) => layer.layerId === "historical-key-player-profiles").status, "available");
    assert.equal(coverage.layers.find((layer) => layer.layerId === "key-player-profiles").status, "pending-final-rosters-and-profile-generator");
    assert.equal(coverage.runtimeGuidance.matchAnalysis.includes("match-context"), true);
    const sourceAuditEntry = manifest.files.find((file) => file.path === "data/metadata/source-audit.json");
    assert.equal(sourceAuditEntry.required, true);
    assert.equal(sourceAuditEntry.downloadTier, "core");
    assert.equal(sourceAuditEntry.category, "metadata.sourceAudit");
    const sourceAudit = JSON.parse(await readFile(path.join(tempRoot, "data/metadata/source-audit.json"), "utf8"));
    assert.equal(sourceAudit.switchPolicy.currentDecision, "keep-layered-stack");
    assert.equal(sourceAudit.layers.find((layer) => layer.layerId === "national-team-history").decision, "keep-primary");
    assert.equal(sourceAudit.layers.find((layer) => layer.layerId === "official-rosters").status, "not-packaged");
    const sourceInputsEntry = manifest.files.find((file) => file.path === "data/metadata/source-inputs.json");
    assert.equal(sourceInputsEntry.required, true);
    assert.equal(sourceInputsEntry.downloadTier, "core");
    assert.equal(sourceInputsEntry.category, "metadata.sourceInputs");
    const sourceInputs = JSON.parse(await readFile(path.join(tempRoot, "data/metadata/source-inputs.json"), "utf8"));
    assert.equal(sourceInputs.inputCount, 1);
    assert.equal(sourceInputs.inputs[0].path, "input/raw/worldcup-2026.json");
    assert.equal(sourceInputs.inputs[0].sha256, "abc123");
    const playerIndex = JSON.parse(await readFile(path.join(tempRoot, "data/players/players-index.json"), "utf8"));
    assert.equal(playerIndex.playerCount, 1);
    const playerIdentity = JSON.parse(await readFile(path.join(tempRoot, "data/players/identities/lionel-messi.json"), "utf8"));
    assert.equal(playerIdentity.reepId, "reep_p_messi");
    const teamProfileIndex = JSON.parse(await readFile(path.join(tempRoot, "data/profiles/teams/index.json"), "utf8"));
    const argentinaProfile = JSON.parse(await readFile(path.join(tempRoot, "data/profiles/teams/arg.json"), "utf8"));
    assert.equal(teamProfileIndex.profileCount, 3);
    assert.equal(argentinaProfile.form.last5.matches, 3);
    assert.equal(argentinaProfile.topScorers[0].playerKey, "lionel-messi");
    const historicalKeyPlayerIndex = JSON.parse(await readFile(path.join(tempRoot, "data/profiles/key-players/historical/index.json"), "utf8"));
    const argentinaHistoricalKeyPlayerIndex = JSON.parse(await readFile(path.join(tempRoot, "data/profiles/key-players/historical/arg/index.json"), "utf8"));
    const messiProfile = JSON.parse(await readFile(path.join(tempRoot, "data/profiles/key-players/historical/arg/lionel-messi.json"), "utf8"));
    assert.equal(historicalKeyPlayerIndex.profileCount, 2);
    assert.equal(historicalKeyPlayerIndex.teams[0].profiles, undefined);
    assert.equal(argentinaHistoricalKeyPlayerIndex.profiles[0].playerKey, "lionel-messi");
    assert.equal(messiProfile.profileStatus, "available-historical");
    assert.equal(messiProfile.identity.providerIds.wikidata, "Q615");
    assert.equal(messiProfile.goalCount, 1);
    assert.equal(
      manifest.files.find((file) => file.path === "data/taxonomy/team-identities.json").downloadTier,
      "core",
    );
    assert.equal(
      allManifestFiles.find((file) => file.path === "data/players/identities/lionel-messi.json").downloadTier,
      "player-context",
    );
    const marketMappingEntry = manifest.files.find((file) => file.path === "data/market-mapping/polymarket-query-seeds.json");
    assert.equal(marketMappingEntry.downloadTier, "core");
    assert.equal(marketMappingEntry.required, false);
    const marketMapping = JSON.parse(await readFile(path.join(tempRoot, "data/market-mapping/polymarket-query-seeds.json"), "utf8"));
    assert.deepEqual(marketMapping.provider, "polymarket");
    assert.equal(marketMapping.matchQueries["wc-2026-sample-arg-bra"].includes("Argentina Brazil World Cup"), true);
    assert.equal(marketMapping.teamQueries.arg.includes("Argentina to win World Cup"), true);
    assert.equal(marketMapping.tournamentQueries.includes("2026 World Cup winner"), true);
    const identificationEntry = manifest.files.find((file) => file.path === "data/identification/matches.json");
    assert.equal(identificationEntry.downloadTier, "core");
    assert.equal(identificationEntry.required, true);
    assert.equal(identificationEntry.category, "identification.matches");
    const identification = JSON.parse(await readFile(path.join(tempRoot, "data/identification/matches.json"), "utf8"));
    assert.equal(identification.matchCount, 1);
    assert.equal(identification.defaultWeights.teamAlias, 0.45);
    assert.equal(identification.matches[0].matchId, "wc-2026-sample-arg-bra");
    assert.equal(identification.matches[0].teams[0].aliases.includes("Argentina"), true);
    assert.equal(identification.matches[0].venue.aliases.includes("MetLife Stadium"), true);
    assert.equal(identification.matches[0].queryHints.includes("Argentina vs Brazil"), true);
    assert.equal(coverage.layers.find((layer) => layer.layerId === "schedule").categories.includes("identification.matches"), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("derives head-to-head and team form from international results", () => {
  const packageFiles = buildPhaseAData({
    snapshot: fixture,
    dataVersion: "2026.05.26+test",
    generatedAt: "2026-05-26T12:00:00Z",
    gitCommit: "testcommit",
  });
  const headToHead = JSON.parse(packageFiles.get("data/history/head-to-head/arg__bra.json"));
  const finalHeadToHead = JSON.parse(packageFiles.get("data/history/head-to-head/arg__fra.json"));
  const argentinaForm = JSON.parse(packageFiles.get("data/history/form/arg.json"));

  assert.deepEqual(headToHead.allTime, {
    matches: 2,
    teamAWins: 1,
    draws: 0,
    teamBWins: 1,
    teamAGoals: 1,
    teamBGoals: 1,
  });
  assert.deepEqual(headToHead.splits.worldCup, {
    matches: 0,
    teamAWins: 0,
    draws: 0,
    teamBWins: 0,
    teamAGoals: 0,
    teamBGoals: 0,
  });
  assert.deepEqual(headToHead.splits.competitive, {
    matches: 1,
    teamAWins: 1,
    draws: 0,
    teamBWins: 0,
    teamAGoals: 1,
    teamBGoals: 0,
  });
  assert.deepEqual(headToHead.splits.neutralVenue, {
    matches: 1,
    teamAWins: 0,
    draws: 0,
    teamBWins: 1,
    teamAGoals: 0,
    teamBGoals: 1,
  });
  assert.deepEqual(finalHeadToHead.splits.worldCup, {
    matches: 1,
    teamAWins: 0,
    draws: 1,
    teamBWins: 0,
    teamAGoals: 3,
    teamBGoals: 3,
  });
  assert.deepEqual(finalHeadToHead.shootoutSummary, {
    matches: 1,
    teamAWins: 1,
    teamBWins: 0,
    firstShooterTeamA: 0,
    firstShooterTeamB: 1,
  });
  assert.equal(headToHead.lastMeeting.matchId, "int-2023-11-21-bra-arg");
  assert.deepEqual(argentinaForm.windows.last5, {
    matches: 3,
    wins: 1,
    draws: 1,
    losses: 1,
    goalsFor: 4,
    goalsAgainst: 4,
  });
});

test("splits goalscorers into lazy-loadable team and player indexes", () => {
  const packageFiles = buildPhaseAData({
    snapshot: fixture,
    dataVersion: "2026.05.26+test",
    generatedAt: "2026-05-26T12:00:00Z",
    gitCommit: "testcommit",
  });
  const index = JSON.parse(packageFiles.get("data/history/goalscorers/index.json"));
  const argentinaGoals = JSON.parse(packageFiles.get("data/history/goalscorers/by-team/arg.json"));
  const messiGoals = JSON.parse(packageFiles.get("data/history/goalscorers/by-player/lionel-messi.json"));
  const manifest = JSON.parse(packageFiles.get("manifest.json"));
  const allManifestFiles = [...manifest.files, ...manifest.fileIndexes, ...readManifestIndexFilesFromMap(packageFiles, manifest)];

  assert.equal(packageFiles.has("data/history/goalscorers.json"), false);
  assert.equal(index.goalCount, 2);
  assert.equal(index.teamCount, 2);
  assert.equal(index.playerCount, 2);
  assert.equal(argentinaGoals.topScorers[0].scorer, "Lionel Messi");
  assert.equal(Array.isArray(argentinaGoals.goals), false);
  assert.equal(messiGoals.scorer, "Lionel Messi");
  assert.equal(messiGoals.goals[0].teamId, "arg");
  assert.equal(
    allManifestFiles.find((file) => file.path === "data/history/goalscorers/by-team/arg.json").required,
    false,
  );
  assert.equal(
    allManifestFiles.find((file) => file.path === "data/history/goalscorers/by-team/arg.json").downloadTier,
    "player-context",
  );
});

test("builds simulated rosters and current key-player profiles when official squads are unavailable", async () => {
  const packageFiles = buildPhaseAData({
    snapshot: { ...fixture, simulateRosters: true },
    dataVersion: "2026.05.26+simulated-rosters-test",
    generatedAt: "2026-05-26T12:00:00Z",
    gitCommit: "testcommit",
  });
  const tempRoot = await mkdtemp(path.join(tmpdir(), "world-cup-data-"));

  try {
    await writePackage(tempRoot, packageFiles);
    const result = await validatePackage(tempRoot);
    assert.equal(result.ok, true, result.errors.join("\n"));

    const coverage = JSON.parse(await readFile(path.join(tempRoot, "data/metadata/coverage.json"), "utf8"));
    const rosterIndex = JSON.parse(await readFile(path.join(tempRoot, "data/rosters/worldcup-2026/index.json"), "utf8"));
    const currentIndex = JSON.parse(await readFile(path.join(tempRoot, "data/profiles/key-players/current/index.json"), "utf8"));
    const argentinaRoster = JSON.parse(await readFile(path.join(tempRoot, "data/rosters/worldcup-2026/arg.json"), "utf8"));

    assert.equal(coverage.layers.find((layer) => layer.layerId === "official-rosters").status, "available-simulated");
    assert.equal(coverage.layers.find((layer) => layer.layerId === "key-player-profiles").status, "available-simulated");
    assert.equal(rosterIndex.teams.some((team) => team.rosterStatus === "simulated"), true);
    assert.equal(currentIndex.teams.some((team) => team.rosterStatus === "simulated"), true);
    assert.equal(argentinaRoster.rosterStatus, "simulated");
    assert.equal(argentinaRoster.players.length, 8);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("validation rejects missing source references", async () => {
  const packageFiles = buildPhaseAData({
    snapshot: fixture,
    dataVersion: "2026.05.26+test",
    generatedAt: "2026-05-26T12:00:00Z",
    gitCommit: "testcommit",
  });
  const brokenSources = JSON.stringify([
    {
      sourceId: "openfootball-worldcup-json",
      name: "openfootball/worldcup.json",
      license: "CC0-1.0",
      url: "https://github.com/openfootball/worldcup.json",
    },
  ]);
  packageFiles.set("data/sources/sources.json", brokenSources);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "world-cup-data-"));

  try {
    await writePackage(tempRoot, packageFiles);
    const result = await validatePackage(tempRoot);
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /martj42-international-results/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("validation rejects mismatched team quality metadata", async () => {
  const packageFiles = buildPhaseAData({
    snapshot: fixture,
    dataVersion: "2026.05.26+test",
    generatedAt: "2026-05-26T12:00:00Z",
    gitCommit: "testcommit",
  });
  const quality = JSON.parse(packageFiles.get("data/taxonomy/team-quality.json"));
  quality.byConfidence.low = 1;
  const brokenQuality = `${JSON.stringify(quality, null, 2)}\n`;
  packageFiles.set("data/taxonomy/team-quality.json", brokenQuality);
  const manifest = JSON.parse(packageFiles.get("manifest.json"));
  const qualityEntry = manifest.files.find((file) => file.path === "data/taxonomy/team-quality.json");
  qualityEntry.sha256 = sha256(brokenQuality);
  qualityEntry.sizeBytes = Buffer.byteLength(brokenQuality, "utf8");
  packageFiles.set("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "world-cup-data-"));

  try {
    await writePackage(tempRoot, packageFiles);
    const result = await validatePackage(tempRoot);
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /team-quality.*byConfidence\.low/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("validation rejects stale generated files that are not indexed", async () => {
  const packageFiles = buildPhaseAData({
    snapshot: fixture,
    dataVersion: "2026.05.26+test",
    generatedAt: "2026-05-26T12:00:00Z",
    gitCommit: "testcommit",
  });
  const tempRoot = await mkdtemp(path.join(tmpdir(), "world-cup-data-"));

  try {
    await writePackage(tempRoot, packageFiles);
    await mkdir(path.join(tempRoot, "indexes"), { recursive: true });
    await writeFile(path.join(tempRoot, "indexes/files-stale.json"), '{"stale":true}\n', "utf8");
    const result = await validatePackage(tempRoot);
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /indexes\/files-stale\.json exists in generated package/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("build rejects matches where a team plays itself", () => {
  const brokenFixture = structuredClone(fixture);
  brokenFixture.internationalResults = [
    {
      matchId: "bad-self-match",
      date: "2024-01-01",
      homeTeamId: "arg",
      awayTeamId: "arg",
      homeScore: 1,
      awayScore: 1,
      tournament: "Friendly",
      neutral: true,
      sourceRefs: [{ sourceId: "martj42-international-results", path: "results.csv" }],
    },
  ];

  assert.throws(
    () =>
      buildPhaseAData({
        snapshot: brokenFixture,
        dataVersion: "2026.05.26+test",
        generatedAt: "2026-05-26T12:00:00Z",
        gitCommit: "testcommit",
      }),
    /bad-self-match/,
  );
});

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

test("builds head-to-head files for hyphenated team IDs", () => {
  const hyphenFixture = structuredClone(fixture);
  hyphenFixture.teams = [
    ...hyphenFixture.teams,
    { teamId: "abkhazia", fifaCode: "ABK", name: "Abkhazia", aliases: ["Abkhazia"] },
    { teamId: "chagos-islands", fifaCode: "CHA", name: "Chagos Islands", aliases: ["Chagos Islands"] },
  ];
  hyphenFixture.internationalResults = [
    {
      matchId: "int-2016-05-29-abkhazia-chagos-islands",
      date: "2016-05-29",
      homeTeamId: "abkhazia",
      awayTeamId: "chagos-islands",
      homeScore: 9,
      awayScore: 0,
      tournament: "Friendly",
      neutral: true,
      sourceRefs: [{ sourceId: "martj42-international-results", path: "results.csv" }],
    },
  ];

  const packageFiles = buildPhaseAData({
    snapshot: hyphenFixture,
    dataVersion: "2026.05.26+test",
    generatedAt: "2026-05-26T12:00:00Z",
    gitCommit: "testcommit",
  });
  const headToHead = JSON.parse(packageFiles.get("data/history/head-to-head/abkhazia__chagos-islands.json"));

  assert.equal(headToHead.teamAId, "abkhazia");
  assert.equal(headToHead.teamBId, "chagos-islands");
  assert.equal(headToHead.allTime.teamAGoals, 9);
});

test("build allows schedule placeholder teams to repeat before knockout teams are known", () => {
  const placeholderFixture = structuredClone(fixture);
  placeholderFixture.teams.push({
    teamId: "placeholder-l10",
    fifaCode: "TBD",
    name: "L10",
    aliases: ["L10"],
    isPlaceholder: true,
  });
  placeholderFixture.schedule = [
    {
      matchId: "wc-2026-103-placeholder-l10-placeholder-l10",
      competitionId: "fifa-world-cup-2026",
      stage: "Third place play-off",
      kickoffUtc: "2026-07-18T22:00:00.000Z",
      homeTeamId: "placeholder-l10",
      awayTeamId: "placeholder-l10",
      venueId: "hard-rock-stadium",
      sourceRefs: [{ sourceId: "openfootball-worldcup-json", path: "worldcup.json" }],
    },
  ];

  const packageFiles = buildPhaseAData({
    snapshot: placeholderFixture,
    dataVersion: "2026.05.26+test",
    generatedAt: "2026-05-26T12:00:00Z",
    gitCommit: "testcommit",
  });
  const teams = JSON.parse(packageFiles.get("data/taxonomy/teams.json"));

  assert.equal(teams.find((team) => team.teamId === "placeholder-l10").isPlaceholder, true);
  assert.equal(packageFiles.has("data/history/form/placeholder-l10.json"), false);
});

test("build rejects duplicate match IDs", () => {
  const brokenFixture = structuredClone(fixture);
  brokenFixture.internationalResults = [
    brokenFixture.internationalResults[0],
    { ...brokenFixture.internationalResults[0] },
  ];

  assert.throws(
    () =>
      buildPhaseAData({
        snapshot: brokenFixture,
        dataVersion: "2026.05.26+test",
        generatedAt: "2026-05-26T12:00:00Z",
        gitCommit: "testcommit",
      }),
    /duplicate matchId/,
  );
});

async function readManifestIndexFiles(rootDir, manifest) {
  const files = [];
  for (const index of manifest.fileIndexes ?? []) {
    const parsed = JSON.parse(await readFile(path.join(rootDir, index.path), "utf8"));
    files.push(...expandIndexedFiles(parsed));
  }
  return files;
}

function readManifestIndexFilesFromMap(packageFiles, manifest) {
  const files = [];
  for (const index of manifest.fileIndexes ?? []) {
    const parsed = JSON.parse(packageFiles.get(index.path));
    files.push(...expandIndexedFiles(parsed));
  }
  return files;
}

function expandIndexedFiles(indexPayload) {
  const defaults = indexPayload.fileDefaults ?? {};
  return (indexPayload.files ?? []).map((file) => ({
    ...defaults,
    ...file,
  }));
}
