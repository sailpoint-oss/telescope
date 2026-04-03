/**
 * E2E Tests: Malformed document non-interference
 *
 * The editor now owns malformed YAML/JSON syntax feedback. Telescope should
 * stay well-behaved and avoid publishing its own generic syntax/root
 * diagnostics for broken documents.
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

function isTelescopeOwned(diag: vscode.Diagnostic): boolean {
	const source = (diag.source ?? "").toLowerCase();
	return source.includes("telescope") || diagCode(diag) === "oas3-schema";
}

async function assertMalformedDocumentStaysEditorOwned(
	relativePath: string,
	contents: string,
	expectedLanguageId: string,
): Promise<void> {
	const uri = await writeWorkspaceFile(relativePath, contents);
	try {
		await openAndShow(uri);
		await waitForLanguageId(uri, expectedLanguageId, { timeoutMs: 30000 });

		try {
			await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 15000 });
		} catch {
			// Some hosts may surface malformed-document feedback slowly or not at all.
			// The contract under test is only that Telescope does not add its own.
		}

		const diagnostics = vscode.languages.getDiagnostics(uri);
		const telescopeDiags = diagnostics.filter(isTelescopeOwned);
		assert.strictEqual(
			telescopeDiags.length,
			0,
			`Malformed documents should remain editor-owned. Got Telescope diagnostics: ${telescopeDiags.map((d) => `${diagCode(d)}:${d.message}`).join(" | ")}`,
		);
	} finally {
		await deleteWorkspaceFile(relativePath);
	}
}

suite("Malformed Documents", () => {
	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await ensureSingleRootWorkspaceReady();
	});

	test("Malformed YAML does not produce Telescope-owned syntax diagnostics", async () => {
		if (isMultiRootWorkspace()) return;
		await assertMalformedDocumentStaysEditorOwned(
			`malformed-openapi-${Date.now()}.yaml`,
			[
				'openapi: "3.1.0"',
				"info:",
				"  title: Broken YAML",
				'  version: "1.0.0"',
				"paths:",
				"  /test:",
				"    get:",
				"      responses:",
				'        "200":',
				"          description: OK",
				"components:",
				"  schemas: [",
				"",
			].join("\n"),
			"openapi-yaml",
		);
	});

	test("Malformed JSON does not produce Telescope-owned syntax diagnostics", async () => {
		if (isMultiRootWorkspace()) return;
		await assertMalformedDocumentStaysEditorOwned(
			`malformed-openapi-${Date.now()}.json`,
			'{"openapi":"3.1.0","info":{"title":"Broken JSON","version":"1.0.0"},"paths":{"/test":{"get":{"responses":{"200":{"description":"OK"}}}}},"components":',
			"openapi-json",
		);
	});
});
