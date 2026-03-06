import {
	Button,
	Container,
	Dropdown,
	Inline,
	render,
	SearchTextbox,
	SelectableItem,
	Stack,
	Tabs,
	Text,
	TextboxMultiline,
	VerticalSpace
} from "@create-figma-plugin/ui";
import { emit, on } from "@create-figma-plugin/utilities";
import { h } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
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

const INITIAL_JSON = `{
  "meta": {
    "format": "clr-tokens",
    "version": "0.1.0"
  },
  "collections": []
}`;

void h;

function copyWithExecCommand(text: string): boolean {
	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	textarea.style.pointerEvents = "none";
	document.body.appendChild(textarea);
	textarea.focus();
	textarea.select();

	let copied = false;
	try {
		copied = document.execCommand("copy");
	} catch {
		copied = false;
	}

	textarea.remove();
	return copied;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
	if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			return false;
		}
	}
	return false;
}

function filterCollectionNodes(nodes: CollectionContentNode[], query: string): CollectionContentNode[] {
	if (query.trim().length === 0) {
		return nodes;
	}
	const normalizedQuery = query.trim().toLowerCase();
	const result: CollectionContentNode[] = [];

	for (const node of nodes) {
		const nodeMatches = node.name.toLowerCase().includes(normalizedQuery);
		if (node.kind === "variable") {
			if (nodeMatches) {
				result.push(node);
			}
			continue;
		}

		const filteredChildren = filterCollectionNodes(node.children ?? [], normalizedQuery);
		if (nodeMatches || filteredChildren.length > 0) {
			result.push({
				kind: "group",
				name: node.name,
				children: filteredChildren
			});
		}
	}

	return result;
}

