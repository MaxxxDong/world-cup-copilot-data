import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { auditRemoteLatency, selectLatencySampleFiles } from "../scripts/lib/remote-latency.mjs";

const contentByPath = new Map([
  ["data/metadata/coverage.json", "{}\n"],
  ["data/sources/sources.json", "[]\n"],
  ["data/taxonomy/teams.json", "[]\n"],
  ["data/history/head-to-head/arg__bra.json", "{}\n"],
  ["data/history/head-to-head/arg__fra.json", "{\"large\":true}\n"],
  ["data/history/form/arg.json", "{}\n"],
  ["data/history/goalscorers/by-player/lionel-messi.json", "{}\n"],
]);

const manifest = {
  dataVersion: "2026.05.27+test",
  generatedAt: "2026-05-27T00:00:00.000Z",
  files: [...contentByPath.entries()].map(([path, content]) => ({
    path,
    category: categoryForPath(path),
    downloadTier: tierForPath(path),
    required: path.startsWith("data/metadata/") || path.startsWith("data/sources/") || path.startsWith("data/taxonomy/"),
    sha256: sha256(content),
    sizeBytes: Buffer.byteLength(content, "utf8"),
    updatedAt: "2026-05-27T00:00:00.000Z",
  })),
};

const splitIndexContentByPath = new Map([
  [
    "indexes/files-match-context-head-to-head-a.json",
    JSON.stringify({
      files: [
        fileMetadata("data/history/head-to-head/arg__bra.json"),
        fileMetadata("data/history/head-to-head/arg__fra.json"),
      ],
    }),
  ],
  [
    "indexes/files-player-context-goalscorers-by-player-l.json",
    JSON.stringify({
      files: [fileMetadata("data/history/goalscorers/by-player/lionel-messi.json")],
    }),
  ],
]);
for (const [path, content] of [...splitIndexContentByPath]) {
  splitIndexContentByPath.set(path, `${content}\n`);
}

const splitManifest = {
  dataVersion: "2026.05.27+split-test",
  generatedAt: "2026-05-27T00:00:00.000Z",
  files: [...contentByPath.entries()]
    .filter(([path]) => tierForPath(path) === "core")
    .map(([path]) => fileMetadata(path)),
  fileIndexes: [
    indexMetadata("indexes/files-match-context-head-to-head-a.json", "match-context", ["data/history/head-to-head/a"]),
    indexMetadata("indexes/files-player-context-goalscorers-by-player-l.json", "player-context", ["data/history/goalscorers/by-player/l"]),
  ],
};

test("selects required core files and representative optional tier files", () => {
  const files = selectLatencySampleFiles(manifest, {
    tiers: ["core", "match-context"],
    sampleLimitByTier: {
      core: 10,
      "match-context": 2,
    },
  });

  assert.deepEqual(files.map((file) => file.path), [
    "data/history/form/arg.json",
    "data/history/head-to-head/arg__fra.json",
    "data/metadata/coverage.json",
    "data/sources/sources.json",
    "data/taxonomy/teams.json",
  ]);
});

test("audits manifest and selected file fetches with hash and size checks", async () => {
  const fetchFn = async (url) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace("/package/", "");
    if (path === "manifest.json") {
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    const content = contentByPath.get(path);
    return content === undefined ? new Response("not found", { status: 404 }) : new Response(content, { status: 200 });
  };

  const result = await auditRemoteLatency({
    manifestUrl: "https://example.test/package/manifest.json",
    tiers: ["core"],
    explicitPaths: ["data/history/goalscorers/by-player/lionel-messi.json"],
    fetchFn,
    options: {
      sampleLimitByTier: { core: 10, "player-context": 1 },
      slowFileMs: 10_000,
      slowTotalMs: 20_000,
    },
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.summary.dataVersion, "2026.05.27+test");
  assert.equal(result.summary.files.some((file) => file.path === "data/metadata/coverage.json"), true);
  assert.equal(result.summary.files.some((file) => file.path === "data/history/goalscorers/by-player/lionel-messi.json"), true);
});

test("loads only matching split index files for explicit paths", async () => {
  const fetchedPaths = [];
  const fetchFn = async (url) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace("/package/", "");
    fetchedPaths.push(path);
    if (path === "manifest.json") {
      return new Response(JSON.stringify(splitManifest), { status: 200 });
    }
    const indexContent = splitIndexContentByPath.get(path);
    if (indexContent !== undefined) return new Response(indexContent, { status: 200 });
    const content = contentByPath.get(path);
    return content === undefined ? new Response("not found", { status: 404 }) : new Response(content, { status: 200 });
  };

  const result = await auditRemoteLatency({
    manifestUrl: "https://example.test/package/manifest.json",
    tiers: ["core"],
    explicitPaths: ["data/history/goalscorers/by-player/lionel-messi.json"],
    fetchFn,
    options: {
      sampleLimitByTier: { core: 10, "player-context": 1 },
      slowFileMs: 10_000,
      slowTotalMs: 20_000,
    },
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(
    fetchedPaths.filter((path) => path.startsWith("indexes/")),
    ["indexes/files-player-context-goalscorers-by-player-l.json"],
  );
  assert.equal(result.summary.files.some((file) => file.path === "data/history/goalscorers/by-player/lionel-messi.json"), true);
});

function categoryForPath(path) {
  if (path.startsWith("data/metadata/")) return "metadata.coverage";
  if (path.startsWith("data/sources/")) return "sources";
  if (path.startsWith("data/taxonomy/")) return "taxonomy.teams";
  if (path.startsWith("data/history/head-to-head/")) return "history.headToHead";
  if (path.startsWith("data/history/form/")) return "history.form";
  return "history.goalscorers.byPlayer";
}

function tierForPath(path) {
  if (path.startsWith("data/history/head-to-head/") || path.startsWith("data/history/form/")) return "match-context";
  if (path.startsWith("data/history/goalscorers/")) return "player-context";
  return "core";
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function fileMetadata(path) {
  const content = contentByPath.get(path);
  return {
    path,
    category: categoryForPath(path),
    downloadTier: tierForPath(path),
    required: path.startsWith("data/metadata/") || path.startsWith("data/sources/") || path.startsWith("data/taxonomy/"),
    sha256: sha256(content),
    sizeBytes: Buffer.byteLength(content, "utf8"),
    updatedAt: "2026-05-27T00:00:00.000Z",
  };
}

function indexMetadata(path, tier, pathPrefixes) {
  const content = splitIndexContentByPath.get(path);
  return {
    path,
    category: "indexes.files",
    downloadTier: tier,
    indexesTier: tier,
    pathPrefixes,
    required: false,
    sha256: sha256(content),
    sizeBytes: Buffer.byteLength(content, "utf8"),
    updatedAt: "2026-05-27T00:00:00.000Z",
  };
}
