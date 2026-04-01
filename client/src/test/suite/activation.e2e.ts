/**
 * E2E Tests: Extension Activation and Server Startup
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { activateExtension, getTestApi, isMultiRootWorkspace } from "./utils/e2e-helpers";

suite("Extension Activation", () => {
	test("Extension should activate", async () => {
		const extension = vscode.extensions.getExtension("sailpoint.telescope");
		assert.ok(extension, "Extension should be available");

		if (!extension.isActive) {
			await extension.activate();
		}

		assert.ok(extension.isActive, "Extension should be active");
	});

	test("Extension should expose test API", async () => {
		const extension = vscode.extensions.getExtension("sailpoint.telescope");
		assert.ok(extension, "Extension should be available");

		if (!extension.isActive) {
			await extension.activate();
		}

		const exports = extension.exports as {
			__telescopeTest?: {
				waitForSessionsRunning: (timeoutMs?: number) => Promise<void>;
				getSessionStates: () => Array<{ folder: string; state: string }>;
				getProjectInfo: (uri?: vscode.Uri) => Promise<unknown>;
			};
		};

		assert.ok(exports.__telescopeTest, "Test API should be exposed");
		assert.ok(
			typeof exports.__telescopeTest.waitForSessionsRunning === "function",
			"waitForSessionsRunning should be a function",
		);
		assert.ok(
			typeof exports.__telescopeTest.getSessionStates === "function",
			"getSessionStates should be a function",
		);
		assert.ok(
			typeof exports.__telescopeTest.getProjectInfo === "function",
			"getProjectInfo should be a function",
		);
	});

	test("Sessions should start running", async () => {
		await activateExtension();
		const testAPI = getTestApi();

		// Multi-root workspace launches can be slower to materialize folders in test-electron.
		const timeout = isMultiRootWorkspace() ? 180000 : 120000;
		await testAPI.waitForSessionsRunning(timeout);

		// Verify session states
		const states = testAPI.getSessionStates();
		assert.ok(states.length > 0, "Should have at least one session");
		assert.ok(
			states.every((s) => s.state === "running"),
			`All sessions should be running. States: ${JSON.stringify(states)}`,
		);
	});
	test("Sessions recover state after manual restart", async () => {
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);

		const statesBefore = api.getSessionStates();
		assert.ok(
			statesBefore.every((s) => s.state === "running"),
			`All sessions should be running before restart. States: ${JSON.stringify(statesBefore)}`,
		);

		// Trigger manual restart (exercises the restart + crash recovery reset path)
		await vscode.commands.executeCommand("telescope.restartServer");
		await api.waitForSessionsRunning(120000);

		const statesAfter = api.getSessionStates();
		assert.ok(statesAfter.length > 0, "Should have sessions after restart");
		assert.ok(
			statesAfter.every((s) => s.state === "running"),
			`All sessions should be running after restart. States: ${JSON.stringify(statesAfter)}`,
		);
	});
});

