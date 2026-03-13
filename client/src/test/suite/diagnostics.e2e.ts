/**
 * E2E Tests: Diagnostics and Validation
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
	writeWorkspaceFile,
} from "./utils/e2e-helpers";

suite("Diagnostics", () => {
	let testAPI: ReturnType<typeof getTestApi>;
	let workspaceFolder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		testAPI = getTestApi();
		await testAPI.waitForSessionsRunning(60000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		workspaceFolder = f;
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
				schemaDiags.every((d) => d.severity !== undefined),
				"Expected oas3-schema diagnostics to include a severity value",
			);
		} finally {
			await deleteWorkspaceFile(relativePath);
		}
	});

	test("Should not produce errors for valid OpenAPI file", async () => {
		if (isMultiRootWorkspace()) return;

		const validFile = vscode.Uri.joinPath(workspaceFolder.uri, "valid.yaml");
		await openAndShow(validFile);
		await waitForDiagnostics(validFile, () => true, { timeoutMs: 60000 });

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
