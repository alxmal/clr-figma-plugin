import { exportTokenFileFromLocalVariables } from "../export";
import type { ClrTokenFile, TokenNode } from "../../shared/schema/tokens";
import { toJsonTokenPath } from "../../shared/mappers";
import { normalizeTokenPathForLookup } from "../../shared/tokens/references";
import type { CollectionDocsData, DocsStats, FlatColorToken, FlatGradientToken } from "./helpers";
import {
  createCollectionFrame,
  createColorRow,
  createGradientRow,
  createHeaderRow,
  createSectionContainer,
  createTextNode,
  flattenTokens
} from "./helpers";

function appendCollectionSections(
  tokenFile: ClrTokenFile,
  colorVariablesByCollectionAndPath: Map<string, Map<string, Variable>>,
  gradientStyleIdByName: Map<string, string>
): { stats: DocsStats; frames: FrameNode[] } {
  const stats: DocsStats = { colorRows: 0, gradientRows: 0, sections: 0 };
  const frames: FrameNode[] = [];
  const globalColorValuesByPath = new Map<string, Record<string, string>>();
  const docsData: CollectionDocsData[] = [];

  for (const collection of tokenFile.collections) {
    const colors: FlatColorToken[] = [];
    const gradients: FlatGradientToken[] = [];
    flattenTokens(collection.name, collection.modes, collection.tokens as TokenNode, colors, gradients);

    const colorValuesByPath = new Map<string, Record<string, string>>();
    for (const token of colors) {
      const key = normalizeTokenPathForLookup(token.tokenPath);
      colorValuesByPath.set(key, token.valuesByMode);
      if (!globalColorValuesByPath.has(key)) {
        globalColorValuesByPath.set(key, token.valuesByMode);
      }
    }
    docsData.push({ collection, colors, gradients, colorValuesByPath });
  }

  for (const { collection, colors, gradients, colorValuesByPath } of docsData) {
    const collectionFrame = createCollectionFrame(collection.name);
    frames.push(collectionFrame);
    const collectionTitle = createTextNode(collection.name, 32, "Medium");
    collectionTitle.name = "Title";
    collectionFrame.appendChild(collectionTitle);

    const bySection = new Map<string, FlatColorToken[]>();
    for (const token of colors) {
      const list = bySection.get(token.sectionName) ?? [];
      list.push(token);
      bySection.set(token.sectionName, list);
    }

    const byGradientSection = new Map<string, FlatGradientToken[]>();
    for (const token of gradients) {
      const list = byGradientSection.get(token.sectionName) ?? [];
      list.push(token);
      byGradientSection.set(token.sectionName, list);
    }

    for (const [sectionName, rows] of Array.from(bySection.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      const section = createSectionContainer(sectionName);
      section.appendChild(createHeaderRow(sectionName, collection.modes));
      for (const token of rows.sort((a, b) => a.shortName.localeCompare(b.shortName))) {
        section.appendChild(
          createColorRow(
            token,
            collection.modes,
            colorValuesByPath,
            globalColorValuesByPath,
            colorVariablesByCollectionAndPath.get(collection.name) ?? new Map()
          )
        );
        stats.colorRows += 1;
      }
      collectionFrame.appendChild(section);
      stats.sections += 1;
    }

    if (byGradientSection.size > 0) {
      const separator = createTextNode("Gradients", 18);
      collectionFrame.appendChild(separator);

      for (const [sectionName, rows] of Array.from(byGradientSection.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      )) {
        const title = `gradient.${sectionName}`;
        const section = createSectionContainer(title);
        section.appendChild(createHeaderRow(title, collection.modes));
        for (const token of rows.sort((a, b) => a.shortName.localeCompare(b.shortName))) {
          section.appendChild(createGradientRow(token, collection.modes, gradientStyleIdByName));
          stats.gradientRows += 1;
        }
        collectionFrame.appendChild(section);
        stats.sections += 1;
      }
    }
  }
  return { stats, frames };
}

export async function generateDocumentationFrames(): Promise<DocsStats> {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });

  const exportResult = await exportTokenFileFromLocalVariables();
  const [localCollections, localColorVariables, localPaintStyles] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync("COLOR"),
    figma.getLocalPaintStylesAsync()
  ]);
  const collectionNameById = new Map(localCollections.map((collection) => [collection.id, collection.name]));
  const colorVariablesByCollectionAndPath = new Map<string, Map<string, Variable>>();
  for (const colorVariable of localColorVariables) {
    const collectionName = collectionNameById.get(colorVariable.variableCollectionId);
    if (!collectionName) continue;
    const tokenPath = normalizeTokenPathForLookup(toJsonTokenPath(colorVariable.name));
    const variablesByPath = colorVariablesByCollectionAndPath.get(collectionName) ?? new Map<string, Variable>();
    variablesByPath.set(tokenPath, colorVariable);
    colorVariablesByCollectionAndPath.set(collectionName, variablesByPath);
  }
  const gradientStyleIdByName = new Map(localPaintStyles.map((style) => [style.name, style.id]));
  const legacyRoot = figma.currentPage.findOne(
    (node) => node.type === "FRAME" && node.name === "CLR Tokens Documentation"
  ) as FrameNode | null;
  if (legacyRoot) {
    legacyRoot.remove();
  }

  const docsResult = appendCollectionSections(
    exportResult.tokenFile,
    colorVariablesByCollectionAndPath,
    gradientStyleIdByName
  );
  if (docsResult.frames.length > 0) {
    figma.currentPage.selection = docsResult.frames;
    figma.viewport.scrollAndZoomIntoView(docsResult.frames);
  }
  return docsResult.stats;
}
