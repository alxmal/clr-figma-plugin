import { toJsonTokenPath } from "../shared/mappers";
import { rgbaToHex } from "../shared/figma/color";
import type { ClrTokenFile, TokenGroup, TokenLeaf, TokenPrimitive } from "../shared/schema/tokens";
import { setTokenAtPath } from "../shared/tokens/tree";
import { appendGradientTokensFromLocalStyles } from "./gradients";

interface ExportResult {
  tokenFile: ClrTokenFile;
  stats: {
    collections: number;
    variables: number;
    gradients: number;
  };
}

function mapVariableTypeToTokenType(variableType: VariableResolvedDataType): string {
  switch (variableType) {
    case "COLOR":
      return "color";
    case "FLOAT":
      return "number";
    case "BOOLEAN":
      return "boolean";
    case "STRING":
      return "string";
    default:
      return "string";
  }
}

function isRgbLike(value: VariableValue): value is RGB | RGBA {
  if (typeof value !== "object" || value === null) return false;
  if (!("r" in value) || !("g" in value) || !("b" in value)) return false;
  return true;
}

function resolveValueForExport(
  variableValue: VariableValue,
  variableType: VariableResolvedDataType,
  variableIdToPath: Map<string, string>
): TokenPrimitive {
  if (typeof variableValue === "boolean" || typeof variableValue === "number") {
    return variableValue;
  }
  if (typeof variableValue === "string") {
    return variableValue;
  }

  if ("type" in variableValue && variableValue.type === "VARIABLE_ALIAS") {
    const aliasPath = variableIdToPath.get(variableValue.id);
    if (!aliasPath) {
      throw new Error(`Cannot resolve alias target for variable id "${variableValue.id}"`);
    }
    return `{${aliasPath}}`;
  }

  if (variableType === "COLOR") {
    if (!isRgbLike(variableValue)) {
      throw new Error(`Color variable has invalid value for export`);
    }
    return rgbaToHex(variableValue);
  }

  throw new Error(`Unsupported variable value for type "${variableType}"`);
}

export async function exportTokenFileFromLocalVariables(): Promise<ExportResult> {
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const localVariables = await figma.variables.getLocalVariablesAsync();

  const variableIdToPath = new Map<string, string>();
  for (const variable of localVariables) {
    variableIdToPath.set(variable.id, toJsonTokenPath(variable.name));
  }

  const collections: ClrTokenFile["collections"] = [];
  let variableCount = 0;

  for (const collection of localCollections) {
    const tokens: TokenGroup = {};
    const collectionVariables = localVariables.filter(
      (variable) => variable.variableCollectionId === collection.id
    );

    for (const variable of collectionVariables) {
      const valuesByModeName: Record<string, TokenPrimitive> = {};
      for (const mode of collection.modes) {
        const variableValue = variable.valuesByMode[mode.modeId];
        if (variableValue === undefined) {
          throw new Error(
            `Variable "${variable.name}" does not have a value for mode "${mode.name}"`
          );
        }
        valuesByModeName[mode.name] = resolveValueForExport(
          variableValue,
          variable.resolvedType,
          variableIdToPath
        );
      }

      const leaf: TokenLeaf = {
        $type: mapVariableTypeToTokenType(variable.resolvedType),
        $value: valuesByModeName
      };
      if (variable.description && variable.description.trim().length > 0) {
        leaf.$description = variable.description;
      }
      if (variable.hiddenFromPublishing) {
        leaf.$extensions = {
          clr: {
            hideFromPublishing: true
          }
        };
      }

      const tokenPath = toJsonTokenPath(variable.name);
      setTokenAtPath(tokens as Record<string, unknown>, tokenPath, leaf);
      variableCount += 1;
    }

    collections.push({
      name: collection.name,
      modes: collection.modes.map((mode) => mode.name),
      tokens
    });
  }

  const tokenFile: ClrTokenFile = {
    meta: {
      format: "clr-tokens",
      version: "0.1.0",
      source: "figma-local-variables"
    },
    collections
  };

  const gradientExportStats = await appendGradientTokensFromLocalStyles(tokenFile);

  return {
    tokenFile,
    stats: {
      collections: collections.length,
      variables: variableCount,
      gradients: gradientExportStats.gradients
    }
  };
}
