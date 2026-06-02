import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("team registry covers every FIFA group-stage fixture team", async () => {
  const [registry, fixture] = await Promise.all([
    readJson("input/team-registry.seed.json"),
    readJson("input/audit/fifa-schedule.group-stage.json"),
  ]);
  const registeredTeamIds = new Set(registry.map((team) => team.teamId));
  const fixtureTeamIds = new Set(fixture.matches.flatMap((match) => [match.homeTeamId, match.awayTeamId]));
  const missing = [...fixtureTeamIds].filter((teamId) => !registeredTeamIds.has(teamId)).sort();

  assert.deepEqual(missing, []);
  assert.equal(fixtureTeamIds.size, 48);
});

test("team registry has stable unique team ids and FIFA codes", async () => {
  const registry = await readJson("input/team-registry.seed.json");
  const teamIds = registry.map((team) => team.teamId);
  const fifaCodes = registry.map((team) => team.fifaCode);

  assert.equal(new Set(teamIds).size, teamIds.length);
  assert.equal(new Set(fifaCodes).size, fifaCodes.length);
  assert.equal(registry.every((team) => team.aliases.includes(team.name) && team.aliases.includes(team.fifaCode)), true);
});

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
