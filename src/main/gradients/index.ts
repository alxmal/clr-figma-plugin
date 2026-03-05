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
  metadataCollectionName: string;
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
const PRODUCT_COLLECTION_HINTS = new Set(["pay", "plus", "pro", "savers", "split"]);

function toKebabSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toCollectionSuffix(
  collectionName: string,
  prefix: "Product" | "Semantic" | "External"
): string | null {
  const normalized = collectionName.trim();
  const match = normalized.match(new RegExp(`^${prefix}[.\\s-]+(.+)$`, "i"));
  if (!match || !match[1]) return null;
  const kebab = toKebabSegment(match[1]);
  return kebab.length > 0 ? kebab : null;
}

function inferProductFromTokenPath(tokenPath: string): string | null {
  const normalized = normalizeStylePath(toFigmaVariableName(tokenPath));
  const parts = normalized.split("/");
  if (parts.length === 0) return null;

  let startIndex = 0;
  if (parts[0].toLowerCase() === "gradient" || parts[0].toLowerCase() === "gradients") {
    startIndex = 1;
  }
  if (parts.length <= startIndex) return null;

  const first = parts[startIndex];
  const second = parts[startIndex + 1];
  if (first && first.toLowerCase() === "product card" && second) {
    return toPascalSegment(second);
  }
  return first ? toPascalSegment(first) : null;
}

function getStyleCollectionPrefix(collectionName: string, tokenPath: string): string | null {
  const productSuffix = toCollectionSuffix(collectionName, "Product");
  if (productSuffix) return `${toPascalSegment(productSuffix)} Gradients`;

  const externalSuffix = toCollectionSuffix(collectionName, "External");
  if (externalSuffix) return `${toPascalSegment(externalSuffix)} Gradients`;

  const semanticSuffix = toCollectionSuffix(collectionName, "Semantic");
  if (semanticSuffix) {
    if (semanticSuffix === "common") {
      const inferredProduct = inferProductFromTokenPath(tokenPath);
      return inferredProduct ? `${inferredProduct} Gradients` : null;
    }
    return `${toPascalSegment(semanticSuffix)} Gradients`;
  }

  if (collectionName.trim().toLowerCase().startsWith("core")) {
    return "Core Gradients";
  }

  const inferredProduct = inferProductFromTokenPath(tokenPath);
  return inferredProduct ? `${inferredProduct} Gradients` : null;
}

