#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenLeaf(node) {
  return isObject(node) && typeof node.$type === "string" && "$value" in node;
}

function walkTokenTree(node, pathParts, callback) {
  if (isTokenLeaf(node)) {
    callback(node, pathParts.join("."));
    return;
  }
  if (!isObject(node)) return;

  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    walkTokenTree(child, pathParts.concat(key), callback);
  }
}

function setTokenAtPath(root, tokenPath, leaf) {
  const parts = tokenPath.split(".");
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const isLast = index === parts.length - 1;
    const existing = current[part];
    if (isLast) {
      current[part] = leaf;
      return;
    }
    if (!existing) {
      current[part] = {};
      current = current[part];
      continue;
    }
    if (isObject(existing) && !isTokenLeaf(existing)) {
      current = existing;
      continue;
    }
    throw new Error(`Cannot set "${tokenPath}". Path conflict at "${part}"`);
  }
}

function normalizePath(pathValue) {
  return String(pathValue).replaceAll("/", ".").toLowerCase();
}

function pickCollectionRule(sourceCollectionName, rules) {
  const normalized = sourceCollectionName.toLowerCase();
  for (const rule of rules.sourceCollectionRules ?? []) {
    const byEquals =
      typeof rule.equals === "string" && normalized === rule.equals.toLowerCase();
    const byIncludes =
      typeof rule.includes === "string" && normalized.includes(rule.includes.toLowerCase());
    if (byEquals || byIncludes) {
      return rule.target;
    }
  }
  return null;
}

function pickByPathPrefix(tokenPath, prefixesByTarget) {
  const normalizedPath = normalizePath(tokenPath);
  for (const [target, prefixes] of Object.entries(prefixesByTarget ?? {})) {
    for (const prefix of prefixes) {
      if (normalizedPath.startsWith(normalizePath(prefix))) {
        return target;
      }
    }
  }
  return null;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureCollection(collectionsByName, collectionModesByName, targetName, sourceModes) {
  let targetCollection = collectionsByName.get(targetName);
  if (!targetCollection) {
    targetCollection = {
      name: targetName,
      modes: [...sourceModes],
      tokens: {}
    };
    collectionsByName.set(targetName, targetCollection);
    collectionModesByName.set(targetName, [...sourceModes]);
    return targetCollection;
  }

  const existingModes = collectionModesByName.get(targetName) ?? [];
  const sameModes =
    existingModes.length === sourceModes.length &&
    existingModes.every((mode, index) => mode === sourceModes[index]);
  if (!sameModes) {
    throw new Error(
      `Mode mismatch for collection "${targetName}". Existing: [${existingModes.join(", ")}], source: [${sourceModes.join(", ")}]`
    );
  }
  return targetCollection;
}

function selectTargetCollection(sourceCollectionName, tokenPath, rules) {
  const byCollection = pickCollectionRule(sourceCollectionName, rules);
  if (byCollection) return byCollection;

  const bySemanticPath = pickByPathPrefix(tokenPath, rules.semanticPathPrefixesByTarget);
  if (bySemanticPath) return bySemanticPath;

  const byProductPath = pickByPathPrefix(tokenPath, rules.productPathPrefixesByTarget);
  if (byProductPath) return byProductPath;

  const byCorePath = pickByPathPrefix(tokenPath, { [rules.coreCollectionName]: rules.corePathPrefixes ?? [] });
  if (byCorePath) return byCorePath;

  return rules.defaultTarget ?? sourceCollectionName;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input;
  const outputPath = args.output;
  const rulesPath = args.rules;

  if (!inputPath || !outputPath || !rulesPath) {
    throw new Error(
      "Usage: node scripts/migrate-multi-product.mjs --input <tokens.json> --rules <rules.json> --output <result.json>"
    );
  }

  const [inputRaw, rulesRaw] = await Promise.all([readFile(inputPath, "utf8"), readFile(rulesPath, "utf8")]);
  const tokenFile = JSON.parse(inputRaw);
  const rules = JSON.parse(rulesRaw);

  if (!Array.isArray(tokenFile.collections)) {
    throw new Error('Input token file must include "collections" array');
  }
  if (typeof rules.coreCollectionName !== "string" || rules.coreCollectionName.length === 0) {
    throw new Error('Rules file must include non-empty "coreCollectionName"');
  }

  const collectionsByName = new Map();
  const collectionModesByName = new Map();
  const stats = {
    moved: 0,
    byCollection: {}
  };

  for (const sourceCollection of tokenFile.collections) {
    if (!isObject(sourceCollection) || !isObject(sourceCollection.tokens) || !Array.isArray(sourceCollection.modes)) {
      continue;
    }
    walkTokenTree(sourceCollection.tokens, [], (leaf, tokenPath) => {
      const targetCollectionName = selectTargetCollection(sourceCollection.name, tokenPath, rules);
      const targetCollection = ensureCollection(
        collectionsByName,
        collectionModesByName,
        targetCollectionName,
        sourceCollection.modes
      );
      setTokenAtPath(targetCollection.tokens, tokenPath, deepClone(leaf));
      stats.moved += 1;
      stats.byCollection[targetCollectionName] = (stats.byCollection[targetCollectionName] ?? 0) + 1;
    });
  }

  const output = {
    meta: {
      ...(tokenFile.meta ?? {}),
      source: `${tokenFile.meta?.source ?? "unknown"} | migrated-multi-product`
    },
    collections: Array.from(collectionsByName.values())
  };

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const summary = Object.entries(stats.byCollection)
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");
  // eslint-disable-next-line no-console
  console.log(`Migration complete. Tokens moved: ${stats.moved}. ${summary}`);
  // eslint-disable-next-line no-console
  console.log(`Output written to ${path.resolve(outputPath)}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
