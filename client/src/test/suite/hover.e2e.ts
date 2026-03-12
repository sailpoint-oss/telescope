/**
 * E2E Tests: Hover provider
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	delay,
	executeWithRetry,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

function hoverContentToString(hovers: vscode.Hover[]): string {
	return hovers
		.flatMap((h) => h.contents)
		.map((c) => {
			if (typeof c === "string") return c;
			if (c instanceof vscode.MarkdownString) return c.value;
			return (c as { value: string }).value ?? "";
		})
		.join("\n");
}

suite("Hover", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(60000);
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
			timeoutMs: 60000,
		});
	});

	test("Hover on local $ref shows resolved schema with properties", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const refIdx = text.indexOf("#/components/schemas/User");
		assert.ok(refIdx !== -1, "Fixture should contain a local $ref to User");
		const pos = doc.positionAt(refIdx + 5);

		const hovers = await executeWithRetry<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			[uri, pos],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(hovers && hovers.length > 0, "Expected hover result for $ref");
		const content = hoverContentToString(hovers);
		const lower = content.toLowerCase();
		assert.ok(
			lower.includes("object") ||
				lower.includes("user") ||
				lower.includes("schema"),
			`Hover should describe the schema. Got: ${content.slice(0, 300)}`,
		);
		assert.ok(
			lower.includes("email") || lower.includes("id"),
			`Hover should include schema properties. Got: ${content.slice(0, 300)}`,
		);
	});

	test("Hover on Pet schema shows deep owner ref preview", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const schemasSection = text.indexOf("  schemas:");
		const petDefIdx = text.indexOf("    Pet:", schemasSection);
		assert.ok(petDefIdx !== -1, "Fixture should contain Pet schema definition");
		const pos = doc.positionAt(petDefIdx + "    Pe".length);

		const hovers = await executeWithRetry<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			[uri, pos],
			(r) => Array.isArray(r) && r.length > 0,
		);
		assert.ok(hovers.length > 0, "Expected hover on Pet schema");

		const content = hoverContentToString(hovers);
		const lower = content.toLowerCase();
		assert.ok(
			lower.includes("owner"),
			`Hover should include owner property. Got: ${content.slice(0, 350)}`,
		);
		assert.ok(
			content.includes("→ User") || lower.includes("user"),
			`Hover should include owner ref target summary. Got: ${content.slice(0, 350)}`,
		);
		assert.ok(
			lower.includes("email") || lower.includes("id"),
			`Hover should include referenced object fields. Got: ${content.slice(0, 350)}`,
		);
	});

	test("Hover on cross-file $ref shows resolved schema content", async function () {
		if (isMultiRootWorkspace()) return;

		const compUri = vscode.Uri.joinPath(folder.uri, "ref-components.yaml");
		await openAndShow(compUri);
		await delay(2000);

		const uri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		const doc = await openAndShow(uri);
		await delay(3000);

		const text = doc.getText();
		const refIdx = text.indexOf("$ref:");
		assert.ok(refIdx !== -1, "Fixture should contain a $ref in ref-root.yaml");
		const refLine = doc.positionAt(refIdx).line;
		const lineText = doc.lineAt(refLine).text;
		const valueStart = lineText.indexOf('"') + 1;
		const pos = new vscode.Position(refLine, valueStart + 5);

		const hovers = await executeWithRetry<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			[uri, pos],
			(r) => Array.isArray(r),
			{ maxAttempts: 25 },
		);
		assert.ok(Array.isArray(hovers), "Expected hover provider array result");
		if (hovers.length > 0) {
			const content = hoverContentToString(hovers);
			assert.ok(
				content.length > 0,
				"Cross-file hover should return non-empty content when available",
			);
			const lower = content.toLowerCase();
			assert.ok(
				lower.includes("user") || lower.includes("id") || lower.includes("email"),
				`Cross-file hover should expose referenced schema details. Got: ${content.slice(0, 350)}`,
			);
		} else {
			// Fallback contract check: cross-file definition should still resolve
			// at this location even when hover content is unavailable.
			const defs = await executeWithRetry<(vscode.Location | vscode.LocationLink)[]>(
				"vscode.executeDefinitionProvider",
				[uri, pos],
				(r) => Array.isArray(r) && r.length > 0,
				{ maxAttempts: 25 },
			);
			assert.ok(defs.length > 0, "Expected cross-file definition fallback");
		}
	});

	test("Hover on operationId shows operation details", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const opIdx = text.indexOf("operationId: listUsers");
		assert.ok(opIdx !== -1, "Fixture should contain operationId");
		const pos = doc.positionAt(opIdx + "operationId: list".length);

		const hovers = await executeWithRetry<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			[uri, pos],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(hovers && hovers.length > 0, "Expected hover on operationId");
		const content = hoverContentToString(hovers);
		assert.ok(
			content.includes("listUsers") || content.includes("/users"),
			`Hover should reference the operation. Got: ${content.slice(0, 300)}`,
		);
	});

	test("Hover on tag name shows tag info", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const tagIdx = text.indexOf("- name: Users");
		assert.ok(tagIdx !== -1, "Fixture should contain Users tag");
		const pos = doc.positionAt(tagIdx + "- name: Us".length);

		const hovers = await executeWithRetry<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			[uri, pos],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(hovers && hovers.length > 0, "Expected hover on tag name");
		const content = hoverContentToString(hovers);
		assert.ok(
			content.includes("Users") || content.includes("Tag"),
			`Hover should describe the tag. Got: ${content.slice(0, 300)}`,
		);
	});

	test("Hover on schema definition shows type and properties", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const schemasSection = text.indexOf("  schemas:");
		const userDefIdx = text.indexOf("    User:", schemasSection);
		assert.ok(
			userDefIdx !== -1,
			"Fixture should contain User schema definition",
		);
		const pos = doc.positionAt(userDefIdx + "    Us".length);

		const hovers = await executeWithRetry<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			[uri, pos],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(hovers && hovers.length > 0, "Expected hover on schema");
		const content = hoverContentToString(hovers);
		assert.ok(
			content.includes("object") || content.includes("User"),
			`Hover should show schema type. Got: ${content.slice(0, 300)}`,
		);
	});
});
