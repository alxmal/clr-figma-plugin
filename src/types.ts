import type { EventHandler } from "@create-figma-plugin/utilities";

export interface ImportJsonHandler extends EventHandler {
  name: "IMPORT_JSON";
  handler: (rawJson: string) => void;
}

export interface ExportJsonHandler extends EventHandler {
  name: "EXPORT_JSON";
  handler: () => void;
}

export interface GenerateDocsHandler extends EventHandler {
  name: "GENERATE_DOCS";
  handler: () => void;
}

export interface ClearColorsHandler extends EventHandler {
  name: "CLEAR_COLORS";
  handler: () => void;
}

export interface StatusHandler extends EventHandler {
  name: "STATUS";
  handler: (message: string) => void;
}

export interface ErrorHandler extends EventHandler {
  name: "ERROR";
  handler: (message: string) => void;
}

export interface ExportResultHandler extends EventHandler {
  name: "EXPORT_RESULT";
  handler: (json: string) => void;
}

export interface LoadCollectionsHandler extends EventHandler {
  name: "LOAD_COLLECTIONS";
  handler: () => void;
}

export interface CollectionSummary {
  id: string;
  name: string;
}

export interface CollectionsResultHandler extends EventHandler {
  name: "COLLECTIONS_RESULT";
  handler: (collections: CollectionSummary[]) => void;
}

export interface CollectionContentNode {
  kind: "group" | "variable";
  name: string;
  children?: CollectionContentNode[];
}

export interface LoadCollectionContentHandler extends EventHandler {
  name: "LOAD_COLLECTION_CONTENT";
  handler: (collectionId: string) => void;
}

export interface CollectionContentResultHandler extends EventHandler {
  name: "COLLECTION_CONTENT_RESULT";
  handler: (payload: {
    collectionId: string;
    nodes: CollectionContentNode[];
  }) => void;
}
