/**
 * E2E Tests: Diagnostics and Validation
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
	writeWorkspaceFile,
} from "./utils/e2e-helpers";

suite("Diagnostics", () => {
	let workspaceFolder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		({ folder: workspaceFolder } = await ensureSingleRootWorkspaceReady());
	});

	test("Should produce diagnostics for OpenAPI file with issues", async () => {
		if (isMultiRootWorkspace()) return;

		// Use rich-api.yaml which reliably triggers warnings (server-url-https, etc.)
		const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, "rich-api.yaml");
		await openAndShow(fileUri);

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) => d.length > 0,
			{ timeoutMs: 60000 },
		);
		assert.ok(
			diagnostics.length > 0,
			`Should have diagnostics. Found: ${diagnostics.length}`,
		);

		// Validate diagnostics have proper structure
		for (const d of diagnostics) {
			assert.ok(d.severity !== undefined, "Every diagnostic should have a severity");
			assert.ok(d.range, "Every diagnostic should have a range");
		}

		// rich-api.yaml is valid OpenAPI — should produce warnings only, not errors
		const errors = diagnostics.filter(
			(d) => d.severity === vscode.DiagnosticSeverity.Error,
		);
		assert.strictEqual(
			errors.length,
			0,
			`rich-api.yaml should have no errors (only warnings). Errors: ${errors.map((e) => `${diagCode(e)}: ${e.message}`).join("; ")}`,
		);

		// At least some diagnostics should come from telescope
		const telescopeDiags = diagnostics.filter(
			(d) => d.source?.toLowerCase().includes("telescope"),
		);
		assert.ok(
			telescopeDiags.length > 0,
			`Expected telescope-sourced diagnostics. Sources: ${[...new Set(diagnostics.map((d) => d.source))].join(", ")}`,
		);
	});

	test("Schema validation diagnostics should surface as errors", async () => {
		if (isMultiRootWorkspace()) return;
		const relativePath = "fragment-invalid-schema.yaml";
		const invalidFile = await writeWorkspaceFile(
			relativePath,
			"type: object\nrequired: id\n",
		);
		try {
			await openAndShow(invalidFile);
			const diagnostics = await waitForDiagnostics(
				invalidFile,
				(diags) => diags.some((d) => diagCode(d) === "oas3-schema"),
				{ timeoutMs: 60000 },
			);
			const schemaDiags = diagnostics.filter((d) => diagCode(d) === "oas3-schema");
			assert.ok(
				schemaDiags.length > 0,
				`Expected at least one oas3-schema diagnostic on ${relativePath}`,
			);
			assert.ok(
				schemaDiags.every(
					(d) => d.severity === vscode.DiagnosticSeverity.Error ||
						d.severity === vscode.DiagnosticSeverity.Warning,
				),
				"Expected oas3-schema diagnostics to have Error or Warning severity",
			);
		} finally {
			await deleteWorkspaceFile(relativePath);
		}
	});

	test("Should not produce errors for valid OpenAPI file", async () => {
		if (isMultiRootWorkspace()) return;

		const validFile = vscode.Uri.joinPath(workspaceFolder.uri, "valid.yaml");
		await openAndShow(validFile);
		// Ensure the full analysis pipeline completes before asserting zero errors.
		await waitForDocumentAnalyzed(validFile, { skipDiagnostics: true });

		const diagnostics = vscode.languages.getDiagnostics(validFile);
		const errors = diagnostics.filter(
			(d) => d.severity === vscode.DiagnosticSeverity.Error,
		);
		assert.strictEqual(
			errors.length,
			0,
			`Valid file should have no errors. Found: ${errors.map((e) => e.message).join(", ")}`,
		);
	});
});