function getStyleGroupFromCollectionPrefix(collectionPrefix: string): string | null {
  const groupedMatch = collectionPrefix.match(/^([^/]+?)\s+Gradients$/i);
  return groupedMatch && groupedMatch[1] ? groupedMatch[1] : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeStylePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function buildConventionalStyleName(collectionName: string, tokenPath: string): string {
  const collectionPrefix = getStyleCollectionPrefix(collectionName, tokenPath);
  const tokenStylePath = normalizeStylePath(toFigmaVariableName(tokenPath));
  let tokenSuffix = tokenStylePath;
  if (tokenSuffix.toLowerCase().startsWith("gradient/")) {
    tokenSuffix = tokenSuffix.slice("gradient/".length);
  }
  if (tokenSuffix.toLowerCase().startsWith("gradients/")) {
    tokenSuffix = tokenSuffix.slice("gradients/".length);
  }

  if (!collectionPrefix) return tokenStylePath;
  const styleGroup = getStyleGroupFromCollectionPrefix(collectionPrefix);
  if (styleGroup && tokenSuffix.toLowerCase().startsWith(`${styleGroup.toLowerCase()}/`)) {
    tokenSuffix = tokenSuffix.slice(styleGroup.length + 1);
  }
  return normalizeStylePath(`${collectionPrefix}/${tokenSuffix}`);
}

function normalizeStyleNameByConvention(
  collectionName: string,
  tokenPath: string,
  styleNameCandidate?: string
): string {
  const collectionPrefix = getStyleCollectionPrefix(collectionName, tokenPath);
  if (!styleNameCandidate || styleNameCandidate.trim().length === 0) {
    return buildConventionalStyleName(collectionName, tokenPath);
  }

  const candidate = normalizeStylePath(styleNameCandidate);
  if (!collectionPrefix) return candidate;

  const expectedPrefix = `${collectionPrefix}/`;
  if (candidate.toLowerCase().startsWith(expectedPrefix.toLowerCase())) {
    return candidate;
  }

  let suffix = candidate;
  const styleGroup = getStyleGroupFromCollectionPrefix(collectionPrefix);

  if (suffix.toLowerCase().startsWith("gradients/")) {
    suffix = suffix.slice("gradients/".length);
  }
  if (suffix.toLowerCase().startsWith("gradient/")) {
    suffix = suffix.slice("gradient/".length);
  }

  if (styleGroup) {
    const escapedStyleGroup = escapeRegex(styleGroup);
    suffix = suffix.replace(new RegExp(`^${escapedStyleGroup}\\s+gradients/`, "i"), "");
  }
  if (styleGroup && suffix.toLowerCase().startsWith(`${styleGroup.toLowerCase()}/`)) {
    suffix = suffix.slice(styleGroup.length + 1);
  }
  if (suffix.toLowerCase().startsWith("gradient/")) {
    suffix = suffix.slice("gradient/".length);
  }
  if (suffix.toLowerCase().startsWith("gradients/")) {
    suffix = suffix.slice("gradients/".length);
  }

  return normalizeStylePath(`${collectionPrefix}/${suffix}`);
}

function toPascalSegment(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function inferGradientLocationFromStyleName(styleName: string): { collectionName: string; tokenPath: string } | null {
  const normalized = normalizeStylePath(styleName);
  const groupedMatch = normalized.match(/^([^/]+?)\s+Gradients\/(.+)$/i);
  if (groupedMatch && groupedMatch[1] && groupedMatch[2]) {
    const group = toPascalSegment(groupedMatch[1]);
    const collectionName = group.toLowerCase() === "core" ? "Core" : `Product.${group}`;
    return {
      collectionName,
      tokenPath: `gradient.${toJsonTokenPath(groupedMatch[2])}`
    };
  }

  return null;
}

function inferProductCollectionFromTokenPath(tokenPath: string): string | null {
  const normalized = normalizeStylePath(toFigmaVariableName(tokenPath)).toLowerCase();
  const parts = normalized.split("/").filter((part) => part.length > 0);
  if (parts.length < 2) return null;

  if ((parts[0] === "gradient" || parts[0] === "gradients") && PRODUCT_COLLECTION_HINTS.has(parts[1])) {
    return `Product.${toPascalSegment(parts[1])}`;
  }
  if (parts[0] === "product" && PRODUCT_COLLECTION_HINTS.has(parts[1])) {
    return `Product.${toPascalSegment(parts[1])}`;
  }
  return null;
}

function getStyleNameFromLeaf(collectionName: string, leaf: TokenLeaf, tokenPath: string): string {
  const clrExtensions = leaf.$extensions?.clr;
  let styleNameCandidate: string | undefined;
  if (typeof clrExtensions === "object" && clrExtensions !== null) {
    const candidate = (clrExtensions as Record<string, unknown>).styleName;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      styleNameCandidate = candidate;
    }
  }
  return normalizeStyleNameByConvention(collectionName, tokenPath, styleNameCandidate);
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
    const styleName = getStyleNameFromLeaf(collectionName, leaf, tokenPath);
    const inferredFromPath = inferProductCollectionFromTokenPath(tokenPath);
    const inferredFromStyle = inferGradientLocationFromStyleName(styleName)?.collectionName;
    const metadataCollectionName =
      collectionName === "Product" || collectionName === "External"
        ? collectionName
        : inferredFromPath ?? inferredFromStyle ?? collectionName;
    flatTokens.push({
      collectionName,
      metadataCollectionName,
      tokenPath,
      styleName,
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
  const expectedStyleNamesGlobal = new Set<string>();
  for (const tokens of gradientsByCollection.values()) {
    for (const token of tokens) {
      const names = expectedNamesByCollection.get(token.metadataCollectionName) ?? new Set<string>();
      names.add(token.styleName);
      expectedNamesByCollection.set(token.metadataCollectionName, names);
      expectedStyleNamesGlobal.add(token.styleName);
    }
  }

  for (const style of localPaintStyles) {
    const gradientPaint = extractGradientPaint(style);
    if (gradientPaint && !expectedStyleNamesGlobal.has(style.name)) {
      localByName.delete(style.name);
      style.remove();
      stats.removed += 1;
      continue;
    }

    const { metadata } = parseStyleMetadata(style);
    if (!metadata) continue;
    const expectedNames = expectedNamesByCollection.get(metadata.collectionName);
    if (!expectedNames || !expectedNames.has(style.name)) {
      localByName.delete(style.name);
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
        collectionName: gradientToken.metadataCollectionName,
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
  const hasUnifiedProductCollection = byName.has("Product");
  const hasUnifiedExternalCollection = byName.has("External");
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
    const inferred = inferGradientLocationFromStyleName(metadata?.styleName ?? style.name);
    let collectionName = inferred?.collectionName ?? metadata?.collectionName ?? defaultCollectionName;
    let tokenPath = inferred?.tokenPath ?? metadata?.tokenPath ?? toJsonTokenPath(style.name);
    const productCollectionMatch = collectionName.match(/^Product\.(.+)$/);
    if (productCollectionMatch && productCollectionMatch[1] && hasUnifiedProductCollection) {
      collectionName = "Product";
      tokenPath = `${toJsonTokenPath(productCollectionMatch[1])}.${tokenPath}`;
    }
    const externalCollectionMatch = collectionName.match(/^External\.(.+)$/);
    if (externalCollectionMatch && externalCollectionMatch[1] && hasUnifiedExternalCollection) {
      collectionName = "External";
      tokenPath = `${toJsonTokenPath(externalCollectionMatch[1])}.${tokenPath}`;
    }
    const styleName = normalizeStyleNameByConvention(
      collectionName,
      tokenPath,
      metadata?.styleName ?? style.name
    );
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
