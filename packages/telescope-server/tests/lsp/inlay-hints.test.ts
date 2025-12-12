import { expect, test } from "bun:test";
import { __testFormatReferencedType } from "../../src/lsp/handlers/inlay-hints.js";

test("$ref type inlay formats parameter/schema/array meaningfully", async () => {
	expect(
		__testFormatReferencedType({ name: "id", in: "path", required: true }),
	).toBe("parameter (path) id");

	expect(__testFormatReferencedType({ type: "string" })).toBe("string");
	expect(
		__testFormatReferencedType({ type: "array", items: { type: "string" } }),
	).toBe("array<string>");
});
