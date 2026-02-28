/**
 * E2E Tests: File create/change/remove triggers diagnostic updates
 *
 * Validates that creating, modifying, and deleting OpenAPI files
 * produces the expected diagnostic changes via standard LSP.
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
} from "./utils/e2e-helpers";

suite("File Change Diagnostics", () => {
	test("Create/change/remove should update diagnostics", async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(60000);

		const rel = `tmp-e2e/delta-${Date.now()}.yaml`;
		const folder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(folder, "Should have a workspace folder");
		const absPath = path.join(folder.uri.fsPath, ...rel.split("/"));
		await mkdir(path.dirname(absPath), { recursive: true });

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

		await openAndShow(createdUri);
		await waitForDiagnostics(createdUri, (d) => d.length > 0, { timeoutMs: 60000 });

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
		await waitForDiagnostics(createdUri, (d) => d.length === 0, { timeoutMs: 60000 });

		await rm(absPath, { force: true });
	});
});
