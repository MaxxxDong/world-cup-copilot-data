import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node scripts/fetch-wikimedia-team-identities.mjs [options]

Options:
  --teams-json <path>  Team taxonomy JSON, relative to package root.
                       Default: dist/phase-a-real/data/taxonomy/teams.json
  --out <path>         Output CSV path, relative to package root.
                       Default: input/raw/wikidata-national-football-teams.csv
  --delay-ms <ms>      Delay between Wikipedia API batches. Default: 500
`);
  process.exit(0);
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const teamsJsonPath = getArg("--teams-json") ?? "dist/phase-a-real/data/taxonomy/teams.json";
const outPath = getArg("--out") ?? "input/raw/wikidata-national-football-teams.csv";
const delayMs = Number(getArg("--delay-ms") ?? 500);

const teams = JSON.parse(await readFile(path.resolve(packageRoot, teamsJsonPath), "utf8"));
const realTeams = teams.filter((team) => team.isPlaceholder !== true);
const rows = [["team", "teamLabel", "fifaCode", "matchedTitle"]];
const missing = [];

for (const batch of chunks(realTeams, 20)) {
  const titleMap = new Map();
  for (const team of batch) {
    for (const title of candidateTitles(team)) {
      if (!titleMap.has(title)) titleMap.set(title, team);
    }
  }
  const pages = await fetchPageProps([...titleMap.keys()]);
  const seenTeamIds = new Set(rows.slice(1).map((row) => row[1]));
  for (const page of pages) {
    const team = titleMap.get(page.title);
    const qid = page.pageprops?.wikibase_item;
    if (!team || !qid || seenTeamIds.has(team.name)) continue;
    rows.push([qid, page.title, team.fifaCode ?? "", page.title]);
    seenTeamIds.add(team.name);
  }
  await sleep(delayMs);
}

const matchedTeamIds = new Set();
for (const row of rows.slice(1)) {
  const normalizedLabel = normalizeTeamLabel(row[1]);
  const team = realTeams.find((candidate) => candidate.name === normalizedLabel || (candidate.aliases ?? []).includes(normalizedLabel));
  if (team) matchedTeamIds.add(team.teamId);
}
for (const team of realTeams) {
  if (!matchedTeamIds.has(team.teamId)) missing.push(team);
}

await mkdir(path.dirname(path.resolve(packageRoot, outPath)), { recursive: true });
await writeFile(path.resolve(packageRoot, outPath), toCsv(rows), "utf8");
console.log(
  JSON.stringify(
    {
      outPath,
      teamCount: realTeams.length,
      matchedCount: rows.length - 1,
      missingCount: missing.length,
      missingSample: missing.slice(0, 20).map((team) => ({ teamId: team.teamId, name: team.name, fifaCode: team.fifaCode })),
    },
    null,
    2,
  ),
);

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function candidateTitles(team) {
  const values = [team.name, ...(team.aliases ?? [])]
    .filter(Boolean)
    .filter((value) => !/^[A-Z]{3}$/.test(value))
    .flatMap((value) => titleVariants(String(value)));
  return [...new Set(values)];
}

function titleVariants(name) {
  const normalized = name.trim();
  const special = {
    Australia: ["Australia men's national soccer team"],
    Canada: ["Canada men's national soccer team"],
    "China PR": ["China national football team"],
    "Cote d'Ivoire": ["Ivory Coast national football team"],
    "Côte d'Ivoire": ["Ivory Coast national football team"],
    "Czech Republic": ["Czech Republic national football team"],
    "DR Congo": ["DR Congo national football team"],
    "East Germany": ["East Germany national football team"],
    England: ["England national football team"],
    Iran: ["Iran national football team"],
    Ireland: ["Republic of Ireland national football team"],
    "Korea DPR": ["North Korea national football team"],
    "Korea Republic": ["South Korea national football team"],
    "Northern Ireland": ["Northern Ireland national football team"],
    Russia: ["Russia national football team"],
    Scotland: ["Scotland national football team"],
    "United States": ["United States men's national soccer team"],
    Wales: ["Wales national football team"],
  };
  return [
    ...(special[normalized] ?? []),
    `${normalized} national football team`,
    `${normalized} men's national football team`,
    `${normalized} national soccer team`,
    `${normalized} men's national soccer team`,
  ];
}

async function fetchPageProps(titles) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("prop", "pageprops");
  url.searchParams.set("titles", titles.join("|"));
  const response = await fetch(url, {
    headers: {
      "User-Agent": "world-cup-copilot-data-build/0.1 (offline data reconciliation; local development)",
    },
  });
  if (!response.ok) throw new Error(`Wikipedia API returned ${response.status} ${response.statusText}`);
  const payload = await response.json();
  return payload.query?.pages?.filter((page) => !page.missing) ?? [];
}

function normalizeTeamLabel(label) {
  return String(label)
    .replace(/\s+(?:men's|women's)\s+national\s+(?:association\s+)?(?:football|soccer)\s+team$/i, "")
    .replace(/\s+national\s+(?:association\s+)?(?:football|soccer)\s+team$/i, "")
    .trim();
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toCsv(values) {
  return values.map((row) => row.map(escapeCsvCell).join(",")).join("\n") + "\n";
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
