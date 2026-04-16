import type * as vscode from "vscode";

export interface BreakingChangeGroup {
	uri: vscode.Uri;
	diagnostics: vscode.Diagnostic[];
}

export function collectBreakingChangeGroups(
	entries: readonly [vscode.Uri, readonly vscode.Diagnostic[]][],
): BreakingChangeGroup[] {
	return entries
		.map(([uri, diagnostics]) => ({
			uri,
			diagnostics: diagnostics.filter(
				(diagnostic) => diagnostic.source === "telescope-diff",
			),
		}))
		.filter((group) => group.diagnostics.length > 0)
		.sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath));
}
