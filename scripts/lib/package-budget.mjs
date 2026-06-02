export const DEFAULT_PACKAGE_BUDGETS = {
  manifestBytesWarning: 2 * 1024 * 1024,
  fileIndexBytesWarning: 12 * 1024 * 1024,
  totalBytes: 100 * 1024 * 1024,
  requiredCoreBytes: 512 * 1024,
  tiers: {
    core: {
      totalBytes: 512 * 1024,
      maxFileBytes: 192 * 1024,
    },
    "match-context": {
      totalBytes: 40 * 1024 * 1024,
      maxFileBytes: 256 * 1024,
    },
    "player-context": {
      totalBytes: 45 * 1024 * 1024,
      maxFileBytes: 256 * 1024,
    },
    audit: {
      totalBytes: 8 * 1024 * 1024,
      maxFileBytes: 8 * 1024 * 1024,
    },
    optional: {
      totalBytes: 5 * 1024 * 1024,
      maxFileBytes: 512 * 1024,
    },
    "tournament-context": {
      totalBytes: 10 * 1024 * 1024,
      maxFileBytes: 512 * 1024,
    },
  },
};

export function auditPackageBudget(manifest, budgets = DEFAULT_PACKAGE_BUDGETS) {
  const errors = [];
  const warnings = [];
  const files = manifest.files ?? [];
  const manifestBytes = manifest.rootManifestBytes ?? Buffer.byteLength(JSON.stringify(manifest), "utf8");
  const fileIndexBytes = (manifest.fileIndexes ?? []).reduce((sum, file) => sum + file.sizeBytes, 0);
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const requiredCoreFiles = files.filter((file) => file.required && file.downloadTier === "core");
  const requiredCoreBytes = requiredCoreFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
  const byTier = {};

  for (const file of files) {
    const tier = file.downloadTier ?? "unknown";
    byTier[tier] ??= { files: 0, bytes: 0, largestFile: undefined };
    byTier[tier].files += 1;
    byTier[tier].bytes += file.sizeBytes;
    if (!byTier[tier].largestFile || file.sizeBytes > byTier[tier].largestFile.sizeBytes) {
      byTier[tier].largestFile = {
        path: file.path,
        sizeBytes: file.sizeBytes,
      };
    }
  }

  if (totalBytes > budgets.totalBytes) {
    errors.push(`total package bytes ${totalBytes} exceeds budget ${budgets.totalBytes}`);
  }
  if (requiredCoreBytes > budgets.requiredCoreBytes) {
    errors.push(`required core bytes ${requiredCoreBytes} exceeds budget ${budgets.requiredCoreBytes}`);
  }
  if (manifestBytes > budgets.manifestBytesWarning) {
    warnings.push(`manifest bytes ${manifestBytes} exceeds warning threshold ${budgets.manifestBytesWarning}; consider split indexes before publishing`);
  }
  if (fileIndexBytes > budgets.fileIndexBytesWarning) {
    warnings.push(`file index bytes ${fileIndexBytes} exceeds warning threshold ${budgets.fileIndexBytesWarning}; consider category or prefix indexes`);
  }

  for (const [tier, summary] of Object.entries(byTier)) {
    const tierBudget = budgets.tiers[tier];
    if (!tierBudget) {
      warnings.push(`download tier ${tier} has no budget`);
      continue;
    }
    if (summary.bytes > tierBudget.totalBytes) {
      errors.push(`${tier} bytes ${summary.bytes} exceeds budget ${tierBudget.totalBytes}`);
    }
    if (summary.largestFile && summary.largestFile.sizeBytes > tierBudget.maxFileBytes) {
      errors.push(
        `${tier} largest file ${summary.largestFile.path} is ${summary.largestFile.sizeBytes} bytes, exceeds budget ${tierBudget.maxFileBytes}`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalBytes,
      manifestBytes,
      fileIndexBytes,
      requiredCoreBytes,
      byTier,
      budgets,
    },
  };
}
