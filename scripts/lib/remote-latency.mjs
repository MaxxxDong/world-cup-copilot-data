import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

export const DEFAULT_REMOTE_LATENCY_OPTIONS = {
  sampleLimitByTier: {
    core: 25,
    "match-context": 6,
    "player-context": 6,
    "tournament-context": 6,
    optional: 6,
    audit: 1,
  },
  slowFileMs: 5_000,
  slowTotalMs: 20_000,
};

export async function auditRemoteLatency({
  manifestUrl,
  tiers = ["core", "match-context", "player-context"],
  explicitPaths = [],
  fetchFn = fetch,
  options = DEFAULT_REMOTE_LATENCY_OPTIONS,
}) {
  const errors = [];
  const warnings = [];
  const manifestFetch = await fetchTextTimed(manifestUrl, fetchFn);
  if (!manifestFetch.ok) {
    return {
      ok: false,
      errors: [`manifest fetch failed: ${manifestFetch.error}`],
      warnings,
      summary: {
        manifestUrl,
        manifest: manifestFetch,
        files: [],
      },
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestFetch.text);
  } catch (error) {
    return {
      ok: false,
      errors: [`manifest JSON parse failed: ${error.message}`],
      warnings,
      summary: {
        manifestUrl,
        manifest: manifestFetch,
        files: [],
      },
    };
  }

  const indexLoad = await fetchFileIndexesForTiers({ manifest, manifestUrl, tiers, explicitPaths, fetchFn, errors });
  const expandedManifest = {
    ...manifest,
    files: [...(manifest.files ?? []), ...indexLoad.files],
  };
  const selectedFiles = selectLatencySampleFiles(expandedManifest, { tiers, explicitPaths, sampleLimitByTier: options.sampleLimitByTier });
  const fileResults = [];
  let totalElapsedMs = manifestFetch.elapsedMs;
  let totalBytes = manifestFetch.sizeBytes;
  for (const indexResult of indexLoad.indexes) {
    totalElapsedMs += indexResult.elapsedMs;
    totalBytes += indexResult.sizeBytes;
  }

  for (const file of selectedFiles) {
    const fileUrl = new URL(file.path, manifestUrl).toString();
    const result = await fetchTextTimed(fileUrl, fetchFn);
    totalElapsedMs += result.elapsedMs;
    totalBytes += result.sizeBytes;
    fileResults.push({
      path: file.path,
      category: file.category,
      downloadTier: file.downloadTier,
      required: file.required,
      expectedBytes: file.sizeBytes,
      expectedSha256: file.sha256,
      url: fileUrl,
      ...withoutText(result),
    });
    if (!result.ok) {
      errors.push(`${file.path} fetch failed: ${result.error}`);
      continue;
    }
    if (result.sizeBytes !== file.sizeBytes) {
      errors.push(`${file.path} size mismatch: expected ${file.sizeBytes}, got ${result.sizeBytes}`);
    }
    const actualSha256 = sha256(result.text);
    if (actualSha256 !== file.sha256) {
      errors.push(`${file.path} sha256 mismatch: expected ${file.sha256}, got ${actualSha256}`);
    }
    if (result.elapsedMs > options.slowFileMs) {
      warnings.push(`${file.path} took ${Math.round(result.elapsedMs)}ms, above ${options.slowFileMs}ms`);
    }
  }

  if (totalElapsedMs > options.slowTotalMs) {
    warnings.push(`sample fetch total took ${Math.round(totalElapsedMs)}ms, above ${options.slowTotalMs}ms`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      manifestUrl,
      dataVersion: manifest.dataVersion,
      generatedAt: manifest.generatedAt,
      selectedTiers: tiers,
      explicitPaths,
      manifest: withoutText(manifestFetch),
      indexes: indexLoad.indexes,
      files: fileResults,
      totals: {
        files: fileResults.length,
        bytes: totalBytes,
        elapsedMs: Math.round(totalElapsedMs),
      },
    },
  };
}

