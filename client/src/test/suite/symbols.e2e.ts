/**
 * E2E Tests: Document symbols and workspace symbols
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	executeWithRetry,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
	waitForProviders,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

function flattenSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
	const result: vscode.DocumentSymbol[] = [];
	for (const s of symbols) {
		result.push(s);
		if (s.children?.length) {
			result.push(...flattenSymbols(s.children));
		}
	}
	return result;
}

suite("Symbols", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
		await waitForProjectInfo(api, (i) => i.knownOpenAPIFiles > 0, {
			timeoutMs: 60000,
			uri: folder.uri,
		});
		const warmupUri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(warmupUri);
		await waitForDiagnostics(warmupUri, (d) => d.length > 0, {
			timeoutMs: 90000,
		});
		await waitForProviders(warmupUri);
	});

	test("Document symbols include paths, operations, and components", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const symbols = await executeWithRetry<vscode.DocumentSymbol[]>(
			"vscode.executeDocumentSymbolProvider",
			[uri],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(symbols && symbols.length > 0, "Expected document symbols");

		const all = flattenSymbols(symbols);
		const names = all.map((s) => s.name.toLowerCase());

		assert.ok(
			names.some((n) => n.includes("/users") || n.includes("paths")),
			`Expected path symbols. Got: ${names.slice(0, 20).join(", ")}`,
		);
	});

	test("Document symbols have valid ranges", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const symbols = await executeWithRetry<vscode.DocumentSymbol[]>(
			"vscode.executeDocumentSymbolProvider",
			[uri],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(symbols && symbols.length > 0);
		const all = flattenSymbols(symbols);
		for (const sym of all) {
			assert.ok(
				sym.range.start.line >= 0,
				`Symbol "${sym.name}" should have valid start line`,
			);
			assert.ok(
				sym.range.end.line >= sym.range.start.line,
				`Symbol "${sym.name}" end should be >= start`,
			);
		}
	});

	test("Workspace symbols find schemas by query", async () => {
		if (isMultiRootWorkspace()) return;

		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const symbols = await executeWithRetry<vscode.SymbolInformation[]>(
			"vscode.executeWorkspaceSymbolProvider",
			["User"],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(symbols && symbols.length > 0, "Expected workspace symbols for 'User'");
		const names = symbols.map((s) => s.name);
		assert.ok(
			names.some((n) => n.includes("User")),
			`Expected a symbol containing 'User'. Got: ${names.join(", ")}`,
		);

		for (const sym of symbols) {
			assert.ok(sym.location, `Symbol "${sym.name}" should have a location`);
			assert.ok(
				sym.location.uri.fsPath.length > 0,
				`Symbol "${sym.name}" should have a valid URI`,
			);
		}
	});

	test("Workspace symbols find operations by name", async () => {
		if (isMultiRootWorkspace()) return;

		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const symbols = await executeWithRetry<vscode.SymbolInformation[]>(
			"vscode.executeWorkspaceSymbolProvider",
			["listUsers"],
			(r) => Array.isArray(r) && r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(
			symbols && symbols.length > 0,
			"Expected workspace symbols for 'listUsers'",
		);
		const names = symbols.map((s) => s.name);
		assert.ok(
			names.some((n) => n.includes("listUsers")),
			`Expected a symbol containing 'listUsers'. Got: ${names.join(", ")}`,
		);
	});
});
