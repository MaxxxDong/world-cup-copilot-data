import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { auditSourceInputs } from "../scripts/lib/source-inputs.mjs";

test("audits source input hashes against local raw files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "source-inputs-"));
  const packageRoot = path.join(root, "package");
  const sourceRoot = path.join(root, "source");
  await mkdir(path.join(packageRoot, "data/metadata"), { recursive: true });
  await mkdir(path.join(sourceRoot, "input/raw"), { recursive: true });

  const content = "hello,world\n";
  await writeFile(path.join(sourceRoot, "input/raw/results.csv"), content, "utf8");
  await writeFile(
    path.join(packageRoot, "data/metadata/source-inputs.json"),
    JSON.stringify({
      generatedAt: "2026-05-27T10:00:00.000Z",
      inputCount: 1,
      inputs: [
        {
          inputRole: "history-results",
          sourceId: "martj42-international-results",
          sourcePath: "results.csv",
          format: "csv",
          path: "input/raw/results.csv",
          sizeBytes: Buffer.byteLength(content, "utf8"),
          sha256: createHash("sha256").update(content).digest("hex"),
        },
      ],
    }),
    "utf8",
  );

  const result = await auditSourceInputs({ packageRoot, sourceRoot });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.summary.checked, 1);
  assert.equal(result.inputs[0].status, "matched");
});

test("reports source input hash mismatches", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "source-inputs-"));
  const packageRoot = path.join(root, "package");
  const sourceRoot = path.join(root, "source");
  await mkdir(path.join(packageRoot, "data/metadata"), { recursive: true });
  await mkdir(path.join(sourceRoot, "input/raw"), { recursive: true });
  await writeFile(path.join(sourceRoot, "input/raw/results.csv"), "changed\n", "utf8");
  await writeFile(
    path.join(packageRoot, "data/metadata/source-inputs.json"),
    JSON.stringify({
      generatedAt: "2026-05-27T10:00:00.000Z",
      inputCount: 1,
      inputs: [
        {
          inputRole: "history-results",
          sourceId: "martj42-international-results",
          sourcePath: "results.csv",
          format: "csv",
          path: "input/raw/results.csv",
          sizeBytes: 1,
          sha256: "wrong",
        },
      ],
    }),
    "utf8",
  );

  const result = await auditSourceInputs({ packageRoot, sourceRoot });
  assert.equal(result.ok, false);
  assert.equal(result.summary.mismatched, 1);
  assert.match(result.errors.join("\n"), /history-results mismatch/);
});