async function fetchFileIndexesForTiers({ manifest, manifestUrl, tiers, explicitPaths, fetchFn, errors }) {
  const rootPaths = new Set((manifest.files ?? []).map((file) => file.path));
  const neededTiers = new Set(tiers.filter((tier) => tier !== "core"));
  const neededIndexPaths = new Set();
  if (explicitPaths.some((filePath) => !rootPaths.has(filePath))) {
    for (const index of manifest.fileIndexes ?? []) {
      if (explicitPaths.some((filePath) => (index.pathPrefixes ?? []).some((prefix) => filePath.startsWith(prefix)))) {
        neededIndexPaths.add(index.path);
      }
    }
    if (!neededIndexPaths.size) {
      for (const index of manifest.fileIndexes ?? []) neededTiers.add(index.indexesTier ?? index.downloadTier);
    }
  }
  const files = [];
  const indexes = [];
  for (const index of manifest.fileIndexes ?? []) {
    const indexTier = index.indexesTier ?? index.downloadTier;
    if (!neededTiers.has(indexTier) && !neededIndexPaths.has(index.path)) continue;
    const indexUrl = new URL(index.path, manifestUrl).toString();
    const result = await fetchTextTimed(indexUrl, fetchFn);
    indexes.push({
      path: index.path,
      indexesTier: indexTier,
      expectedBytes: index.sizeBytes,
      url: indexUrl,
      ...withoutText(result),
    });
    if (!result.ok) {
      errors.push(`${index.path} fetch failed: ${result.error}`);
      continue;
    }
    if (result.sizeBytes !== index.sizeBytes) {
      errors.push(`${index.path} size mismatch: expected ${index.sizeBytes}, got ${result.sizeBytes}`);
      continue;
    }
    const actualSha256 = sha256(result.text);
    if (actualSha256 !== index.sha256) {
      errors.push(`${index.path} sha256 mismatch: expected ${index.sha256}, got ${actualSha256}`);
      continue;
    }
    try {
      const parsed = JSON.parse(result.text);
      files.push(...expandIndexedFiles(parsed));
    } catch (error) {
      errors.push(`${index.path} JSON parse failed: ${error.message}`);
    }
  }
  return { files, indexes };
}

function expandIndexedFiles(indexPayload) {
  const defaults = indexPayload.fileDefaults ?? {};
  return (indexPayload.files ?? []).map((file) => ({
    ...defaults,
    ...file,
  }));
}

export function selectLatencySampleFiles(manifest, { tiers, explicitPaths = [], sampleLimitByTier = DEFAULT_REMOTE_LATENCY_OPTIONS.sampleLimitByTier }) {
  const files = manifest.files ?? [];
  const byPath = new Map(files.map((file) => [file.path, file]));
  const selected = new Map();

  for (const filePath of explicitPaths) {
    const file = byPath.get(filePath);
    if (!file) {
      selected.set(filePath, {
        path: filePath,
        category: "missing",
        downloadTier: "missing",
        required: false,
        sizeBytes: 0,
        sha256: "",
      });
    } else {
      selected.set(file.path, file);
    }
  }

  for (const tier of tiers) {
    const tierFiles = files.filter((file) => file.downloadTier === tier || (tier === "core" && file.required));
    for (const file of representativeFiles(tierFiles, sampleLimitByTier[tier] ?? 0)) {
      selected.set(file.path, file);
    }
  }

  return [...selected.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function representativeFiles(files, limit) {
  if (!limit || files.length <= limit) return [...files].sort((a, b) => a.path.localeCompare(b.path));
  const sortedBySize = [...files].sort((a, b) => b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path));
  const selected = new Map();
  selected.set(sortedBySize[0].path, sortedBySize[0]);
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (selected.size >= limit) break;
    selected.set(file.path, file);
  }
  return [...selected.values()].sort((a, b) => a.path.localeCompare(b.path));
}

async function fetchTextTimed(url, fetchFn) {
  const startedAt = performance.now();
  try {
    const text = await readText(url, fetchFn);
    return {
      ok: true,
      elapsedMs: Math.round(performance.now() - startedAt),
      sizeBytes: Buffer.byteLength(text, "utf8"),
      text,
    };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Math.round(performance.now() - startedAt),
      sizeBytes: 0,
      error: error.message,
      text: "",
    };
  }
}

async function readText(url, fetchFn) {
  const parsed = new URL(url);
  if (parsed.protocol === "file:") {
    return readFile(fileURLToPath(parsed), "utf8");
  }
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function withoutText(result) {
  const { text, ...rest } = result;
  return rest;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
