import { describe, expect, it } from "bun:test";
import { runEngine, createRuleContext } from "../../src/engine/execution/runner.js";
import type { Rule, Visitors, Diagnostic } from "../../src/engine/rules/types.js";
import type { InfoRef, TagRef } from "../../src/engine/indexes/types.js";
import { buildRefGraph } from "../../src/engine/indexes/ref-graph.js";
import { buildIndex } from "../../src/engine/indexes/project-index.js";
import type { ParsedDocument } from "../../src/engine/types.js";
import { parse } from "yaml";

// Helper to create a minimal ParsedDocument
function createParsedDocument(content: string): ParsedDocument {
	const parsed = parse(content);
	return {
		rawText: content,
		parsed,
		ast: parsed,
		ir: null as unknown as ParsedDocument["ir"],
		sourceMap: {
			pointerToRange: () => null,
			rangeToPointer: () => null,
		},
		isYaml: true,
	};
}

describe("Info visitor", () => {
	it("should receive InfoRef with typed accessors", async () => {
		const content = `
openapi: "3.0.0"
info:
  title: "Test API"
  version: "1.0.0"
  description: "A test API"
  contact:
    name: "API Support"
    email: "support@example.com"
  license:
    name: "MIT"
paths: {}
`;
		const doc = createParsedDocument(content);
		const uri = "file:///test.yaml";
		const docs = new Map([[uri, doc]]);

		const { graph, resolver, rootResolver } = buildRefGraph({ docs });
		const index = buildIndex({ docs, graph, resolver });
		const project = { docs, index, resolver, graph, rootResolver, version: "3.0" };

		let infoReceived: InfoRef | null = null;

		const testRule: Rule = {
			meta: {
				id: "test-info-visitor",
				number: 9999,
				type: "problem",
				description: "Test Info visitor",
			},
			check(ctx) {
				return {
					Info(info) {
						infoReceived = info;
					},
				};
			},
		};

		runEngine(project, [uri], { rules: [testRule] });

		expect(infoReceived).not.toBeNull();
		expect(infoReceived!.title()).toBe("Test API");
		expect(infoReceived!.version()).toBe("1.0.0");
		expect(infoReceived!.description()).toBe("A test API");
		expect(infoReceived!.hasContact()).toBe(true);
		expect(infoReceived!.hasLicense()).toBe(true);
		expect(infoReceived!.hasDescription()).toBe(true);
		expect(infoReceived!.contact()?.name).toBe("API Support");
		expect(infoReceived!.license()?.name).toBe("MIT");
	});

	it("should handle info without optional fields", async () => {
		const content = `
openapi: "3.0.0"
info:
  title: "Minimal API"
  version: "1.0.0"
paths: {}
`;
		const doc = createParsedDocument(content);
		const uri = "file:///test.yaml";
		const docs = new Map([[uri, doc]]);

		const { graph, resolver, rootResolver } = buildRefGraph({ docs });
		const index = buildIndex({ docs, graph, resolver });
		const project = { docs, index, resolver, graph, rootResolver, version: "3.0" };

		let infoReceived: InfoRef | null = null;

		const testRule: Rule = {
			meta: {
				id: "test-info-minimal",
				number: 9999,
				type: "problem",
				description: "Test minimal Info",
			},
			check(ctx) {
				return {
					Info(info) {
						infoReceived = info;
					},
				};
			},
		};

		runEngine(project, [uri], { rules: [testRule] });

		expect(infoReceived).not.toBeNull();
		expect(infoReceived!.title()).toBe("Minimal API");
		expect(infoReceived!.version()).toBe("1.0.0");
		expect(infoReceived!.description()).toBeUndefined();
		expect(infoReceived!.hasContact()).toBe(false);
		expect(infoReceived!.hasLicense()).toBe(false);
		expect(infoReceived!.hasDescription()).toBe(false);
	});

	it("should not dispatch Info visitor for non-root documents", async () => {
		const content = `
# A fragment file without openapi key
components:
  schemas:
    User:
      type: object
`;
		const doc = createParsedDocument(content);
		const uri = "file:///fragment.yaml";
		const docs = new Map([[uri, doc]]);

		const { graph, resolver, rootResolver } = buildRefGraph({ docs });
		const index = buildIndex({ docs, graph, resolver });
		const project = { docs, index, resolver, graph, rootResolver, version: "3.0" };

		let infoVisited = false;

		const testRule: Rule = {
			meta: {
				id: "test-no-info",
				number: 9999,
				type: "problem",
				description: "Test no Info for fragments",
			},
			check(ctx) {
				return {
					Info(info) {
						infoVisited = true;
					},
				};
			},
		};

		runEngine(project, [uri], { rules: [testRule] });

		expect(infoVisited).toBe(false);
	});
});

