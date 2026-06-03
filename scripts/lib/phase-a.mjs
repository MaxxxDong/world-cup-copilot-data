import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WINDOW_SIZES = [5, 10, 20];
const PAIR_KEY_DELIMITER = "__";
const SIMULATED_ROSTER_SIZE = 8;

const CATEGORY_BY_PREFIX = [
  ["indexes/", "indexes.files"],
  ["data/metadata/coverage.json", "metadata.coverage"],
  ["data/metadata/identity-gaps.json", "metadata.identityGaps"],
  ["data/metadata/layer-index.json", "metadata.layerIndex"],
  ["data/metadata/source-inputs.json", "metadata.sourceInputs"],
  ["data/metadata/source-audit.json", "metadata.sourceAudit"],
  ["data/identification/matches.json", "identification.matches"],
  ["data/sources/", "sources"],
  ["data/taxonomy/teams.json", "taxonomy.teams"],
  ["data/taxonomy/team-aliases.json", "taxonomy.aliases"],
  ["data/taxonomy/team-identities.json", "taxonomy.teamIdentities"],
  ["data/taxonomy/team-quality.json", "taxonomy.teamQuality"],
  ["data/taxonomy/former-names.json", "taxonomy.formerNames"],
  ["data/taxonomy/venues.json", "taxonomy.venues"],
  ["data/market-mapping/polymarket-query-seeds.json", "marketMapping.polymarket"],
  ["data/profiles/teams/index.json", "profiles.teams.index"],
  ["data/profiles/teams/", "profiles.teams"],
  ["data/profiles/key-players/current/index.json", "profiles.keyPlayersCurrent.index"],
  ["data/profiles/key-players/current/", "profiles.keyPlayersCurrent"],
  ["data/profiles/key-players/historical/index.json", "profiles.keyPlayersHistorical.index"],
  ["data/profiles/key-players/historical/", "profiles.keyPlayersHistorical"],
  ["data/rosters/worldcup-2026/index.json", "rosters.worldcup2026.index"],
  ["data/rosters/worldcup-2026/", "rosters.worldcup2026"],
  ["data/players/players-index.json", "players.index"],
  ["data/players/identities/", "players.identities"],
  ["data/schedule/", "schedule"],
  ["data/history/international-results-index.json", "history.index"],
  ["data/history/head-to-head/", "history.headToHead"],
  ["data/history/form/", "history.form"],
  ["data/history/shootouts.json", "history.shootouts"],
  ["data/history/goalscorers/index.json", "history.goalscorers.index"],
  ["data/history/goalscorers/by-team/", "history.goalscorers.byTeam"],
  ["data/history/goalscorers/by-player/", "history.goalscorers.byPlayer"],
  ["checksums/", "checksums"],
];

