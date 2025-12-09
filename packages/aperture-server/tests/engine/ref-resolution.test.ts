/**
 * Comprehensive tests for reference resolution functionality.
 * Tests URI normalization, reference discovery, reference resolution,
 * and document loading with all $ref formats (internal, external file, external URL).
 */

import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { URI } from "vscode-uri";
import {
	buildRefGraph,
	findRefUris,
} from "../../src/engine/indexes/ref-graph.js";
import { loadDocument } from "../../src/engine/load-document.js";
import type { ParsedDocument } from "../../src/engine/types.js";
import { MemoryFileSystem } from "../../src/engine/utils/file-system-utils.js";
import { normalizeUri, resolveRef } from "../../src/engine/utils/ref-utils.js";

// Helper to create a mock ParsedDocument for testing
function createMockDocument(uri: string, ast: unknown): ParsedDocument {
	return {
		uri: normalizeUri(uri),
		format: "yaml",
		version: "3.1",
		ast,
		ir: { root: { value: ast, kind: "object" }, version: "3.1" } as any,
		sourceMap: {
			pointerToRange: () => null,
			rangeToPointer: () => null,
		},
		rawText: "",
		hash: "",
		mtimeMs: 0,
	};
}

describe("URI Normalization (normalizeUri)", () => {
	describe("file:// URIs", () => {
		it("should normalize file:// URIs consistently", () => {
			const uri = "file:///path/to/file.yaml";
			const normalized = normalizeUri(uri);
			expect(normalized).toBe("file:///path/to/file.yaml");
		});

		it("should strip fragments from file:// URIs", () => {
			const uri = "file:///path/to/file.yaml#/components/schemas/User";
			const normalized = normalizeUri(uri);
			expect(normalized).toBe("file:///path/to/file.yaml");
		});

		it("should handle URIs with special characters", () => {
			const uri = "file:///path/to/my%20file.yaml";
			const normalized = normalizeUri(uri);
			expect(normalized).toContain("file:///");
			expect(normalized).toContain("path/to/");
		});

		it("should be idempotent (calling twice produces same result)", () => {
			const uri = "file:///path/to/file.yaml#/fragment";
			const once = normalizeUri(uri);
			const twice = normalizeUri(once);
			expect(twice).toBe(once);
		});
	});

	describe("https:// URIs", () => {
		it("should normalize https:// URIs consistently", () => {
			const uri = "https://example.com/schema.yaml";
			const normalized = normalizeUri(uri);
			expect(normalized).toBe("https://example.com/schema.yaml");
		});

		it("should strip fragments from https:// URIs", () => {
			const uri = "https://example.com/schema.yaml#/definitions/Pet";
			const normalized = normalizeUri(uri);
			expect(normalized).toBe("https://example.com/schema.yaml");
		});
	});

	describe("URI object input", () => {
		it("should accept URI objects", () => {
			const uriObj = URI.parse("file:///path/to/file.yaml#/fragment");
			const normalized = normalizeUri(uriObj);
			expect(normalized).toBe("file:///path/to/file.yaml");
		});
	});
});

describe("Reference Resolution (resolveRef)", () => {
	const baseUri = URI.parse("file:///project/api/main.yaml");

	describe("internal refs (#/...)", () => {
		it("should resolve same-document references", () => {
			const result = resolveRef(baseUri, "#/components/schemas/User");
			expect(result.toString()).toContain("file:///project/api/main.yaml");
			expect(result.fragment).toBe("/components/schemas/User");
		});

		it("should handle empty fragment", () => {
			const result = resolveRef(baseUri, "#");
			expect(result.toString()).toContain("file:///project/api/main.yaml");
		});
	});

	describe("relative file refs (./...)", () => {
		it("should resolve sibling file references", () => {
			const result = resolveRef(baseUri, "./schemas/User.yaml");
			expect(normalizeUri(result)).toBe(
				"file:///project/api/schemas/User.yaml",
			);
		});

		it("should resolve parent directory references", () => {
			const result = resolveRef(baseUri, "../common/Error.yaml");
			expect(normalizeUri(result)).toBe("file:///project/common/Error.yaml");
		});

		it("should resolve nested relative paths", () => {
			const result = resolveRef(baseUri, "./v2/schemas/Pet.yaml");
			expect(normalizeUri(result)).toBe(
				"file:///project/api/v2/schemas/Pet.yaml",
			);
		});

		it("should resolve multiple parent directory refs", () => {
			const result = resolveRef(baseUri, "../../shared/types.yaml");
			expect(normalizeUri(result)).toBe("file:///shared/types.yaml");
		});
	});

	describe("absolute file refs (/...)", () => {
		it("should resolve absolute path references", () => {
			const result = resolveRef(baseUri, "/schemas/User.yaml");
			expect(normalizeUri(result)).toBe("file:///schemas/User.yaml");
		});
	});

	describe("external URL refs (https://...)", () => {
		it("should resolve HTTPS URLs", () => {
			const result = resolveRef(baseUri, "https://example.com/schema.yaml");
			expect(normalizeUri(result)).toBe("https://example.com/schema.yaml");
		});

		it("should resolve HTTP URLs", () => {
			const result = resolveRef(baseUri, "http://example.com/schema.yaml");
			expect(normalizeUri(result)).toBe("http://example.com/schema.yaml");
		});

		it("should strip fragments from URL refs", () => {
			const result = resolveRef(
				baseUri,
				"https://example.com/schema.yaml#/definitions/Pet",
			);
			// resolveRef strips fragments for URLs
			expect(normalizeUri(result)).toBe("https://example.com/schema.yaml");
		});
	});
});

