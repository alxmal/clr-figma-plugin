import { emit, on, showUI } from "@create-figma-plugin/utilities";
import type { ClrTokenFile } from "./shared/schema/tokens";
import type {
  CollectionContentNode,
  CollectionContentResultHandler,
  CollectionSummary,
  CollectionsResultHandler,
  ClearColorsHandler,
  ErrorHandler,
  ExportJsonHandler,
  ExportResultHandler,
  GenerateDocsHandler,
  ImportJsonHandler,
  LoadCollectionContentHandler,
  LoadCollectionsHandler,
  StatusHandler
} from "./types";
import { exportTokenFileFromLocalVariables } from "./main/export";
import { generateDocumentationFrames } from "./main/docs-generator";
import { upsertGradientStylesFromTokens } from "./main/gradients";
import { validateTokenFile } from "./main/validation";
import { upsertVariablesFromTokens } from "./main/variables";

export default function () {
  showUI({ width: 700, height: 900 });

  function normalizeVariablePath(name: string): string[] {
    const parts = name
      .split("/")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    return parts.length > 0 ? parts : [name.trim() || "Unnamed"];
  }

  function buildCollectionContentNodes(variableNames: string[]): CollectionContentNode[] {
    type MutableNode = {
      kind: "group" | "variable";
      name: string;
      children?: MutableNode[];
      childrenByName?: Map<string, MutableNode>;
    };

    const root: MutableNode = {
      kind: "group",
      name: "__root__",
      children: [],
      childrenByName: new Map()
    };

    for (const variableName of variableNames) {
      const parts = normalizeVariablePath(variableName);
      let current = root;

      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        const isLeaf = index === parts.length - 1;
        const key = `${isLeaf ? "variable" : "group"}:${part}`;
        if (!current.childrenByName) {
          current.childrenByName = new Map();
        }
        if (!current.children) {
          current.children = [];
        }

        const existing = current.childrenByName.get(key);
        if (existing) {
          current = existing;
          continue;
        }

        const nextNode: MutableNode = isLeaf
          ? { kind: "variable", name: part }
          : { kind: "group", name: part, children: [], childrenByName: new Map() };

        current.childrenByName.set(key, nextNode);
        current.children.push(nextNode);
        current = nextNode;
      }
    }

    function finalizeNode(node: MutableNode): CollectionContentNode {
      if (node.kind === "variable") {
        return { kind: "variable", name: node.name };
      }
      const sortedChildren = [...(node.children ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name)
      );
      return {
        kind: "group",
        name: node.name,
        children: sortedChildren.map(finalizeNode)
      };
    }

    return (root.children ?? []).map(finalizeNode);
  }

  async function getLocalCollectionSummaries(): Promise<CollectionSummary[]> {
    const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
    return localCollections
      .map((collection) => ({
        id: collection.id,
        name: collection.name
      }))
      .filter((collection) => collection.name.trim().length > 0)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async function emitLocalCollectionNames() {
    const collections = await getLocalCollectionSummaries();
    emit<CollectionsResultHandler>("COLLECTIONS_RESULT", collections);
  }

  on<LoadCollectionsHandler>("LOAD_COLLECTIONS", async function () {
    try {
      await emitLocalCollectionNames();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown plugin error";
      emit<ErrorHandler>("ERROR", messageText);
    }
  });

  on<LoadCollectionContentHandler>("LOAD_COLLECTION_CONTENT", async function (collectionId: string) {
    try {
      const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
      const collection = localCollections.find((item) => item.id === collectionId);
      if (!collection) {
        emit<CollectionContentResultHandler>("COLLECTION_CONTENT_RESULT", {
          collectionId,
          nodes: []
        });
        return;
      }

      const localVariables = await figma.variables.getLocalVariablesAsync();
      const variablesById = new Map(localVariables.map((variable) => [variable.id, variable]));
      const variableNames: string[] = [];
      for (const variableId of collection.variableIds) {
        const variable = variablesById.get(variableId);
        if (!variable) {
          continue;
        }
        variableNames.push(variable.name);
      }

      emit<CollectionContentResultHandler>("COLLECTION_CONTENT_RESULT", {
        collectionId,
        nodes: buildCollectionContentNodes(variableNames)
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown plugin error";
      emit<ErrorHandler>("ERROR", messageText);
    }
  });

  on<ImportJsonHandler>("IMPORT_JSON", async function (rawJson: string) {
    try {
      const parsedJson = JSON.parse(rawJson);
      const validationResult = validateTokenFile(parsedJson);

      if (!validationResult.ok) {
        emit<ErrorHandler>("ERROR", `Invalid JSON schema: ${validationResult.error}`);
        return;
      }

      const tokenFile = parsedJson as ClrTokenFile;
      const importResult = await upsertVariablesFromTokens(tokenFile);
      const gradientResult = await upsertGradientStylesFromTokens(tokenFile);
      emit<StatusHandler>(
        "STATUS",
        `Import complete: ${importResult.stats.collections} collections, ${importResult.stats.created} vars created, ${importResult.stats.updated} vars updated, ${importResult.stats.removed} vars removed, ${gradientResult.gradients} gradient tokens processed, ${gradientResult.created} gradients created, ${gradientResult.updated} gradients updated, ${gradientResult.removed} gradients removed.`
      );
      await emitLocalCollectionNames();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown plugin error";
      emit<ErrorHandler>("ERROR", messageText);
    }
  });

  on<ExportJsonHandler>("EXPORT_JSON", async function () {
    try {
      const exportResult = await exportTokenFileFromLocalVariables();
      emit<ExportResultHandler>("EXPORT_RESULT", JSON.stringify(exportResult.tokenFile, null, 2));
      emit<StatusHandler>(
        "STATUS",
        `Export complete: ${exportResult.stats.collections} collections, ${exportResult.stats.variables} variables, ${exportResult.stats.gradients} gradients.`
      );
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown plugin error";
      emit<ErrorHandler>("ERROR", messageText);
    }
  });

  on<GenerateDocsHandler>("GENERATE_DOCS", async function () {
    try {
      emit<StatusHandler>("STATUS", "Generating docs... please wait.");
      const docsResult = await generateDocumentationFrames();
      emit<StatusHandler>(
        "STATUS",
        `Docs generated: ${docsResult.sections} sections, ${docsResult.colorRows} color rows, ${docsResult.gradientRows} gradient rows.`
      );
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown plugin error";
      emit<ErrorHandler>("ERROR", messageText);
    }
  });

  on<ClearColorsHandler>("CLEAR_COLORS", async function () {
    try {
      const [localCollections, localVariables, localPaintStyles] = await Promise.all([
        figma.variables.getLocalVariableCollectionsAsync(),
        figma.variables.getLocalVariablesAsync(),
        figma.getLocalPaintStylesAsync()
      ]);

      const variableCount = localVariables.length;
      const styleCount = localPaintStyles.length;
      for (const style of localPaintStyles) {
        style.remove();
      }
      for (const collection of localCollections) {
        collection.remove();
      }

      emit<StatusHandler>(
        "STATUS",
        `Cleared colors: ${variableCount} variables and ${styleCount} paint styles removed.`
      );
      await emitLocalCollectionNames();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown plugin error";
      emit<ErrorHandler>("ERROR", messageText);
    }
  });
}
