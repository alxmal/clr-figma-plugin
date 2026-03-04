import { toFigmaVariableName } from "../../shared/mappers";
import type {
  ClrTokenFile,
  TokenLeaf,
  TokenNode,
  TokenPrimitive
} from "../../shared/schema/tokens";

type VariableType = VariableResolvedDataType;

interface FlatToken {
  collectionName: string;
  tokenPath: string;
  variableName: string;
  type: VariableType;
  description: string;
  valuesByModeName: Record<string, TokenPrimitive>;
}

interface ImportStats {
  collections: number;
  created: number;
  updated: number;
  removed: number;
}

interface ImportResult {
  stats: ImportStats;
}

const ALIAS_REFERENCE_PATTERN = /^\{([^}]+)\}$/;

function isTokenLeaf(node: TokenNode): node is TokenLeaf {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return false;
  const candidate = node as Partial<TokenLeaf>;
  return typeof candidate.$type === "string" && candidate.$value !== undefined;
}

function mapTokenTypeToVariableType(tokenType: string): VariableType | null {
  switch (tokenType) {
    case "color":
      return "COLOR";
    case "number":
    case "dimension":
      return "FLOAT";
    case "string":
      return "STRING";
    case "boolean":
      return "BOOLEAN";
    case "gradient":
      return null;
    default:
      throw new Error(`Unsupported token type: ${tokenType}`);
  }
}

function flattenTokenNode(
  collectionName: string,
  node: TokenNode,
  pathParts: string[],
  modeNames: string[],
  flatTokens: FlatToken[]
): void {
  if (isTokenLeaf(node)) {
    const tokenPath = pathParts.join(".");
    if (!tokenPath) {
      throw new Error(`Token path cannot be empty in collection "${collectionName}"`);
    }
    const mappedType = mapTokenTypeToVariableType(node.$type);
    if (!mappedType) {
      return;
    }
    flatTokens.push({
      collectionName,
      tokenPath,
      variableName: toFigmaVariableName(tokenPath),
      type: mappedType,
      description: node.$description ?? "",
      valuesByModeName: normalizeValuesForModes(node.$value, modeNames, tokenPath)
    });
    return;
  }

  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) {
      continue;
    }
    const childPath = pathParts.slice();
    childPath.push(key);
    flattenTokenNode(collectionName, child as TokenNode, childPath, modeNames, flatTokens);
  }
}

function normalizeValuesForModes(
  value: TokenLeaf["$value"],
  modeNames: string[],
  tokenPath: string
): Record<string, TokenPrimitive> {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return Object.fromEntries(modeNames.map((modeName) => [modeName, value]));
  }
  if ("kind" in value) {
    throw new Error(`Token "${tokenPath}" cannot use gradient object in variable import`);
  }

  const valuesByModeName: Record<string, TokenPrimitive> = {};
  for (const modeName of modeNames) {
    const modeValue = value[modeName];
    if (modeValue === undefined) {
      throw new Error(`Missing value for mode "${modeName}" in token "${tokenPath}"`);
    }
    if (typeof modeValue !== "string" && typeof modeValue !== "number" && typeof modeValue !== "boolean") {
      throw new Error(`Token "${tokenPath}" has non-primitive value for mode "${modeName}"`);
    }
    valuesByModeName[modeName] = modeValue;
  }
  return valuesByModeName;
}

function parseAliasReference(rawValue: TokenPrimitive): string | null {
  if (typeof rawValue !== "string") return null;
  const match = rawValue.match(ALIAS_REFERENCE_PATTERN);
  if (!match) return null;
  return match[1].trim();
}

function hexToRgba(hex: string): RGBA {
  const normalized = hex.trim().replace(/^#/, "");
  if (![3, 4, 6, 8].includes(normalized.length)) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }

  const expanded =
    normalized.length === 3 || normalized.length === 4
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;

  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;

  if ([red, green, blue, alpha].some((v) => Number.isNaN(v))) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }

  return { r: red, g: green, b: blue, a: alpha };
}