describe("Reference Discovery (findRefUris)", () => {
	it("should discover relative file refs", () => {
		const doc = createMockDocument("file:///api/main.yaml", {
			openapi: "3.1.0",
			components: {
				schemas: {
					User: { $ref: "./schemas/User.yaml" },
				},
			},
		});

		const refs = findRefUris(doc, doc.uri);
		expect(refs.length).toBe(1);
		expect(refs[0]).toBe("file:///api/schemas/User.yaml");
	});

	it("should discover relative file refs with fragments", () => {
		const doc = createMockDocument("file:///api/main.yaml", {
			openapi: "3.1.0",
			components: {
				schemas: {
					User: { $ref: "./schemas/common.yaml#/definitions/User" },
				},
			},
		});

		const refs = findRefUris(doc, doc.uri);
		expect(refs.length).toBe(1);
		// Fragment should be stripped for file identity
		expect(refs[0]).toBe("file:///api/schemas/common.yaml");
	});

	it("should discover parent directory refs", () => {
		const doc = createMockDocument("file:///api/v2/main.yaml", {
			openapi: "3.1.0",
			components: {
				schemas: {
					Error: { $ref: "../common/Error.yaml" },
				},
			},
		});

		const refs = findRefUris(doc, doc.uri);
		expect(refs.length).toBe(1);
		expect(refs[0]).toBe("file:///api/common/Error.yaml");
	});

	it("should discover absolute URL refs", () => {
		const doc = createMockDocument("file:///api/main.yaml", {
			openapi: "3.1.0",
			components: {
				schemas: {
					Pet: { $ref: "https://example.com/schemas/Pet.yaml" },
				},
			},
		});

		const refs = findRefUris(doc, doc.uri);
		expect(refs.length).toBe(1);
		expect(refs[0]).toBe("https://example.com/schemas/Pet.yaml");
	});

	it("should skip internal refs (#/...)", () => {
		const doc = createMockDocument("file:///api/main.yaml", {
			openapi: "3.1.0",
			paths: {
				"/users": {
					get: {
						responses: {
							"200": {
								content: {
									"application/json": {
										schema: { $ref: "#/components/schemas/User" },
									},
								},
							},
						},
					},
				},
			},
			components: {
				schemas: {
					User: { type: "object" },
				},
			},
		});

		const refs = findRefUris(doc, doc.uri);
		expect(refs.length).toBe(0);
	});

	it("should discover multiple refs and deduplicate", () => {
		const doc = createMockDocument("file:///api/main.yaml", {
			openapi: "3.1.0",
			components: {
				schemas: {
					User: { $ref: "./schemas/User.yaml" },
					Admin: { $ref: "./schemas/User.yaml" }, // Same file
					Pet: { $ref: "./schemas/Pet.yaml" },
				},
			},
		});

		const refs = findRefUris(doc, doc.uri);
		expect(refs.length).toBe(2);
		expect(refs).toContain("file:///api/schemas/User.yaml");
		expect(refs).toContain("file:///api/schemas/Pet.yaml");
	});

	it("should return normalized URIs consistently", () => {
		const doc = createMockDocument("file:///api/main.yaml", {
			openapi: "3.1.0",
			components: {
				schemas: {
					User: { $ref: "./schemas/User.yaml#/definitions/User" },
				},
			},
		});

		const refs = findRefUris(doc, doc.uri);
		// Should be normalized (no fragment)
		expect(refs[0]).toBe(normalizeUri(refs[0]!));
	});
});

