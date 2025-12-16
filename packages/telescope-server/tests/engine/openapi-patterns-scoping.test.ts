import { describe, expect, it } from "bun:test";
import { pathToFileURL } from "node:url";
import { discoverWorkspaceRoots } from "../../src/engine/context/root-discovery.js";
import { DocumentTypeCache } from "../../src/engine/context/document-cache.js";
import { MemoryFileSystem } from "../../src/engine/utils/file-system-utils.js";

describe("OpenAPI patterns scoping (engine)", () => {
	it("discoverWorkspaceRoots respects include + !exclude patterns", async () => {
		const fs = new MemoryFileSystem();
		const cache = new DocumentTypeCache();

		const workspace = pathToFileURL("/workspace").toString();
		const inScopeRoot = pathToFileURL("/workspace/apis/api.yaml").toString();
		const excludedRoot = pathToFileURL("/workspace/apis/fixtures/api.yaml").toString();
		const outOfScopeRoot = pathToFileURL("/workspace/other/api.yaml").toString();

		fs.addFile(
			inScopeRoot,
			`openapi: 3.1.0
info:
  title: In Scope
  version: 1.0.0
paths: {}
`,
		);
		fs.addFile(
			excludedRoot,
			`openapi: 3.1.0
info:
  title: Excluded
  version: 1.0.0
paths: {}
`,
		);
		fs.addFile(
			outOfScopeRoot,
			`openapi: 3.1.0
info:
  title: Out of Scope
  version: 1.0.0
paths: {}
`,
		);

		const patterns = ["apis/**", "!apis/**/fixtures/**"];
		const roots = await discoverWorkspaceRoots([workspace], fs, cache, patterns);

		expect(roots).toContain(inScopeRoot);
		expect(roots).not.toContain(excludedRoot);
		expect(roots).not.toContain(outOfScopeRoot);
	});
});


