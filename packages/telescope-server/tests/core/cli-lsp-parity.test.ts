import { describe, expect, test } from "bun:test";
import { URI } from "vscode-uri";

import { materializeRules, NodeFileSystem, resolveConfig } from "../../src/engine/index.js";
import { lintDocument, type Rule } from "../../src/engine/index.js";
import { lintWorkspace } from "../../src/core/workspace-analyzer.js";
import { WorkspaceProject } from "../../src/lsp/workspace/workspace-project.js";

function simplify(d: {
	uri: string;
	code?: unknown;
	message?: string;
	severity?: number;
	range: { start: { line: number; character: number }; end: { line: number; character: number } };
}): string {
	return [
		d.uri,
		d.code?.toString?.() ?? "",
		d.severity ?? "",
		d.range.start.line,
		d.range.start.character,
		d.range.end.line,
		d.range.end.character,
		(d.message ?? "").replace(/\r?\n/g, " "),
	].join("|");
}

describe("CLI/LSP parity", () => {
	test("lintWorkspace (CLI path) matches WorkspaceProject+resolveLintingContext+lintDocument (LSP path)", async () => {
		const workspacePath = URI.file(
			// Repo-local fixture workspace used by CI preview workflow.
			"packages/test-files",
		).fsPath;
		const workspaceFolderUri = URI.file(workspacePath).toString();

		const fs = new NodeFileSystem();
		const config = resolveConfig(workspacePath);
		const rules = (await materializeRules(config, workspacePath)).map(
			(r) => r.rule,
		) as Rule[];

		// CLI path
		const cli = await lintWorkspace({
			workspaceFolderUri,
			workspacePath,
			fileSystem: fs,
			rules,
			openapiPatterns: config.openapi?.patterns,
		});

		// LSP path
		const project = new WorkspaceProject({ workspaceFolderUri, fileSystem: fs });
		project.setOpenApiPatterns(config.openapi?.patterns);
		const roots = await project.getRootUris();

		const lspDiags: any[] = [];
		for (const rootUri of roots) {
			const ctx = await project.resolveLintingContext(rootUri, fs, {
				useProjectCache: true,
			});
			const diags = await lintDocument(ctx, fs, rules);
			lspDiags.push(...diags);
		}

		const cliSet = new Set(cli.diagnostics.map(simplify));
		const lspSet = new Set(lspDiags.map(simplify));

		// Helpful deltas for debugging if this ever regresses.
		const onlyInCli = Array.from(cliSet).filter((x) => !lspSet.has(x));
		const onlyInLsp = Array.from(lspSet).filter((x) => !cliSet.has(x));

		expect(onlyInCli).toEqual([]);
		expect(onlyInLsp).toEqual([]);
	});
});


