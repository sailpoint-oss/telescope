import * as path from "node:path";
import * as vscode from "vscode";
import { collectBreakingChangeGroups, type BreakingChangeGroup } from "../breaking-changes-data";

type BreakingTreeNode = BreakingFileNode | BreakingDiagnosticNode;

class BreakingFileNode extends vscode.TreeItem {
	constructor(public readonly group: BreakingChangeGroup) {
		super(
			path.basename(group.uri.fsPath),
			vscode.TreeItemCollapsibleState.Expanded,
		);
		this.contextValue = "telescope.breakingFile";
		this.description = `${group.diagnostics.length} breaking`;
		this.tooltip = group.uri.fsPath;
		this.command = {
			command: "vscode.open",
			title: "Open breaking-changes file",
			arguments: [group.uri],
		};
		this.iconPath = new vscode.ThemeIcon("git-compare");
	}
}

class BreakingDiagnosticNode extends vscode.TreeItem {
	constructor(
		public readonly uri: vscode.Uri,
		public readonly diagnostic: vscode.Diagnostic,
	) {
		super(diagnostic.message, vscode.TreeItemCollapsibleState.None);
		this.contextValue = "telescope.breakingDiagnostic";
		this.description = `L${diagnostic.range.start.line + 1}`;
		this.tooltip = diagnostic.message;
		this.iconPath = new vscode.ThemeIcon("warning");
		this.command = {
			command: "vscode.open",
			title: "Open breaking change",
			arguments: [
				uri,
				{
					selection: diagnostic.range,
					preview: false,
				},
			],
		};
	}
}

export class BreakingChangesProvider
	implements vscode.TreeDataProvider<BreakingTreeNode>
{
	private readonly onDidChangeTreeDataEmitter =
		new vscode.EventEmitter<BreakingTreeNode | undefined | null | void>();

	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	getTreeItem(element: BreakingTreeNode): vscode.TreeItem {
		return element;
	}

	getChildren(element?: BreakingTreeNode): BreakingTreeNode[] {
		if (element instanceof BreakingFileNode) {
			return element.group.diagnostics.map(
				(diagnostic) =>
					new BreakingDiagnosticNode(element.group.uri, diagnostic),
			);
		}
		return collectBreakingChangeGroups(vscode.languages.getDiagnostics()).map(
			(group) => new BreakingFileNode(group),
		);
	}

	getSummary(): { breaking: number } {
		return {
			breaking: collectBreakingChangeGroups(vscode.languages.getDiagnostics())
				.reduce((total, group) => total + group.diagnostics.length, 0),
		};
	}
}
