import type {
  ClrTokenFile,
  GradientValue,
  TokenLeafValue,
  TokenNode
} from "../../shared/schema/tokens";
import { toFigmaVariableName } from "../../shared/mappers";
import { HEX_COLOR_PATTERN, tryHexToRgba } from "../../shared/figma/color";
import { createTextNode } from "../../shared/figma/text";
import { normalizeTokenPathForLookup, parseAliasReference } from "../../shared/tokens/references";
import { walkTokenTree } from "../../shared/tokens/tree";
export { createTextNode } from "../../shared/figma/text";

const ROOT_WIDTH = 1000;
const TABLE_WIDTH = 920;
const TOKEN_COLUMN_WIDTH = 320;
const MODE_COLUMN_WIDTH = 300;

export interface FlatColorToken {
  collectionName: string;
  tokenPath: string;
  sectionName: string;
  shortName: string;
  valuesByMode: Record<string, string>;
}

export interface FlatGradientToken {
  collectionName: string;
  tokenPath: string;
  sectionName: string;
  shortName: string;
  styleName: string;
  valuesByMode: Record<string, GradientValue>;
}

export interface DocsStats {
  colorRows: number;
  gradientRows: number;
  sections: number;
}

export interface CollectionDocsData {
  collection: ClrTokenFile["collections"][number];
  colors: FlatColorToken[];
  gradients: FlatGradientToken[];
  colorValuesByPath: Map<string, Record<string, string>>;
}

function normalizePrimitiveValuesByMode(
  value: TokenLeafValue | Record<string, TokenLeafValue>,
  modeNames: string[],
  tokenPath: string
): Record<string, string> {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return Object.fromEntries(modeNames.map((modeName) => [modeName, String(value)]));
  }
  if ("kind" in value) {
    throw new Error(`Token "${tokenPath}" is gradient but requested as primitive`);
  }

  const modeRecord = value as Record<string, TokenLeafValue>;
  const result: Record<string, string> = {};
  for (const modeName of modeNames) {
    const modeValue = modeRecord[modeName];
    if (modeValue === undefined) {
      throw new Error(`Missing mode "${modeName}" for token "${tokenPath}"`);
    }
    if (typeof modeValue !== "string" && typeof modeValue !== "number" && typeof modeValue !== "boolean") {
      throw new Error(`Token "${tokenPath}" has non-primitive value in mode "${modeName}"`);
    }
    result[modeName] = String(modeValue);
  }
  return result;
}

