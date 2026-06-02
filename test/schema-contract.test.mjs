import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("manifest schema covers current file and index metadata fields", async () => {
  const schema = JSON.parse(await readFile("schemas/manifest.schema.json", "utf8"));
  const fileEntry = schema.$defs.fileEntry;

  for (const field of ["path", "category", "downloadTier", "required", "sha256", "sizeBytes", "updatedAt"]) {
    assert.equal(fileEntry.required.includes(field), true, `${field} should be required`);
  }
  for (const field of ["fileIndexes", "files"]) {
    assert.ok(schema.properties[field], `${field} should be described`);
  }
  for (const field of ["indexesTier", "indexId", "pathPrefixes"]) {
    assert.ok(fileEntry.properties[field], `${field} should be described for split index entries`);
  }
});

test("source inputs schema covers release provenance fields", async () => {
  const schema = JSON.parse(await readFile("schemas/source-inputs.schema.json", "utf8"));
  const input = schema.properties.inputs.items;

  for (const field of ["inputRole", "sourceId", "sourcePath", "format", "path", "sizeBytes", "sha256"]) {
    assert.equal(input.required.includes(field), true, `${field} should be required`);
  }
  assert.ok(schema.properties.guidance, "guidance should be described");
});

test("file index schema covers compact split index fields", async () => {
  const schema = JSON.parse(await readFile("schemas/file-index.schema.json", "utf8"));
  const file = schema.properties.files.items;

  for (const field of ["path", "sha256", "sizeBytes"]) {
    assert.equal(file.required.includes(field), true, `${field} should be required for compact file entries`);
  }
  assert.ok(schema.properties.fileDefaults, "fileDefaults should be described");
  assert.ok(schema.properties.pathPrefixes, "pathPrefixes should be described");
});

test("layer index schema covers agent navigation fields", async () => {
  const schema = JSON.parse(await readFile("schemas/layer-index.schema.json", "utf8"));
  const layer = schema.properties.layers.items;

  for (const field of ["layerId", "downloadTiers", "categories", "useWhen"]) {
    assert.equal(layer.required.includes(field), true, `${field} should be required`);
  }
  assert.ok(layer.properties.pathTemplates, "pathTemplates should be described");
  assert.ok(schema.properties.guidance, "guidance should be described");
});
