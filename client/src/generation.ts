// Client-side wiring for Telescope's cartographer generation loop.
//
// Exposes the status-bar item, activity-bar TreeViews, virtual document
// provider for the telescope-generated:// scheme, CodeLens provider for
// source files, and the palette commands that back them.
//
// Every subscription is pushed to the disposable set so deactivate() tears
// everything down cleanly.

import * as vscode from "vscode";
import type { SessionManager } from "./session-manager";

const GENERATED_SCHEME = "telescope-generated";

interface GenerationNotification {
	state: "started" | "succeeded" | "failed" | "skipped";
	root: string;
	durationMs?: number;
	error?: string;
	operations?: number;
	types?: number;
}

interface FileContributions {
	File: string;
	Operations?: Array<{ Method: string; Path: string }>;
	Schemas?: Array<{ Name: string }>;
	Fields?: Array<{ Schema: string; Field: string }>;
}

// Thin accessor that locates a client the extension can send requests to.
// Uses the active session as the routing root.
function activeClient(sessionManager: SessionManager): any | undefined {
	const session = sessionManager.getActiveSession();
	if (!session) return undefined;
	const c: any = (session as any).getClient?.();
	return c ?? undefined;
}

async function sendCommand(
	sessionManager: SessionManager,
	command: string,
	args: any[] = [],
): Promise<unknown> {
	const c = activeClient(sessionManager);
	if (!c) return undefined;
	return c.sendRequest("workspace/executeCommand", { command, arguments: args });
}

// registerGenerationFeatures wires every generation-loop-facing extension
// surface to the Telescope language server. Callers should invoke this once
// from activate() after the SessionManager is ready. Subscribing to each
// session's language client is handled lazily via getActiveSession() so
// multi-root workspaces are supported.
export function registerGenerationFeatures(
	context: vscode.ExtensionContext,
	sessionManager: SessionManager,
): void {
	const statusBar = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		80,
	);
	statusBar.text = "$(compass) Telescope: idle";
	statusBar.tooltip = "Telescope generation loop";
	statusBar.command = "telescope.revealGeneratedSpec";
	statusBar.show();
	context.subscriptions.push(statusBar);

	const virtualDiagnostics =
		vscode.languages.createDiagnosticCollection("telescope-generated");
	context.subscriptions.push(virtualDiagnostics);

	const generatedSpecTree = new GeneratedSpecProvider(sessionManager);
	const sourceContributionsTree = new SourceContributionsProvider(sessionManager);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			"telescope.generatedSpec",
			generatedSpecTree,
		),
		vscode.window.registerTreeDataProvider(
			"telescope.sourceContributions",
			sourceContributionsTree,
		),
	);

	const emitter = new vscode.EventEmitter<vscode.Uri>();
	const provider = new GeneratedSpecContentProvider(sessionManager, emitter);
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(
			GENERATED_SCHEME,
			provider,
		),
	);

	const onGenerationEvent = (params: GenerationNotification) => {
		switch (params.state) {
			case "started":
				statusBar.text = "$(sync~spin) Telescope: regenerating";
				break;
			case "succeeded":
				statusBar.text = `$(check) Telescope: up to date (${params.durationMs ?? 0} ms)`;
				generatedSpecTree.refresh();
				sourceContributionsTree.refresh();
				emitter.fire(
					vscode.Uri.parse(`${GENERATED_SCHEME}:/generated/openapi.yaml`),
				);
				break;
			case "failed":
				statusBar.text = "$(alert) Telescope: extraction failed";
				statusBar.tooltip = params.error ?? "Unknown extraction error";
				break;
		}
	};

	// Subscribe to the active session's notifications. Multi-root support can
	// extend this later by iterating over all sessions.
	const subscribeOnce = () => {
		const c = activeClient(sessionManager);
		if (!c || typeof c.onNotification !== "function") {
			return;
		}
		try {
			c.onNotification("$/telescope.generation", onGenerationEvent);
		} catch {
			/* already subscribed */
		}
	};
	subscribeOnce();

	context.subscriptions.push(
		vscode.commands.registerCommand("telescope.regenerate", async () => {
			await sendCommand(sessionManager, "telescope.regenerate", []);
		}),
		vscode.commands.registerCommand("telescope.openGeneratedSpec", async () => {
			const result = (await sendCommand(
				sessionManager,
				"telescope.openGeneratedSpec",
				[],
			)) as { uri?: string } | undefined;
			if (!result?.uri) return;
			const doc = await vscode.workspace.openTextDocument(
				vscode.Uri.parse(result.uri),
			);
			await vscode.window.showTextDocument(doc);
		}),
		vscode.commands.registerCommand("telescope.writeSpecNow", async () => {
			await sendCommand(sessionManager, "telescope.writeSpecNow", []);
		}),
		vscode.commands.registerCommand("telescope.showSourceMap", async () => {
			const uri = vscode.window.activeTextEditor?.document.uri.toString();
			if (!uri) return;
			const payload = await sendCommand(
				sessionManager,
				"telescope.getSourceContributions",
				[uri],
			);
			const doc = await vscode.workspace.openTextDocument({
				content: JSON.stringify(payload, null, 2),
				language: "json",
			});
			await vscode.window.showTextDocument(doc);
		}),
		vscode.commands.registerCommand("telescope.revealGeneratedSpec", async () => {
			await vscode.commands.executeCommand(
				"workbench.view.extension.telescope",
			);
		}),
	);

	const lensSelector: vscode.DocumentSelector = [
		{ language: "go" },
		{ language: "java" },
		{ language: "typescript" },
		{ language: "typescriptreact" },
	];
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			lensSelector,
			new ContributionCodeLensProvider(sessionManager),
		),
	);
}

