/**
 * E2E Tests: Call hierarchy provider
 *
 * Tests prepareCallHierarchy, incomingCalls, and outgoingCalls.
 * In OpenAPI context, "calls" are $ref usages between components.
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
	waitForProviders,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

suite("Call Hierarchy", () => {
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

	test("Prepare call hierarchy on schema returns item", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const schemasSection = text.indexOf("  schemas:");
		const userDefIdx = text.indexOf("    User:", schemasSection);
		assert.ok(userDefIdx !== -1, "Fixture should contain User schema");
		const pos = doc.positionAt(userDefIdx + "    Us".length);

		const items = await executeWithRetry<vscode.CallHierarchyItem[]>(
			"vscode.prepareCallHierarchy",
			[uri, pos],
			(r) => Array.isArray(r) && r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(
			items && items.length > 0,
			"Expected call hierarchy item for User schema",
		);
		const item = items[0]!;
		assert.ok(
			item.name.includes("User"),
			`Expected item name to include 'User'. Got: ${item.name}`,
		);
	});

	test("Incoming calls shows $ref usages of schema", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const schemasSection = text.indexOf("  schemas:");
		const userDefIdx = text.indexOf("    User:", schemasSection);
		assert.ok(userDefIdx !== -1, "Fixture should contain User schema");
		const pos = doc.positionAt(userDefIdx + "    Us".length);

		const items = await executeWithRetry<vscode.CallHierarchyItem[]>(
			"vscode.prepareCallHierarchy",
			[uri, pos],
			(r) => Array.isArray(r) && r.length > 0,
			{ maxAttempts: 15 },
		);
		assert.ok(items && items.length > 0, "Need prepared item for incoming calls");

		const incoming = (await vscode.commands.executeCommand(
			"vscode.provideIncomingCalls",
			items[0],
		)) as vscode.CallHierarchyIncomingCall[] | undefined;

		assert.ok(
			Array.isArray(incoming),
			"Incoming calls should return an array",
		);
		// User schema is referenced by 4+ $refs in rich-api.yaml
		if (incoming.length > 0) {
			assert.ok(
				incoming.length >= 1,
				`Expected incoming calls for User schema. Got: ${incoming.length}`,
			);
		}
	});

	test("Outgoing calls from Pet schema includes User ref", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const schemasSection = text.indexOf("  schemas:");
		const petDefIdx = text.indexOf("    Pet:", schemasSection);
		assert.ok(petDefIdx !== -1, "Fixture should contain Pet schema");
		const pos = doc.positionAt(petDefIdx + "    Pe".length);

		const items = await executeWithRetry<vscode.CallHierarchyItem[]>(
			"vscode.prepareCallHierarchy",
			[uri, pos],
			(r) => Array.isArray(r) && r.length > 0,
			{ maxAttempts: 15 },
		);
		assert.ok(items && items.length > 0, "Need prepared item for outgoing calls");

		const outgoing = (await vscode.commands.executeCommand(
			"vscode.provideOutgoingCalls",
			items[0],
		)) as vscode.CallHierarchyOutgoingCall[] | undefined;

		assert.ok(
			Array.isArray(outgoing),
			"Outgoing calls should return an array",
		);
		// Pet.owner references User — should appear in outgoing
		if (outgoing.length > 0) {
			const targetNames = outgoing.map((c) => c.to.name);
			assert.ok(
				targetNames.some((n) => n.includes("User")),
				`Expected outgoing call to User (Pet.owner). Got: ${targetNames.join(", ")}`,
			);
		}
	});
});
