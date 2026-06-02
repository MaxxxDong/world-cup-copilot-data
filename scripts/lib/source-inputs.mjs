import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function auditSourceInputs({ packageRoot, sourceRoot }) {
  const sourceInputsPath = path.join(packageRoot, "data/metadata/source-inputs.json");
  let sourceInputs;
  try {
    sourceInputs = JSON.parse(await readFile(sourceInputsPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      errors: [`data/metadata/source-inputs.json cannot be read: ${error.message}`],
      warnings: [],
      summary: { inputCount: 0, checked: 0, missing: 0, mismatched: 0 },
      inputs: [],
    };
  }

  const inputs = [];
  const errors = [];
  const warnings = [];
  for (const input of sourceInputs.inputs ?? []) {
    const resolvedPath = path.resolve(sourceRoot, input.path);
    if (!isWithin(sourceRoot, resolvedPath)) {
      errors.push(`${input.inputRole ?? input.path} resolves outside source root: ${input.path}`);
      inputs.push({ ...input, ok: false, status: "outside-source-root" });
      continue;
    }

    let content;
    try {
      content = await readFile(resolvedPath);
    } catch (error) {
      errors.push(`${input.inputRole ?? input.path} cannot be read at ${input.path}: ${error.message}`);
      inputs.push({ ...input, ok: false, status: "missing" });
      continue;
    }

    const sizeBytes = content.length;
    const sha256 = createHash("sha256").update(content).digest("hex");
    const mismatches = [];
    if (input.sizeBytes !== sizeBytes) mismatches.push(`sizeBytes expected ${input.sizeBytes}, got ${sizeBytes}`);
    if (input.sha256 !== sha256) mismatches.push(`sha256 expected ${input.sha256}, got ${sha256}`);
    if (mismatches.length) {
      errors.push(`${input.inputRole ?? input.path} mismatch at ${input.path}: ${mismatches.join("; ")}`);
      inputs.push({ ...input, actualSizeBytes: sizeBytes, actualSha256: sha256, ok: false, status: "mismatched" });
      continue;
    }

    inputs.push({ ...input, actualSizeBytes: sizeBytes, actualSha256: sha256, ok: true, status: "matched" });
  }

  if (!Array.isArray(sourceInputs.inputs)) {
    errors.push("data/metadata/source-inputs.json inputs must be an array");
  } else if (sourceInputs.inputCount !== sourceInputs.inputs.length) {
    warnings.push(`inputCount expected ${sourceInputs.inputs.length}, got ${sourceInputs.inputCount ?? "<missing>"}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      generatedAt: sourceInputs.generatedAt,
      inputCount: sourceInputs.inputs?.length ?? 0,
      checked: inputs.filter((input) => input.status === "matched").length,
      missing: inputs.filter((input) => input.status === "missing").length,
      mismatched: inputs.filter((input) => input.status === "mismatched").length,
      outsideSourceRoot: inputs.filter((input) => input.status === "outside-source-root").length,
    },
    inputs,
  };
}

function isWithin(rootDir, targetPath) {
  const relativePath = path.relative(path.resolve(rootDir), targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}
