import { describe, expect, test } from "bun:test";
import { pathToFileURL } from "node:url";

import { WorkspaceProject } from "../../src/lsp/workspace/workspace-project.js";
import { createDocumentProvider } from "../../src/lsp/services/document-provider.js";

describe("DocumentProvider", () => {
	test("loads unopened files from FS and supports pointer/loc mapping", async () => {
		// Make this test independent of the current working directory.
		const workspaceFolderUri = new URL("../../../../", import.meta.url).toString();
		const rootUri = new URL(
			"../../../../packages/test-files/openapi/api-minimal.yaml",
			import.meta.url,
		).toString();

		const project = new WorkspaceProject({ workspaceFolderUri });

		// Minimal stub: provider will take the FS path since get() returns undefined.
		const documents = {
			get: (_uri: string) => undefined,
		} as any;

		// DocumentCache is only used for open docs; for FS docs it won't be touched.
		const cache = {} as any;

		const provider = createDocumentProvider({ documents, cache, project });
		const doc = await provider.get(rootUri);
		expect(doc).not.toBeNull();
		if (!doc) return;

		expect(doc.kind).toBe("fs");

		const openapiRange = provider.pointerToRange(doc, "/openapi");
		expect(openapiRange).not.toBeNull();

		const node = provider.findNode(doc, "/info");
		expect(node).not.toBeNull();
		if (!node?.loc) return;

		const infoRange = provider.locToRange(doc, node.loc);
		expect(infoRange).not.toBeNull();

		const offset0 = provider.positionToOffset(doc, { line: 0, character: 0 });
		expect(offset0).toBe(0);
	});
});


