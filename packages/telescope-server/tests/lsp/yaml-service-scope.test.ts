import { describe, expect, it } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { getYAMLService } from "../../src/lsp/services/yaml-service.js";

describe("yaml-service schema scoping", () => {
	it("does not provide OpenAPI schema hover unless configured per-document", async () => {
		const yamlService = getYAMLService();

		const uri = URI.file("/workspace/api.yaml").toString();
		const content = "openapi: 3.1.0\ninfo:\n  title: X\n  version: 1.0.0\n";
		const doc = TextDocument.create(uri, "yaml", 1, content);

		// Hover on the `openapi` key. Without any schema association, this should be null/empty.
		const hoverBefore = await yamlService.getHover(doc, { line: 0, character: 1 });

		// Configure schema for this specific document.
		yamlService.configureForDocument({
			uri,
			documentType: "root",
			openapiVersion: "3.1.0",
		} as any);

		const hoverAfter = await yamlService.getHover(doc, { line: 0, character: 1 });

		// We only assert that schema-driven hover changes behavior (becomes non-null).
		// Exact contents vary by yaml-language-server version.
		expect(hoverBefore).toBeNull();
		expect(hoverAfter).not.toBeNull();
	});
});


