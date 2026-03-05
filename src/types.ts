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