export function buildPhaseAData({ snapshot, dataVersion, generatedAt, gitCommit, inputProvenance = [] }) {
  assertSnapshot(snapshot);

  const files = new Map();
  const teams = buildTeams(snapshot);
  const aliases = buildAliases(teams);
  const schedule = [...snapshot.schedule].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const results = [...snapshot.internationalResults].sort((a, b) => a.date.localeCompare(b.date));
  const shootouts = [...(snapshot.shootouts ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const goalscorers = [...(snapshot.goalscorers ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const simulatedRosters = snapshot.simulateRosters && !snapshot.rosters?.length
    ? buildSimulatedRosters({ teams, schedule, goalscorers, generatedAt })
    : [];
  const rosters = snapshot.rosters?.length ? snapshot.rosters : simulatedRosters;
  const activeSnapshot = {
    ...snapshot,
    rosters,
    sources: [
      ...snapshot.sources,
      ...(simulatedRosters.length ? [simulatedRosterSource(generatedAt)] : []),
    ],
  };
  const sources = [...activeSnapshot.sources].sort((a, b) => a.sourceId.localeCompare(b.sourceId));

  setJson(files, "data/metadata/coverage.json", buildCoverageMetadata({ snapshot: activeSnapshot, teams, schedule, results, shootouts, goalscorers, generatedAt }));
  setCompactJson(files, "data/metadata/layer-index.json", buildLayerIndexMetadata({ generatedAt }));
  setCompactJson(files, "data/metadata/source-audit.json", buildSourceAuditMetadata({ snapshot: activeSnapshot, teams, generatedAt }));
  setJson(files, "data/metadata/source-inputs.json", buildSourceInputsMetadata({ inputProvenance, generatedAt }));
  setJson(files, "data/sources/sources.json", sources);
  setJson(files, "data/taxonomy/teams.json", teams);
  setJson(files, "data/taxonomy/team-aliases.json", aliases);
  setJson(files, "data/taxonomy/team-quality.json", buildTeamQuality(teams, generatedAt));
  if (snapshot.formerNames?.length) {
    setJson(files, "data/taxonomy/former-names.json", snapshot.formerNames);
  }
  if (snapshot.venues?.length) {
    setJson(files, "data/taxonomy/venues.json", [...snapshot.venues].sort((a, b) => a.venueId.localeCompare(b.venueId)));
  }
  if (snapshot.teamIdentities?.length) {
    setJson(files, "data/taxonomy/team-identities.json", [...snapshot.teamIdentities].sort((a, b) => a.teamId.localeCompare(b.teamId)));
  }
  if (snapshot.playerIdentities?.length) {
    writePlayerIdentityFiles(files, snapshot.playerIdentities, generatedAt);
  }
  if (rosters.length) {
    writeRosterFiles(files, rosters, generatedAt);
  }
  setJson(files, "data/schedule/worldcup-2026.json", {
    competitionId: "fifa-world-cup-2026",
    generatedAt,
    matches: schedule,
    sourceRefs: uniqueSourceRefs(schedule.flatMap((match) => match.sourceRefs ?? [])),
  });
  setCompactJson(files, "data/market-mapping/polymarket-query-seeds.json", buildPolymarketQuerySeeds(schedule, teams, generatedAt));
  setCompactJson(files, "data/identification/matches.json", buildMatchIdentificationIndex(schedule, teams, snapshot.venues ?? [], generatedAt));
  setJson(files, "data/history/international-results-index.json", buildHistoryIndex(results, generatedAt));
  if (shootouts.length) {
    setJson(files, "data/history/shootouts.json", shootouts);
  }
  if (goalscorers.length) {
    writeGoalscorerFiles(files, goalscorers);
    writeHistoricalKeyPlayerProfileFiles(files, teams, goalscorers, snapshot.playerIdentities ?? [], generatedAt);
  }
  if (rosters.length) {
    writeCurrentKeyPlayerProfileFiles(files, teams, rosters, goalscorers, snapshot.playerIdentities ?? [], generatedAt);
  }
  writeTeamProfileFiles(files, teams, results, goalscorers, generatedAt);

  const shootoutsByPair = buildShootoutGroups(shootouts);
  for (const [pairKey, pairMatches] of buildPairGroups(results)) {
    setJson(files, `data/history/head-to-head/${pairKey}.json`, buildHeadToHead(pairKey, pairMatches, shootoutsByPair.get(pairKey) ?? []));
  }

  for (const team of teams) {
    if (team.isPlaceholder) continue;
    const teamMatches = results.filter(
      (match) => match.homeTeamId === team.teamId || match.awayTeamId === team.teamId,
    );
    setJson(files, `data/history/form/${team.teamId}.json`, buildTeamForm(team.teamId, teamMatches));
  }

  setJson(files, "data/metadata/identity-gaps.json", buildIdentityGaps(teams, generatedAt));
  const checksums = buildChecksums(files);
  files.set("checksums/sha256.txt", checksums);
  const fileIndexes = writeFileIndexFiles(files, generatedAt);
  setJson(files, "manifest.json", buildManifest(files, { dataVersion, generatedAt, gitCommit }, fileIndexes));

  return files;
}

export async function writePackage(rootDir, files) {
  for (const [relativePath, content] of files) {
    const targetPath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, "utf8");
  }
}

export async function refreshPackageMetadata(rootDir) {
  const manifestPath = path.join(rootDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const errors = [];
  const indexedFiles = await readIndexedManifestFiles(rootDir, manifest, errors);
  if (errors.length) {
    throw new Error(`Cannot read existing file indexes:\n${errors.join("\n")}`);
  }

  const packagePaths = uniqueStrings([...(manifest.files ?? []), ...indexedFiles].map((file) => file.path))
    .filter((relativePath) => relativePath !== "manifest.json")
    .filter((relativePath) => !relativePath.startsWith("indexes/"))
    .filter((relativePath) => !relativePath.startsWith("checksums/"));

  const files = new Map();
  for (const relativePath of packagePaths) {
    files.set(relativePath, await readFile(path.join(rootDir, relativePath), "utf8"));
  }

  files.set("checksums/sha256.txt", buildChecksums(files));
  const fileIndexes = writeFileIndexFiles(files, manifest.generatedAt);
  setJson(
    files,
    "manifest.json",
    buildManifest(
      files,
      {
        dataVersion: manifest.dataVersion,
        generatedAt: manifest.generatedAt,
        gitCommit: manifest.gitCommit,
      },
      fileIndexes,
    ),
  );

  await writePackage(rootDir, files);
  return {
    fileCount: files.size,
    fileIndexCount: fileIndexes.length,
    dataVersion: manifest.dataVersion,
  };
}

export async function validatePackage(rootDir) {
  const errors = [];
  const manifestPath = path.join(rootDir, "manifest.json");
  let manifest;

  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    return { ok: false, errors: [`manifest.json cannot be read: ${error.message}`] };
  }

  if (!manifest.schemaVersion || !manifest.dataVersion || !Array.isArray(manifest.files)) {
    errors.push("manifest.json is missing schemaVersion, dataVersion, or files");
  }

  const indexedFiles = await readIndexedManifestFiles(rootDir, manifest, errors);
  const filesToValidate = [...(manifest.files ?? []), ...(manifest.fileIndexes ?? []), ...indexedFiles];
  for (const file of filesToValidate) {
    const filePath = path.join(rootDir, file.path);
    try {
      const content = await readFile(filePath, "utf8");
      const hash = sha256(content);
      const sizeBytes = Buffer.byteLength(content, "utf8");
      if (hash !== file.sha256) {
        errors.push(`${file.path} sha256 mismatch: expected ${file.sha256}, got ${hash}`);
      }
      if (sizeBytes !== file.sizeBytes) {
        errors.push(`${file.path} size mismatch: expected ${file.sizeBytes}, got ${sizeBytes}`);
      }
      if (file.path.endsWith(".json")) {
        JSON.parse(content);
      }
    } catch (error) {
      errors.push(`${file.path} cannot be validated: ${error.message}`);
    }
  }

  const sourceIds = await readSourceIds(rootDir, errors);
  await validateSourceRefs(rootDir, filesToValidate, sourceIds, errors);
  await validateTeamQuality(rootDir, errors);
  await validateNoUnindexedGeneratedFiles(rootDir, filesToValidate, errors);

  return { ok: errors.length === 0, errors };
}

function assertSnapshot(snapshot) {
  for (const key of ["sources", "teams", "schedule", "internationalResults"]) {
    if (!Array.isArray(snapshot?.[key])) {
      throw new Error(`snapshot.${key} must be an array`);
    }
  }
  const teamById = new Map(snapshot.teams.map((team) => [team.teamId, team]));
  const matchIds = new Set();
  for (const match of snapshot.schedule) {
    if (match.homeTeamId === match.awayTeamId && !isPlaceholderTeam(teamById.get(match.homeTeamId))) {
      throw new Error(`${match.matchId} has the same homeTeamId and awayTeamId: ${match.homeTeamId}`);
    }
    if (matchIds.has(match.matchId)) {
      throw new Error(`duplicate matchId ${match.matchId}`);
    }
    matchIds.add(match.matchId);
  }
  for (const match of snapshot.internationalResults) {
    if (match.homeTeamId === match.awayTeamId) {
      throw new Error(`${match.matchId} has the same homeTeamId and awayTeamId: ${match.homeTeamId}`);
    }
    if (matchIds.has(match.matchId)) {
      throw new Error(`duplicate matchId ${match.matchId}`);
    }
    matchIds.add(match.matchId);
  }
}

function buildTeams(snapshot) {
  const teams = new Map();
  for (const team of snapshot.teams) {
    teams.set(team.teamId, normalizeTeam(team));
  }
  for (const match of [...snapshot.schedule, ...snapshot.internationalResults]) {
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (!teams.has(teamId)) {
        teams.set(teamId, normalizeTeam({ teamId, derivedCode: teamId.toUpperCase(), name: teamId, aliases: [teamId] }));
      }
    }
  }
  for (const identity of snapshot.teamIdentities ?? []) {
    const team = teams.get(identity.teamId);
    if (!team || team.isPlaceholder) continue;
    const sourceRefs = uniqueSourceRefs([...(team.sourceRefs ?? []), ...(identity.sourceRefs ?? [])]);
    teams.set(identity.teamId, {
      ...team,
      identityConfidence: team.identityConfidence === "high" ? "high" : "medium",
      identityStatus: team.identityStatus === "registry" ? "registry" : "reconciled",
      sourceRefs,
    });
  }
  return [...teams.values()].sort((a, b) => a.teamId.localeCompare(b.teamId));
}

function normalizeTeam(team) {
  const isPlaceholder = team.isPlaceholder === true;
  const identityStatus = team.identityStatus ?? (isPlaceholder ? "placeholder" : "inferred");
  return {
    teamId: team.teamId,
    fifaCode: team.fifaCode,
    derivedCode: team.derivedCode,
    name: team.name,
    aliases: uniqueStrings([team.name, team.fifaCode, ...(team.aliases ?? [])]),
    identityConfidence: team.identityConfidence ?? (identityStatus === "registry" ? "high" : identityStatus === "placeholder" ? "placeholder" : "low"),
    identityStatus,
    sourceRefs: team.sourceRefs ?? [],
    isPlaceholder,
  };
}

function buildTeamQuality(teams, generatedAt) {
  const byStatus = {};
  const byConfidence = {};
  for (const team of teams) {
    byStatus[team.identityStatus] = (byStatus[team.identityStatus] ?? 0) + 1;
    byConfidence[team.identityConfidence] = (byConfidence[team.identityConfidence] ?? 0) + 1;
  }
  return {
    generatedAt,
    teamCount: teams.length,
    byStatus,
    byConfidence,
    lowConfidenceTeams: teams
      .filter((team) => team.identityConfidence === "low")
      .map((team) => ({
        aliases: team.aliases,
        fifaCode: team.fifaCode,
        derivedCode: team.derivedCode,
        name: team.name,
        teamId: team.teamId,
      })),
  };
}

function buildIdentityGaps(teams, generatedAt) {
  const realTeams = teams.filter((team) => !isPlaceholderTeam(team));
  const teamsByFifaCode = new Map();
  for (const team of realTeams) {
    const code = team.fifaCode;
    if (!code) continue;
    const existing = teamsByFifaCode.get(code) ?? [];
    existing.push(team);
    teamsByFifaCode.set(code, existing);
  }
  const duplicateFifaCodes = [...teamsByFifaCode.entries()]
    .filter(([, codeTeams]) => codeTeams.length > 1)
    .map(([fifaCode, codeTeams]) => ({
      fifaCode,
      teams: codeTeams.map(compactIdentityTeam),
    }))
    .sort((a, b) => a.fifaCode.localeCompare(b.fifaCode));
  const lowConfidenceTeams = realTeams.filter((team) => team.identityConfidence === "low").map(compactIdentityTeam);
  const missingSourceRefTeams = realTeams.filter((team) => !(team.sourceRefs ?? []).length).map(compactIdentityTeam);

  return {
    generatedAt,
    purpose: "Machine-readable identity quality gaps for extension UI, package QA, and agent routing.",
    summary: {
      realTeamCount: realTeams.length,
      lowConfidenceTeamCount: lowConfidenceTeams.length,
      missingSourceRefTeamCount: missingSourceRefTeams.length,
      duplicateFifaCodeCount: duplicateFifaCodes.length,
    },
    guidance: {
      matchDetection: "Prefer registry/high teams and aliases. Treat inferred/low teams and duplicate FIFA codes as fallback-only signals.",
      sourceUpgrade: "Use this file to prioritize Wikidata/FIFA ID reconciliation and registry expansion before promoting a team to registry/high.",
      rosterProfiles: "Do not generate official roster or key-player profile facts for unresolved teams without a roster sourceRef.",
    },
    lowConfidenceTeams,
    missingSourceRefTeamIds: missingSourceRefTeams.map((team) => team.teamId),
    duplicateFifaCodes,
  };
}

function buildSourceInputsMetadata({ inputProvenance, generatedAt }) {
  return {
    generatedAt,
    purpose: "Machine-readable raw input provenance for package QA, source refresh, and agent audit.",
    inputCount: inputProvenance.length,
    inputs: [...inputProvenance].sort((a, b) => `${a.inputRole}:${a.path}`.localeCompare(`${b.inputRole}:${b.path}`)),
    guidance: {
      refresh: "Regenerate the package when a raw input hash changes, then rerun validate-package, budget, readiness, FIFA fixture, and remote-latency audits.",
      privacy: "Paths are repository-relative or basename-only; raw source files are not included in the published package unless explicitly indexed elsewhere.",
      sourceRefs: "Use sourceRefs for fact-level attribution and this file for package build provenance.",
    },
  };
}

function compactIdentityTeam(team) {
  return {
    derivedCode: team.derivedCode,
    fifaCode: team.fifaCode,
    identityConfidence: team.identityConfidence,
    identityStatus: team.identityStatus,
    name: team.name,
    teamId: team.teamId,
  };
}

function isPlaceholderTeam(team) {
  return team?.isPlaceholder === true || team?.teamId?.startsWith("placeholder-") === true;
}

function buildAliases(teams) {
  return teams
    .flatMap((team) =>
      team.aliases.map((alias) => ({
        teamId: team.teamId,
        alias,
        normalizedAlias: normalizeAlias(alias),
      })),
    )
    .sort((a, b) => a.normalizedAlias.localeCompare(b.normalizedAlias));
}

function buildHistoryIndex(results, generatedAt) {
  const teams = new Set();
  const tournaments = new Set();
  const sourceRefs = [];
  for (const result of results) {
    teams.add(result.homeTeamId);
    teams.add(result.awayTeamId);
    tournaments.add(result.tournament);
    sourceRefs.push(...(result.sourceRefs ?? []));
  }
  return {
    generatedAt,
    matchCount: results.length,
    teamCount: teams.size,
    tournamentCount: tournaments.size,
    firstMatchDate: results[0]?.date ?? null,
    lastMatchDate: results.at(-1)?.date ?? null,
    sourceRefs: uniqueSourceRefs(sourceRefs),
  };
}

function buildSimulatedRosters({ teams, schedule, goalscorers, generatedAt }) {
  const teamById = new Map(teams.map((team) => [team.teamId, team]));
  const tournamentTeamIds = uniqueStrings(schedule.flatMap((match) => [match.homeTeamId, match.awayTeamId]))
    .filter((teamId) => !teamById.get(teamId)?.isPlaceholder);
  const goalsByTeamPlayer = new Map();
  for (const goal of goalscorers) {
    const key = `${goal.teamId}:${playerKeyFor(goal.scorer)}`;
    const existing = goalsByTeamPlayer.get(key) ?? {
      goalCount: 0,
      name: goal.scorer,
      playerKey: playerKeyFor(goal.scorer),
    };
    existing.goalCount += 1;
    goalsByTeamPlayer.set(key, existing);
  }

  return tournamentTeamIds.sort().map((teamId) => {
    const team = teamById.get(teamId);
    const knownPlayers = [...goalsByTeamPlayer.entries()]
      .filter(([key]) => key.startsWith(`${teamId}:`))
      .map(([, value]) => value)
      .sort((a, b) => b.goalCount - a.goalCount || a.name.localeCompare(b.name))
      .slice(0, SIMULATED_ROSTER_SIZE)
      .map((player, index) => ({
        playerKey: player.playerKey,
        name: player.name,
        order: index + 1,
      }));
    const players = [...knownPlayers];
    while (players.length < SIMULATED_ROSTER_SIZE) {
      const order = players.length + 1;
      const name = `${team?.name ?? teamId} Simulated Player ${String(order).padStart(2, "0")}`;
      players.push({
        playerKey: playerKeyFor(name),
        name,
        order,
      });
    }
    return {
      teamId,
      teamName: team?.name ?? teamId,
      rosterStatus: "simulated",
      announcementDate: generatedAt.slice(0, 10),
      sourceUrl: `simulated://world-cup-copilot/squads/${teamId}`,
      players,
      sourceRefs: [{ sourceId: "world-cup-copilot-simulated-squads", path: "generated:simulated-squads" }],
    };
  });
}

function simulatedRosterSource(generatedAt) {
  return {
    sourceId: "world-cup-copilot-simulated-squads",
    name: "World Cup Copilot simulated squad list",
    publisher: "world-cup-copilot",
    url: "generated:simulated-squads",
    license: "project-generated",
    accessMethod: "generated",
    retrievedAt: generatedAt,
    sourceCommit: "local",
    rightsNote: "Development-only approximate squads generated from tournament teams and historical goalscorer records. Not official FIFA roster data.",
  };
}

function buildCoverageMetadata({ snapshot, teams, schedule, results, shootouts, goalscorers, generatedAt }) {
  const teamQuality = buildTeamQuality(teams, generatedAt);
  const hasPlayerIdentities = (snapshot.playerIdentities ?? []).length > 0;
  const hasTeamIdentities = (snapshot.teamIdentities ?? []).length > 0;
  const rosters = snapshot.rosters ?? [];
  const rosterStatuses = uniqueStrings(rosters.map((roster) => roster.rosterStatus ?? "unknown"));
  const hasFinalRosters = rosters.length > 0 && rosterStatuses.every((status) => status === "final");
  const hasSimulatedRosters = rosters.length > 0 && rosterStatuses.every((status) => status === "simulated");
  const hasRosters = rosters.length > 0;
  const sourceIds = new Set(snapshot.sources.map((source) => source.sourceId));
  const optionalCandidateSources = [
    {
      sourceId: "fifa-squad-announcements-2026",
      name: "FIFA World Cup 2026 squad announcements",
      url: "https://www.fifa.com/en/articles/all-world-cup-squad-announcements",
      role: "official-roster-authority",
      useWhen: "Import only after final official squad lists are published by FIFA.",
      packagePolicy: "Do not promote media projections or provisional federation lists to canonical roster facts.",
    },
    {
      sourceId: "wikidata-national-football-teams",
      name: "Wikidata national football team entities",
      url: "https://www.wikidata.org/",
      role: "national-team-identity-authority",
      useWhen: "Use for QIDs, multilingual aliases, and cross-source identity enrichment after batch reconciliation.",
      packagePolicy: "Keep as identity metadata with sourceRefs; do not overwrite registry/high teams without reconciliation.",
    },
  ].filter((candidate) => !sourceIds.has(candidate.sourceId));

  return {
    generatedAt,
    packagePhase: "phase-a",
    purpose: "Machine-readable coverage and readiness map for extension UI and agent routing.",
    qualitySignals: {
      scheduleMatches: schedule.length,
      historicalMatches: results.length,
      shootoutMatches: shootouts.length,
      goalscorerRecords: goalscorers.length,
      teamIdentity: {
        teamCount: teamQuality.teamCount,
        byStatus: teamQuality.byStatus,
        byConfidence: teamQuality.byConfidence,
        lowConfidenceTeamCount: teamQuality.lowConfidenceTeams.length,
      },
      playerIdentities: {
        status: hasPlayerIdentities ? "available" : "not-in-package",
        count: snapshot.playerIdentities?.length ?? 0,
        scope: hasPlayerIdentities ? "filtered-to-known-goalscorers-or-roster-targets" : "none",
      },
      teamIdentities: {
        status: hasTeamIdentities ? "available" : "not-in-package",
        count: snapshot.teamIdentities?.length ?? 0,
        scope: hasTeamIdentities ? "registry-mapped-national-teams-only" : "none",
      },
      rosters: {
        status: hasFinalRosters ? "available-final" : hasSimulatedRosters ? "available-simulated" : hasRosters ? "available-provisional" : "not-in-package",
        teamCount: rosters.length,
        playerCount: rosters.reduce((sum, roster) => sum + (roster.players?.length ?? 0), 0),
        rosterStatuses,
      },
    },
    layers: [
      {
        layerId: "sources",
        status: "available",
        confidence: "high",
        downloadTier: "core",
        categories: ["sources"],
        filePatterns: ["data/sources/sources.json", "data/metadata/identity-gaps.json"],
        runtimeUse: "Show attribution and validate sourceRefs.",
      },
      {
        layerId: "team-taxonomy",
        status: "available-with-quality-flags",
        confidence: teamQuality.byConfidence.low ? "mixed" : "high",
        downloadTier: "core",
        categories: ["taxonomy.teams", "taxonomy.aliases", "taxonomy.teamQuality", "taxonomy.teamIdentities", "metadata.identityGaps"],
        filePatterns: ["data/taxonomy/teams.json", "data/taxonomy/team-aliases.json", "data/taxonomy/team-quality.json", "data/metadata/identity-gaps.json"],
        runtimeUse: "Resolve team names and decide when agent should warn about inferred historical teams.",
      },
      {
        layerId: "schedule",
        status: "available",
        confidence: "high",
        downloadTier: "core",
        categories: ["schedule", "taxonomy.venues", "identification.matches"],
        filePatterns: ["data/schedule/worldcup-2026.json", "data/taxonomy/venues.json", "data/identification/matches.json"],
        runtimeUse: "Identify the current match from time, page context, team aliases, venue aliases, and market query hints.",
      },
      {
        layerId: "historical-team-context",
        status: "available",
        confidence: "high",
        downloadTier: "match-context",
        categories: ["history.headToHead", "history.form", "history.shootouts"],
        filePatterns: ["data/history/head-to-head/{teamA}__{teamB}.json", "data/history/form/{teamId}.json", "data/history/shootouts.json"],
        runtimeUse: "Lazy-load only the current match teams for head-to-head, form, split, and shootout context.",
      },
      {
        layerId: "goalscorer-context",
        status: goalscorers.length ? "available" : "not-in-package",
        confidence: goalscorers.length ? "medium" : "none",
        downloadTier: "player-context",
        categories: ["history.goalscorers.index", "history.goalscorers.byTeam", "history.goalscorers.byPlayer"],
        filePatterns: [
          "data/history/goalscorers/index.json",
          "data/history/goalscorers/by-team/{teamId}.json",
          "data/history/goalscorers/by-player/{playerKey}.json",
        ],
        runtimeUse: "Use by-team summaries for team scoring history and by-player files for named-player follow-up questions.",
      },
      {
        layerId: "player-identities",
        status: hasPlayerIdentities ? "available-filtered" : "not-in-package",
        confidence: hasPlayerIdentities ? "medium" : "none",
        downloadTier: "player-context",
        categories: ["players.index", "players.identities"],
        filePatterns: ["data/players/players-index.json", "data/players/identities/{playerKey}.json"],
        runtimeUse: "Attach stable provider IDs to known historical scorers or later official-roster players.",
      },
      {
        layerId: "official-rosters",
        status: hasFinalRosters ? "available" : hasSimulatedRosters ? "available-simulated" : hasRosters ? "available-provisional" : "pending-official-final-list",
        confidence: hasFinalRosters ? "high" : hasSimulatedRosters ? "simulated" : hasRosters ? "medium" : "none",
        downloadTier: "tournament-context",
        categories: ["rosters"],
        filePatterns: ["data/rosters/worldcup-2026/{teamId}.json"],
        runtimeUse: hasRosters
          ? "Use only with rosterStatus and sourceUrl. Agent must say simulated/provisional unless rosterStatus is final."
          : "Unavailable in Phase A; agent must not claim official roster facts from this package.",
        blocker: hasFinalRosters || hasSimulatedRosters ? undefined : "Final official FIFA squad lists are not packaged yet.",
        recommendedAction: hasFinalRosters
          ? "Reconcile final squad players against Reep/Wikidata identities."
          : hasSimulatedRosters
            ? "Replace simulated squads with FIFA official final squad lists when available."
            : "Import FIFA official final squad lists, then reconcile players against Reep/Wikidata identities.",
      },
      {
        layerId: "team-profiles",
        status: results.length ? "available" : "not-in-package",
        confidence: results.length ? "medium" : "none",
        downloadTier: "match-context",
        categories: ["profiles.teams", "profiles.teams.index"],
        filePatterns: ["data/profiles/teams/index.json", "data/profiles/teams/{teamId}.json"],
        runtimeUse: "Lazy-load a compact team profile derived from cited schedule, history, form, and goalscorer inputs.",
      },
      {
        layerId: "historical-key-player-profiles",
        status: goalscorers.length ? "available" : "not-in-package",
        confidence: goalscorers.length ? "medium" : "none",
        downloadTier: "player-context",
        categories: ["profiles.keyPlayersHistorical", "profiles.keyPlayersHistorical.index"],
        filePatterns: [
          "data/profiles/key-players/historical/index.json",
          "data/profiles/key-players/historical/{teamId}/{playerKey}.json",
        ],
        runtimeUse: "Lazy-load historical key-player profiles derived from cited national-team goals and filtered Reep identities. Do not treat this as a current official roster.",
      },
      {
        layerId: "key-player-profiles",
        status: hasFinalRosters ? "available" : hasSimulatedRosters ? "available-simulated" : hasRosters ? "available-provisional" : "pending-final-rosters-and-profile-generator",
        confidence: hasFinalRosters ? "high" : hasSimulatedRosters ? "simulated" : hasRosters ? "medium" : "none",
        downloadTier: "tournament-context",
        categories: ["profiles.keyPlayersCurrent", "profiles.keyPlayersCurrent.index"],
        filePatterns: ["data/profiles/key-players/current/{teamId}/{playerKey}.json"],
        runtimeUse: hasRosters
          ? "Lazy-load current roster key-player candidates. Agent must preserve rosterStatus and say simulated/provisional unless rosterStatus is final."
          : "Unavailable until roster ingestion; generate only from cited roster, identity, club, and national-team inputs.",
        blocker: hasFinalRosters || hasSimulatedRosters ? undefined : "Current key-player profiles require final official roster confirmation before completion.",
      },
      {
        layerId: "market-mapping",
        status: "available-query-seeds-only",
        confidence: "medium",
        downloadTier: "core",
        categories: ["marketMapping.polymarket"],
        filePatterns: ["data/market-mapping/polymarket-query-seeds.json"],
        runtimeUse: "Guide Polymarket search ranking; not a source of live market prices.",
      },
    ],
    runtimeGuidance: {
      startup: ["core"],
      matchDetection: ["core"],
      matchAnalysis: ["core", "match-context"],
      playerFollowUp: ["core", "match-context", "tournament-context", "player-context"],
      developerAudit: ["audit"],
    },
    optionalCandidateSources,
  };
}

function buildLayerIndexMetadata({ generatedAt }) {
  return {
    generatedAt,
    purpose: "Machine-readable navigation map for extension download planning and agent retrieval.",
    guidance: {
      coreFirst: "Load core before any match or player context.",
      exactPath: "Prefer exact known paths. Use fileIndexes only to discover optional files outside root manifest.",
      noFactClaims: "This file is routing metadata only; use sourceRefs in target files for factual claims.",
    },
    layers: [
      {
        layerId: "startup",
        downloadTiers: ["core"],
        categories: ["metadata.coverage", "metadata.layerIndex", "metadata.identityGaps", "metadata.sourceAudit", "sources"],
        required: true,
        useWhen: "Open extension, show data status, decide available capabilities, and explain source decisions.",
      },
      {
        layerId: "match-detection",
        downloadTiers: ["core"],
        categories: ["identification.matches", "schedule", "taxonomy.teams", "taxonomy.aliases", "taxonomy.venues", "marketMapping.polymarket"],
        required: true,
        useWhen: "Rank current-page match candidates from time, teams, venue, page text, and market query hints.",
      },
      {
        layerId: "match-analysis",
        downloadTiers: ["core", "match-context"],
        categories: ["history.headToHead", "history.form", "history.shootouts", "profiles.teams"],
        pathTemplates: [
          "data/history/head-to-head/{orderedTeamA}__{orderedTeamB}.json",
          "data/history/form/{teamId}.json",
          "data/profiles/teams/{teamId}.json",
        ],
        useWhen: "Analyze current match teams, historical head-to-head, form, and team profile context.",
      },
      {
        layerId: "historical-player-analysis",
        downloadTiers: ["core", "player-context"],
        categories: ["history.goalscorers.byTeam", "history.goalscorers.byPlayer", "profiles.keyPlayersHistorical", "players.identities"],
        pathTemplates: [
          "data/history/goalscorers/by-team/{teamId}.json",
          "data/history/goalscorers/by-player/{playerKey}.json",
          "data/profiles/key-players/historical/{teamId}/index.json",
          "data/profiles/key-players/historical/{teamId}/{playerKey}.json",
          "data/players/identities/{playerKey}.json",
        ],
        useWhen: "Answer historical scorer, named player, and national-team player identity questions.",
      },
      {
        layerId: "current-roster-analysis",
        downloadTiers: ["core", "tournament-context", "player-context"],
        categories: ["rosters.worldcup2026", "profiles.keyPlayersCurrent", "players.identities"],
        pathTemplates: [
          "data/rosters/worldcup-2026/{teamId}.json",
          "data/profiles/key-players/current/{teamId}/index.json",
          "data/profiles/key-players/current/{teamId}/{playerKey}.json",
          "data/players/identities/{playerKey}.json",
        ],
        useWhen: "Answer roster and current key-player questions only when coverage says roster/profile layers are available.",
      },
      {
        layerId: "market-analysis",
        downloadTiers: ["core"],
        categories: ["marketMapping.polymarket"],
        pathTemplates: ["data/market-mapping/polymarket-query-seeds.json"],
        useWhen: "Rank Polymarket search queries and related event discovery. Not a live price source.",
      },
      {
        layerId: "developer-audit",
        downloadTiers: ["audit"],
        categories: ["checksums", "metadata.sourceInputs"],
        pathTemplates: ["checksums/sha256.txt", "data/metadata/source-inputs.json"],
        useWhen: "Verify package provenance, hashes, and local raw input freshness.",
      },
    ],
  };
}

function buildSourceAuditMetadata({ snapshot, teams, generatedAt }) {
  const sourceIds = new Set(snapshot.sources.map((source) => source.sourceId));
  const sourcePresent = (sourceId) => sourceIds.has(sourceId);
  const hasSimulatedSquads = sourcePresent("world-cup-copilot-simulated-squads");
  const rosterStatuses = uniqueStrings((snapshot.rosters ?? []).map((roster) => roster.rosterStatus ?? "unknown"));
  const hasFinalRosters = (snapshot.rosters ?? []).length > 0 && rosterStatuses.every((status) => status === "final");
  const hasRosterSource = sourcePresent("fifa-squad-announcements-2026") || hasSimulatedSquads;
  const officialRosterSourceIds = hasFinalRosters
    ? ["fifa-squad-announcements-2026"].filter(sourcePresent)
    : ["fifa-squad-announcements-2026", "world-cup-copilot-simulated-squads"].filter(sourcePresent);
  const officialRosterCandidateSourceIds = hasFinalRosters
    ? ["fifa-squad-announcements-2026"]
    : ["fifa-squad-announcements-2026", "world-cup-copilot-simulated-squads"];
  const identityGapSummary = buildIdentityGaps(teams ?? [], generatedAt).summary;
  const teamIdentityGapsResolved =
    (identityGapSummary.lowConfidenceTeamCount ?? 0) === 0 &&
    (identityGapSummary.missingSourceRefTeamCount ?? 0) === 0 &&
    (identityGapSummary.duplicateFifaCodeCount ?? 0) === 0;
  const teamIdentityDecision = sourcePresent("wikidata-national-football-teams")
    ? "reconcile-with-wikidata"
    : teamIdentityGapsResolved
      ? "keep-source-derived-await-official-ids"
      : "await-wikidata-export";

  return {
    generatedAt,
    purpose: "Machine-readable source decisions for package QA, extension UI, and agent routing.",
    switchPolicy: {
      rule: "Do not replace a current primary source unless the candidate is strictly better on authority, license, structure, coverage, and redistributability.",
      comparisonDimensions: ["authority", "license", "structure", "coverage", "redistributability", "runtimeCost"],
      currentDecision: "keep-layered-stack",
      reason: "No single free public source is strictly better than the current Phase A combination for all required data layers.",
    },
    layers: [
      {
        layerId: "schedule",
        primarySourceIds: ["openfootball-worldcup-json"].filter(sourcePresent),
        authoritySource: "FIFA official schedule",
        decision: "keep-primary-and-audit-with-official-source",
        status: sourcePresent("openfootball-worldcup-json") ? "usable" : "missing-primary",
        reason: "openfootball is structured and redistributable; FIFA is authoritative but better used as audit/import reference before redistribution.",
        nextGate: "Run FIFA fixture audit for group-stage and knockout schedule before publishing a new data release.",
      },
      {
        layerId: "national-team-history",
        primarySourceIds: ["martj42-international-results"].filter(sourcePresent),
        decision: "keep-primary",
        status: sourcePresent("martj42-international-results") ? "usable" : "missing-primary",
        reason: "Long-running CC0 CSV history remains the best free base for head-to-head, form, tournament, and shootout summaries.",
        nextGate: "Cross-check selected records against openfootball/internationals only if discrepancies appear.",
      },
      {
        layerId: "team-identity",
        primarySourceIds: ["world-cup-copilot-team-registry", "wikidata-national-football-teams"].filter(sourcePresent),
        decision: teamIdentityDecision,
        status: sourcePresent("world-cup-copilot-team-registry")
          ? teamIdentityGapsResolved
            ? "usable-source-derived"
            : "usable-with-gaps"
          : "missing-registry",
        reason: teamIdentityGapsResolved
          ? "Registry protects the 48 World Cup teams and historical teams carry sourceRefs without duplicate FIFA-code risk; Wikidata remains an optional official-ID enrichment."
          : "Registry protects the 48 World Cup teams; Wikidata national-team QIDs should reduce historical identity gaps when a stable export is available.",
        nextGate: teamIdentityGapsResolved
          ? "Use Wikidata/FIFA IDs as enrichment, not as a blocker, unless identity-gaps.json regresses."
          : "Use identity-gaps.json to verify low-confidence and duplicate FIFA-code counts decrease after reconciliation.",
      },
      {
        layerId: "player-identity",
        primarySourceIds: ["withqwerty-reep"].filter(sourcePresent),
        decision: sourcePresent("withqwerty-reep") ? "keep-filtered-subset" : "await-identity-source",
        status: sourcePresent("withqwerty-reep") ? "usable-filtered" : "missing-primary",
        reason: "Reep is valuable for provider IDs, but only filtered player identities should ship in the plugin package.",
        nextGate: "After official rosters are imported, filter Reep/Wikidata identities to roster and known-goalscorer players.",
      },
      {
        layerId: "official-rosters",
        primarySourceIds: officialRosterSourceIds,
        candidateSourceIds: officialRosterCandidateSourceIds,
        decision: hasFinalRosters
          ? "package-final-official-rosters"
          : sourcePresent("fifa-squad-announcements-2026")
            ? "package-with-roster-status"
            : hasSimulatedSquads
              ? "use-simulated-until-official"
              : "wait-for-official-import-or-simulation",
        status: hasRosterSource
          ? hasFinalRosters
            ? "final-packaged"
            : hasSimulatedSquads
              ? "simulated-packaged"
              : "provisional-packaged"
          : "not-packaged",
        reason: hasFinalRosters
          ? "FIFA final squad lists are packaged as official roster facts with source URLs and rosterStatus=final."
          : hasSimulatedSquads
            ? "User accepted simulated roster facts for current development; they must stay labelled simulated and be replaced by FIFA final lists later."
            : "Official final squad facts should come from FIFA or federation sources; media projections must not become canonical final roster data.",
        nextGate: hasFinalRosters
          ? "Keep final roster input under release audit and update only from official FIFA or federation sources."
          : hasSimulatedSquads
            ? "Replace simulated squads with FIFA final squad lists when available; keep simulated label in agent responses."
            : "Import FIFA final squad lists with source metadata, or generate labelled simulated squads for current development.",
      },
      {
        layerId: "club-form-and-player-workload",
        primarySourceIds: [],
        candidateSourceIds: ["transfermarkt-derived", "statsbomb-open-data", "fifpro-workload-reports"],
        decision: "defer-or-derive-summaries-only",
        status: "not-packaged",
        reason: "Useful for analysis, but raw redistribution and cross-league completeness are weaker than Phase A sources.",
        nextGate: "Only publish cited derived summaries after license/legal review and official roster linkage.",
      },
      {
        layerId: "live-sports-api",
        primarySourceIds: [],
        candidateSourceIds: ["api-football", "football-data.org"],
        decision: "user-key-runtime-only",
        status: "not-packaged",
        reason: "Free quota APIs can supplement live-ish state with user keys, but they are not the offline historical data authority.",
        nextGate: "Keep API quota, cache TTL, and provider fallback separate from the static data package.",
      },
    ],
    rejectedAsPrimary: [
      {
        sourceId: "soccerdata",
        reason: "Useful scraper framework, not a redistributable canonical data source for this package.",
      },
      {
        sourceId: "worldfootballR",
        reason: "Useful extraction toolkit, but not strictly better than current CC0 raw sources for packaged facts.",
      },
      {
        sourceId: "media-and-social",
        reason: "Good qualitative context, not stable enough for canonical structured facts.",
      },
    ],
    candidateComparisons: buildSourceCandidateComparisons({ sourcePresent, teamIdentityGapsResolved }),
  };
}

function buildSourceCandidateComparisons({ sourcePresent, teamIdentityGapsResolved }) {
  return [
    {
      layerId: "schedule",
      currentPrimarySourceIds: ["openfootball-worldcup-json"].filter(sourcePresent),
      candidates: [
        {
          sourceId: "fifa-official-schedule",
          role: "authority-audit-source",
          decision: "use-as-audit-or-import-reference",
          strictlyBetterThanCurrent: false,
          reason: "FIFA is more authoritative, but openfootball remains more redistributable and easier to package as structured data. Keep FIFA as audit/import authority unless redistribution and structure are both solved.",
          dimensions: {
            authority: "better",
            license: "weaker",
            structure: "weaker",
            coverage: "equal",
            redistributability: "weaker",
            runtimeCost: "weaker",
          },
          requiredGates: ["official fixture audit passes", "redistribution policy reviewed", "structured import parser available"],
        },
      ],
    },
    {
      layerId: "national-team-history",
      currentPrimarySourceIds: ["martj42-international-results"].filter(sourcePresent),
      candidates: [
        {
          sourceId: "openfootball-internationals",
          role: "cross-check-source",
          decision: "keep-as-cross-check",
          strictlyBetterThanCurrent: false,
          reason: "Useful Football.TXT mirror, but not strictly better than the current CC0 CSV base on structure and long-history coverage for this package.",
          dimensions: {
            authority: "equal",
            license: "equal",
            structure: "weaker",
            coverage: "equal",
            redistributability: "equal",
            runtimeCost: "equal",
          },
          requiredGates: ["diff selected records before changing primary source"],
        },
        {
          sourceId: "kaggle-or-media-history-datasets",
          role: "rejected-primary",
          decision: "reject-as-primary",
          strictlyBetterThanCurrent: false,
          reason: "Coverage can be useful, but license clarity and reproducibility are weaker than CC0 source-controlled CSV.",
          dimensions: {
            authority: "weaker",
            license: "weaker",
            structure: "mixed",
            coverage: "mixed",
            redistributability: "weaker",
            runtimeCost: "weaker",
          },
          requiredGates: ["license review", "raw provenance review"],
        },
      ],
    },
    {
      layerId: "team-identity",
      currentPrimarySourceIds: ["world-cup-copilot-team-registry", "wikidata-national-football-teams"].filter(sourcePresent),
      candidates: [
        {
          sourceId: "wikidata-national-football-teams",
          role: "identity-enrichment-source",
          decision: teamIdentityGapsResolved ? "use-as-enrichment" : "use-to-reduce-identity-gaps",
          strictlyBetterThanCurrent: false,
          reason: teamIdentityGapsResolved
            ? "Current measured identity risk is already zero; Wikidata remains valuable for QIDs and aliases, not as a full replacement for registry/source-derived identities."
            : "Use Wikidata to reduce measured identity gaps, then re-run identity-gaps audit before promotion.",
          dimensions: {
            authority: "better-for-provider-ids",
            license: "equal",
            structure: "mixed",
            coverage: "better-for-identities",
            redistributability: "equal",
            runtimeCost: "equal",
          },
          requiredGates: ["identity-gaps low-confidence count decreases", "duplicate FIFA-code count remains zero"],
        },
      ],
    },
    {
      layerId: "player-identity",
      currentPrimarySourceIds: ["withqwerty-reep"].filter(sourcePresent),
      candidates: [
        {
          sourceId: "wikidata-player-entities",
          role: "identity-enrichment-source",
          decision: "use-as-filtered-enrichment-after-roster",
          strictlyBetterThanCurrent: false,
          reason: "Wikidata can improve player aliases and QIDs, but should be filtered to roster/goalscorer players and reconciled rather than replacing the current Reep-derived provider ID subset.",
          dimensions: {
            authority: "mixed",
            license: "equal",
            structure: "weaker",
            coverage: "better",
            redistributability: "equal",
            runtimeCost: "weaker",
          },
          requiredGates: ["final roster imported", "player identity collision audit passes"],
        },
      ],
    },
    {
      layerId: "official-rosters",
      currentPrimarySourceIds: ["fifa-squad-announcements-2026"].filter(sourcePresent),
      candidates: [
        {
          sourceId: "fifa-squad-announcements-2026",
          role: "official-authority-source",
          decision: sourcePresent("fifa-squad-announcements-2026") ? "package-with-roster-status" : "import-when-available",
          strictlyBetterThanCurrent: sourcePresent("fifa-squad-announcements-2026") ? false : true,
          reason: sourcePresent("fifa-squad-announcements-2026")
            ? "Already selected as the roster authority; keep provisional/final status explicit."
            : "FIFA is the official roster authority and should be imported once source JSON is prepared.",
          dimensions: {
            authority: "better",
            license: "acceptable-with-attribution",
            structure: "requires-parser",
            coverage: "better",
            redistributability: "mixed",
            runtimeCost: "equal",
          },
          requiredGates: ["rosterStatus preserved", "sourceUrl preserved", "final lists confirmed before completion"],
        },
      ],
    },
    {
      layerId: "club-form-and-player-workload",
      currentPrimarySourceIds: [],
      candidates: [
        {
          sourceId: "statsbomb-open-data",
          role: "optional-context-source",
          decision: "defer-or-derived-summaries-only",
          strictlyBetterThanCurrent: false,
          reason: "Excellent open event data for covered competitions, but not a complete cross-league current-form source for every World Cup roster player.",
          dimensions: {
            authority: "better-for-covered-events",
            license: "usable-with-terms",
            structure: "better",
            coverage: "weaker",
            redistributability: "mixed",
            runtimeCost: "weaker",
          },
          requiredGates: ["license review", "coverage map by roster player"],
        },
        {
          sourceId: "transfermarkt-derived",
          role: "optional-derived-summary-source",
          decision: "defer-pending-rights-review",
          strictlyBetterThanCurrent: false,
          reason: "Useful for clubs and market context, but redistribution rights and scraping fragility make it unsuitable as a package primary source.",
          dimensions: {
            authority: "mixed",
            license: "weaker",
            structure: "weaker",
            coverage: "better",
            redistributability: "weaker",
            runtimeCost: "weaker",
          },
          requiredGates: ["rights review", "derived-summary-only policy"],
        },
      ],
    },
    {
      layerId: "live-sports-api",
      currentPrimarySourceIds: [],
      candidates: [
        {
          sourceId: "api-football",
          role: "user-key-runtime-source",
          decision: "runtime-only-not-static-primary",
          strictlyBetterThanCurrent: false,
          reason: "Can improve live-ish match state with user keys, but quota, latency, and terms make it unsuitable as the offline historical data authority.",
          dimensions: {
            authority: "mixed",
            license: "api-terms",
            structure: "better",
            coverage: "better-live",
            redistributability: "weaker",
            runtimeCost: "weaker",
          },
          requiredGates: ["user key present", "quota guard", "TTL cache"],
        },
        {
          sourceId: "football-data-org",
          role: "user-key-runtime-source",
          decision: "runtime-only-not-static-primary",
          strictlyBetterThanCurrent: false,
          reason: "Useful fallback API, but user-key quota and coverage limits mean it supplements rather than replaces the static package.",
          dimensions: {
            authority: "mixed",
            license: "api-terms",
            structure: "better",
            coverage: "mixed",
            redistributability: "weaker",
            runtimeCost: "weaker",
          },
          requiredGates: ["user key present", "provider fallback", "TTL cache"],
        },
      ],
    },
  ];
}

function buildPolymarketQuerySeeds(schedule, teams, generatedAt) {
  const teamById = new Map(teams.map((team) => [team.teamId, team]));
  const teamQueries = {};
  const matchQueries = {};
  const sourceRefs = [];

  for (const team of teams) {
    if (team.isPlaceholder) continue;
    teamQueries[team.teamId] = uniqueStrings([
      `${team.name} World Cup`,
      `${team.name} 2026 World Cup`,
      `${team.name} to win World Cup`,
      team.fifaCode ? `${team.fifaCode} World Cup` : undefined,
      ...(team.aliases ?? []).map((alias) => `${alias} World Cup`),
    ]).slice(0, 10);
  }

  for (const match of schedule) {
    const homeTeam = teamById.get(match.homeTeamId);
    const awayTeam = teamById.get(match.awayTeamId);
    if (!homeTeam || !awayTeam || homeTeam.isPlaceholder || awayTeam.isPlaceholder) continue;
    sourceRefs.push(...(match.sourceRefs ?? []));
    matchQueries[match.matchId] = uniqueStrings([
      `${homeTeam.name} ${awayTeam.name} World Cup`,
      `${homeTeam.name} vs ${awayTeam.name}`,
      `${homeTeam.name} ${awayTeam.name} 2026 World Cup`,
      `${homeTeam.name} ${awayTeam.name} ${match.stage ?? "World Cup"}`,
      match.group ? `${homeTeam.name} ${match.group}` : undefined,
      match.group ? `${awayTeam.name} ${match.group}` : undefined,
      homeTeam.fifaCode && awayTeam.fifaCode ? `${homeTeam.fifaCode} ${awayTeam.fifaCode} World Cup` : undefined,
      ...(homeTeam.aliases ?? []).flatMap((homeAlias) =>
        (awayTeam.aliases ?? []).slice(0, 3).map((awayAlias) => `${homeAlias} ${awayAlias} World Cup`),
      ),
    ]).slice(0, 16);
  }

  return {
    generatedAt,
    provider: "polymarket",
    tournamentQueries: [
      "2026 World Cup winner",
      "World Cup champion",
      "FIFA World Cup 2026 champion",
      "World Cup Golden Boot",
      "2026 World Cup Golden Boot",
    ],
    matchQueries,
    teamQueries,
    sourceRefs: uniqueSourceRefs(sourceRefs),
  };
}

function buildMatchIdentificationIndex(schedule, teams, venues, generatedAt) {
  const teamById = new Map(teams.map((team) => [team.teamId, team]));
  const venueById = new Map((venues ?? []).map((venue) => [venue.venueId, venue]));
  const matches = [];
  const sourceRefs = [];

  for (const match of schedule) {
    const homeTeam = teamById.get(match.homeTeamId);
    const awayTeam = teamById.get(match.awayTeamId);
    const venue = venueById.get(match.venueId);
    sourceRefs.push(...(match.sourceRefs ?? []), ...(venue?.sourceRefs ?? []));

    matches.push({
      matchId: match.matchId,
      stage: match.stage,
      group: match.group,
      kickoffUtc: match.kickoffUtc,
      localDate: match.localDate,
      localTime: match.localTime,
      timezone: match.timezone,
      teams: [
        compactIdentificationTeam(homeTeam, match.homeTeamId, "home"),
        compactIdentificationTeam(awayTeam, match.awayTeamId, "away"),
      ],
      venue: {
        venueId: match.venueId,
        city: match.city ?? venue?.city,
        country: match.country ?? venue?.country,
        aliases: normalizeIdentificationAliases([
          match.venueId,
          match.city,
          venue?.displayName,
          venue?.city,
          ...(venue?.aliases ?? []),
        ]),
      },
      queryHints: buildMatchIdentificationQueries(match, homeTeam, awayTeam, venue),
      hasPlaceholderTeam: homeTeam?.isPlaceholder === true || awayTeam?.isPlaceholder === true,
    });
  }

  return {
    generatedAt,
    purpose: "Compact core index for extension and agent match detection from page text, watch-site context, local time, venue text, and market search hints.",
    algorithmHint:
      "Score candidate matches by normalized team aliases, venue aliases, time-window proximity, and market query hints. Treat placeholder knockout teams as low-confidence until teams are known.",
    defaultWeights: {
      teamAlias: 0.45,
      placeholderTeamAlias: 0.35,
      venueAlias: 0.2,
      timeWindow: 0.25,
      marketQuery: 0.1,
    },
    matchCount: matches.length,
    matches,
    sourceRefs: uniqueSourceRefs(sourceRefs),
  };
}

function compactIdentificationTeam(team, fallbackTeamId, side) {
  return {
    side,
    teamId: team?.teamId ?? fallbackTeamId,
    name: team?.name ?? fallbackTeamId,
    fifaCode: team?.fifaCode,
    identityConfidence: team?.identityConfidence ?? "placeholder",
    isPlaceholder: team?.isPlaceholder === true,
    aliases: normalizeIdentificationAliases([
      team?.name,
      team?.fifaCode,
      team?.derivedCode,
      ...(team?.aliases ?? []),
    ]),
  };
}

function buildMatchIdentificationQueries(match, homeTeam, awayTeam, venue) {
  const homeName = homeTeam?.name;
  const awayName = awayTeam?.name;
  return uniqueStrings([
    homeName && awayName ? `${homeName} vs ${awayName}` : undefined,
    homeName && awayName ? `${homeName} ${awayName} World Cup` : undefined,
    homeName && awayName && match.group ? `${homeName} ${awayName} ${match.group}` : undefined,
    homeTeam?.fifaCode && awayTeam?.fifaCode ? `${homeTeam.fifaCode} ${awayTeam.fifaCode} World Cup` : undefined,
    venue?.displayName,
    venue?.city,
    match.city,
  ]).slice(0, 12);
}

function normalizeIdentificationAliases(values) {
  return uniqueStrings(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean));
}

function buildPairGroups(results) {
  const groups = new Map();
  for (const result of results) {
    const pairKey = makePairKey(result.homeTeamId, result.awayTeamId);
    const existing = groups.get(pairKey) ?? [];
    existing.push(result);
    groups.set(pairKey, existing);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function buildShootoutGroups(shootouts) {
  const groups = new Map();
  for (const shootout of shootouts) {
    const pairKey = makePairKey(shootout.homeTeamId, shootout.awayTeamId);
    const existing = groups.get(pairKey) ?? [];
    existing.push(shootout);
    groups.set(pairKey, existing);
  }
  return groups;
}

function buildHeadToHead(pairKey, matches, shootouts = []) {
  const [teamAId, teamBId] = pairKey.split(PAIR_KEY_DELIMITER);
  const sortedMatches = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const allTime = aggregatePairStats(teamAId, teamBId, sortedMatches);

  const lastMeeting = sortedMatches.at(-1);
  return {
    pairKey,
    teamAId,
    teamBId,
    allTime,
    splits: {
      worldCup: aggregatePairStats(teamAId, teamBId, sortedMatches.filter(isWorldCupTournament)),
      competitive: aggregatePairStats(teamAId, teamBId, sortedMatches.filter(isCompetitiveTournament)),
      friendly: aggregatePairStats(teamAId, teamBId, sortedMatches.filter((match) => !isCompetitiveTournament(match))),
      neutralVenue: aggregatePairStats(teamAId, teamBId, sortedMatches.filter((match) => match.neutral)),
      nonNeutralVenue: aggregatePairStats(teamAId, teamBId, sortedMatches.filter((match) => !match.neutral)),
    },
    lastMeeting: summarizeMatch(lastMeeting),
    shootoutSummary: buildShootoutSummary(teamAId, teamBId, shootouts),
    matches: sortedMatches.map((match) => summarizeMatch(match)),
    sourceRefs: uniqueSourceRefs([...sortedMatches, ...shootouts].flatMap((match) => match.sourceRefs ?? [])),
  };
}

function aggregatePairStats(teamAId, teamBId, matches) {
  const aggregate = {
    matches: matches.length,
    teamAWins: 0,
    draws: 0,
    teamBWins: 0,
    teamAGoals: 0,
    teamBGoals: 0,
  };

  for (const match of matches) {
    const teamAGoals = goalsFor(match, teamAId);
    const teamBGoals = goalsFor(match, teamBId);
    aggregate.teamAGoals += teamAGoals;
    aggregate.teamBGoals += teamBGoals;
    if (teamAGoals > teamBGoals) aggregate.teamAWins += 1;
    else if (teamAGoals < teamBGoals) aggregate.teamBWins += 1;
    else aggregate.draws += 1;
  }
  return aggregate;
}

function isWorldCupTournament(match) {
  return normalizeTournament(match.tournament) === "fifa world cup";
}

function isCompetitiveTournament(match) {
  const tournament = normalizeTournament(match.tournament);
  return tournament !== "friendly";
}

function normalizeTournament(tournament) {
  return String(tournament ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildShootoutSummary(teamAId, teamBId, shootouts) {
  if (!shootouts.length) return undefined;
  const summary = {
    matches: shootouts.length,
    teamAWins: 0,
    teamBWins: 0,
    firstShooterTeamA: 0,
    firstShooterTeamB: 0,
  };
  for (const shootout of shootouts) {
    if (shootout.winnerTeamId === teamAId) summary.teamAWins += 1;
    if (shootout.winnerTeamId === teamBId) summary.teamBWins += 1;
    if (shootout.firstShooterTeamId === teamAId) summary.firstShooterTeamA += 1;
    if (shootout.firstShooterTeamId === teamBId) summary.firstShooterTeamB += 1;
  }
  return summary;
}

function writeGoalscorerFiles(files, goalscorers) {
  const teams = new Map();
  const players = new Map();
  for (const goal of goalscorers) {
    const teamGoals = teams.get(goal.teamId) ?? [];
    teamGoals.push(goal);
    teams.set(goal.teamId, teamGoals);

    const playerKey = playerKeyFor(goal.scorer);
    const playerGoals = players.get(playerKey) ?? [];
    playerGoals.push(goal);
    players.set(playerKey, playerGoals);
  }

  setJson(files, "data/history/goalscorers/index.json", {
    firstGoalDate: goalscorers[0]?.date ?? null,
    goalCount: goalscorers.length,
    lastGoalDate: goalscorers.at(-1)?.date ?? null,
    playerCount: players.size,
    teamCount: teams.size,
    sourceRefs: uniqueSourceRefs(goalscorers.flatMap((goal) => goal.sourceRefs ?? [])),
  });

  for (const [teamId, teamGoals] of [...teams.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sortedGoals = teamGoals.sort(compareGoal);
    setJson(files, `data/history/goalscorers/by-team/${teamId}.json`, {
      teamId,
      goalCount: sortedGoals.length,
      topScorers: summarizeTopScorers(sortedGoals),
      recentGoals: sortedGoals.slice(-50).reverse().map(compactGoal),
      sourceRefs: uniqueSourceRefs(sortedGoals.flatMap((goal) => goal.sourceRefs ?? [])),
    });
  }

  for (const [playerKey, playerGoals] of [...players.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sortedGoals = playerGoals.sort(compareGoal);
    setJson(files, `data/history/goalscorers/by-player/${playerKey}.json`, {
      playerKey,
      scorer: sortedGoals[0].scorer,
      normalizedScorer: normalizeAlias(sortedGoals[0].scorer),
      goalCount: sortedGoals.length,
      teams: [...new Set(sortedGoals.map((goal) => goal.teamId))].sort(),
      goals: sortedGoals,
      sourceRefs: uniqueSourceRefs(sortedGoals.flatMap((goal) => goal.sourceRefs ?? [])),
    });
  }
}

function writePlayerIdentityFiles(files, playerIdentities, generatedAt) {
  const sorted = [...playerIdentities].sort((a, b) => a.playerKey.localeCompare(b.playerKey));
  setJson(files, "data/players/players-index.json", {
    generatedAt,
    playerCount: sorted.length,
    sourceRefs: uniqueSourceRefs(sorted.flatMap((player) => player.sourceRefs ?? [])),
  });
  for (const player of sorted) {
    setJson(files, `data/players/identities/${player.playerKey}.json`, player);
  }
}

function writeHistoricalKeyPlayerProfileFiles(files, teams, goalscorers, playerIdentities, generatedAt) {
  const teamById = new Map(teams.map((team) => [team.teamId, team]));
  const identityByPlayerKey = new Map(playerIdentities.map((identity) => [identity.playerKey, identity]));
  const goalsByTeam = new Map();
  for (const goal of goalscorers) {
    const teamGoals = goalsByTeam.get(goal.teamId) ?? [];
    teamGoals.push(goal);
    goalsByTeam.set(goal.teamId, teamGoals);
  }

  const indexTeams = [];
  let profileCount = 0;
  for (const [teamId, teamGoals] of [...goalsByTeam.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const topPlayers = summarizeTopScorers(teamGoals).slice(0, 12);
    const profiles = [];
    for (const player of topPlayers) {
      const playerGoals = teamGoals.filter((goal) => playerKeyFor(goal.scorer) === player.playerKey).sort(compareGoal);
      const identity = identityByPlayerKey.get(player.playerKey);
      const profile = buildHistoricalKeyPlayerProfile({
        generatedAt,
        identity,
        player,
        playerGoals,
        team: teamById.get(teamId),
        teamId,
      });
      profiles.push({
        goalCount: profile.goalCount,
        playerKey: profile.playerKey,
        profilePath: `data/profiles/key-players/historical/${teamId}/${profile.playerKey}.json`,
        scorer: profile.scorer,
      });
      setJson(files, `data/profiles/key-players/historical/${teamId}/${profile.playerKey}.json`, profile);
      profileCount += 1;
    }
    setJson(files, `data/profiles/key-players/historical/${teamId}/index.json`, {
      generatedAt,
      profileCount: profiles.length,
      profiles,
      profileType: "historical-national-team-scorer",
      sourceRefs: uniqueSourceRefs(teamGoals.flatMap((goal) => goal.sourceRefs ?? [])),
      teamId,
      teamName: teamById.get(teamId)?.name ?? teamId,
    });
    indexTeams.push({
      profileCount: profiles.length,
      teamId,
      teamName: teamById.get(teamId)?.name ?? teamId,
    });
  }

  setJson(files, "data/profiles/key-players/historical/index.json", {
    generatedAt,
    profileCount,
    profileType: "historical-national-team-scorer",
    teams: indexTeams,
    sourceRefs: uniqueSourceRefs(goalscorers.flatMap((goal) => goal.sourceRefs ?? [])),
  });
}

function writeCurrentKeyPlayerProfileFiles(files, teams, rosters, goalscorers, playerIdentities, generatedAt) {
  const teamById = new Map(teams.map((team) => [team.teamId, team]));
  const identityByPlayerKey = new Map(playerIdentities.map((identity) => [identity.playerKey, identity]));
  const goalsByPlayerTeam = new Map();
  for (const goal of goalscorers) {
    goalsByPlayerTeam.set(`${goal.teamId}:${playerKeyFor(goal.scorer)}`, [
      ...(goalsByPlayerTeam.get(`${goal.teamId}:${playerKeyFor(goal.scorer)}`) ?? []),
      goal,
    ]);
  }

  const indexTeams = [];
  let profileCount = 0;
  for (const roster of [...rosters].sort((a, b) => a.teamId.localeCompare(b.teamId))) {
    const candidates = [...(roster.players ?? [])]
      .map((player) => {
        const historicalGoals = goalsByPlayerTeam.get(`${roster.teamId}:${player.playerKey}`) ?? [];
        return {
          historicalGoalCount: historicalGoals.length,
          player,
          score: historicalGoals.length * 100 + (player.shirtNumber ? 20 : 0) + Math.max(0, 30 - (player.order ?? 99)),
        };
      })
      .sort((a, b) => b.score - a.score || (a.player.order ?? 99) - (b.player.order ?? 99) || a.player.name.localeCompare(b.player.name))
      .slice(0, 12);
    const profiles = candidates.map(({ historicalGoalCount, player }) => {
      const profile = buildCurrentKeyPlayerProfile({
        generatedAt,
        historicalGoals: (goalsByPlayerTeam.get(`${roster.teamId}:${player.playerKey}`) ?? []).sort(compareGoal),
        identity: identityByPlayerKey.get(player.playerKey),
        player,
        roster,
        team: teamById.get(roster.teamId),
      });
      setJson(files, `data/profiles/key-players/current/${roster.teamId}/${profile.playerKey}.json`, profile);
      profileCount += 1;
      return {
        historicalGoalCount,
        name: profile.name,
        playerKey: profile.playerKey,
        position: profile.position,
        profilePath: `data/profiles/key-players/current/${roster.teamId}/${profile.playerKey}.json`,
      };
    });
    setJson(files, `data/profiles/key-players/current/${roster.teamId}/index.json`, {
      generatedAt,
      profileCount: profiles.length,
      profileScope: "current-roster-key-player-candidate",
      profileStatus: currentRosterProfileStatus(roster.rosterStatus),
      profiles,
      rosterStatus: roster.rosterStatus,
      sourceRefs: roster.sourceRefs ?? [],
      teamId: roster.teamId,
      teamName: roster.teamName,
    });
    indexTeams.push({
      profileCount: profiles.length,
      rosterStatus: roster.rosterStatus,
      teamId: roster.teamId,
      teamName: roster.teamName,
    });
  }

  setJson(files, "data/profiles/key-players/current/index.json", {
    generatedAt,
    profileCount,
    profileScope: "current-roster-key-player-candidate",
    teams: indexTeams,
    sourceRefs: uniqueSourceRefs(rosters.flatMap((roster) => roster.sourceRefs ?? [])),
  });
}

function buildCurrentKeyPlayerProfile({ generatedAt, historicalGoals, identity, player, roster, team }) {
  return {
    generatedAt,
    club: player.club,
    historicalNationalTeamGoals: historicalGoals.length,
    identity: identity
      ? {
          dateOfBirth: identity.dateOfBirth,
          fullName: identity.fullName,
          nationality: identity.nationality,
          playerKey: identity.playerKey,
          position: identity.position,
          providerIds: identity.providerIds,
          sourceRefs: identity.sourceRefs ?? [],
        }
      : undefined,
    name: player.name,
    playerKey: player.playerKey,
    position: player.position,
    profileScope: "current-roster-key-player-candidate",
    profileStatus: currentRosterProfileStatus(roster.rosterStatus),
    roster: {
      announcementDate: roster.announcementDate,
      rosterStatus: roster.rosterStatus,
      sourceUrl: roster.sourceUrl,
    },
    shirtNumber: player.shirtNumber,
    teamId: roster.teamId,
    teamName: team?.name ?? roster.teamName,
    recentHistoricalGoals: historicalGoals.slice(-10).reverse().map(compactGoal),
    sourceRefs: uniqueSourceRefs([...(identity?.sourceRefs ?? []), ...(roster.sourceRefs ?? []), ...historicalGoals.flatMap((goal) => goal.sourceRefs ?? [])]),
  };
}

function currentRosterProfileStatus(rosterStatus) {
  if (rosterStatus === "final") return "available-final";
  if (rosterStatus === "simulated") return "available-simulated";
  return "available-provisional";
}

function buildHistoricalKeyPlayerProfile({ generatedAt, identity, player, playerGoals, team, teamId }) {
  const sortedGoals = [...playerGoals].sort(compareGoal);
  const tournaments = new Map();
  for (const goal of sortedGoals) {
    const key = goal.tournament ?? "unknown";
    const existing = tournaments.get(key) ?? 0;
    tournaments.set(key, existing + 1);
  }
  return {
    generatedAt,
    identity: identity
      ? {
          dateOfBirth: identity.dateOfBirth,
          fullName: identity.fullName,
          nationality: identity.nationality,
          playerKey: identity.playerKey,
          position: identity.position,
          providerIds: identity.providerIds,
          sourceRefs: identity.sourceRefs ?? [],
        }
      : undefined,
    goalCount: sortedGoals.length,
    firstGoalDate: sortedGoals[0]?.date,
    lastGoalDate: sortedGoals.at(-1)?.date,
    playerKey: player.playerKey,
    profileScope: "historical-national-team-scorer",
    profileStatus: "available-historical",
    scorer: player.scorer,
    teamId,
    teamName: team?.name ?? teamId,
    tournaments: [...tournaments.entries()]
      .map(([tournament, goals]) => ({ goals, tournament }))
      .sort((a, b) => b.goals - a.goals || a.tournament.localeCompare(b.tournament))
      .slice(0, 12),
    recentGoals: sortedGoals.slice(-20).reverse().map(compactGoal),
    sourceRefs: uniqueSourceRefs([...(identity?.sourceRefs ?? []), ...sortedGoals.flatMap((goal) => goal.sourceRefs ?? [])]),
  };
}

function writeRosterFiles(files, rosters, generatedAt) {
  const sorted = [...rosters].sort((a, b) => a.teamId.localeCompare(b.teamId));
  setJson(files, "data/rosters/worldcup-2026/index.json", {
    generatedAt,
    rosterCount: sorted.length,
    playerCount: sorted.reduce((sum, roster) => sum + (roster.players?.length ?? 0), 0),
    teams: sorted.map((roster) => ({
      playerCount: roster.players?.length ?? 0,
      rosterStatus: roster.rosterStatus,
      teamId: roster.teamId,
      teamName: roster.teamName,
    })),
    sourceRefs: uniqueSourceRefs(sorted.flatMap((roster) => roster.sourceRefs ?? [])),
  });
  for (const roster of sorted) {
    setJson(files, `data/rosters/worldcup-2026/${roster.teamId}.json`, {
      generatedAt,
      ...roster,
      players: [...(roster.players ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)),
    });
  }
}

function writeTeamProfileFiles(files, teams, results, goalscorers, generatedAt) {
  const profiles = teams
    .filter((team) => !team.isPlaceholder)
    .map((team) => buildTeamProfile(team, results, goalscorers, generatedAt))
    .sort((a, b) => a.teamId.localeCompare(b.teamId));
  setJson(files, "data/profiles/teams/index.json", {
    generatedAt,
    profileCount: profiles.length,
    teams: profiles.map((profile) => ({
      identityConfidence: profile.identityConfidence,
      matchCount: profile.allTime.matches,
      profileConfidence: profile.profileConfidence,
      teamId: profile.teamId,
      teamName: profile.teamName,
    })),
    sourceRefs: uniqueSourceRefs(profiles.flatMap((profile) => profile.sourceRefs ?? [])),
  });
  for (const profile of profiles) {
    setJson(files, `data/profiles/teams/${profile.teamId}.json`, profile);
  }
}

function buildTeamProfile(team, results, goalscorers, generatedAt) {
  const teamMatches = results
    .filter((match) => match.homeTeamId === team.teamId || match.awayTeamId === team.teamId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const teamGoals = goalscorers
    .filter((goal) => goal.teamId === team.teamId)
    .sort(compareGoal);
  return {
    generatedAt,
    teamId: team.teamId,
    teamName: team.name,
    fifaCode: team.fifaCode,
    aliases: team.aliases,
    identityStatus: team.identityStatus,
    identityConfidence: team.identityConfidence,
    profileConfidence: team.identityConfidence === "high" ? "medium" : "low",
    dataScope: "derived-from-public-history-results-and-goalscorers",
    allTime: aggregateTeamWindow(team.teamId, teamMatches),
    splits: {
      worldCup: aggregateTeamWindow(team.teamId, teamMatches.filter(isWorldCupTournament)),
      competitive: aggregateTeamWindow(team.teamId, teamMatches.filter(isCompetitiveTournament)),
      friendly: aggregateTeamWindow(team.teamId, teamMatches.filter((match) => !isCompetitiveTournament(match))),
      neutralVenue: aggregateTeamWindow(team.teamId, teamMatches.filter((match) => match.neutral)),
      nonNeutralVenue: aggregateTeamWindow(team.teamId, teamMatches.filter((match) => !match.neutral)),
    },
    form: Object.fromEntries(
      WINDOW_SIZES.map((size) => [`last${size}`, aggregateTeamWindow(team.teamId, teamMatches.slice(0, size))]),
    ),
    topScorers: summarizeTopScorers(teamGoals).slice(0, 10),
    recentMatches: teamMatches.slice(0, 5).map((match) => summarizeMatch(match, team.teamId)),
    sourceRefs: uniqueSourceRefs([...teamMatches, ...teamGoals, team].flatMap((item) => item.sourceRefs ?? [])),
  };
}

function summarizeTopScorers(goals) {
  const counts = new Map();
  for (const goal of goals) {
    const key = playerKeyFor(goal.scorer);
    const existing = counts.get(key) ?? { playerKey: key, scorer: goal.scorer, goals: 0 };
    existing.goals += 1;
    counts.set(key, existing);
  }
  return [...counts.values()]
    .sort((a, b) => b.goals - a.goals || a.scorer.localeCompare(b.scorer))
    .slice(0, 20);
}

function compactGoal(goal) {
  return {
    date: goal.date,
    goalId: goal.goalId,
    matchKey: goal.matchKey,
    minute: goal.minute,
    ownGoal: goal.ownGoal,
    penalty: goal.penalty,
    scorer: goal.scorer,
  };
}

function compareGoal(a, b) {
  return a.date.localeCompare(b.date) || a.matchKey.localeCompare(b.matchKey) || a.goalId.localeCompare(b.goalId);
}

function buildTeamForm(teamId, matches) {
  const sortedDesc = [...matches].sort((a, b) => b.date.localeCompare(a.date));
  const windows = Object.fromEntries(
    WINDOW_SIZES.map((size) => [`last${size}`, aggregateTeamWindow(teamId, sortedDesc.slice(0, size))]),
  );
  return {
    teamId,
    generatedFromMatchCount: sortedDesc.length,
    windows,
    recentMatches: sortedDesc.slice(0, 20).map((match) => summarizeMatch(match, teamId)),
    sourceRefs: uniqueSourceRefs(sortedDesc.flatMap((match) => match.sourceRefs ?? [])),
  };
}

function aggregateTeamWindow(teamId, matches) {
  const aggregate = {
    matches: matches.length,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  };
  for (const match of matches) {
    const forGoals = goalsFor(match, teamId);
    const againstGoals = goalsAgainst(match, teamId);
    aggregate.goalsFor += forGoals;
    aggregate.goalsAgainst += againstGoals;
    if (forGoals > againstGoals) aggregate.wins += 1;
    else if (forGoals < againstGoals) aggregate.losses += 1;
    else aggregate.draws += 1;
  }
  return aggregate;
}

function summarizeMatch(match, perspectiveTeamId) {
  if (!match) return null;
  const summary = {
    matchId: match.matchId,
    date: match.date,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    tournament: match.tournament,
    neutral: Boolean(match.neutral),
    sourceRefs: match.sourceRefs ?? [],
  };
  if (perspectiveTeamId) {
    summary.result = resultFor(match, perspectiveTeamId);
  }
  return summary;
}

function resultFor(match, teamId) {
  const forGoals = goalsFor(match, teamId);
  const againstGoals = goalsAgainst(match, teamId);
  if (forGoals > againstGoals) return "win";
  if (forGoals < againstGoals) return "loss";
  return "draw";
}

function goalsFor(match, teamId) {
  if (match.homeTeamId === teamId) return match.homeScore;
  if (match.awayTeamId === teamId) return match.awayScore;
  throw new Error(`${teamId} did not play ${match.matchId}`);
}

function goalsAgainst(match, teamId) {
  if (match.homeTeamId === teamId) return match.awayScore;
  if (match.awayTeamId === teamId) return match.homeScore;
  throw new Error(`${teamId} did not play ${match.matchId}`);
}

function buildManifest(files, { dataVersion, generatedAt, gitCommit }, fileIndexes = []) {
  const manifestFiles = [...files.entries()]
    .filter(([relativePath]) => relativePath !== "manifest.json" && !relativePath.startsWith("indexes/"))
    .map(([relativePath, content]) => ({
      path: relativePath,
      category: categoryForPath(relativePath),
      downloadTier: downloadTierForPath(relativePath),
      required: isRequired(relativePath),
      sha256: sha256(content),
      sizeBytes: Buffer.byteLength(content, "utf8"),
      recordCount: recordCountForContent(relativePath, content),
      updatedAt: generatedAt,
    }))
    .filter((file) => file.downloadTier === "core")
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    schemaVersion: "1.0.0",
    dataVersion,
    generatedAt,
    gitCommit,
    minExtensionVersion: "0.1.0",
    recommendedExtensionVersion: "0.1.0",
    license: "mixed-source-attributed",
    files: manifestFiles,
    fileIndexes,
  };
}

function writeFileIndexFiles(files, generatedAt) {
  const fileMetadata = [...files.entries()]
    .filter(([relativePath]) => relativePath !== "manifest.json" && !relativePath.startsWith("indexes/"))
    .map(([relativePath, content]) => ({
      path: relativePath,
      category: categoryForPath(relativePath),
      downloadTier: downloadTierForPath(relativePath),
      required: isRequired(relativePath),
      sha256: sha256(content),
      sizeBytes: Buffer.byteLength(content, "utf8"),
      recordCount: recordCountForContent(relativePath, content),
      updatedAt: generatedAt,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const byGroup = new Map();
  for (const file of fileMetadata) {
    if (file.downloadTier === "core") continue;
    const group = indexGroupForFile(file);
    const existing = byGroup.get(group.indexId) ?? { ...group, files: [] };
    existing.files.push(file);
    byGroup.set(group.indexId, existing);
  }

  const fileIndexes = [];
  for (const group of [...byGroup.values()].sort((a, b) => a.indexId.localeCompare(b.indexId))) {
    const tierFiles = group.files.sort((a, b) => a.path.localeCompare(b.path));
    const fileDefaults = buildIndexFileDefaults(group, tierFiles);
    const indexPath = `indexes/${group.indexId}.json`;
    const indexPayload = {
      generatedAt,
      downloadTier: group.downloadTier,
      indexId: group.indexId,
      categories: group.categories,
      pathPrefixes: group.pathPrefixes,
      fileCount: tierFiles.length,
      totalBytes: tierFiles.reduce((sum, file) => sum + file.sizeBytes, 0),
      fileDefaults,
      files: compactIndexFiles(tierFiles, fileDefaults),
    };
    const content = `${stableStringify(indexPayload)}\n`;
    files.set(indexPath, content);
    fileIndexes.push({
      path: indexPath,
      category: "indexes.files",
      downloadTier: group.downloadTier,
      indexesTier: group.downloadTier,
      indexId: group.indexId,
      categories: group.categories,
      pathPrefixes: group.pathPrefixes,
      required: false,
      sha256: sha256(content),
      sizeBytes: Buffer.byteLength(content, "utf8"),
      recordCount: tierFiles.length,
      updatedAt: generatedAt,
    });
  }
  return fileIndexes;
}

function indexGroupForFile(file) {
  if (file.downloadTier === "audit") {
    return indexGroup("files-audit", file.downloadTier, [file.category], ["checksums/"]);
  }
  if (file.path === "data/history/shootouts.json") {
    return indexGroup("files-match-context-shootouts", file.downloadTier, [file.category], ["data/history/shootouts.json"]);
  }
  if (file.path === "data/profiles/teams/index.json") {
    return indexGroup("files-match-context-team-profiles-index", file.downloadTier, [file.category], ["data/profiles/teams/index.json"]);
  }
  if (file.path.startsWith("data/profiles/teams/")) {
    return indexGroup("files-match-context-team-profiles", file.downloadTier, [file.category], ["data/profiles/teams/"]);
  }
  if (file.path === "data/profiles/key-players/current/index.json") {
    return indexGroup("files-tournament-context-current-key-player-profiles-index", file.downloadTier, [file.category], [
      "data/profiles/key-players/current/index.json",
    ]);
  }
  if (file.path.startsWith("data/profiles/key-players/current/")) {
    const prefix = firstPathKeyChar(file.path, "data/profiles/key-players/current/");
    return indexGroup(`files-tournament-context-current-key-player-profiles-${prefix}`, file.downloadTier, [file.category], [
      `data/profiles/key-players/current/${prefix}`,
    ]);
  }
  if (file.path === "data/profiles/key-players/historical/index.json") {
    return indexGroup("files-player-context-historical-key-player-profiles-index", file.downloadTier, [file.category], [
      "data/profiles/key-players/historical/index.json",
    ]);
  }
  if (file.path.startsWith("data/profiles/key-players/historical/")) {
    const prefix = firstPathKeyChar(file.path, "data/profiles/key-players/historical/");
    return indexGroup(`files-player-context-historical-key-player-profiles-${prefix}`, file.downloadTier, [file.category], [
      `data/profiles/key-players/historical/${prefix}`,
    ]);
  }
  if (file.path.startsWith("data/history/form/")) {
    return indexGroup("files-match-context-form", file.downloadTier, [file.category], ["data/history/form/"]);
  }
  if (file.path.startsWith("data/history/head-to-head/")) {
    const prefix = firstPathKeyChar(file.path, "data/history/head-to-head/");
    return indexGroup(`files-match-context-head-to-head-${prefix}`, file.downloadTier, [file.category], [`data/history/head-to-head/${prefix}`]);
  }
  if (file.path === "data/history/goalscorers/index.json") {
    return indexGroup("files-player-context-goalscorers-index", file.downloadTier, [file.category], ["data/history/goalscorers/index.json"]);
  }
  if (file.path.startsWith("data/history/goalscorers/by-team/")) {
    return indexGroup("files-player-context-goalscorers-by-team", file.downloadTier, [file.category], ["data/history/goalscorers/by-team/"]);
  }
  if (file.path.startsWith("data/history/goalscorers/by-player/")) {
    const prefix = firstPathKeyChar(file.path, "data/history/goalscorers/by-player/");
    return indexGroup(
      `files-player-context-goalscorers-by-player-${prefix}`,
      file.downloadTier,
      [file.category],
      [`data/history/goalscorers/by-player/${prefix}`],
    );
  }
  if (file.path === "data/players/players-index.json") {
    return indexGroup("files-player-context-players-index", file.downloadTier, [file.category], ["data/players/players-index.json"]);
  }
  if (file.path === "data/rosters/worldcup-2026/index.json") {
    return indexGroup("files-tournament-context-rosters-index", file.downloadTier, [file.category], ["data/rosters/worldcup-2026/index.json"]);
  }
  if (file.path.startsWith("data/rosters/worldcup-2026/")) {
    return indexGroup("files-tournament-context-rosters-worldcup-2026", file.downloadTier, [file.category], ["data/rosters/worldcup-2026/"]);
  }
  if (file.path.startsWith("data/players/identities/")) {
    const prefix = firstPathKeyChar(file.path, "data/players/identities/");
    return indexGroup(`files-player-context-identities-${prefix}`, file.downloadTier, [file.category], [`data/players/identities/${prefix}`]);
  }
  return indexGroup(`files-${file.downloadTier}-other`, file.downloadTier, [file.category], []);
}

function indexGroup(indexId, downloadTier, categories, pathPrefixes) {
  return {
    categories,
    downloadTier,
    indexId,
    pathPrefixes,
  };
}

function firstPathKeyChar(filePath, prefix) {
  const value = filePath.slice(prefix.length).toLowerCase();
  const char = value[0] ?? "other";
  return /^[a-z0-9]$/.test(char) ? char : "other";
}

function buildChecksums(files) {
  return [...files.entries()]
    .filter(([relativePath]) => relativePath !== "manifest.json" && !relativePath.startsWith("checksums/"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([relativePath, content]) => `${sha256(content)}  ${relativePath}`)
    .join("\n") + "\n";
}

function categoryForPath(relativePath) {
  const match = CATEGORY_BY_PREFIX.find(([prefix]) => relativePath === prefix || relativePath.startsWith(prefix));
  return match?.[1] ?? "other";
}

function isRequired(relativePath) {
  return [
    "data/metadata/",
    "data/identification/",
    "data/sources/",
    "data/taxonomy/",
    "data/schedule/",
    "data/history/international-results-index.json",
  ].some((prefix) => relativePath === prefix || relativePath.startsWith(prefix));
}

function downloadTierForPath(relativePath) {
  if (
    [
      "data/sources/",
      "data/metadata/",
      "data/identification/",
      "data/taxonomy/",
      "data/market-mapping/",
      "data/schedule/",
      "data/history/international-results-index.json",
    ].some((prefix) => relativePath === prefix || relativePath.startsWith(prefix))
  ) {
    return "core";
  }
  if (relativePath.startsWith("data/history/head-to-head/") || relativePath.startsWith("data/history/form/") || relativePath === "data/history/shootouts.json") {
    return "match-context";
  }
  if (relativePath.startsWith("data/profiles/teams/")) {
    return "match-context";
  }
  if (relativePath.startsWith("data/profiles/key-players/current/")) {
    return "tournament-context";
  }
  if (relativePath.startsWith("data/profiles/key-players/")) {
    return "player-context";
  }
  if (relativePath.startsWith("data/history/goalscorers/")) {
    return "player-context";
  }
  if (relativePath.startsWith("data/rosters/")) {
    return "tournament-context";
  }
  if (relativePath.startsWith("data/players/")) {
    return "player-context";
  }
  if (relativePath.startsWith("checksums/")) {
    return "audit";
  }
  return "optional";
}

function recordCountForContent(relativePath, content) {
  if (relativePath.endsWith(".jsonl")) {
    return content.split("\n").filter(Boolean).length;
  }
  if (!relativePath.endsWith(".json")) {
    return undefined;
  }
  const parsed = JSON.parse(content);
  if (Array.isArray(parsed)) return parsed.length;
  if (Array.isArray(parsed.goals)) return parsed.goals.length;
  if (Array.isArray(parsed.matches)) return parsed.matches.length;
  if (Array.isArray(parsed.files)) return parsed.files.length;
  return 1;
}

async function readSourceIds(rootDir, errors) {
  try {
    const content = await readFile(path.join(rootDir, "data/sources/sources.json"), "utf8");
    const sources = JSON.parse(content);
    return new Set(sources.map((source) => source.sourceId));
  } catch (error) {
    errors.push(`data/sources/sources.json cannot be read: ${error.message}`);
    return new Set();
  }
}

async function readIndexedManifestFiles(rootDir, manifest, errors) {
  const files = [];
  if (!Array.isArray(manifest.fileIndexes)) return files;
  for (const fileIndex of manifest.fileIndexes) {
    try {
      const content = await readFile(path.join(rootDir, fileIndex.path), "utf8");
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.files)) {
        errors.push(`${fileIndex.path} must contain files array`);
        continue;
      }
      for (const file of expandIndexedFiles(parsed)) {
        files.push(file);
      }
    } catch (error) {
      errors.push(`${fileIndex.path} cannot be read as file index: ${error.message}`);
    }
  }
  return files;
}

function buildIndexFileDefaults(group, files) {
  const defaultCategory = group.categories.length === 1 ? group.categories[0] : undefined;
  const allSameRequired = files.every((file) => file.required === files[0]?.required);
  const allSameUpdatedAt = files.every((file) => file.updatedAt === files[0]?.updatedAt);
  return {
    ...(defaultCategory ? { category: defaultCategory } : {}),
    downloadTier: group.downloadTier,
    ...(allSameRequired ? { required: files[0]?.required ?? false } : {}),
    ...(allSameUpdatedAt && files[0]?.updatedAt ? { updatedAt: files[0].updatedAt } : {}),
  };
}

function compactIndexFiles(files, defaults) {
  return files.map((file) =>
    Object.fromEntries(
      Object.entries(file).filter(([, value]) => value !== undefined).filter(([key, value]) => defaults[key] !== value),
    ),
  );
}

function expandIndexedFiles(indexPayload) {
  const defaults = indexPayload.fileDefaults ?? {};
  return (indexPayload.files ?? []).map((file) => ({
    ...defaults,
    ...file,
  }));
}

async function validateTeamQuality(rootDir, errors) {
  let teams;
  let quality;
  try {
    teams = JSON.parse(await readFile(path.join(rootDir, "data/taxonomy/teams.json"), "utf8"));
  } catch (error) {
    errors.push(`data/taxonomy/teams.json cannot be read for team quality validation: ${error.message}`);
    return;
  }
  try {
    quality = JSON.parse(await readFile(path.join(rootDir, "data/taxonomy/team-quality.json"), "utf8"));
  } catch (error) {
    errors.push(`data/taxonomy/team-quality.json cannot be read: ${error.message}`);
    return;
  }

  if (!Array.isArray(teams)) {
    errors.push("data/taxonomy/teams.json must be an array for team quality validation");
    return;
  }
  if (!quality || typeof quality !== "object") {
    errors.push("data/taxonomy/team-quality.json must be an object");
    return;
  }

  const byStatus = {};
  const byConfidence = {};
  const lowConfidenceTeamIds = [];
  for (const team of teams) {
    if (!team.teamId) {
      errors.push("data/taxonomy/teams.json contains a team without teamId");
      continue;
    }
    if (!["registry", "reconciled", "source-derived", "inferred", "placeholder"].includes(team.identityStatus)) {
      errors.push(`${team.teamId} has invalid identityStatus ${team.identityStatus ?? "<missing>"}`);
    }
    if (!["high", "medium", "low", "placeholder"].includes(team.identityConfidence)) {
      errors.push(`${team.teamId} has invalid identityConfidence ${team.identityConfidence ?? "<missing>"}`);
    }
    if (team.isPlaceholder === true && (team.identityStatus !== "placeholder" || team.identityConfidence !== "placeholder")) {
      errors.push(`${team.teamId} placeholder team must use placeholder identity status and confidence`);
    }
    if (team.identityStatus === "placeholder" && team.isPlaceholder !== true) {
      errors.push(`${team.teamId} has placeholder identityStatus but isPlaceholder is not true`);
    }
    byStatus[team.identityStatus] = (byStatus[team.identityStatus] ?? 0) + 1;
    byConfidence[team.identityConfidence] = (byConfidence[team.identityConfidence] ?? 0) + 1;
    if (team.identityConfidence === "low") lowConfidenceTeamIds.push(team.teamId);
  }

  if (quality.teamCount !== teams.length) {
    errors.push(`data/taxonomy/team-quality.json teamCount expected ${teams.length}, got ${quality.teamCount ?? "<missing>"}`);
  }
  compareCountMap("byStatus", quality.byStatus, byStatus, errors);
  compareCountMap("byConfidence", quality.byConfidence, byConfidence, errors);

  const listedLowIds = new Set((quality.lowConfidenceTeams ?? []).map((team) => team.teamId));
  const expectedLowIds = new Set(lowConfidenceTeamIds);
  const missingLowIds = [...expectedLowIds].filter((teamId) => !listedLowIds.has(teamId)).sort();
  const extraLowIds = [...listedLowIds].filter((teamId) => !expectedLowIds.has(teamId)).sort();
  if (missingLowIds.length || extraLowIds.length) {
    errors.push(
      `data/taxonomy/team-quality.json lowConfidenceTeams mismatch: missing ${missingLowIds.join(",") || "<none>"}, extra ${extraLowIds.join(",") || "<none>"}`,
    );
  }
}

async function validateNoUnindexedGeneratedFiles(rootDir, filesToValidate, errors) {
  const expectedPaths = new Set(filesToValidate.map((file) => file.path));
  for (const dir of ["data", "checksums", "indexes"]) {
    const files = await listPackageFiles(rootDir, dir);
    for (const relativePath of files) {
      if (!expectedPaths.has(relativePath)) {
        errors.push(`${relativePath} exists in generated package but is not referenced by manifest or file indexes`);
      }
    }
  }
}

async function listPackageFiles(rootDir, relativeDir) {
  const absoluteDir = path.join(rootDir, relativeDir);
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listPackageFiles(rootDir, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath.replace(/\\/g, "/"));
    }
  }
  return files;
}

function compareCountMap(label, actual, expected, errors) {
  const actualMap = actual ?? {};
  const keys = new Set([...Object.keys(actualMap), ...Object.keys(expected)]);
  for (const key of [...keys].sort()) {
    if ((actualMap[key] ?? 0) !== (expected[key] ?? 0)) {
      errors.push(`data/taxonomy/team-quality.json ${label}.${key} expected ${expected[key] ?? 0}, got ${actualMap[key] ?? 0}`);
    }
  }
}

async function validateSourceRefs(rootDir, files, sourceIds, errors) {
  for (const file of files) {
    if (!file.path.endsWith(".json") || file.path === "data/sources/sources.json") continue;
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path.join(rootDir, file.path), "utf8"));
    } catch {
      continue;
    }
    for (const sourceId of collectSourceIds(parsed)) {
      if (!sourceIds.has(sourceId)) {
        errors.push(`${file.path} references missing sourceId ${sourceId}`);
      }
    }
  }
}

function collectSourceIds(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceIds(item, found);
    return found;
  }
  if (!value || typeof value !== "object") return found;

  if (Array.isArray(value.sourceRefs)) {
    for (const ref of value.sourceRefs) {
      if (ref?.sourceId) found.push(ref.sourceId);
    }
  }
  if (value.fieldSources && typeof value.fieldSources === "object") {
    for (const sourceList of Object.values(value.fieldSources)) {
      if (Array.isArray(sourceList)) found.push(...sourceList);
    }
  }
  for (const child of Object.values(value)) {
    collectSourceIds(child, found);
  }
  return found;
}

function setJson(files, relativePath, value) {
  files.set(relativePath, `${stableStringify(value)}\n`);
}

function setCompactJson(files, relativePath, value) {
  files.set(relativePath, `${JSON.stringify(sortRecursively(value))}\n`);
}

function stableStringify(value) {
  return JSON.stringify(sortRecursively(value), null, 2);
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortRecursively(child)]),
  );
}

function makePairKey(teamAId, teamBId) {
  return [teamAId, teamBId].sort().join(PAIR_KEY_DELIMITER);
}

function playerKeyFor(scorer) {
  return normalizeAlias(scorer).replace(/\s+/g, "-") || "unknown-player";
}

function normalizeAlias(alias) {
  return alias.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueSourceRefs(refs) {
  const byKey = new Map();
  for (const ref of refs) {
    if (!ref?.sourceId) continue;
    const key = `${ref.sourceId}:${ref.path ?? ""}`;
    byKey.set(key, ref);
  }
  return [...byKey.values()].sort((a, b) => `${a.sourceId}:${a.path ?? ""}`.localeCompare(`${b.sourceId}:${b.path ?? ""}`));
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