function normalizeGradientValuesByMode(
  value: TokenLeafValue | Record<string, TokenLeafValue>,
  modeNames: string[],
  tokenPath: string
): Record<string, GradientValue> {
  if (typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value) {
    return Object.fromEntries(modeNames.map((modeName) => [modeName, value as GradientValue]));
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Gradient token "${tokenPath}" must be object`);
  }

  const modeRecord = value as Record<string, TokenLeafValue>;
  const result: Record<string, GradientValue> = {};
  for (const modeName of modeNames) {
    const modeValue = modeRecord[modeName];
    if (!modeValue || typeof modeValue !== "object" || Array.isArray(modeValue) || !("kind" in modeValue)) {
      throw new Error(`Gradient token "${tokenPath}" has invalid mode value for "${modeName}"`);
    }
    result[modeName] = modeValue as GradientValue;
  }
  return result;
}

function getStyleNameFromTokenPath(tokenPath: string): string {
  return toFigmaVariableName(tokenPath);
}

export function flattenTokens(
  collectionName: string,
  modeNames: string[],
  node: TokenNode,
  colors: FlatColorToken[],
  gradients: FlatGradientToken[]
): void {
  walkTokenTree(node, ({ leaf, pathParts: leafPathParts, tokenPath }) => {
    const sectionName = leafPathParts[0] ?? "General";
    const shortName = leafPathParts.slice(1).join(".") || sectionName;

    if (leaf.$type === "color") {
      colors.push({
        collectionName,
        tokenPath,
        sectionName,
        shortName,
        valuesByMode: normalizePrimitiveValuesByMode(leaf.$value, modeNames, tokenPath)
      });
    } else if (leaf.$type === "gradient") {
      const clrExtensions = leaf.$extensions?.clr;
      const extensionStyleName =
        typeof clrExtensions === "object" && clrExtensions !== null
          ? (clrExtensions as Record<string, unknown>).styleName
          : undefined;
      const styleName =
        typeof extensionStyleName === "string" && extensionStyleName.trim().length > 0
          ? extensionStyleName.trim()
          : getStyleNameFromTokenPath(tokenPath);
      gradients.push({
        collectionName,
        tokenPath,
        sectionName,
        shortName,
        styleName,
        valuesByMode: normalizeGradientValuesByMode(leaf.$value, modeNames, tokenPath)
      });
    }
  });
}

function resolveColorValueForDocs(
  rawValue: string,
  modeName: string,
  localValuesByPath: Map<string, Record<string, string>>,
  globalValuesByPath: Map<string, Record<string, string>>,
  stack: Set<string> = new Set()
): string {
  const aliasPath = parseAliasReference(rawValue);
  if (!aliasPath) {
    return HEX_COLOR_PATTERN.test(rawValue) ? rawValue.toUpperCase() : rawValue;
  }

  const lookupPath = normalizeTokenPathForLookup(aliasPath);
  if (stack.has(lookupPath)) {
    return rawValue;
  }

  const referencedByMode = localValuesByPath.get(lookupPath) ?? globalValuesByPath.get(lookupPath);
  if (!referencedByMode) {
    return rawValue;
  }

  const referencedValue = referencedByMode[modeName];
  const fallbackValue = Object.values(referencedByMode).find((candidate) => typeof candidate === "string");
  const effectiveValue = typeof referencedValue === "string" ? referencedValue : fallbackValue;
  if (!effectiveValue || typeof effectiveValue !== "string") {
    return rawValue;
  }

  const nextStack = new Set(stack);
  nextStack.add(lookupPath);
  return resolveColorValueForDocs(effectiveValue, modeName, localValuesByPath, globalValuesByPath, nextStack);
}

export function createSectionContainer(title: string): FrameNode {
  const section = figma.createFrame();
  section.name = "Block";
  section.layoutMode = "VERTICAL";
  section.primaryAxisSizingMode = "AUTO";
  section.counterAxisSizingMode = "AUTO";
  section.itemSpacing = 0;
  section.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0 }];
  section.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.08 }];
  section.strokeTopWeight = 1;
  section.strokeRightWeight = 1;
  section.strokeBottomWeight = 1;
  section.strokeLeftWeight = 1;
  section.cornerRadius = 16;
  section.clipsContent = true;
  section.strokeAlign = "OUTSIDE";
  return section;
}

function createCell(width: number, dark = false, omitLeftBorder = false): FrameNode {
  const cell = figma.createFrame();
  cell.name = "Cell";
  cell.layoutMode = "HORIZONTAL";
  cell.primaryAxisSizingMode = "FIXED";
  cell.counterAxisSizingMode = "FIXED";
  cell.primaryAxisAlignItems = "MIN";
  cell.counterAxisAlignItems = "CENTER";
  cell.resizeWithoutConstraints(width, 64);
  cell.paddingLeft = 16;
  cell.paddingRight = 16;
  cell.paddingTop = 12;
  cell.paddingBottom = 12;
  cell.itemSpacing = 8;
  cell.strokes = [{ type: "SOLID", color: dark ? { r: 1, g: 1, b: 1 } : { r: 0, g: 0, b: 0 }, opacity: 0.08 }];
  cell.strokeLeftWeight = omitLeftBorder ? 0 : 1;
  cell.strokeRightWeight = 0;
  cell.strokeTopWeight = 0;
  cell.strokeBottomWeight = 0;
  cell.fills = [
    {
      type: "SOLID",
      color: dark ? { r: 0.07, g: 0.07, b: 0.08 } : { r: 1, g: 1, b: 1 }
    }
  ];
  return cell;
}

export function createCollectionFrame(collectionName: string): FrameNode {
  const existing = figma.currentPage.findOne(
    (node) => node.type === "FRAME" && node.name === collectionName
  ) as FrameNode | null;
  const frame = existing ?? figma.createFrame();
  frame.name = collectionName;
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = 24;
  frame.paddingLeft = 48;
  frame.paddingRight = 48;
  frame.paddingTop = 40;
  frame.paddingBottom = 40;
  frame.resizeWithoutConstraints(ROOT_WIDTH, frame.height > 0 ? frame.height : 100);
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  frame.strokes = [];
  frame.cornerRadius = 24;
  for (const child of [...frame.children]) {
    child.remove();
  }
  return frame;
}

export function createHeaderRow(sectionName: string, modeNames: string[]): FrameNode {
  const row = figma.createFrame();
  row.name = "Color Style Row Header";
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";
  row.resizeWithoutConstraints(TABLE_WIDTH, 56);
  row.fills = [];
  row.strokes = [];

  const firstCell = createCell(TOKEN_COLUMN_WIDTH, false, true);
  firstCell.resizeWithoutConstraints(TOKEN_COLUMN_WIDTH, 56);
  firstCell.appendChild(createTextNode(sectionName, 18));
  row.appendChild(firstCell);

  for (const modeName of modeNames) {
    const modeCell = createCell(MODE_COLUMN_WIDTH, false, false);
    modeCell.resizeWithoutConstraints(MODE_COLUMN_WIDTH, 56);
    modeCell.appendChild(createTextNode(modeName));
    row.appendChild(modeCell);
  }
  return row;
}

function createColorValuePreview(rawValue: string, dark: boolean, colorVariable: Variable | null): FrameNode {
  const content = figma.createFrame();
  content.name = "Content";
  content.layoutMode = "HORIZONTAL";
  content.primaryAxisSizingMode = "AUTO";
  content.counterAxisSizingMode = "AUTO";
  content.primaryAxisAlignItems = "MIN";
  content.counterAxisAlignItems = "CENTER";
  content.itemSpacing = 8;
  content.fills = [];
  content.strokes = [];

  const color = tryHexToRgba(rawValue);
  if (color) {
    const swatch = figma.createEllipse();
    swatch.name = "Color";
    swatch.resize(40, 40);
    const basePaint: SolidPaint = {
      type: "SOLID",
      color: { r: color.r, g: color.g, b: color.b },
      opacity: color.a
    };
    const paint =
      colorVariable === null ? basePaint : figma.variables.setBoundVariableForPaint(basePaint, "color", colorVariable);
    swatch.fills = [paint];
    swatch.strokes = [{ type: "SOLID", color: dark ? { r: 1, g: 1, b: 1 } : { r: 0, g: 0, b: 0 }, opacity: 0.12 }];
    swatch.strokeWeight = 1;
    content.appendChild(swatch);
  }

  const textNode = createTextNode(rawValue.toUpperCase());
  textNode.name = "Text";
  if (dark) {
    textNode.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.88 }];
  }
  content.appendChild(textNode);
  return content;
}

function createGradientValuePreview(value: GradientValue, dark: boolean, fillStyleId?: string): FrameNode {
  const content = figma.createFrame();
  content.name = "Content";
  content.layoutMode = "HORIZONTAL";
  content.primaryAxisSizingMode = "AUTO";
  content.counterAxisSizingMode = "AUTO";
  content.primaryAxisAlignItems = "MIN";
  content.counterAxisAlignItems = "CENTER";
  content.itemSpacing = 8;
  content.fills = [];
  content.strokes = [];

  const preview = figma.createRectangle();
  preview.name = "Color";
  preview.resize(40, 40);
	preview.cornerRadius = 8;
  const stops: ColorStop[] = value.stops.map((stop) => {
    const parsed = tryHexToRgba(stop.color);
    const fallback = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const rgba = parsed ?? fallback;
    const alpha = stop.opacity !== undefined ? rgba.a * stop.opacity : rgba.a;
    return {
      position: Math.max(0, Math.min(100, stop.position)) / 100,
      color: { r: rgba.r, g: rgba.g, b: rgba.b, a: alpha }
    };
  });
  preview.fills = [
    {
      type: "GRADIENT_LINEAR",
      blendMode: "NORMAL",
      gradientTransform: [
        [1, 0, 0],
        [0, 1, 0]
      ],
      gradientStops:
        stops.length >= 2
          ? stops
          : [
              { position: 0, color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } },
              { position: 1, color: { r: 0.3, g: 0.3, b: 0.3, a: 1 } }
            ]
    }
  ];
  if (fillStyleId) {
    preview.fillStyleId = fillStyleId;
  }
  preview.strokes = [{ type: "SOLID", color: dark ? { r: 1, g: 1, b: 1 } : { r: 0, g: 0, b: 0 }, opacity: 0.12 }];
  preview.strokeWeight = 1;
  content.appendChild(preview);

  const textNode = createTextNode(`${value.kind} • ${value.stops.length} stops`);
  textNode.name = "Text";
  if (dark) {
    textNode.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.88 }];
  }
  content.appendChild(textNode);
  return content;
}

export function createColorRow(
  token: FlatColorToken,
  modeNames: string[],
  localValuesByPath: Map<string, Record<string, string>>,
  globalValuesByPath: Map<string, Record<string, string>>,
  colorVariablesByPath: Map<string, Variable>
): FrameNode {
  const row = figma.createFrame();
  row.name = "Color Style Row";
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";
  row.resizeWithoutConstraints(TABLE_WIDTH, 64);
  row.fills = [];
  row.strokes = [];

  const nameCell = createCell(TOKEN_COLUMN_WIDTH, false, true);
  nameCell.appendChild(createTextNode(token.shortName));
  row.appendChild(nameCell);

  for (const modeName of modeNames) {
    const isDark = modeName.toLowerCase().includes("dark");
    const modeCell = createCell(MODE_COLUMN_WIDTH, isDark, false);
    const rawValue = token.valuesByMode[modeName] ?? "-";
    const resolvedValue = resolveColorValueForDocs(
      rawValue,
      modeName,
      localValuesByPath,
      globalValuesByPath
    );
    const tokenLookupPath = normalizeTokenPathForLookup(token.tokenPath);
    const colorVariable = colorVariablesByPath.get(tokenLookupPath) ?? null;
    modeCell.appendChild(createColorValuePreview(resolvedValue, isDark, colorVariable));
    row.appendChild(modeCell);
  }
  return row;
}

export function createGradientRow(
  token: FlatGradientToken,
  modeNames: string[],
  gradientStyleIdByName: Map<string, string>
): FrameNode {
  const row = figma.createFrame();
  row.name = "Color Style Row";
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";
  row.resizeWithoutConstraints(TABLE_WIDTH, 64);
  row.fills = [];
  row.strokes = [];

  const nameCell = createCell(TOKEN_COLUMN_WIDTH, false, true);
  nameCell.appendChild(createTextNode(token.shortName));
  row.appendChild(nameCell);

  for (const modeName of modeNames) {
    const isDark = modeName.toLowerCase().includes("dark");
    const modeCell = createCell(MODE_COLUMN_WIDTH, isDark, false);
    const value = token.valuesByMode[modeName];
    if (value) {
      modeCell.appendChild(
        createGradientValuePreview(value, isDark, gradientStyleIdByName.get(token.styleName))
      );
    } else {
      modeCell.appendChild(createTextNode("-"));
    }
    row.appendChild(modeCell);
  }
  return row;
}
