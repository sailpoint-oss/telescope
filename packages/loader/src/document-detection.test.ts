import { describe, expect, it } from "bun:test";

import { identifyDocumentType, isRootDocument } from "./document-detection";

describe("identifyDocumentType - root detection", () => {
	it("detects root documents when info is present", () => {
		const node = {
			info: { title: "Example", version: "1.0.0" },
		};

		expect(identifyDocumentType(node)).toBe("openapi-root");
		expect(isRootDocument(node)).toBe(true);
	});

	it("detects root documents when paths are present", () => {
		const node = {
			paths: {},
		};

		expect(identifyDocumentType(node)).toBe("openapi-root");
		expect(isRootDocument(node)).toBe(true);
	});

	it("detects root documents when components are present", () => {
		const node = {
			components: {},
		};

		expect(identifyDocumentType(node)).toBe("openapi-root");
		expect(isRootDocument(node)).toBe(true);
	});

	it("detects root documents when webhooks are present", () => {
		const node = {
			webhooks: {},
		};

		expect(identifyDocumentType(node)).toBe("openapi-root");
		expect(isRootDocument(node)).toBe(true);
	});
});

describe("identifyDocumentType - fragment detection", () => {
	it("detects path item objects via HTTP methods", () => {
		const node = {
			get: {
				summary: "List pets",
				responses: { default: { description: "ok" } },
			},
		};

		expect(identifyDocumentType(node)).toBe("path-item");
		expect(isRootDocument(node)).toBe(false);
	});

	it("detects operation objects", () => {
		const node = {
			operationId: "listPets",
			summary: "List pets",
			responses: { default: { description: "ok" } },
		};

		expect(identifyDocumentType(node)).toBe("operation");
	});

	it("detects schema objects", () => {
		const node = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		expect(identifyDocumentType(node)).toBe("schema");
	});

	it("detects parameter objects", () => {
		const node = {
			name: "petId",
			in: "path",
			schema: { type: "string" },
		};

		expect(identifyDocumentType(node)).toBe("parameter");
	});

	it("detects response objects", () => {
		const node = {
			description: "ok",
			content: {
				"application/json": {
					schema: { type: "string" },
				},
			},
		};

		expect(identifyDocumentType(node)).toBe("response");
	});

	it("detects security scheme objects", () => {
		const node = {
			type: "http",
			scheme: "bearer",
		};

		expect(identifyDocumentType(node)).toBe("security-scheme");
	});
});

describe("identifyDocumentType - example detection", () => {
	it("detects example fragments with embedded value", () => {
		const exampleNode = {
			summary: "Pet response",
			description: "Example payload for a pet",
			value: {
				id: 1,
				name: "Fluffy",
			},
		};

		expect(identifyDocumentType(exampleNode)).toBe("example");
	});

	it("detects example fragments with externalValue", () => {
		const exampleNode = {
			description: "Large CSV example",
			externalValue: "https://cdn.example.com/examples/pets.csv",
		};

		expect(identifyDocumentType(exampleNode)).toBe("example");
	});

	it("continues to classify responses with description and content", () => {
		const responseNode = {
			description: "OK response",
			content: {
				"application/json": {
					example: { status: "ok" },
				},
			},
		};

		expect(identifyDocumentType(responseNode)).toBe("response");
	});
});

