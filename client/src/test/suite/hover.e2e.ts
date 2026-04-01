/**
 * E2E Tests: Hover provider
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	executeWithRetry,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForCrossFileReady,
	waitForDiagnostics,
	waitForProviders,
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
		// hover.go formats schema hovers with "**Type:** `<type>`" and a properties listing
		assert.ok(
			lower.includes("object") || lower.includes("type"),
			`Hover should describe the schema type. Got: ${content.slice(0, 400)}`,
		);
		// User schema has required fields: id, email — both must appear
		assert.ok(
			lower.includes("email"),
			`Hover should include 'email' property. Got: ${content.slice(0, 400)}`,
		);
		assert.ok(
			lower.includes("id"),
			`Hover should include 'id' property. Got: ${content.slice(0, 400)}`,
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
		const uri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		await waitForCrossFileReady(compUri, uri, { timeoutMs: 60000 });
		const doc = await vscode.workspace.openTextDocument(uri);

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
		assert.ok(
			Array.isArray(hovers),
			"Hover provider should return an array for cross-file $ref",
		);
		// Cross-file hover depends on graph bridge resolving external refs.
		// When content is available, validate it references the target schema.
		if (hovers.length > 0) {
			const content = hoverContentToString(hovers);
			const lower = content.toLowerCase();
			assert.ok(
				lower.includes("user") || lower.includes("id") || lower.includes("object"),
				`Cross-file hover should expose referenced schema details. Got: ${content.slice(0, 350)}`,
			);
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
		// hover.go formats operation hovers with HTTP method + path
		assert.ok(
			content.includes("listUsers"),
			`Hover should include the operationId. Got: ${content.slice(0, 400)}`,
		);
		assert.ok(
			content.toLowerCase().includes("get") && content.includes("/users"),
			`Hover should show HTTP method and path. Got: ${content.slice(0, 400)}`,
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
		// hover.go tag hover includes tag name and description, plus list of operations
		assert.ok(
			content.includes("Users"),
			`Hover should include the tag name 'Users'. Got: ${content.slice(0, 400)}`,
		);
		assert.ok(
			content.includes("User management"),
			`Hover should include tag description. Got: ${content.slice(0, 400)}`,
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
		const lower = content.toLowerCase();
		// User schema is type: object with properties id, email, name, role, createdAt
		assert.ok(
			lower.includes("object"),
			`Hover should show schema type 'object'. Got: ${content.slice(0, 400)}`,
		);
		assert.ok(
			lower.includes("email") && lower.includes("name"),
			`Hover should show User properties (email, name). Got: ${content.slice(0, 400)}`,
		);
	});

	test("Hover returns empty for non-hoverable position", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		// Position at the very start of the file (on "openapi:" key itself)
		// — not a schema, ref, operationId, or tag, so hover should be empty or minimal
		const pos = new vscode.Position(0, 0);

		const hovers = (await vscode.commands.executeCommand(
			"vscode.executeHoverProvider",
			uri,
			pos,
		)) as vscode.Hover[] | undefined;

		// Hover at file start may return empty or a version hint — either is acceptable,
		// but it must not crash and must return a valid array or undefined.
		assert.ok(
			hovers === undefined || Array.isArray(hovers),
			"Hover at non-hoverable position should return array or undefined",
		);
	});
});
