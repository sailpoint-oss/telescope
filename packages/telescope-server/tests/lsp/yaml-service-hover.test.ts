import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";

import { DocumentCache } from "../../src/lsp/document-cache.js";
import { TelescopeContext } from "../../src/lsp/context.js";
import { getYAMLService } from "../../src/lsp/services/yaml-service.js";

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

test("YAML service hover uses telescope schemas (OpenAPI descriptions appear)", async () => {
	const yamlText = [
		'openapi: "3.1.0"',
		"info:",
		"  title: Test API",
		'  version: "1.0.0"',
		"paths: {}",
	].join("\n");

	const doc = TextDocument.create("file:///test.yaml", "yaml", 1, yamlText);
	const ctx = makeCtx();
	const cache = new DocumentCache(ctx);
	const cached = cache.get(doc);

	const svc = getYAMLService();
	svc.configureForDocument(cached);

	// Hover over the `openapi` key.
	const hover = await svc.getHover(doc, { line: 0, character: 2 });
	const md =
		typeof hover?.contents === "object" && hover?.contents && "value" in hover.contents
			? String((hover.contents as any).value)
			: Array.isArray(hover?.contents)
				? (hover?.contents ?? [])
						.map((c: any) => (typeof c === "string" ? c : c?.value))
						.filter(Boolean)
						.join("\n")
				: typeof hover?.contents === "string"
					? hover.contents
					: "";

	// Assert on a stable substring we expect from our OpenAPI schema descriptions.
	expect(md).toContain("OpenAPI version");
});


