import { describe, expect, it } from "bun:test";
import { pathToFileURL } from "node:url";
import { URI } from "vscode-uri";
import { matchesPattern } from "../../src/engine/pattern-matcher.js";
import { MemoryFileSystem } from "../../src/engine/utils/file-system-utils.js";
import { __testShouldAllowHoverForUri } from "../../src/lsp/handlers/hover.js";
import { WorkspaceProject } from "../../src/lsp/workspace/workspace-project.js";

describe("hover scoping", () => {
	it("returns false for out-of-scope standalone docs (no hover)", async () => {
		const fs = new MemoryFileSystem();
		const workspaceFolderUri = pathToFileURL("/workspace").toString();
		const project = new WorkspaceProject({ workspaceFolderUri, fileSystem: fs });
		project.setOpenApiPatterns(["apis/**/*.yaml"]);

		const uri = pathToFileURL("/workspace/other/not-api.yaml").toString();
		fs.addFile(uri, "foo: bar\n");

		const workspaceRootFsPath = URI.parse(workspaceFolderUri).fsPath;
		const ctx = {
			isOpenApiInScope: (u: string) =>
				matchesPattern(u, ["apis/**/*.yaml"], [workspaceRootFsPath]),
		};

		expect(await __testShouldAllowHoverForUri(uri, ctx, project)).toBe(false);
	});

	it("returns true for out-of-scope fragments referenced from an in-scope root", async () => {
		const fs = new MemoryFileSystem();
		const workspaceFolderUri = pathToFileURL("/workspace").toString();
		const project = new WorkspaceProject({ workspaceFolderUri, fileSystem: fs });
		project.setOpenApiPatterns(["apis/**/*.yaml"]);

		const rootUri = pathToFileURL("/workspace/apis/api.yaml").toString();
		const fragmentUri = pathToFileURL("/workspace/other/user.yaml").toString();

		fs.addFile(
			rootUri,
			[
				"openapi: 3.1.0",
				"info:",
				"  title: X",
				"  version: 1.0.0",
				"paths:",
				"  /users:",
				"    get:",
				"      responses:",
				"        '200':",
				"          description: ok",
				"          content:",
				"            application/json:",
				"              schema:",
				"                $ref: ../other/user.yaml",
				"",
			].join("\n"),
		);

		fs.addFile(fragmentUri, "type: object\nproperties:\n  id:\n    type: string\n");

		const workspaceRootFsPath = URI.parse(workspaceFolderUri).fsPath;
		const ctx = {
			isOpenApiInScope: (u: string) =>
				matchesPattern(u, ["apis/**/*.yaml"], [workspaceRootFsPath]),
		};

		expect(await __testShouldAllowHoverForUri(fragmentUri, ctx, project)).toBe(true);
	});
});


