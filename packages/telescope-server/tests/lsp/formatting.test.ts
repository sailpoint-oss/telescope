import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";

import { getYAMLService } from "../../src/lsp/services/yaml-service.js";

test("YAMLService.format returns edits for YAML documents (smoke test)", async () => {
	const doc = TextDocument.create(
		"file:///fmt.yaml",
		"yaml",
		1,
		['openapi: "3.1.0"', "info:", "  title: Test", "  version: 1.0.0", "paths:{}", ""].join(
			"\n",
		),
	);

	const service = getYAMLService();
	const edits = await service.format(doc, { tabSize: 2, insertSpaces: true });
	expect(Array.isArray(edits)).toBe(true);
});


