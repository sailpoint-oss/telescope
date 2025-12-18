import { describe, expect, it } from "bun:test";
import { pathToFileURL } from "node:url";
import { URI } from "vscode-uri";
import type { Rule } from "../../src/engine/index.js";
import { matchesPattern } from "../../src/engine/pattern-matcher.js";
import { MemoryFileSystem } from "../../src/engine/utils/file-system-utils.js";
import { computeDocumentDiagnostics } from "../../src/lsp/handlers/diagnostics.js";
import { WorkspaceProject } from "../../src/lsp/workspace/workspace-project.js";

describe("LSP document diagnostics scoping", () => {
	it("skips diagnostics for out-of-scope standalone (non-referenced) OpenAPI fragments", async () => {
		const fs = new MemoryFileSystem();
		const workspaceFolderUri = pathToFileURL("/workspace").toString();

		const project = new WorkspaceProject({
			workspaceFolderUri,
			fileSystem: fs,
		});

		// Only scan/consider roots under apis/
		project.setOpenApiPatterns(["apis/**/*.yaml"]);

		const fragmentUri = pathToFileURL("/workspace/other/user.yaml").toString();
		fs.addFile(
			fragmentUri,
			"type: object\nproperties:\n  id:\n    type: string\n",
		);

		const workspaceRootFsPath = URI.parse(workspaceFolderUri).fsPath;
		const scopePatterns = ["apis/**/*.yaml"];
		const scope = {
			isOpenApiInScope: (uri: string) =>
				matchesPattern(uri, scopePatterns, [workspaceRootFsPath]),
		};

		const rule: Rule = {
			meta: {
				id: "test-doc-rule",
				number: 999999,
				type: "problem",
				description: "test rule",
				ruleType: "openapi",
			},
			check(ctx) {
				return {
					Document(node) {
						const range =
							ctx.offsetToRange(node.uri, 0, 1) ??
							({
								start: { line: 0, character: 0 },
								end: { line: 0, character: 1 },
							} as const);
						ctx.report({
							code: "test-doc-rule",
							message: "should-run",
							uri: node.uri,
							range,
							severity: "warning",
							source: "telescope",
						});
					},
				};
			},
		};

		const diags = await computeDocumentDiagnostics(
			fragmentUri,
			undefined,
			[],
			project,
			[rule],
			scope,
		);

		expect(diags).toEqual([]);
	});

	it("allows diagnostics for out-of-scope fragments when referenced by an in-scope root", async () => {
		const fs = new MemoryFileSystem();
		const workspaceFolderUri = pathToFileURL("/workspace").toString();

		const project = new WorkspaceProject({
			workspaceFolderUri,
			fileSystem: fs,
		});

		// Only scan/consider roots under apis/
		project.setOpenApiPatterns(["apis/**/*.yaml"]);

		const rootUri = pathToFileURL("/workspace/apis/api.yaml").toString();
		const fragmentUri = pathToFileURL("/workspace/other/user.yaml").toString();

		fs.addFile(
			rootUri,
			[
				"openapi: 3.1.0",
				"info:",
				"  title: X",
				"  version: 1.0.0",
				"paths:",
				"  /users:",
				"    get:",
				"      responses:",
				"        '200':",
				"          description: ok",
				"          content:",
				"            application/json:",
				"              schema:",
				"                $ref: ../other/user.yaml",
				"",
			].join("\n"),
		);

		fs.addFile(
			fragmentUri,
			"type: object\nproperties:\n  id:\n    type: string\n",
		);

		const workspaceRootFsPath = URI.parse(workspaceFolderUri).fsPath;
		const scopePatterns = ["apis/**/*.yaml"];
		const scope = {
			isOpenApiInScope: (uri: string) =>
				matchesPattern(uri, scopePatterns, [workspaceRootFsPath]),
		};

		const rule: Rule = {
			meta: {
				id: "test-doc-rule",
				number: 999999,
				type: "problem",
				description: "test rule",
				ruleType: "openapi",
			},
			check(ctx) {
				return {
					Document(node) {
						const range =
							ctx.offsetToRange(node.uri, 0, 1) ??
							({
								start: { line: 0, character: 0 },
								end: { line: 0, character: 1 },
							} as const);
						ctx.report({
							code: "test-doc-rule",
							message: "should-run",
							uri: node.uri,
							range,
							severity: "warning",
							source: "telescope",
						});
					},
				};
			},
		};

		const diags = await computeDocumentDiagnostics(
			fragmentUri,
			undefined,
			[],
			project,
			[rule],
			scope,
		);

		expect(diags.length).toBeGreaterThan(0);
	});

	it("skips diagnostics for out-of-scope roots (enforces openapi.patterns)", async () => {
		const fs = new MemoryFileSystem();
		const workspaceFolderUri = pathToFileURL("/workspace").toString();

		const project = new WorkspaceProject({
			workspaceFolderUri,
			fileSystem: fs,
		});

		// Only scan/consider roots under apis/
		project.setOpenApiPatterns(["apis/**/*.yaml"]);

		const outOfScopeRootUri = pathToFileURL("/workspace/other/api.yaml").toString();
		fs.addFile(
			outOfScopeRootUri,
			"openapi: 3.1.0\ninfo:\n  title: X\n  version: 1.0.0\npaths: {}\n",
		);

		const workspaceRootFsPath = URI.parse(workspaceFolderUri).fsPath;
		const scopePatterns = ["apis/**/*.yaml"];
		const scope = {
			isOpenApiInScope: (uri: string) =>
				matchesPattern(uri, scopePatterns, [workspaceRootFsPath]),
		};

		const rule: Rule = {
			meta: {
				id: "test-doc-rule",
				number: 999999,
				type: "problem",
				description: "test rule",
				ruleType: "openapi",
			},
			check(ctx) {
				return {
					Document(node) {
						ctx.report({
							code: "test-doc-rule",
							message: "should-run",
							uri: node.uri,
							range: {
								start: { line: 0, character: 0 },
								end: { line: 0, character: 1 },
							},
							severity: "warning",
							source: "telescope",
						});
					},
				};
			},
		};

		const diags = await computeDocumentDiagnostics(
			outOfScopeRootUri,
			undefined,
			[],
			project,
			[rule],
			scope,
		);

		expect(diags).toEqual([]);
	});
});


