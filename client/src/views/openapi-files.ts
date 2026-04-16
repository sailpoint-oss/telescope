import * as path from "node:path";
import * as vscode from "vscode";
import { SessionManager } from "../session-manager";

type OpenAPIFilesNode = WorkspaceNode | FileNode;

class WorkspaceNode extends vscode.TreeItem {
	constructor(
		public readonly workspaceFolder: vscode.WorkspaceFolder,
		public readonly uris: vscode.Uri[],
	) {
		super(
			workspaceFolder.name,
			vscode.TreeItemCollapsibleState.Expanded,
		);
		this.contextValue = "telescope.workspaceFolder";
		this.description = `${uris.length} OpenAPI file${uris.length === 1 ? "" : "s"}`;
		this.tooltip = workspaceFolder.uri.fsPath;
	}
}

class FileNode extends vscode.TreeItem {
	constructor(
		public readonly uri: vscode.Uri,
		relativePath: string,
	) {
		super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.None);
		this.contextValue = "telescope.openapiFile";
		this.description = relativePath;
		this.tooltip = uri.fsPath;
		this.command = {
			command: "vscode.open",
			title: "Open OpenAPI file",
			arguments: [uri],
		};
	}
}

export class OpenAPIFilesProvider
	implements vscode.TreeDataProvider<OpenAPIFilesNode>
{
	private readonly onDidChangeTreeDataEmitter =
		new vscode.EventEmitter<OpenAPIFilesNode | undefined | null | void>();

	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	constructor(private readonly sessionManager: SessionManager) {}

	refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	getTreeItem(element: OpenAPIFilesNode): vscode.TreeItem {
		return element;
	}

	getChildren(element?: OpenAPIFilesNode): OpenAPIFilesNode[] {
		if (element instanceof WorkspaceNode) {
			return element.uris
				.slice()
				.sort((a, b) => a.fsPath.localeCompare(b.fsPath))
				.map((uri) => new FileNode(uri, vscode.workspace.asRelativePath(uri, false)));
		}

		const sessions = this.sessionManager
			.getAllSessions()
			.slice()
			.sort((a, b) =>
				a.workspaceFolder.name.localeCompare(b.workspaceFolder.name),
			);
		if (sessions.length <= 1) {
			const uris = sessions.flatMap((session) =>
				session.getOpenAPIFiles().map((raw) => vscode.Uri.parse(raw)),
			);
			return uris
				.sort((a, b) => a.fsPath.localeCompare(b.fsPath))
				.map((uri) => new FileNode(uri, vscode.workspace.asRelativePath(uri, false)));
		}
		return sessions.map(
			(session) =>
				new WorkspaceNode(
					session.workspaceFolder,
					session.getOpenAPIFiles().map((raw) => vscode.Uri.parse(raw)),
				),
		);
	}

	getSummary(): { files: number } {
		return { files: this.sessionManager.getTotalOpenAPIFileCount() };
	}
}