function Plugin() {
	const [rawJson, setRawJson] = useState(INITIAL_JSON);
	const [status, setStatus] = useState("Ready");
	const [exportJson, setExportJson] = useState("");
	const [isBusy, setIsBusy] = useState(false);
	const [busyAction, setBusyAction] = useState<"import" | "export" | "docs" | "clear" | null>(null);
	const [activeTab, setActiveTab] = useState("tokens");
	const [searchValue, setSearchValue] = useState("");
	const [themeValue, setThemeValue] = useState<string | null>("none");
	const [collectionSummaries, setCollectionSummaries] = useState<CollectionSummary[]>([]);
	const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
	const [collectionNodes, setCollectionNodes] = useState<CollectionContentNode[]>([]);

	useEffect(function () {
		const unbindStatus = on<StatusHandler>("STATUS", function (message: string) {
			setStatus(message);
			if (
				message.startsWith("Import complete:") ||
				message.startsWith("Export complete:") ||
				message.startsWith("Docs generated:") ||
				message.startsWith("Cleared colors:")
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
		const unbindCollections = on<CollectionsResultHandler>(
			"COLLECTIONS_RESULT",
			function (collections: CollectionSummary[]) {
				setCollectionSummaries(collections);
			}
		);
		const unbindCollectionContent = on<CollectionContentResultHandler>(
			"COLLECTION_CONTENT_RESULT",
			function (payload) {
				setCollectionNodes(payload.nodes);
			}
		);

		emit<LoadCollectionsHandler>("LOAD_COLLECTIONS");

		return function () {
			unbindStatus();
			unbindError();
			unbindExport();
			unbindCollections();
			unbindCollectionContent();
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

	const handleClearColors = useCallback(function () {
		const confirmed = window.confirm(
			"Remove all local variables and paint styles in this file? This action cannot be undone."
		);
		if (!confirmed) {
			return;
		}
		setIsBusy(true);
		setBusyAction("clear");
		setStatus("Clearing colors... please wait.");
		emit<ClearColorsHandler>("CLEAR_COLORS");
	}, []);

	const handleCopyStatus = useCallback(function () {
		const text = status.trim();
		if (text.length === 0) {
			return;
		}

		// Keep copy attempt synchronous in click handler for Figma webview.
		const copiedSync = copyWithExecCommand(text);
		if (copiedSync) {
			setStatus("Status copied to clipboard.");
			return;
		}

		// Fallback for environments where async Clipboard API is available.
		copyTextToClipboard(text)
			.then((copied) => {
				setStatus(copied ? "Status copied to clipboard." : "Failed to copy status text.");
			})
			.catch(() => {
				setStatus("Failed to copy status text.");
			});
	}, [status]);

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

	useEffect(
		function () {
			if (collectionSummaries.length === 0) {
				setSelectedCollectionId(null);
				setCollectionNodes([]);
				return;
			}
			const selectedExists = collectionSummaries.some(
				(collection) => collection.id === selectedCollectionId
			);
			if (!selectedCollectionId || !selectedExists) {
				setSelectedCollectionId(collectionSummaries[0].id);
			}
		},
		[collectionSummaries, selectedCollectionId]
	);

	useEffect(
		function () {
			if (!selectedCollectionId) {
				setCollectionNodes([]);
				return;
			}
			emit<LoadCollectionContentHandler>("LOAD_COLLECTION_CONTENT", selectedCollectionId);
		},
		[selectedCollectionId]
	);

	const filteredNodes = useMemo(
		function () {
			return filterCollectionNodes(collectionNodes, searchValue);
		},
		[collectionNodes, searchValue]
	);

	const rootStyle = {
		height: "100%",
		minHeight: 0,
		display: "flex",
		flexDirection: "column" as const
	};

	const toolbarStyle = {
		display: "grid",
		gridTemplateColumns: "1fr 220px",
		gap: "8px",
		alignItems: "center",
		padding: "8px",
		borderBottom: "1px solid var(--figma-color-border)",
	};

	const contentStyle = {
		flex: 1,
		minHeight: 0,
		display: "grid",
		gridTemplateColumns: "220px 1fr",
	};

	const sidebarStyle = {
		borderRight: "1px solid var(--figma-color-border)",
		//padding: "8px",
		overflow: "auto",
		// background: "var(--figma-color-bg-secondary)"
	};

	const canvasStyle = {
		minHeight: 0,
		overflow: "auto",
	};

	const panelStyle = {
		flex: 1,
		minHeight: 0,
		overflow: "auto",
	};

	const footerStyle = {
		borderTop: "1px solid var(--figma-color-border)",
		padding: "8px",
		display: "grid",
		gridTemplateColumns: "220px 1fr",
		gap: "12px",
		alignItems: "center"
	};

	const footerRightStyle = {
		display: "flex",
		justifyContent: "flex-end"
	};

	function renderCollectionNode(node: CollectionContentNode, level: number): h.JSX.Element {
		if (node.kind === "variable") {
			return (
				<div key={`variable-${level}-${node.name}`} style={{ marginLeft: `${level * 12}px` }}>
					<Text>{node.name}</Text>
				</div>
			);
		}

		return (
			<div key={`group-${level}-${node.name}`} style={{ marginLeft: `${level * 12}px` }}>
				<div
					style={{
						border: "1px solid var(--figma-color-border)",
						borderRadius: "8px",
						padding: "8px"
					}}
				>
					<Text>{node.name}</Text>
					<VerticalSpace space="extraSmall" />
					<Stack space="extraSmall">
						{(node.children ?? []).map((child) => renderCollectionNode(child, level + 1))}
					</Stack>
				</div>
			</div>
		);
	}

	return (
		<div >
			<Container space="extraSmall" style={rootStyle}>
				<Tabs
					value={activeTab}
					onValueChange={(nextValue) => setActiveTab(nextValue ?? "tokens")}
					options={[
						{ value: "tokens", children: "tokens" },
						{ value: "inspect", children: "inspect" },
						{ value: "settings", children: "settings" }
					]}
				/>


				<div style={toolbarStyle}>
					<div>
						<SearchTextbox value={searchValue} onValueInput={setSearchValue} placeholder="Search" />
					</div>
					<div>
						<Dropdown
							value={themeValue}
							onValueChange={setThemeValue}
							options={[
								{ value: "none", text: "Theme: None" },
								{ value: "light", text: "Theme: Light" },
								{ value: "dark", text: "Theme: Dark" }
							]}
						/>
					</div>
				</div>

				{activeTab === "tokens" ? (
					<div style={contentStyle}>
						<div style={sidebarStyle}>
							<VerticalSpace space="small" />
							<Stack space="extraSmall">
								{collectionSummaries.map((collection) => (
									<SelectableItem
										key={collection.id}
										value={selectedCollectionId === collection.id}
										onValueChange={(value) => {
											if (value) {
												setSelectedCollectionId(collection.id);
											}
										}}
										bold={selectedCollectionId === collection.id}
									>
										{collection.name}
									</SelectableItem>
								))}
							</Stack>
							<VerticalSpace space="small" />
							<Button fullWidth secondary disabled>
								+ New Set
							</Button>
						</div>

						<div style={canvasStyle}>
							{selectedCollectionId ? (
								<Stack space="small">
									{filteredNodes.length > 0 ? (
										filteredNodes.map((node) => renderCollectionNode(node, 0))
									) : (
										<Text>No variables found in this collection.</Text>
									)}
								</Stack>
							) : (
								<Text>Select a collection to view its variables.</Text>
							)}
						</div>
					</div>
				) : null}

				{activeTab === "inspect" ? (
					<div style={panelStyle}>
						<Text>Status</Text>
						<VerticalSpace space="extraSmall" />
						<Text>{status}</Text>
						<VerticalSpace space="extraSmall" />
						<Inline space="extraSmall">
							<Button secondary onClick={handleCopyStatus} disabled={isBusy}>
								Copy status text
							</Button>
							<Button secondary onClick={handleExport} disabled={isBusy} loading={isBusy && busyAction === "export"}>
								Read Figma Variables to JSON
							</Button>
						</Inline>
						<VerticalSpace space="small" />
						<Text>Export result</Text>
						<VerticalSpace space="extraSmall" />
						<TextboxMultiline rows={16} value={exportJson} onValueInput={setExportJson} />
					</div>
				) : null}

				{activeTab === "settings" ? (
					<div style={panelStyle}>
						<Text>Source JSON</Text>
						<VerticalSpace space="extraSmall" />
						<TextboxMultiline rows={20} value={rawJson} onValueInput={setRawJson} />
						<VerticalSpace space="small" />
						<Inline space="extraSmall">
							<Button onClick={handleImport} disabled={isBusy} loading={isBusy && busyAction === "import"}>
								Apply JSON to Figma
							</Button>
							<Button
								secondary
								onClick={handleGenerateDocs}
								disabled={isBusy}
								loading={isBusy && busyAction === "docs"}
							>
								Generate docs
							</Button>
							<Button secondary onClick={handleSaveExport} disabled={isBusy}>
								Save export file
							</Button>
							<Button
								danger
								onClick={handleClearColors}
								disabled={isBusy}
								loading={isBusy && busyAction === "clear"}
							>
								Clear colors
							</Button>
						</Inline>
					</div>
				) : null}

				<div style={footerStyle}>
					<div>
						<Dropdown
							value={"styles-and-variables"}
							options={[
								{ value: "styles-and-variables", text: "Styles & Variables" },
								{ value: "variables-only", text: "Variables only" },
								{ value: "styles-only", text: "Styles only" }
							]}
							onValueChange={() => { }}
						/>
					</div>
					<div style={footerRightStyle}>
						<Inline space="extraSmall">
							<Button
								secondary
								onClick={handleGenerateDocs}
								disabled={isBusy}
								loading={isBusy && busyAction === "docs"}
							>
								Generate docs
							</Button>
							<Button onClick={handleImport} disabled={isBusy} loading={isBusy && busyAction === "import"}>
								Apply to selection
							</Button>
						</Inline>
					</div>
				</div>
			</Container>
		</div>
	);
}

export default render(Plugin);
