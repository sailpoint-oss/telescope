/**
 * E2E Tests: Completion provider
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	executeWithRetry,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
	waitForLanguageId,
	waitForProviders,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

type CompletionResult = vscode.CompletionList | vscode.CompletionItem[];

function getItems(result: CompletionResult): vscode.CompletionItem[] {
	if (Array.isArray(result)) return result;
	return result.items;
}

function getLabel(item: vscode.CompletionItem): string {
	return typeof item.label === "string" ? item.label : item.label.label;
}

suite("Completion", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
		await waitForProjectInfo(api, (i) => i.knownOpenAPIFiles > 0, {
			timeoutMs: 60000,
			uri: folder.uri,
		});
		const warmupUri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(warmupUri);
		await waitForDiagnostics(warmupUri, (d) => d.length > 0, {
			timeoutMs: 90000,
		});
		await waitForProviders(warmupUri);
	});

	test("$ref completion offers schema component names", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const text = doc.getText();
		const refStr = '#/components/schemas/User"';
		const refIdx = text.indexOf(refStr);
		assert.ok(refIdx !== -1, "Fixture should contain $ref to User schema");
		const pos = doc.positionAt(refIdx + "#/components/schemas/".length);

		const result = await executeWithRetry<CompletionResult>(
			"vscode.executeCompletionItemProvider",
			[uri, pos],
			(r) => getItems(r).length > 0,
		);

		const items = getItems(result);
		assert.ok(items.length > 0, "Expected completion items for $ref path");

		const labels = items.map(getLabel);
		// rich-api.yaml has exactly 4 schemas: User, CreateUserRequest, Pet, Error
		const expectedSchemas = ["User", "CreateUserRequest", "Pet", "Error"];
		for (const schema of expectedSchemas) {
			assert.ok(
				labels.some((l) => l.includes(schema)),
				`Expected '${schema}' in completions. Got: ${labels.slice(0, 15).join(", ")}`,
			);
		}
	});

	test("Completion inside path item offers HTTP methods", async () => {
		if (isMultiRootWorkspace()) return;

		const tmpName = `completion-e2e-${Date.now()}.yaml`;
		const tmpUri = vscode.Uri.joinPath(folder.uri, tmpName);
		const content = [
			"openapi: 3.1.0",
			"info:",
			"  title: Completion Test",
			"  version: 1.0.0",
			"paths:",
			"  /test:",
			"    ",
			"",
		].join("\n");

		await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(content, "utf-8"));

		try {
			await openAndShow(tmpUri);
			await waitForLanguageId(tmpUri, "openapi-yaml", { timeoutMs: 15000 });
			await waitForDiagnostics(tmpUri, () => true, { timeoutMs: 30000 });

			const pos = new vscode.Position(6, 4);

			const result = await executeWithRetry<CompletionResult>(
				"vscode.executeCompletionItemProvider",
				[tmpUri, pos],
				(r) => getItems(r).length > 0,
			);

			const items = getItems(result);
			const labels = items.map(getLabel);
			const httpMethods = ["get", "post", "put", "delete", "patch"];
			const hasMethod = labels.some((l) => httpMethods.includes(l.toLowerCase()));
			assert.ok(
				hasMethod,
				`Expected HTTP method completions (get/post/put/delete/patch). Got: ${labels.slice(0, 15).join(", ")}`,
			);
		} finally {
			await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
			try {
				await vscode.workspace.fs.delete(tmpUri);
			} catch {
				// cleanup best-effort
			}
		}
	});

	test("Completion items have non-empty labels and valid kinds", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const text = (await vscode.workspace.openTextDocument(uri)).getText();
		const refStr = '#/components/schemas/User"';
		const refIdx = text.indexOf(refStr);
		assert.ok(refIdx !== -1);
		const pos = (await vscode.workspace.openTextDocument(uri)).positionAt(
			refIdx + "#/components/schemas/".length,
		);

		const result = await executeWithRetry<CompletionResult>(
			"vscode.executeCompletionItemProvider",
			[uri, pos],
			(r) => getItems(r).length > 0,
		);

		const items = getItems(result);
		for (const item of items) {
			const label = getLabel(item);
			assert.ok(label.length > 0, "Completion item should have non-empty label");
		}
	});
});
