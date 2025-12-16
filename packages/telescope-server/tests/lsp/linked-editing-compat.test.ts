import { describe, expect, test } from "bun:test";
import type { Connection } from "vscode-languageserver";
import type { TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { registerLinkedEditingHandlers } from "../../src/lsp/handlers/linked-editing.js";

describe("linked editing compatibility", () => {
	test("does not throw when linkedEditingRange is not supported by runtime", () => {
		const connection = { languages: {} } as unknown as Connection;
		const documents = {} as unknown as TextDocuments<TextDocument>;
		const cache = {} as any;
		const ctx = {
			getLogger: () => ({ log() {}, error() {} }),
		} as any;

		expect(() => {
			registerLinkedEditingHandlers(connection, documents, cache, ctx);
		}).not.toThrow();
	});
});


