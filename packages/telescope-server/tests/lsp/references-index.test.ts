import { expect, test } from "bun:test";
import { pathToFileURL } from "node:url";
import { DocumentTypeCache } from "../../src/engine/context/document-cache.js";
import { MemoryFileSystem } from "../../src/engine/utils/file-system-utils.js";
import { ReferencesIndex } from "../../src/lsp/services/references-index.js";

test("ReferencesIndex finds inbound refs by file and by pointer", async () => {
	const fs = new MemoryFileSystem();
	const cache = new DocumentTypeCache();

	const rootUri = pathToFileURL("/workspace/api.yaml").toString();
	const otherUri = pathToFileURL("/workspace/other.yaml").toString();

	// Root contains a schema and references it internally
	fs.addFile(
		rootUri,
		[
			"openapi: 3.1.0",
			"info:",
			"  title: Test",
			"  version: 1.0.0",
			"components:",
			"  schemas:",
			"    User:",
			"      type: object",
			"      properties:",
			"        id:",
			"          type: string",
			"paths:",
			"  /users:",
			"    get:",
			"      responses:",
			"        '200':",
			"          description: ok",
			"          content:",
			"            application/json:",
			"              schema:",
			`                $ref: "#/components/schemas/User"`,
			"",
		].join("\n"),
	);

	// Another file references root's schema externally
	fs.addFile(
		otherUri,
		[
			"openapi: 3.1.0",
			"info:",
			"  title: Other",
			"  version: 1.0.0",
			"paths:",
			"  /x:",
			"    get:",
			"      responses:",
			"        '200':",
			"          description: ok",
			"          content:",
			"            application/json:",
			"              schema:",
			`                $ref: "${rootUri}#/components/schemas/User"`,
			"",
		].join("\n"),
	);

	const index = new ReferencesIndex(fs, cache, () => [rootUri, otherUri]);

	const inboundPtr = await index.getInboundRefsToPointer(
		rootUri,
		"/components/schemas/User",
	);
	expect(inboundPtr.locations.length).toBe(2);
	expect(inboundPtr.internalLocations.length).toBe(1);
	expect(inboundPtr.externalLocations.length).toBe(1);
	expect(inboundPtr.byFile.size).toBe(2);

	// Header counts should exclude self
	const inboundFileExternalOnly = await index.getInboundRefsWithOptions(
		rootUri,
		{
			excludeSelf: true,
		},
	);
	expect(inboundFileExternalOnly.locations.length).toBe(1);
	expect(inboundFileExternalOnly.byFile.size).toBe(1);
});
