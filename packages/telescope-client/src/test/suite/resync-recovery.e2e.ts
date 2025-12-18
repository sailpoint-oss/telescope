/**
 * E2E Tests: Server-driven resync recovery
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

suite("Resync Recovery", () => {
	let api: ReturnType<typeof getTestApi> & {
		sendBadDeltaVersionOnce?: (uri?: vscode.Uri) => Promise<void>;
	};
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		api = getTestApi() as ReturnType<typeof getTestApi> & {
			sendBadDeltaVersionOnce?: (uri?: vscode.Uri) => Promise<void>;
		};
		await api.waitForSessionsRunning(60000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
	});

	test("Server should be able to request a resync and client should recover", async () => {
		if (isMultiRootWorkspace()) return;
		const valid = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		await openAndShow(valid);

		// Ensure baseline sync exists
		await waitForProjectInfo(api, (i) => i.hasClientFileList, { timeoutMs: 60000 });

		assert.ok(
			typeof api.sendBadDeltaVersionOnce === "function",
			"Test API should expose sendBadDeltaVersionOnce",
		);

		// Trigger server recovery path (server will request resync via custom request)
		await api.sendBadDeltaVersionOnce?.(valid);

		// After resync, project info should still be consistent and client list present.
		await waitForProjectInfo(
			api,
			(i) => i.hasClientFileList && i.knownOpenAPIFiles > 0,
			{ timeoutMs: 60000, uri: valid },
		);
	});
});


