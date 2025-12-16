import { describe, expect, test } from "bun:test";
import { pathToFileURL } from "node:url";

import {
	materializeRules,
	NodeFileSystem,
	resolveConfig,
} from "../../src/engine/index.js";
import { lintWorkspace } from "../../src/core/workspace-analyzer.js";

describe("WorkspaceAnalyzer", () => {
	test("can lint an explicit root and return stable counts", async () => {
		const workspacePath = process.cwd();
		const workspaceFolderUri = pathToFileURL(workspacePath).toString();

		const fs = new NodeFileSystem();
		const config = resolveConfig(workspacePath);
		const rules = (await materializeRules(config, workspacePath)).map((r) => r.rule);

		const rootUri = pathToFileURL(
			`${workspacePath}/packages/test-files/openapi/api-minimal.yaml`,
		).toString();

		const result = await lintWorkspace({
			workspaceFolderUri,
			workspacePath,
			fileSystem: fs,
			rules,
			roots: [rootUri],
		});

		expect(result.workspaceFolderUri).toBe(workspaceFolderUri);
		expect(result.roots).toEqual([rootUri]);
		expect(result.diagnostics.length).toBeGreaterThanOrEqual(0);
		expect(result.counts.error + result.counts.warning + result.counts.notice).toBe(
			result.diagnostics.length,
		);
		expect(typeof result.projectHash).toBe("string");
		expect(result.projectHash.length).toBe(16);
	});
});