describe("Reference Graph Building (buildRefGraph)", () => {
	it("should build graph with external refs", () => {
		const mainDoc = createMockDocument("file:///api/main.yaml", {
			openapi: "3.1.0",
			components: {
				schemas: {
					User: { $ref: "./schemas/User.yaml" },
				},
			},
		});

		const userDoc = createMockDocument("file:///api/schemas/User.yaml", {
			type: "object",
			properties: {
				id: { type: "string" },
			},
		});

		const docs = new Map<string, ParsedDocument>([
			[mainDoc.uri, mainDoc],
			[userDoc.uri, userDoc],
		]);

		const { graph, resolver } = buildRefGraph({ docs });

		// Check edges exist
		expect(graph.edges.length).toBeGreaterThan(0);
	});

	it("should resolve refs with deref", () => {
		const mainDoc = createMockDocument("file:///api/main.yaml", {
			openapi: "3.1.0",
			components: {
				schemas: {
					User: { $ref: "./schemas/User.yaml" },
				},
			},
		});

		const userSchema = {
			type: "object",
			properties: {
				id: { type: "string" },
				name: { type: "string" },
			},
		};

		const userDoc = createMockDocument(
			"file:///api/schemas/User.yaml",
			userSchema,
		);

		const docs = new Map<string, ParsedDocument>([
			[mainDoc.uri, mainDoc],
			[userDoc.uri, userDoc],
		]);

		const { resolver } = buildRefGraph({ docs });

		// Resolve the ref
		const origin = { uri: mainDoc.uri, pointer: "#/components/schemas/User" };
		const resolved = resolver.deref(origin, "./schemas/User.yaml");

		expect(resolved).toEqual(userSchema);
	});

	it("should resolve refs with fragments", () => {
		const mainDoc = createMockDocument("file:///api/main.yaml", {
			openapi: "3.1.0",
			components: {
				schemas: {
					User: { $ref: "./schemas/common.yaml#/definitions/User" },
				},
			},
		});

		const commonDoc = createMockDocument("file:///api/schemas/common.yaml", {
			definitions: {
				User: {
					type: "object",
					properties: { id: { type: "string" } },
				},
				Pet: {
					type: "object",
					properties: { name: { type: "string" } },
				},
			},
		});

		const docs = new Map<string, ParsedDocument>([
			[mainDoc.uri, mainDoc],
			[commonDoc.uri, commonDoc],
		]);

		const { resolver } = buildRefGraph({ docs });

		const origin = { uri: mainDoc.uri, pointer: "#/components/schemas/User" };
		const resolved = resolver.deref(
			origin,
			"./schemas/common.yaml#/definitions/User",
		);

		expect(resolved).toEqual({
			type: "object",
			properties: { id: { type: "string" } },
		});
	});
});

describe("Document Loading Integration", () => {
	it("should store documents with normalized URI keys", async () => {
		const mainUri = "file:///test/api.yaml";

		// Create a simple in-memory file system for testing
		const fs = new MemoryFileSystem();
		fs.addFile(
			mainUri,
			`
openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}
`,
		);

		const doc = await loadDocument({ fileSystem: fs, uri: mainUri });

		// The stored URI should be normalized
		expect(doc.uri).toBe(normalizeUri(mainUri));
	});
});

describe("Integration: api-v2.yaml with security scheme ref", () => {
	it("should resolve security scheme ref to external file", () => {
		// Test the specific case from the bug report:
		// api-v2.yaml refs ./v2/security/schemes.yaml#/components/securitySchemes/userAuth

		const mainDoc = createMockDocument("file:///api/api-v2.yaml", {
			openapi: "3.1.0",
			info: { title: "API v2", version: "2.0.0" },
			components: {
				securitySchemes: {
					userAuth: {
						$ref: "./v2/security/schemes.yaml#/components/securitySchemes/userAuth",
					},
				},
			},
		});

		const schemesDoc = createMockDocument(
			"file:///api/v2/security/schemes.yaml",
			{
				components: {
					securitySchemes: {
						userAuth: {
							type: "oauth2",
							flows: {
								authorizationCode: {
									authorizationUrl: "https://example.com/oauth/authorize",
									tokenUrl: "https://example.com/oauth/token",
									scopes: { read: "Read access" },
								},
							},
						},
					},
				},
			},
		);

		const docs = new Map<string, ParsedDocument>([
			[mainDoc.uri, mainDoc],
			[schemesDoc.uri, schemesDoc],
		]);

		const { resolver } = buildRefGraph({ docs });

		// This should resolve successfully
		const origin = {
			uri: mainDoc.uri,
			pointer: "#/components/securitySchemes/userAuth",
		};
		const resolved = resolver.deref(
			origin,
			"./v2/security/schemes.yaml#/components/securitySchemes/userAuth",
		);

		expect(resolved).toEqual({
			type: "oauth2",
			flows: {
				authorizationCode: {
					authorizationUrl: "https://example.com/oauth/authorize",
					tokenUrl: "https://example.com/oauth/token",
					scopes: { read: "Read access" },
				},
			},
		});
	});

	it("should discover security scheme refs in findRefUris", () => {
		const mainDoc = createMockDocument("file:///api/api-v2.yaml", {
			openapi: "3.1.0",
			components: {
				securitySchemes: {
					userAuth: {
						$ref: "./v2/security/schemes.yaml#/components/securitySchemes/userAuth",
					},
				},
			},
		});

		const refs = findRefUris(mainDoc, mainDoc.uri);

		expect(refs.length).toBe(1);
		expect(refs[0]).toBe("file:///api/v2/security/schemes.yaml");
	});
});