describe("Tag visitor", () => {
	it("should receive TagRef for each tag with typed accessors", async () => {
		const content = `
openapi: "3.0.0"
info:
  title: "Test API"
  version: "1.0.0"
tags:
  - name: "users"
    description: "User operations"
  - name: "products"
    description: "Product operations"
paths: {}
`;
		const doc = createParsedDocument(content);
		const uri = "file:///test.yaml";
		const docs = new Map([[uri, doc]]);

		const { graph, resolver, rootResolver } = buildRefGraph({ docs });
		const index = buildIndex({ docs, graph, resolver });
		const project = { docs, index, resolver, graph, rootResolver, version: "3.0" };

		const tagsReceived: TagRef[] = [];

		const testRule: Rule = {
			meta: {
				id: "test-tag-visitor",
				number: 9999,
				type: "problem",
				description: "Test Tag visitor",
			},
			check(ctx) {
				return {
					Tag(tag) {
						tagsReceived.push(tag);
					},
				};
			},
		};

		runEngine(project, [uri], { rules: [testRule] });

		expect(tagsReceived.length).toBe(2);
		
		expect(tagsReceived[0].name()).toBe("users");
		expect(tagsReceived[0].description()).toBe("User operations");
		expect(tagsReceived[0].index).toBe(0);
		expect(tagsReceived[0].pointer).toBe("#/tags/0");

		expect(tagsReceived[1].name()).toBe("products");
		expect(tagsReceived[1].description()).toBe("Product operations");
		expect(tagsReceived[1].index).toBe(1);
		expect(tagsReceived[1].pointer).toBe("#/tags/1");
	});

	it("should handle tags with OpenAPI 3.2+ fields", async () => {
		const content = `
openapi: "3.2.0"
info:
  title: "Test API"
  version: "1.0.0"
tags:
  - name: "public"
    summary: "Public APIs"
    description: "Publicly accessible endpoints"
    kind: "audience"
  - name: "internal"
    summary: "Internal APIs"
    parent: "public"
    kind: "nav"
paths: {}
`;
		const doc = createParsedDocument(content);
		const uri = "file:///test.yaml";
		const docs = new Map([[uri, doc]]);

		const { graph, resolver, rootResolver } = buildRefGraph({ docs });
		const index = buildIndex({ docs, graph, resolver });
		const project = { docs, index, resolver, graph, rootResolver, version: "3.2" };

		const tagsReceived: TagRef[] = [];

		const testRule: Rule = {
			meta: {
				id: "test-tag-32",
				number: 9999,
				type: "problem",
				description: "Test Tag 3.2 fields",
			},
			check(ctx) {
				return {
					Tag(tag) {
						tagsReceived.push(tag);
					},
				};
			},
		};

		runEngine(project, [uri], { rules: [testRule] });

		expect(tagsReceived.length).toBe(2);
		
		expect(tagsReceived[0].name()).toBe("public");
		expect(tagsReceived[0].summary()).toBe("Public APIs");
		expect(tagsReceived[0].kind()).toBe("audience");
		expect(tagsReceived[0].parent()).toBeUndefined();

		expect(tagsReceived[1].name()).toBe("internal");
		expect(tagsReceived[1].summary()).toBe("Internal APIs");
		expect(tagsReceived[1].parent()).toBe("public");
		expect(tagsReceived[1].kind()).toBe("nav");
	});

	it("should not dispatch Tag visitor when no tags defined", async () => {
		const content = `
openapi: "3.0.0"
info:
  title: "Test API"
  version: "1.0.0"
paths: {}
`;
		const doc = createParsedDocument(content);
		const uri = "file:///test.yaml";
		const docs = new Map([[uri, doc]]);

		const { graph, resolver, rootResolver } = buildRefGraph({ docs });
		const index = buildIndex({ docs, graph, resolver });
		const project = { docs, index, resolver, graph, rootResolver, version: "3.0" };

		let tagVisited = false;

		const testRule: Rule = {
			meta: {
				id: "test-no-tags",
				number: 9999,
				type: "problem",
				description: "Test no tags",
			},
			check(ctx) {
				return {
					Tag(tag) {
						tagVisited = true;
					},
				};
			},
		};

		runEngine(project, [uri], { rules: [testRule] });

		expect(tagVisited).toBe(false);
	});

	it("should handle tags with externalDocs", async () => {
		const content = `
openapi: "3.0.0"
info:
  title: "Test API"
  version: "1.0.0"
tags:
  - name: "pets"
    description: "Pet operations"
    externalDocs:
      url: "https://example.com/docs/pets"
      description: "Full pet documentation"
paths: {}
`;
		const doc = createParsedDocument(content);
		const uri = "file:///test.yaml";
		const docs = new Map([[uri, doc]]);

		const { graph, resolver, rootResolver } = buildRefGraph({ docs });
		const index = buildIndex({ docs, graph, resolver });
		const project = { docs, index, resolver, graph, rootResolver, version: "3.0" };

		let tagReceived: TagRef | null = null;

		const testRule: Rule = {
			meta: {
				id: "test-tag-externaldocs",
				number: 9999,
				type: "problem",
				description: "Test Tag externalDocs",
			},
			check(ctx) {
				return {
					Tag(tag) {
						tagReceived = tag;
					},
				};
			},
		};

		runEngine(project, [uri], { rules: [testRule] });

		expect(tagReceived).not.toBeNull();
		expect(tagReceived!.name()).toBe("pets");
		expect(tagReceived!.externalDocs()).toBeDefined();
		expect(tagReceived!.externalDocs()?.url).toBe("https://example.com/docs/pets");
	});
});

