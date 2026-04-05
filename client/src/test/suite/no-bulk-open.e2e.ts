/**
 * E2E Tests: No bulk open regression
 *
 * Ensures startup scanning does NOT open every discovered file just to classify language IDs.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	getTestApi,
	isMultiRootWorkspace,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

suite("No Bulk Open", () => {
	let api: ReturnType<typeof getTestApi>;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		api = getTestApi();
		await api.waitForSessionsRunning(120000);
	});

	test("Startup scan should not open all discovered OpenAPI files", async () => {
		if (isMultiRootWorkspace()) return;
		const before = vscode.workspace.textDocuments.length;

		await waitForProjectInfo(api, (info) => info.knownOpenAPIFiles > 0, {
			timeoutMs: 60000,
		});

		const after = vscode.workspace.textDocuments.length;

		// Expectation: we do NOT open the entire repo; only already-open docs + docs opened by tests.
		// Allow a small delta for VS Code internals.
		const delta = after - before;
		assert.ok(
			delta <= 2,
			`Expected textDocuments to remain stable (no bulk open). Before=${before}, After=${after}, Delta=${delta}`,
		);
	});
});


