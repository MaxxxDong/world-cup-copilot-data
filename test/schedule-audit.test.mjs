import test from "node:test";
import assert from "node:assert/strict";

import { auditFifaSchedule } from "../scripts/lib/schedule-audit.mjs";

test("audits FIFA schedule fixture against schedule, teams, and venue aliases", () => {
  const result = auditFifaSchedule({
    schedule: {
      matches: [
        {
          matchId: "wc-2026-001-mex-rsa",
          localDate: "2026-06-11",
          homeTeamId: "mex",
          awayTeamId: "rsa",
          venueId: "mexico-city",
        },
      ],
    },
    teams: [{ teamId: "mex" }, { teamId: "rsa" }],
    venues: [{ venueId: "mexico-city", aliases: ["Mexico City", "Mexico City Stadium"] }],
    fixture: {
      matches: [
        {
          matchNumber: 1,
          localDate: "2026-06-11",
          homeTeamId: "mex",
          awayTeamId: "rsa",
          venueAlias: "Mexico City Stadium",
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.checkedMatches, 1);
  assert.deepEqual(result.fieldCoverage, {
    expectedPlaceholder: 0,
    localDate: 1,
    stage: 0,
    teamPairing: 1,
    venueAlias: 1,
  });
  assert.deepEqual(result.mismatches, []);
});

test("audits full group-stage fixtures by team pair when official numbers differ from internal ids", () => {
  const result = auditFifaSchedule({
    schedule: {
      matches: [
        {
          matchId: "wc-2026-007-canada-bosnia-and-herzegovina",
          group: "Group B",
          localDate: "2026-06-12",
          homeTeamId: "canada",
          awayTeamId: "bosnia-and-herzegovina",
          venueId: "toronto",
        },
      ],
    },
    teams: [{ teamId: "canada" }, { teamId: "bosnia-and-herzegovina" }],
    venues: [{ venueId: "toronto", aliases: ["Toronto Stadium"] }],
    fixture: {
      matches: [
        {
          officialMatchNumber: 3,
          group: "Group B",
          localDate: "2026-06-12",
          homeTeamId: "canada",
          awayTeamId: "bosnia-and-herzegovina",
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.fieldCoverage, {
    expectedPlaceholder: 0,
    localDate: 1,
    stage: 0,
    teamPairing: 1,
    venueAlias: 0,
  });
  assert.deepEqual(result.mismatches, []);
});

test("audits knockout placeholders by match number, stage, and placeholder taxonomy", () => {
  const result = auditFifaSchedule({
    schedule: {
      matches: [
        {
          matchId: "wc-2026-074-placeholder-1e-placeholder-3a-b-c-d-f",
          stage: "Round of 32",
          localDate: "2026-06-29",
          homeTeamId: "placeholder-1e",
          awayTeamId: "placeholder-3a-b-c-d-f",
          venueId: "boston-foxborough",
        },
      ],
    },
    teams: [
      { teamId: "placeholder-1e", isPlaceholder: true },
      { teamId: "placeholder-3a-b-c-d-f", isPlaceholder: true },
    ],
    venues: [{ venueId: "boston-foxborough", aliases: ["Boston Stadium"] }],
    fixture: {
      matches: [
        {
          matchNumber: 74,
          localDate: "2026-06-29",
          stage: "Round of 32",
          homeTeamId: "placeholder-1e",
          awayTeamId: "placeholder-3a-b-c-d-f",
          expectedPlaceholder: true,
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.fieldCoverage, {
    expectedPlaceholder: 1,
    localDate: 1,
    stage: 1,
    teamPairing: 1,
    venueAlias: 0,
  });
  assert.deepEqual(result.mismatches, []);
});

test("reports hard mismatches and home-away warnings separately", () => {
  const result = auditFifaSchedule({
    schedule: {
      matches: [
        {
          matchId: "wc-2026-005-czech-republic-mex",
          localDate: "2026-06-24",
          homeTeamId: "czech-republic",
          awayTeamId: "mex",
          venueId: "mexico-city",
        },
      ],
    },
    teams: [{ teamId: "mex" }, { teamId: "czech-republic" }],
    venues: [{ venueId: "mexico-city", aliases: ["Mexico City"] }],
    fixture: {
      matches: [
        {
          matchNumber: 5,
          localDate: "2026-06-24",
          homeTeamId: "mex",
          awayTeamId: "czech-republic",
          venueAlias: "Mexico City Stadium",
        },
      ],
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.mismatches.join("\n"), /missing FIFA alias/);
  assert.match(result.warnings.join("\n"), /home\/away order differs/);
});