class GeneratedSpecContentProvider
	implements vscode.TextDocumentContentProvider
{
	onDidChange: vscode.Event<vscode.Uri>;
	constructor(
		private readonly sessionManager: SessionManager,
		emitter: vscode.EventEmitter<vscode.Uri>,
	) {
		this.onDidChange = emitter.event;
	}
	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		const bytes = (await sendCommand(
			this.sessionManager,
			"telescope.getGeneratedSpecBytes",
			[uri.toString()],
		)) as string | undefined;
		return bytes ?? "";
	}
}

class GeneratedSpecProvider
	implements vscode.TreeDataProvider<GeneratedSpecNode>
{
	private readonly emitter = new vscode.EventEmitter<
		GeneratedSpecNode | undefined
	>();
	readonly onDidChangeTreeData = this.emitter.event;
	constructor(private readonly sessionManager: SessionManager) {}
	refresh() {
		this.emitter.fire(undefined);
	}
	getTreeItem(element: GeneratedSpecNode): vscode.TreeItem {
		return element;
	}
	async getChildren(): Promise<GeneratedSpecNode[]> {
		const tree = (await sendCommand(
			this.sessionManager,
			"telescope.getGeneratedSpecTree",
			[],
		)) as
			| { paths?: Array<{ path: string }>; schemas?: Array<{ name: string }> }
			| undefined;
		const nodes: GeneratedSpecNode[] = [];
		for (const p of tree?.paths ?? []) {
			nodes.push(
				new GeneratedSpecNode(p.path, vscode.TreeItemCollapsibleState.None),
			);
		}
		for (const s of tree?.schemas ?? []) {
			nodes.push(
				new GeneratedSpecNode(
					`schema: ${s.name}`,
					vscode.TreeItemCollapsibleState.None,
				),
			);
		}
		return nodes;
	}
}

class GeneratedSpecNode extends vscode.TreeItem {
	constructor(label: string, state: vscode.TreeItemCollapsibleState) {
		super(label, state);
	}
}

class SourceContributionsProvider
	implements vscode.TreeDataProvider<GeneratedSpecNode>
{
	private readonly emitter = new vscode.EventEmitter<
		GeneratedSpecNode | undefined
	>();
	readonly onDidChangeTreeData = this.emitter.event;
	constructor(private readonly sessionManager: SessionManager) {}
	refresh() {
		this.emitter.fire(undefined);
	}
	getTreeItem(element: GeneratedSpecNode): vscode.TreeItem {
		return element;
	}
	async getChildren(): Promise<GeneratedSpecNode[]> {
		const uri = vscode.window.activeTextEditor?.document.uri.toString();
		if (!uri) return [];
		const fc = (await sendCommand(
			this.sessionManager,
			"telescope.getSourceContributions",
			[uri],
		)) as FileContributions | undefined;
		if (!fc) return [];
		const nodes: GeneratedSpecNode[] = [];
		for (const op of fc.Operations ?? []) {
			nodes.push(
				new GeneratedSpecNode(
					`${op.Method} ${op.Path}`,
					vscode.TreeItemCollapsibleState.None,
				),
			);
		}
		for (const s of fc.Schemas ?? []) {
			nodes.push(
				new GeneratedSpecNode(
					`schema: ${s.Name}`,
					vscode.TreeItemCollapsibleState.None,
				),
			);
		}
		for (const f of fc.Fields ?? []) {
			nodes.push(
				new GeneratedSpecNode(
					`${f.Schema}.${f.Field}`,
					vscode.TreeItemCollapsibleState.None,
				),
			);
		}
		return nodes;
	}
}

class ContributionCodeLensProvider implements vscode.CodeLensProvider {
	constructor(private readonly sessionManager: SessionManager) {}
	async provideCodeLenses(
		document: vscode.TextDocument,
	): Promise<vscode.CodeLens[]> {
		const fc = (await sendCommand(
			this.sessionManager,
			"telescope.getSourceContributions",
			[document.uri.toString()],
		)) as FileContributions | undefined;
		if (!fc) return [];
		const summary = `${fc.Operations?.length ?? 0} operations | ${fc.Schemas?.length ?? 0} schemas`;
		return [
			new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
				title: `Telescope: ${summary}`,
				command: "telescope.openGeneratedSpec",
			}),
		];
	}
}