function ensureCollectionModes(collection: VariableCollection, desiredModeNames: string[]): Map<string, string> {
  if (desiredModeNames.length === 0) {
    throw new Error(`Collection "${collection.name}" must contain at least one mode`);
  }

  const currentModesByName = new Map(collection.modes.map((mode) => [mode.name, mode.modeId]));

  const defaultMode = collection.modes.find((mode) => mode.modeId === collection.defaultModeId);
  if (!defaultMode) {
    throw new Error(`Collection "${collection.name}" does not have a valid default mode`);
  }

  const firstDesiredModeName = desiredModeNames[0];
  if (defaultMode.name !== firstDesiredModeName) {
    collection.renameMode(defaultMode.modeId, firstDesiredModeName);
  }

  const usedModeIds = new Set<string>([defaultMode.modeId]);
  const modeNameToModeId = new Map<string, string>([[firstDesiredModeName, defaultMode.modeId]]);

  for (const desiredModeName of desiredModeNames.slice(1)) {
    const existingModeId = currentModesByName.get(desiredModeName);
    if (existingModeId && !usedModeIds.has(existingModeId)) {
      modeNameToModeId.set(desiredModeName, existingModeId);
      usedModeIds.add(existingModeId);
      continue;
    }

    const newModeId = collection.addMode(desiredModeName);
    modeNameToModeId.set(desiredModeName, newModeId);
    usedModeIds.add(newModeId);
  }

  for (const mode of collection.modes) {
    if (usedModeIds.has(mode.modeId)) continue;
    collection.removeMode(mode.modeId);
  }

  return modeNameToModeId;
}

function resolveVariableValue(
  rawValue: TokenPrimitive,
  tokenType: VariableType,
  variablesByCollectionAndPath: Map<string, Variable>,
  variablesByPathGlobal: Map<string, Variable[]>
): VariableValue {
  const referencePath = parseAliasReference(rawValue);
  if (referencePath) {
    const referenced =
      variablesByCollectionAndPath.get(referencePath) ??
      (function () {
        const globalCandidates = variablesByPathGlobal.get(referencePath) ?? [];
        if (globalCandidates.length === 1) return globalCandidates[0];
        if (globalCandidates.length > 1) {
          throw new Error(
            `Alias target "${referencePath}" is ambiguous across collections (${globalCandidates.length} matches)`
          );
        }
        return null;
      })();
    if (!referenced) {
      throw new Error(`Alias target not found: "${referencePath}"`);
    }
    return figma.variables.createVariableAlias(referenced);
  }

  if (tokenType === "COLOR") {
    if (typeof rawValue !== "string") {
      throw new Error(`Color token value must be a hex string, received "${typeof rawValue}"`);
    }
    return hexToRgba(rawValue);
  }
  if (tokenType === "FLOAT") {
    if (typeof rawValue !== "number") {
      throw new Error(`Number token value must be number, received "${typeof rawValue}"`);
    }
    return rawValue;
  }
  if (tokenType === "BOOLEAN") {
    if (typeof rawValue !== "boolean") {
      throw new Error(`Boolean token value must be boolean, received "${typeof rawValue}"`);
    }
    return rawValue;
  }
  if (typeof rawValue !== "string") {
    throw new Error(`String token value must be string, received "${typeof rawValue}"`);
  }
  return rawValue;
}

async function getOrCreateCollectionByName(name: string): Promise<VariableCollection> {
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const existing = localCollections.find((collection) => collection.name === name);
  if (existing) return existing;
  return figma.variables.createVariableCollection(name);
}

async function getVariablesByNameInCollection(collection: VariableCollection): Promise<Map<string, Variable>> {
  const localVariables = await figma.variables.getLocalVariablesAsync();
  const collectionVariables = localVariables.filter(
    (variable) => variable.variableCollectionId === collection.id
  );
  return new Map(collectionVariables.map((variable) => [variable.name, variable]));
}

