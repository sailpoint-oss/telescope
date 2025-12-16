import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";

import { DocumentCache } from "../../src/lsp/document-cache.js";
import { TelescopeContext } from "../../src/lsp/context.js";
import { __testProvideSpecLinkHover } from "../../src/lsp/handlers/hover.js";

function makeCtx(): TelescopeContext {
	const fakeConnection = {
		console: {
			log: () => {},
			error: () => {},
			warn: () => {},
		},
	} as unknown as Parameters<typeof TelescopeContext>[0];
	return new TelescopeContext(fakeConnection);
}

test("hover spec link: YAML operation key lands on Operation Object", () => {
	const yamlText = [
		'openapi: "3.1.0"',
		"info:",
		"  title: Test API",
		'  version: "1.0.0"',
		"paths:",
		"  /users:",
		"    get:",
		"      operationId: getUsers",
		"      responses:",
		"        \"200\":",
		"          description: ok",
	].join("\n");

	const doc = TextDocument.create("file:///test.yaml", "yaml", 1, yamlText);
	const ctx = makeCtx();
	const cache = new DocumentCache(ctx);
	const cached = cache.get(doc);

	// Hover on the `operationId` key
	const hover = __testProvideSpecLinkHover(
		cached,
		{ line: 7, character: 8 },
		cache,
	);
	expect(hover?.contents).toBeDefined();
	const md =
		typeof hover?.contents === "object" && hover?.contents && "value" in hover.contents
			? String((hover.contents as any).value)
			: "";
	expect(md).toContain("**Spec**:");
	expect(md).toContain("#operation-object");
});

test("hover spec link: YAML x- extension key lands on Specification Extensions", () => {
	const yamlText = [
		'openapi: "3.1.0"',
		"info:",
		"  title: Test API",
		'  version: "1.0.0"',
		"x-foo: true",
		"paths: {}",
	].join("\n");

	const doc = TextDocument.create("file:///test.yaml", "yaml", 1, yamlText);
	const ctx = makeCtx();
	const cache = new DocumentCache(ctx);
	const cached = cache.get(doc);

	const hover = __testProvideSpecLinkHover(cached, { line: 4, character: 2 }, cache);
	const md =
		typeof hover?.contents === "object" && hover?.contents && "value" in hover.contents
			? String((hover.contents as any).value)
			: "";
	expect(md).toContain("#specification-extensions");
});

test("hover spec link: JSON root key lands on OpenAPI Object / Paths Object", () => {
	const jsonText = JSON.stringify(
		{
			openapi: "3.1.0",
			info: { title: "Test API", version: "1.0.0" },
			paths: {},
		},
		null,
		2,
	);

	const doc = TextDocument.create("file:///test.json", "json", 1, jsonText);
	const ctx = makeCtx();
	const cache = new DocumentCache(ctx);
	const cached = cache.get(doc);

	// Hover on the "paths" key
	const lineIndex = jsonText.split("\n").findIndex((l) => l.includes('"paths"'));
	expect(lineIndex).toBeGreaterThanOrEqual(0);
	const char = (jsonText.split("\n")[lineIndex] ?? "").indexOf('"paths"') + 2;

	const hover = __testProvideSpecLinkHover(
		cached,
		{ line: lineIndex, character: char },
		cache,
	);
	const md =
		typeof hover?.contents === "object" && hover?.contents && "value" in hover.contents
			? String((hover.contents as any).value)
			: "";
	expect(md).toContain("**Spec**:");
	// Prefer #paths-object, but allow root fallback depending on mapping
	expect(md.includes("#paths-object") || md.includes("#openapi-object")).toBe(true);
});

test("hover spec link: Swagger 2.0 key uses swagger.io base URL", () => {
	const yamlText = [
		'swagger: "2.0"',
		"info:",
		"  title: Test API",
		'  version: "1.0.0"',
		"paths: {}",
	].join("\n");

	const doc = TextDocument.create("file:///swagger.yaml", "yaml", 1, yamlText);
	const ctx = makeCtx();
	const cache = new DocumentCache(ctx);
	const cached = cache.get(doc);

	// Hover on the `paths` key
	const hover = __testProvideSpecLinkHover(cached, { line: 4, character: 2 }, cache);
	const md =
		typeof hover?.contents === "object" && hover?.contents && "value" in hover.contents
			? String((hover.contents as any).value)
			: "";
	expect(md).toContain("swagger.io/specification/v2");
});