describe("Info and Tag visitors together", () => {
	it("should dispatch both Info and Tag visitors for root documents", async () => {
		const content = `
openapi: "3.0.0"
info:
  title: "Full API"
  version: "2.0.0"
  description: "Complete API spec"
tags:
  - name: "users"
  - name: "orders"
  - name: "products"
paths: {}
`;
		const doc = createParsedDocument(content);
		const uri = "file:///test.yaml";
		const docs = new Map([[uri, doc]]);

		const { graph, resolver, rootResolver } = buildRefGraph({ docs });
		const index = buildIndex({ docs, graph, resolver });
		const project = { docs, index, resolver, graph, rootResolver, version: "3.0" };

		let infoReceived: InfoRef | null = null;
		const tagsReceived: TagRef[] = [];

		const testRule: Rule = {
			meta: {
				id: "test-info-and-tags",
				number: 9999,
				type: "problem",
				description: "Test both visitors",
			},
			check(ctx) {
				return {
					Info(info) {
						infoReceived = info;
					},
					Tag(tag) {
						tagsReceived.push(tag);
					},
				};
			},
		};

		runEngine(project, [uri], { rules: [testRule] });

		expect(infoReceived).not.toBeNull();
		expect(infoReceived!.title()).toBe("Full API");
		
		expect(tagsReceived.length).toBe(3);
		expect(tagsReceived.map(t => t.name())).toEqual(["users", "orders", "products"]);
	});
});