export async function upsertVariablesFromTokens(tokenFile: ClrTokenFile): Promise<ImportResult> {
  const stats: ImportStats = {
    collections: 0,
    created: 0,
    updated: 0,
    removed: 0
  };

  const flatTokensByCollectionName = new Map<string, FlatToken[]>();
  for (const collectionInput of tokenFile.collections) {
    const flatTokens: FlatToken[] = [];
    flattenTokenNode(collectionInput.name, collectionInput.tokens as TokenNode, [], collectionInput.modes, flatTokens);

    const seenPaths = new Set<string>();
    for (const token of flatTokens) {
      if (seenPaths.has(token.tokenPath)) {
        throw new Error(
          `Duplicate token path "${token.tokenPath}" in collection "${collectionInput.name}"`
        );
      }
      seenPaths.add(token.tokenPath);
    }

    flatTokensByCollectionName.set(collectionInput.name, flatTokens);
  }

  const variablesByCollectionAndPath = new Map<string, Variable>();
  const modeMapByCollectionName = new Map<string, Map<string, string>>();

  for (const collectionInput of tokenFile.collections) {
    const collection = await getOrCreateCollectionByName(collectionInput.name);
    stats.collections += 1;

    const modeNameToModeId = ensureCollectionModes(collection, collectionInput.modes);
    modeMapByCollectionName.set(collectionInput.name, modeNameToModeId);

    const tokens = flatTokensByCollectionName.get(collectionInput.name) ?? [];
    const expectedVariableNames = new Set(tokens.map((token) => token.variableName));
    const existingByName = await getVariablesByNameInCollection(collection);

    for (const [existingName, existingVariable] of existingByName.entries()) {
      if (expectedVariableNames.has(existingName)) continue;
      existingVariable.remove();
      stats.removed += 1;
    }

    for (const token of tokens) {
      const existing = existingByName.get(token.variableName);
      let variable: Variable;

      if (existing && existing.resolvedType === token.type) {
        variable = existing;
        stats.updated += 1;
      } else {
        if (existing) {
          existing.remove();
          stats.removed += 1;
        }
        variable = figma.variables.createVariable(token.variableName, collection, token.type);
        stats.created += 1;
      }

      variable.description = token.description;
      const variableKey = `${collectionInput.name}:${token.tokenPath}`;
      variablesByCollectionAndPath.set(variableKey, variable);
    }
  }

  const variablesByPathGlobal = new Map<string, Variable[]>();
  for (const [collectionAndPath, variable] of variablesByCollectionAndPath.entries()) {
    const separatorIndex = collectionAndPath.indexOf(":");
    const tokenPath = separatorIndex >= 0 ? collectionAndPath.slice(separatorIndex + 1) : collectionAndPath;
    const existing = variablesByPathGlobal.get(tokenPath) ?? [];
    existing.push(variable);
    variablesByPathGlobal.set(tokenPath, existing);
  }

  for (const collectionInput of tokenFile.collections) {
    const modeNameToModeId = modeMapByCollectionName.get(collectionInput.name);
    if (!modeNameToModeId) {
      throw new Error(`Mode mapping missing for collection "${collectionInput.name}"`);
    }

    const tokens = flatTokensByCollectionName.get(collectionInput.name) ?? [];
    for (const token of tokens) {
      const variable = variablesByCollectionAndPath.get(`${collectionInput.name}:${token.tokenPath}`);
      if (!variable) {
        throw new Error(
          `Variable mapping missing for token "${token.tokenPath}" in collection "${collectionInput.name}"`
        );
      }

      for (const [modeName, modeValue] of Object.entries(token.valuesByModeName)) {
        const modeId = modeNameToModeId.get(modeName);
        if (!modeId) {
          throw new Error(`Mode "${modeName}" does not exist in collection "${collectionInput.name}"`);
        }

        const variableValue = resolveVariableValue(
          modeValue,
          token.type,
          new Map(
            Array.from(variablesByCollectionAndPath.entries())
              .filter(([collectionAndPath]) => collectionAndPath.startsWith(`${collectionInput.name}:`))
              .map(([collectionAndPath, variableRef]) => [
                collectionAndPath.replace(`${collectionInput.name}:`, ""),
                variableRef
              ])
          ),
          variablesByPathGlobal
        );
        variable.setValueForMode(modeId, variableValue);
      }
    }
  }

  return { stats };
}
