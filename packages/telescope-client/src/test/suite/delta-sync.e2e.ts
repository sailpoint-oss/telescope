/**
 * E2E Tests: Delta sync (create/change/remove)
 */

import * as assert from "assert";
import { mkdir, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
	activateExtension,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

suite("Delta Sync", () => {
	test("Create/change/remove should update server project model", async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(60000);

		const clientCount0 = (api as any).getClientOpenApiFileCount?.() as number | undefined;
		if (typeof clientCount0 === "number") {
			console.log(`[delta-sync] baseline clientOpenApi=${clientCount0}`);
		}

		const baseline = await waitForProjectInfo(api, (i) => i.hasClientFileList, {
			timeoutMs: 60000,
		});
		const baselineCount = baseline.knownOpenAPIFiles;
		console.log(`[delta-sync] baseline serverKnown=${baselineCount}`);

		const rel = `tmp-e2e/delta-${Date.now()}.yaml`;
		const folder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(folder, "Should have a workspace folder");
		const absPath = path.join(folder.uri.fsPath, ...rel.split("/"));
		await mkdir(path.dirname(absPath), { recursive: true });

		// Create: valid OpenAPI root
		console.log("[delta-sync] writing file");
		await writeFile(
			absPath,
			[
				"openapi: 3.1.0",
				"info:",
				"  title: Delta",
				"  version: 1.0.0",
				"paths: {}",
				"",
			].join("\n"),
			"utf-8",
		);
		const createdUri = vscode.Uri.file(absPath);
		console.log(`[delta-sync] wrote file ${createdUri.toString()}`);

		// Open the created document to ensure VS Code requests diagnostics.
		await openAndShow(createdUri);

		// If deltas worked, the server should treat this as OpenAPI and produce diagnostics (rule set may vary).
		await waitForDiagnostics(createdUri, (d) => d.length > 0, { timeoutMs: 60000 });

		// Change: still OpenAPI (membership should stay the same)
		await writeFile(
			absPath,
			[
				"openapi: 3.1.0",
				"info:",
				"  title: Delta Changed",
				"  version: 1.0.1",
				"paths:",
				"  /ping:",
				"    get:",
				"      operationId: ping",
				"      responses:",
				"        '200':",
				"          description: ok",
				"",
			].join("\n"),
			"utf-8",
		);
		await waitForDiagnostics(createdUri, (d) => d.length > 0, { timeoutMs: 60000 });

		// Change: remove root key -> no longer OpenAPI (membership should decrement)
		await writeFile(
			absPath,
			[
				"notOpenApi: true",
				"info:",
				"  title: Not OpenAPI",
				"",
			].join("\n"),
			"utf-8",
		);
		// After removing the OpenAPI root key, diagnostics should eventually clear.
		await waitForDiagnostics(createdUri, (d) => d.length === 0, { timeoutMs: 60000 });

		// Delete should not crash.
		await rm(absPath, { force: true });
	});
});


