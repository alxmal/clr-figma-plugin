import {
  Button,
  Container,
  render,
  Text,
  TextboxMultiline,
  VerticalSpace
} from "@create-figma-plugin/ui";
import { emit, on } from "@create-figma-plugin/utilities";
import { h } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import type {
  ErrorHandler,
  ExportJsonHandler,
  ExportResultHandler,
  GenerateDocsHandler,
  ImportJsonHandler,
  StatusHandler
} from "./types";

const INITIAL_JSON = `{
  "meta": {
    "format": "clr-tokens",
    "version": "0.1.0"
  },
  "collections": []
}`;

void h;

function Plugin() {
  const [rawJson, setRawJson] = useState(INITIAL_JSON);
  const [status, setStatus] = useState("Ready");
  const [exportJson, setExportJson] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"import" | "export" | "docs" | null>(null);

  useEffect(function () {
    const unbindStatus = on<StatusHandler>("STATUS", function (message: string) {
      setStatus(message);
      if (
        message.startsWith("Import complete:") ||
        message.startsWith("Export complete:") ||
        message.startsWith("Docs generated:")
      ) {
        setIsBusy(false);
        setBusyAction(null);
      }
    });
    const unbindError = on<ErrorHandler>("ERROR", function (message: string) {
      setStatus(`Error: ${message}`);
      setIsBusy(false);
      setBusyAction(null);
    });
    const unbindExport = on<ExportResultHandler>("EXPORT_RESULT", function (json: string) {
      setExportJson(json);
      setStatus("Export completed");
      setIsBusy(false);
      setBusyAction(null);
    });

    return function () {
      unbindStatus();
      unbindError();
      unbindExport();
    };
  }, []);

  const handleImport = useCallback(function () {
    setIsBusy(true);
    setBusyAction("import");
    setStatus("Applying JSON... please wait.");
    emit<ImportJsonHandler>("IMPORT_JSON", rawJson);
  }, [rawJson]);

  const handleExport = useCallback(function () {
    setIsBusy(true);
    setBusyAction("export");
    setStatus("Exporting from Figma... please wait.");
    emit<ExportJsonHandler>("EXPORT_JSON");
  }, []);

  const handleGenerateDocs = useCallback(function () {
    setIsBusy(true);
    setBusyAction("docs");
    setStatus("Generating docs... please wait.");
    emit<GenerateDocsHandler>("GENERATE_DOCS");
  }, []);

  const handleSaveExport = useCallback(function () {
    if (exportJson.length === 0) {
      setStatus("Nothing to save. Run Export JSON first.");
      return;
    }
    const blob = new Blob([exportJson], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `clr-tokens-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("JSON file saved.");
  }, [exportJson]);

  return (
    <Container space="small">
      <VerticalSpace space="small" />
      <Text>CLR Plugin</Text>
      <Text>
        Import/export DTCG-style tokens and generate docs frames.
      </Text>
      <VerticalSpace space="small" />

      <TextboxMultiline
        rows={14}
        value={rawJson}
        onValueInput={setRawJson}
      />

      <VerticalSpace space="small" />
      <Button
        fullWidth
        onClick={handleImport}
        disabled={isBusy}
        loading={isBusy && busyAction === "import"}
      >
        Apply JSON to Figma
      </Button>
      <VerticalSpace space="extraSmall" />
      <Button
        fullWidth
        secondary
        onClick={handleExport}
        disabled={isBusy}
        loading={isBusy && busyAction === "export"}
      >
        Read Figma Variables to JSON
      </Button>
      <VerticalSpace space="extraSmall" />
      <Button
        fullWidth
        secondary
        onClick={handleGenerateDocs}
        disabled={isBusy}
        loading={isBusy && busyAction === "docs"}
      >
        Generate docs
      </Button>
      <VerticalSpace space="extraSmall" />
      <Button fullWidth secondary onClick={handleSaveExport} disabled={isBusy}>
        Save export file
      </Button>

      <VerticalSpace space="small" />
      <Text>Status</Text>
      <Text>{status}</Text>

      {exportJson.length > 0 ? (
        <div>
          <VerticalSpace space="small" />
          <Text>Export result</Text>
          <TextboxMultiline rows={14} value={exportJson} onValueInput={setExportJson} />
        </div>
      ) : null}
      <VerticalSpace space="small" />
    </Container>
  );
}

export default render(Plugin);
