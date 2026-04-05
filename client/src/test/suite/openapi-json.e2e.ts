/**
 * E2E Tests: OpenAPI JSON host wiring
 *
 * Validates that JSON OpenAPI documents stay on Telescope's path for
 * classification and Telescope-owned diagnostics after child-LSP removal.
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
	waitForLanguageId,
	writeWorkspaceFile,
} from "./utils/e2e-helpers";

suite("OpenAPI JSON", () => {
	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await ensureSingleRootWorkspaceReady();
	});

	test("OpenAPI JSON routes through Telescope-owned schema diagnostics", async () => {
		if (isMultiRootWorkspace()) return;

		const relativePath = `openapi-json-missing-info-${Date.now()}.json`;
		const uri = await writeWorkspaceFile(
			relativePath,
			`${JSON.stringify({ openapi: "3.1.0", paths: {} }, null, 2)}\n`,
		);

		try {
			await openAndShow(uri);
			const doc = await waitForLanguageId(uri, "openapi-json", {
				timeoutMs: 30000,
			});
			assert.strictEqual(
				doc.languageId,
				"openapi-json",
				`Expected openapi-json, got ${doc.languageId}`,
			);

			const diagnostics = await waitForDiagnostics(
				uri,
				(d) => d.some((diag) => diagCode(diag) === "oas3-schema"),
				{ timeoutMs: 60000 },
			);
			const schemaDiags = diagnostics.filter((d) => diagCode(d) === "oas3-schema");
			assert.ok(
				schemaDiags.length > 0,
				`Expected oas3-schema diagnostics for malformed OpenAPI structure. Got: ${diagnostics.map((d) => `${diagCode(d)}:${d.message}`).join(" | ")}`,
			);
			assert.ok(
				schemaDiags.some((d) => d.message.toLowerCase().includes("info")),
				`Expected a JSON OpenAPI diagnostic mentioning 'info'. Messages: ${schemaDiags.map((d) => d.message).join("; ")}`,
			);
		} finally {
			await deleteWorkspaceFile(relativePath);
		}
	});
});
