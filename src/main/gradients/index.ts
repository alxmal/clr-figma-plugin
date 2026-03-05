import { toFigmaVariableName, toJsonTokenPath } from "../../shared/mappers";
import { hexToRgba, rgbaToHex } from "../../shared/figma/color";
import type {
  ClrTokenFile,
  GradientStop,
  GradientValue,
  TokenLeaf,
  TokenLeafValue,
  TokenNode,
  TokenPrimitive
} from "../../shared/schema/tokens";
import { parseAliasReference } from "../../shared/tokens/references";
import { setTokenAtPath, walkTokenTree } from "../../shared/tokens/tree";

const GRADIENT_META_PREFIX = "CLR_GRADIENT_META::";

interface GradientFlatToken {
  collectionName: string;
  tokenPath: string;
  styleName: string;
  description: string;
  value: TokenLeaf["$value"];
  valuesByModeName: Record<string, GradientValue>;
}

interface GradientMetadata {
  version: 1;
  collectionName: string;
  tokenPath: string;
  styleName: string;
  value: TokenLeaf["$value"];
}

export interface GradientImportStats {
  created: number;
  updated: number;
  removed: number;
  gradients: number;
}

export interface GradientExportStats {
  gradients: number;
}

type GradientPaintType =
  | "GRADIENT_LINEAR"
  | "GRADIENT_RADIAL"
  | "GRADIENT_ANGULAR"
  | "GRADIENT_DIAMOND";

function getStyleNameFromLeaf(leaf: TokenLeaf, tokenPath: string): string {
  const clrExtensions = leaf.$extensions?.clr;
  if (typeof clrExtensions === "object" && clrExtensions !== null) {
    const styleNameCandidate = (clrExtensions as Record<string, unknown>).styleName;
    if (typeof styleNameCandidate === "string" && styleNameCandidate.trim().length > 0) {
      return styleNameCandidate.trim();
    }
  }
  return toFigmaVariableName(tokenPath);
}

function isGradientValue(value: unknown): value is GradientValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    "stops" in value
  );
}

