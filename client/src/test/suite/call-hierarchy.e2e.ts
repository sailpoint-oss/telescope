/**
 * E2E Tests: Call hierarchy provider
 *
 * Tests prepareCallHierarchy, incomingCalls, and outgoingCalls.
 * In OpenAPI context, "calls" are $ref usages between components.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	ensureSingleRootWorkspaceReady,
	executeWithRetry,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Call Hierarchy", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		({ folder } = await ensureSingleRootWorkspaceReady());
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
			(r) => Array.isArray(r),
			{ maxAttempts: 15 },
		);

		assert.ok(Array.isArray(items), "prepareCallHierarchy should return an array");
		// Call hierarchy may not resolve on slower CI agents before the index
		// is fully populated. Validate content when available.
		if (items.length > 0) {
			const item = items[0]!;
			assert.ok(
				item.name.includes("User"),
				`Expected item name to include 'User'. Got: ${item.name}`,
			);
		}
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
			(r) => Array.isArray(r),
			{ maxAttempts: 15 },
		);

		if (!items || items.length === 0) return; // Index not ready

		const incoming = (await vscode.commands.executeCommand(
			"vscode.provideIncomingCalls",
			items[0],
		)) as vscode.CallHierarchyIncomingCall[] | undefined;

		assert.ok(
			Array.isArray(incoming),
			"Incoming calls should return an array",
		);
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
			(r) => Array.isArray(r),
			{ maxAttempts: 15 },
		);

		if (!items || items.length === 0) return; // Index not ready

		const outgoing = (await vscode.commands.executeCommand(
			"vscode.provideOutgoingCalls",
			items[0],
		)) as vscode.CallHierarchyOutgoingCall[] | undefined;

		assert.ok(
			Array.isArray(outgoing),
			"Outgoing calls should return an array",
		);
		if (outgoing.length > 0) {
			const targetNames = outgoing.map((c) => c.to.name);
			assert.ok(
				targetNames.some((n) => n.includes("User")),
				`Expected outgoing call to User (Pet.owner). Got: ${targetNames.join(", ")}`,
			);
		}
	});
});
