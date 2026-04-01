/**
 * E2E Tests: Diagnostic contract tests
 *
 * These tests validate that specific fixture content produces specific diagnostic
 * codes and severities. They serve as the canary — if rule behavior changes,
 * these tests surface it.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	deleteWorkspaceFile,
	diagCode,
	getTestApi,
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
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
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

	test("Missing info field triggers oas3-schema error", async () => {
		if (isMultiRootWorkspace()) return;

		const relativePath = `diag-contract-no-info-${Date.now()}.yaml`;
		const content = [
			'openapi: "3.1.0"',
			"paths:",
			"  /test:",
			"    get:",
			"      summary: No info block",
			"      responses:",
			'        "200":',
			"          description: OK",
			"",
		].join("\n");

		const uri = await writeWorkspaceFile(relativePath, content);
		try {
			await openAndShow(uri);
			await waitForLanguageId(uri, "openapi-yaml", { timeoutMs: 15000 });
			const diagnostics = await waitForDiagnostics(
				uri,
				(d) => d.some((diag) => diagCode(diag) === "oas3-schema"),
				{ timeoutMs: 60000 },
			);

			const schemaDiags = diagnostics.filter((d) => diagCode(d) === "oas3-schema");
			assert.ok(
				schemaDiags.length > 0,
				`Expected oas3-schema diagnostic for missing 'info'. Codes: ${diagnostics.map((d) => diagCode(d)).join(", ")}`,
			);
			assert.ok(
				schemaDiags.some((d) => d.message.toLowerCase().includes("info")),
				`Expected diagnostic message to mention 'info'. Messages: ${schemaDiags.map((d) => d.message).join("; ")}`,
			);
		} finally {
			await deleteWorkspaceFile(relativePath);
		}
	});

	test("Unresolved $ref produces unresolved-ref diagnostic", async () => {
		if (isMultiRootWorkspace()) return;

		const relativePath = `diag-contract-bad-ref-${Date.now()}.yaml`;
		const content = [
			'openapi: "3.1.0"',
			"info:",
			"  title: Bad Ref Test",
			'  version: "1.0.0"',
			"paths:",
			"  /test:",
			"    get:",
			"      operationId: getTest",
			"      summary: Test",
			"      responses:",
			'        "200":',
			"          description: OK",
			"          content:",
			"            application/json:",
			"              schema:",
			"                $ref: '#/components/schemas/DoesNotExist'",
			"",
		].join("\n");

		const uri = await writeWorkspaceFile(relativePath, content);
		try {
			await openAndShow(uri);
			await waitForLanguageId(uri, "openapi-yaml", { timeoutMs: 15000 });
			const diagnostics = await waitForDiagnostics(
				uri,
				(d) => d.some((diag) => diagCode(diag) === "unresolved-ref"),
				{ timeoutMs: 60000 },
			);

			const unresolvedDiags = diagnostics.filter(
				(d) => diagCode(d) === "unresolved-ref",
			);
			assert.ok(
				unresolvedDiags.length > 0,
				`Expected unresolved-ref diagnostic. Codes: ${diagnostics.map((d) => diagCode(d)).join(", ")}`,
			);
			assert.ok(
				unresolvedDiags.some((d) => d.message.includes("DoesNotExist")),
				`Expected diagnostic to mention 'DoesNotExist'. Messages: ${unresolvedDiags.map((d) => d.message).join("; ")}`,
			);
		} finally {
			await deleteWorkspaceFile(relativePath);
		}
	});

	test("Duplicate operationId produces diagnostic", async () => {
		if (isMultiRootWorkspace()) return;

		const relativePath = `diag-contract-dup-opid-${Date.now()}.yaml`;
		const content = [
			'openapi: "3.1.0"',
			"info:",
			"  title: Dup OpId Test",
			'  version: "1.0.0"',
			"paths:",
			"  /a:",
			"    get:",
			"      operationId: duplicated",
			"      summary: First",
			"      responses:",
			'        "200":',
			"          description: OK",
			"  /b:",
			"    get:",
			"      operationId: duplicated",
			"      summary: Second",
			"      responses:",
			'        "200":',
			"          description: OK",
			"",
		].join("\n");

		const uri = await writeWorkspaceFile(relativePath, content);
		try {
			await openAndShow(uri);
			await waitForLanguageId(uri, "openapi-yaml", { timeoutMs: 15000 });
			const diagnostics = await waitForDiagnostics(
				uri,
				(d) =>
					d.some(
						(diag) =>
							diagCode(diag) === "unique-operation-id" ||
							diag.message.toLowerCase().includes("operationid") ||
							diag.message.toLowerCase().includes("duplicate"),
					),
				{ timeoutMs: 60000 },
			);

			const dupDiags = diagnostics.filter(
				(d) =>
					diagCode(d) === "unique-operation-id" ||
					d.message.toLowerCase().includes("operationid") ||
					d.message.toLowerCase().includes("duplicate"),
			);
			assert.ok(
				dupDiags.length > 0,
				`Expected duplicate operationId diagnostic. Codes: ${diagnostics.map((d) => `${diagCode(d)}: ${d.message.slice(0, 60)}`).join("; ")}`,
			);
		} finally {
			await deleteWorkspaceFile(relativePath);
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
