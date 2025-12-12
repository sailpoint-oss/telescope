import { expect, test } from "bun:test";
import { pathToFileURL } from "node:url";

import { MemoryFileSystem } from "../../src/engine/utils/file-system-utils.js";
import { WorkspaceProject } from "../../src/lsp/workspace/workspace-project.js";

test("WorkspaceProject derives root URIs from client candidate list", async () => {
	const fs = new MemoryFileSystem();

	const rootUri = pathToFileURL("/workspace/api.yaml").toString();
	const partialUri = pathToFileURL("/workspace/schemas/User.yaml").toString();

	fs.addFile(
		rootUri,
		[
			"openapi: 3.1.0",
			"info:",
			"  title: Test",
			"  version: 1.0.0",
			"paths: {}",
			"",
		].join("\n"),
	);

	// A non-root OpenAPI-ish fragment (should not be treated as a root entrypoint)
	fs.addFile(
		partialUri,
		["type: object", "properties:", "  id:", "    type: string", ""].join("\n"),
	);

	const project = new WorkspaceProject({
		workspaceFolderUri: pathToFileURL("/workspace").toString(),
		fileSystem: fs,
	});

	project.setCandidateOpenApiFiles([partialUri, rootUri]);

	const roots = await project.getRootUris();
	expect(roots).toEqual([rootUri]);
});
