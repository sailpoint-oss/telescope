import { expect, test } from "bun:test";

import {
	__testFormatPreview,
	__testFormatRefDetails,
} from "../../src/lsp/handlers/hover.js";

test("$ref hover formatting includes kind, description, and key fields", () => {
	const value = {
		type: "array",
		description: "A list of users",
		items: { type: "string" },
	};

	const details = __testFormatRefDetails(value);
	expect(details).toContain("**Kind**:");
	expect(details).toContain("**Description**: A list of users");
	expect(details).toContain("**type**:");
	expect(details).toContain("**items**:");

	const preview = __testFormatPreview(
		value,
		"/components/schemas/UserList",
		"file:///x/api-v3.yaml",
		"yaml",
	);
	expect(preview).toContain("**api-v3.yaml**");
	expect(preview).toContain("`#/components/schemas/UserList`");
});
