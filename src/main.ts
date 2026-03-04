import { emit, on, showUI } from "@create-figma-plugin/utilities";
import type { ClrTokenFile } from "./shared/schema/tokens";
import type {
  ErrorHandler,
  ExportJsonHandler,
  ExportResultHandler,
  GenerateDocsHandler,
  ImportJsonHandler,
  StatusHandler
} from "./types";
import { exportTokenFileFromLocalVariables } from "./main/export";
import { upsertGradientStylesFromTokens } from "./main/gradients";
import { validateTokenFile } from "./main/validation";
import { upsertVariablesFromTokens } from "./main/variables";

export default function () {
  showUI({ width: 420, height: 720 });

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

  on<GenerateDocsHandler>("GENERATE_DOCS", function () {
    emit<StatusHandler>("STATUS", "Docs generator scaffold is ready. Logic will be added next.");
  });
}
