/**
 * E2E Tests: Extension Activation and Server Startup
 */

import * as assert from "assert";
import * as vscode from "vscode";

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
		const extension = vscode.extensions.getExtension("sailpoint.telescope");
		assert.ok(extension, "Extension should be available");

		if (!extension.isActive) {
			await extension.activate();
		}

		const exports = extension.exports as {
			__telescopeTest?: {
				waitForSessionsRunning: (timeoutMs?: number) => Promise<void>;
				getSessionStates: () => Array<{ folder: string; state: string }>;
			};
		};

		const testAPI = exports.__telescopeTest;
		assert.ok(testAPI, "Test API should be available");

		// Wait for sessions to be running (with generous timeout for CI)
		await testAPI.waitForSessionsRunning(60000);

		// Verify session states
		const states = testAPI.getSessionStates();
		assert.ok(states.length > 0, "Should have at least one session");
		assert.ok(
			states.every((s) => s.state === "running"),
			`All sessions should be running. States: ${JSON.stringify(states)}`,
		);
	});
});

