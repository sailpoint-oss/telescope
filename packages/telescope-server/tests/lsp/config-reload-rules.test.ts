import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";

import { TelescopeContext } from "../../src/lsp/context.js";

function createFakeConnection(): Connection {
	// Minimal subset used by TelescopeContext: connection.console.{log,warn,error}
	return {
		console: {
			log: () => {},
			warn: () => {},
			error: () => {},
		},
		// biome-ignore lint/suspicious/noExplicitAny: test double
	} as any as Connection;
}

describe("Config reload toggles SailPoint rules", () => {
	it("openapi.sailpoint true/false changes resolved rule ids", async () => {
		const dir = mkdtempSync(join(tmpdir(), "telescope-config-test-"));
		mkdirSync(join(dir, ".telescope"), { recursive: true });

		const configPath = join(dir, ".telescope", "config.yaml");
		const wsUri = URI.file(dir).toString();

		const writeConfig = (enabled: boolean) => {
			writeFileSync(
				configPath,
				`openapi:\n  sailpoint: ${enabled ? "true" : "false"}\n`,
				"utf8",
			);
		};

		const conn = createFakeConnection();
		const ctx = new TelescopeContext(conn);

		writeConfig(true);
		ctx.initialize({
			capabilities: {},
			initializationOptions: { workspaceFolder: wsUri },
			// biome-ignore lint/suspicious/noExplicitAny: test double
		} as any);
		await ctx.rulesLoadPromise;

		const enabledIds = ctx.getRules().map((r) => r.meta.id);
		expect(enabledIds).toContain("root-sailpoint-api");

		writeConfig(false);
		const changed = ctx.reloadConfiguration();
		expect(changed).toBe(true);
		await ctx.rulesLoadPromise;

		const disabledIds = ctx.getRules().map((r) => r.meta.id);
		expect(disabledIds).not.toContain("root-sailpoint-api");
	});
});