describe("Multi-level refs (A→B→C)", () => {
	it("should handle chained references across multiple files", () => {
		const mainDoc = createMockDocument("file:///api/main.yaml", {
			openapi: "3.1.0",
			components: {
				schemas: {
					User: { $ref: "./schemas/User.yaml" },
				},
			},
		});

		const userDoc = createMockDocument("file:///api/schemas/User.yaml", {
			type: "object",
			properties: {
				address: { $ref: "./Address.yaml" },
			},
		});

		const addressDoc = createMockDocument("file:///api/schemas/Address.yaml", {
			type: "object",
			properties: {
				street: { type: "string" },
				city: { type: "string" },
			},
		});

		const docs = new Map<string, ParsedDocument>([
			[mainDoc.uri, mainDoc],
			[userDoc.uri, userDoc],
			[addressDoc.uri, addressDoc],
		]);

		const { resolver } = buildRefGraph({ docs });

		// Resolve User from main
		const userOrigin = {
			uri: mainDoc.uri,
			pointer: "#/components/schemas/User",
		};
		const userResolved = resolver.deref(userOrigin, "./schemas/User.yaml");
		expect(userResolved).toBeDefined();

		// Resolve Address from User
		const addressOrigin = { uri: userDoc.uri, pointer: "#/properties/address" };
		const addressResolved = resolver.deref(addressOrigin, "./Address.yaml");
		expect(addressResolved).toEqual({
			type: "object",
			properties: {
				street: { type: "string" },
				city: { type: "string" },
			},
		});
	});
});

describe("Mixed ref types in same document", () => {
	it("should handle internal, external file, and URL refs together", () => {
		const mainDoc = createMockDocument("file:///api/main.yaml", {
			openapi: "3.1.0",
			components: {
				schemas: {
					// Internal ref
					UserList: {
						type: "array",
						items: { $ref: "#/components/schemas/User" },
					},
					// Same-document definition
					User: {
						type: "object",
						properties: { id: { type: "string" } },
					},
					// External file ref
					Pet: { $ref: "./schemas/Pet.yaml" },
				},
			},
		});

		const petDoc = createMockDocument("file:///api/schemas/Pet.yaml", {
			type: "object",
			properties: {
				name: { type: "string" },
			},
		});

		// findRefUris should only return external file refs
		const refs = findRefUris(mainDoc, mainDoc.uri);
		expect(refs.length).toBe(1);
		expect(refs[0]).toBe("file:///api/schemas/Pet.yaml");

		// Building graph should work
		const docs = new Map<string, ParsedDocument>([
			[mainDoc.uri, mainDoc],
			[petDoc.uri, petDoc],
		]);

		const { resolver } = buildRefGraph({ docs });

		// Internal ref should resolve
		const internalOrigin = {
			uri: mainDoc.uri,
			pointer: "#/components/schemas/UserList/items",
		};
		const internalResolved = resolver.deref(
			internalOrigin,
			"#/components/schemas/User",
		);
		expect(internalResolved).toEqual({
			type: "object",
			properties: { id: { type: "string" } },
		});

		// External ref should resolve
		const externalOrigin = {
			uri: mainDoc.uri,
			pointer: "#/components/schemas/Pet",
		};
		const externalResolved = resolver.deref(
			externalOrigin,
			"./schemas/Pet.yaml",
		);
		expect(externalResolved).toEqual({
			type: "object",
			properties: { name: { type: "string" } },
		});
	});
});
