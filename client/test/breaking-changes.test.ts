import { describe, expect, test } from "bun:test";
import type * as vscode from "vscode";
import { collectBreakingChangeGroups } from "../src/breaking-changes-data";

function diag(
	message: string,
	source: string,
): vscode.Diagnostic {
	return {
		message,
		source,
		range: {
			start: { line: 3, character: 1 },
			end: { line: 3, character: 2 },
		},
	} as vscode.Diagnostic;
}

describe("collectBreakingChangeGroups", () => {
	test("filters to telescope diff diagnostics and groups by file", () => {
		const groups = collectBreakingChangeGroups([
			[
				{ fsPath: "/workspace/a.yaml" } as vscode.Uri,
				[
					diag("Breaking API change: removed path", "telescope-diff"),
					diag("regular lint", "telescope"),
				],
			],
			[
				{ fsPath: "/workspace/b.yaml" } as vscode.Uri,
				[diag("Breaking API change: changed schema", "telescope-diff")],
			],
		]);

		expect(groups).toHaveLength(2);
		expect(groups[0]?.diagnostics).toHaveLength(1);
		expect(groups[1]?.diagnostics).toHaveLength(1);
		expect(groups[0]?.diagnostics[0]?.message).toContain("Breaking API change");
	});
});