function normalizeGradientValuesByMode(
  value: TokenLeaf["$value"],
  modeNames: string[],
  tokenPath: string
): Record<string, GradientValue> {
  if (typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value) {
    if (!isGradientValue(value)) {
      throw new Error(`Invalid gradient value at token "${tokenPath}"`);
    }
    return Object.fromEntries(modeNames.map((modeName) => [modeName, value]));
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Gradient token "${tokenPath}" must use object value`);
  }

  const modeRecord = value as Record<string, TokenLeafValue>;
  const byMode: Record<string, GradientValue> = {};
  for (const modeName of modeNames) {
    const modeValue = modeRecord[modeName];
    if (!modeValue) {
      throw new Error(`Missing gradient value for mode "${modeName}" in token "${tokenPath}"`);
    }
    if (
      typeof modeValue !== "object" ||
      modeValue === null ||
      Array.isArray(modeValue) ||
      !("kind" in modeValue)
    ) {
      throw new Error(`Gradient mode value must be gradient object for token "${tokenPath}"`);
    }
    byMode[modeName] = modeValue as GradientValue;
  }

  return byMode;
}

function flattenGradientNodes(
  collectionName: string,
  node: TokenNode,
  modeNames: string[],
  flatTokens: GradientFlatToken[]
): void {
  walkTokenTree(node, ({ leaf, tokenPath }) => {
    if (leaf.$type !== "gradient") return;
    flatTokens.push({
      collectionName,
      tokenPath,
      styleName: getStyleNameFromLeaf(leaf, tokenPath),
      description: leaf.$description ?? "",
      value: leaf.$value,
      valuesByModeName: normalizeGradientValuesByMode(leaf.$value, modeNames, tokenPath)
    });
  });
}

function flattenColorTokenValues(
  node: TokenNode,
  modeNames: string[],
  target: Map<string, Record<string, TokenPrimitive>>
): void {
  walkTokenTree(node, ({ leaf, tokenPath }) => {
    if (leaf.$type !== "color") return;
    if (
      typeof leaf.$value === "string" ||
      typeof leaf.$value === "number" ||
      typeof leaf.$value === "boolean"
    ) {
      const singleValue = leaf.$value;
      target.set(
        tokenPath,
        Object.fromEntries(modeNames.map((modeName) => [modeName, singleValue])) as Record<
          string,
          TokenPrimitive
        >
      );
      return;
    }
    if ("kind" in leaf.$value) {
      return;
    }

    const modeRecord = leaf.$value as Record<string, TokenLeafValue>;
    const modeValues: Record<string, TokenPrimitive> = {};
    for (const modeName of modeNames) {
      const modeValue = modeRecord[modeName];
      if (modeValue === undefined) continue;
      if (typeof modeValue === "string" || typeof modeValue === "number" || typeof modeValue === "boolean") {
        modeValues[modeName] = modeValue;
      }
    }
    target.set(tokenPath, modeValues);
  });
}

function composeStyleDescription(description: string, metadata: GradientMetadata): string {
  const normalizedDescription = description.trim();
  const serializedMetadata = `${GRADIENT_META_PREFIX}${JSON.stringify(metadata)}`;
  if (!normalizedDescription) return serializedMetadata;
  return `${normalizedDescription}\n${serializedMetadata}`;
}

function parseStyleMetadata(style: PaintStyle): { metadata: GradientMetadata | null; description: string } {
  const description = style.description ?? "";
  const lines = description.split("\n");
  const metadataLine = lines.find((line) => line.startsWith(GRADIENT_META_PREFIX));
  if (!metadataLine) {
    return { metadata: null, description };
  }

  const payload = metadataLine.slice(GRADIENT_META_PREFIX.length);
  try {
    const parsed = JSON.parse(payload) as GradientMetadata;
    if (
      parsed &&
      parsed.version === 1 &&
      typeof parsed.collectionName === "string" &&
      typeof parsed.tokenPath === "string" &&
      typeof parsed.styleName === "string" &&
      parsed.value !== undefined
    ) {
      const userDescription = lines
        .filter((line) => !line.startsWith(GRADIENT_META_PREFIX))
        .join("\n")
        .trim();
      return { metadata: parsed, description: userDescription };
    }
  } catch {
    // Ignore malformed payload to avoid breaking export.
  }

  return { metadata: null, description };
}

function mapKindToPaintType(kind: GradientValue["kind"]): GradientPaintType {
  switch (kind) {
    case "linear":
      return "GRADIENT_LINEAR";
    case "radial":
      return "GRADIENT_RADIAL";
    case "angular":
      return "GRADIENT_ANGULAR";
    case "diamond":
      return "GRADIENT_DIAMOND";
  }
}

function mapPaintTypeToKind(type: GradientPaintType): GradientValue["kind"] {
  switch (type) {
    case "GRADIENT_LINEAR":
      return "linear";
    case "GRADIENT_RADIAL":
      return "radial";
    case "GRADIENT_ANGULAR":
      return "angular";
    case "GRADIENT_DIAMOND":
      return "diamond";
  }
}

function normalizeAngleDegrees(angleDegrees: number): number {
  const normalized = angleDegrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function buildGradientTransform(angleDegrees: number | undefined): Transform {
  const angle = ((angleDegrees ?? 0) * Math.PI) / 180;
  const vectorX = Math.cos(angle);
  const vectorY = Math.sin(angle);
  const cx = 0.5;
  const cy = 0.5;
  return [
    [vectorX, -vectorY, cx - vectorX * 0.5 + vectorY * 0.5],
    [vectorY, vectorX, cy - vectorY * 0.5 - vectorX * 0.5]
  ];
}

function getGradientTransform(gradient: GradientValue): Transform {
  if (gradient.kind === "linear" || gradient.kind === "angular") {
    return buildGradientTransform(gradient.angle);
  }
  return [
    [1, 0, 0],
    [0, 1, 0]
  ];
}

function extractAngleFromGradientTransform(transform: Transform): number {
  const xAxisX = transform[0][0];
  const xAxisY = transform[1][0];
  const radians = Math.atan2(xAxisY, xAxisX);
  const degrees = (radians * 180) / Math.PI;
  return Math.round(normalizeAngleDegrees(degrees) * 100) / 100;
}

function resolveColorAlias(
  aliasPath: string,
  modeName: string,
  colorValuesByPath: Map<string, Record<string, TokenPrimitive>>,
  globalColorValuesByPath: Map<string, Record<string, TokenPrimitive>>,
  stack: Set<string>
): RGBA {
  if (stack.has(aliasPath)) {
    throw new Error(`Circular color alias detected: ${Array.from(stack).concat(aliasPath).join(" -> ")}`);
  }

  const modeValues = colorValuesByPath.get(aliasPath) ?? globalColorValuesByPath.get(aliasPath);
  if (!modeValues) {
    throw new Error(`Alias target not found for gradient stop: "${aliasPath}"`);
  }
  const rawValue = modeValues[modeName];
  if (rawValue === undefined) {
    throw new Error(`Alias target "${aliasPath}" has no value for mode "${modeName}"`);
  }
  if (typeof rawValue !== "string") {
    throw new Error(`Alias target "${aliasPath}" must resolve to string color value`);
  }

  const nestedAlias = parseAliasReference(rawValue);
  if (nestedAlias) {
    const nestedStack = new Set(stack);
    nestedStack.add(aliasPath);
    return resolveColorAlias(
      nestedAlias,
      modeName,
      colorValuesByPath,
      globalColorValuesByPath,
      nestedStack
    );
  }
  return hexToRgba(rawValue);
}

function gradientStopToColorStop(
  stop: GradientStop,
  modeName: string,
  colorValuesByPath: Map<string, Record<string, TokenPrimitive>>,
  globalColorValuesByPath: Map<string, Record<string, TokenPrimitive>>
): ColorStop {
  const aliasPath = parseAliasReference(stop.color);
  let rgba = aliasPath
    ? resolveColorAlias(aliasPath, modeName, colorValuesByPath, globalColorValuesByPath, new Set())
    : hexToRgba(stop.color);
  if (stop.opacity !== undefined) {
    rgba = { ...rgba, a: rgba.a * stop.opacity };
  }

  return {
    position: Math.max(0, Math.min(100, stop.position)) / 100,
    color: rgba
  };
}

function createGradientPaintFromValue(
  gradient: GradientValue,
  modeName: string,
  colorValuesByPath: Map<string, Record<string, TokenPrimitive>>,
  globalColorValuesByPath: Map<string, Record<string, TokenPrimitive>>
): GradientPaint {
  return {
    type: mapKindToPaintType(gradient.kind),
    gradientTransform: getGradientTransform(gradient),
    gradientStops: gradient.stops.map((stop) =>
      gradientStopToColorStop(stop, modeName, colorValuesByPath, globalColorValuesByPath)
    ),
    visible: true,
    blendMode: "NORMAL"
  };
}

function extractGradientPaint(style: PaintStyle): GradientPaint | null {
  for (const paint of style.paints) {
    if (
      paint.type === "GRADIENT_LINEAR" ||
      paint.type === "GRADIENT_RADIAL" ||
      paint.type === "GRADIENT_ANGULAR" ||
      paint.type === "GRADIENT_DIAMOND"
    ) {
      return paint;
    }
  }
  return null;
}

function gradientPaintToValue(paint: GradientPaint): GradientValue {
  return {
    kind: mapPaintTypeToKind(paint.type),
    angle: extractAngleFromGradientTransform(paint.gradientTransform),
    stops: paint.gradientStops.map((stop) => {
      const result: GradientStop = {
        position: Math.round(stop.position * 10000) / 100,
        color: rgbaToHex(stop.color)
      };
      if (stop.color.a < 1) {
        result.opacity = Math.round(stop.color.a * 1000) / 1000;
      }
      return result;
    })
  };
}

export async function upsertGradientStylesFromTokens(tokenFile: ClrTokenFile): Promise<GradientImportStats> {
  const stats: GradientImportStats = { created: 0, updated: 0, removed: 0, gradients: 0 };
  const localPaintStyles = await figma.getLocalPaintStylesAsync();
  const localByName = new Map(localPaintStyles.map((style) => [style.name, style]));

  const gradientsByCollection = new Map<string, GradientFlatToken[]>();
  const colorValuesByCollection = new Map<string, Map<string, Record<string, TokenPrimitive>>>();
  const globalColorValuesByPath = new Map<string, Record<string, TokenPrimitive>>();

  for (const collection of tokenFile.collections) {
    const gradients: GradientFlatToken[] = [];
    flattenGradientNodes(collection.name, collection.tokens as TokenNode, collection.modes, gradients);
    gradientsByCollection.set(collection.name, gradients);

    const colorByPath = new Map<string, Record<string, TokenPrimitive>>();
    flattenColorTokenValues(collection.tokens as TokenNode, collection.modes, colorByPath);
    colorValuesByCollection.set(collection.name, colorByPath);
    for (const [tokenPath, modeValues] of colorByPath.entries()) {
      if (!globalColorValuesByPath.has(tokenPath)) {
        globalColorValuesByPath.set(tokenPath, modeValues);
      }
    }
  }

  const expectedNamesByCollection = new Map<string, Set<string>>();
  for (const [collectionName, tokens] of gradientsByCollection.entries()) {
    expectedNamesByCollection.set(collectionName, new Set(tokens.map((token) => token.styleName)));
  }

  for (const style of localPaintStyles) {
    const { metadata } = parseStyleMetadata(style);
    if (!metadata) continue;
    const expectedNames = expectedNamesByCollection.get(metadata.collectionName);
    if (!expectedNames || !expectedNames.has(style.name)) {
      style.remove();
      stats.removed += 1;
    }
  }

  for (const collection of tokenFile.collections) {
    const gradients = gradientsByCollection.get(collection.name) ?? [];
    const colorsByPath = colorValuesByCollection.get(collection.name) ?? new Map();
    const primaryModeName = collection.modes[0];

    for (const gradientToken of gradients) {
      const existing = localByName.get(gradientToken.styleName);
      const style = existing ?? figma.createPaintStyle();
      if (!existing) {
        stats.created += 1;
      } else {
        stats.updated += 1;
      }

      style.name = gradientToken.styleName;
      const paintValue = gradientToken.valuesByModeName[primaryModeName];
      if (!paintValue) {
        throw new Error(
          `Gradient token "${gradientToken.tokenPath}" is missing value for primary mode "${primaryModeName}"`
        );
      }
      style.paints = [createGradientPaintFromValue(
        paintValue,
        primaryModeName,
        colorsByPath,
        globalColorValuesByPath
      )];
      style.description = composeStyleDescription(gradientToken.description, {
        version: 1,
        collectionName: collection.name,
        tokenPath: gradientToken.tokenPath,
        styleName: gradientToken.styleName,
        value: gradientToken.value
      });

      stats.gradients += 1;
    }
  }

  return stats;
}

export async function appendGradientTokensFromLocalStyles(tokenFile: ClrTokenFile): Promise<GradientExportStats> {
  const localPaintStyles = await figma.getLocalPaintStylesAsync();
  let gradients = 0;

  const byName = new Map(tokenFile.collections.map((collection) => [collection.name, collection]));
  const defaultModes = tokenFile.collections[0]?.modes ?? ["Default"];
  const defaultCollectionName = tokenFile.collections[0]?.name ?? "Local";

  if (!byName.has(defaultCollectionName)) {
    const createdCollection: ClrTokenFile["collections"][number] = {
      name: defaultCollectionName,
      modes: defaultModes,
      tokens: {}
    };
    tokenFile.collections.push(createdCollection);
    byName.set(defaultCollectionName, createdCollection);
  }

  for (const style of localPaintStyles) {
    const gradientPaint = extractGradientPaint(style);
    if (!gradientPaint) continue;

    const parsed = parseStyleMetadata(style);
    const metadata = parsed.metadata;
    const collectionName = metadata?.collectionName ?? defaultCollectionName;
    const tokenPath = metadata?.tokenPath ?? toJsonTokenPath(style.name);
    const styleName = metadata?.styleName ?? style.name;
    const rawValue = metadata?.value ?? gradientPaintToValue(gradientPaint);
    const tokenDescription = parsed.description;

    let targetCollection = byName.get(collectionName);
    if (!targetCollection) {
      targetCollection = {
        name: collectionName,
        modes: defaultModes,
        tokens: {}
      };
      tokenFile.collections.push(targetCollection);
      byName.set(collectionName, targetCollection);
    }

    const gradientLeaf: TokenLeaf = {
      $type: "gradient",
      $value: rawValue,
      $extensions: {
        clr: {
          styleName
        }
      }
    };
    if (tokenDescription.trim().length > 0) {
      gradientLeaf.$description = tokenDescription.trim();
    }

    setTokenAtPath(targetCollection.tokens as Record<string, unknown>, tokenPath, gradientLeaf);
    gradients += 1;
  }

  return { gradients };
}
