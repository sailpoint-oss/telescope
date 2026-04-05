/**
 * E2E Tests: Diagnostic contract tests
 *
 * These tests validate user-visible diagnostic invariants that matter at the
 * extension-host boundary. Exact rule semantics stay covered by Go integration
 * tests; E2E keeps the shape/source contract honest.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	deleteWorkspaceFile,
	diagCode,
	ensureSingleRootWorkspaceReady,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
	waitForDocumentAnalyzed,
	waitForLanguageId,
	writeWorkspaceFile,
} from "./utils/e2e-helpers";

suite("Diagnostic Contracts", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		({ folder } = await ensureSingleRootWorkspaceReady());
	});

	test("rich-api.yaml produces only warnings, no errors", async () => {
		if (isMultiRootWorkspace()) return;

		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);
		await waitForDocumentAnalyzed(uri);

		const diagnostics = vscode.languages.getDiagnostics(uri);
		const errors = diagnostics.filter(
			(d) => d.severity === vscode.DiagnosticSeverity.Error,
		);
		assert.strictEqual(
			errors.length,
			0,
			`rich-api.yaml is valid OpenAPI — should have no errors. Got: ${errors.map((e) => `${diagCode(e)}: ${e.message}`).join("; ")}`,
		);

		// Should have warnings from telescope analyzers
		const warnings = diagnostics.filter(
			(d) => d.severity === vscode.DiagnosticSeverity.Warning ||
				d.severity === vscode.DiagnosticSeverity.Information,
		);
		assert.ok(
			warnings.length > 0,
			"rich-api.yaml should produce at least some warnings/info from telescope analyzers",
		);
	});

	test("All diagnostics have valid structure", async () => {
		if (isMultiRootWorkspace()) return;

		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const diagnostics = vscode.languages.getDiagnostics(uri);
		for (const d of diagnostics) {
			assert.ok(d.range, `Diagnostic should have a range: ${d.message}`);
			assert.ok(
				d.severity !== undefined && d.severity !== null,
				`Diagnostic should have a severity: ${d.message}`,
			);
			assert.ok(
				d.message && d.message.length > 0,
				"Diagnostic should have a non-empty message",
			);
			// telescope diagnostics should have a code
			if (d.source?.toLowerCase().includes("telescope")) {
				assert.ok(
					diagCode(d).length > 0,
					`Telescope diagnostic should have a code. Message: ${d.message}`,
				);
			}
		}
	});

	test("Valid minimal spec produces zero telescope errors", async () => {
		if (isMultiRootWorkspace()) return;

		const relativePath = `diag-contract-valid-${Date.now()}.yaml`;
		const content = [
			'openapi: "3.1.0"',
			"info:",
			"  title: Valid Minimal Spec",
			'  version: "1.0.0"',
			"  description: A fully valid specification.",
			"servers:",
			"  - url: https://api.example.com",
			"tags:",
			"  - name: items",
			"    description: Item operations",
			"paths:",
			"  /items:",
			"    get:",
			"      operationId: listItems",
			"      summary: List items",
			"      description: Returns all items.",
			"      tags:",
			"        - items",
			"      responses:",
			'        "200":',
			"          description: OK",
			'        "400":',
			"          description: Bad request",
			'        "500":',
			"          description: Internal server error",
			"",
		].join("\n");

		const uri = await writeWorkspaceFile(relativePath, content);
		try {
			await openAndShow(uri);
			await waitForLanguageId(uri, "openapi-yaml", { timeoutMs: 15000 });
			await waitForDocumentAnalyzed(uri, { skipDiagnostics: true });

			const diagnostics = vscode.languages.getDiagnostics(uri);
			const telescopeErrors = diagnostics.filter(
				(d) =>
					d.source?.toLowerCase().includes("telescope") &&
					d.severity === vscode.DiagnosticSeverity.Error,
			);
			assert.strictEqual(
				telescopeErrors.length,
				0,
				`Well-formed spec should have no telescope errors. Got: ${telescopeErrors.map((d) => `${diagCode(d)}: ${d.message}`).join("; ")}`,
			);
		} finally {
			await deleteWorkspaceFile(relativePath);
		}
	});
});
