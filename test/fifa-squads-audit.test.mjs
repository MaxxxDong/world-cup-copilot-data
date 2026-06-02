import test from "node:test";
import assert from "node:assert/strict";

import { auditFifaSquadsInput } from "../scripts/lib/fifa-squads-audit.mjs";

const teamRegistry = [
  {
    teamId: "mex",
    fifaCode: "MEX",
    name: "Mexico",
    aliases: ["Mexico", "MEX"],
  },
];

test("audits valid provisional FIFA squad input", () => {
  const result = auditFifaSquadsInput({
    fifaSquadsJson: {
      squads: [
        {
          team: "Mexico",
          rosterStatus: "provisional",
          sourceUrl: "https://www.fifa.com/en/articles/mexico-squad-announcement",
          players: [{ name: "Hirving Lozano" }],
        },
      ],
    },
    teamRegistry,
    expectTeamCount: 48,
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.summary.teamCount, 1);
  assert.equal(result.summary.provisionalTeamCount, 1);
  assert.deepEqual(result.warnings, ["fifa squads input has 1 teams; expected 48"]);
});

test("rejects final FIFA squad input that is not completion-safe", () => {
  const result = auditFifaSquadsInput({
    fifaSquadsJson: {
      squads: [
        {
          team: "Unknownland",
          rosterStatus: "final",
          players: [{ name: "Unknown Player" }],
        },
      ],
    },
    teamRegistry,
    expectTeamCount: 48,
    requireFinal: true,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /unknownland is missing sourceUrl/);
  assert.match(result.errors.join("\n"), /unknownland final roster has 1 players/);
  assert.match(result.errors.join("\n"), /unknownland is not recognized by team registry/);
  assert.match(result.errors.join("\n"), /expected 48/);
});
