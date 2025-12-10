import { describe, expect, it } from "bun:test";
import * as jsonc from "jsonc-parser";
import type { IScriptSnapshot } from "typescript";
import { URI } from "vscode-uri";
import YAML from "yaml";
import { buildIRFromYaml } from "../../src/engine/ir/builder-yaml.js";
import type { IRNode } from "../../src/engine/ir/types.js";
import {
	buildLineOffsets,
	getLineCol,
} from "../../src/engine/utils/line-offset-utils.js";
import { resolveRef } from "../../src/engine/utils/ref-utils.js";
import { OpenAPIVirtualCode } from "../../src/lsp/languages/virtualCodes/openapi-virtual-code.js";

/**
 * Create a mock IScriptSnapshot from text content.
 */
function createSnapshot(text: string): IScriptSnapshot {
	return {
		getText: (start: number, end: number) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

describe("OpenAPIVirtualCode.locToRange", () => {
	it("should convert byte offsets to LSP range for simple content", () => {
		const yaml = "key: value";
		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");

		// The IR should have a node at the root
		const ir = vc.getIR("file:///test.yaml");
		const keyNode = ir.root.children?.[0];
		expect(keyNode).toBeDefined();

		const range = vc.locToRange(keyNode!.loc);
		expect(range).toBeDefined();
		expect(range).not.toBeNull();

		// "key: value" - the key node value starts at position 5 (after "key: ")
		// Line should be 0 (first line), character depends on the loc
		expect(range!.start.line).toBe(0);
		expect(range!.end.line).toBe(0);
	});

	it("should convert byte offsets to LSP range for multiline content", () => {
		const yaml = `openapi: 3.1.0
info:
  title: Test API`;
		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");

		const ir = vc.getIR("file:///test.yaml");

		// Find the info/title node
		const info = ir.root.children?.find((c) => c.key === "info");
		expect(info).toBeDefined();

		const title = info?.children?.find((c) => c.key === "title");
		expect(title).toBeDefined();

		const range = vc.locToRange(title!.loc);
		expect(range).toBeDefined();
		expect(range).not.toBeNull();

		// Title is on the third line (line index 2)
		expect(range!.start.line).toBe(2);
	});

	it("should return null for undefined loc", () => {
		const yaml = "key: value";
		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");

		const range = vc.locToRange(undefined as any);
		expect(range).toBeNull();
	});

	it("should convert $ref node locations correctly", () => {
		const yaml = `components:
  schemas:
    Pet:
      $ref: "./schemas/Pet.yaml"`;
		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");

		const ir = vc.getIR("file:///test.yaml");

		// Navigate to the $ref node
		const components = ir.root.children?.find((c) => c.key === "components");
		const schemas = components?.children?.find((c) => c.key === "schemas");
		const pet = schemas?.children?.find((c) => c.key === "Pet");
		const refNode = pet?.children?.find((c) => c.key === "$ref");

		expect(refNode).toBeDefined();
		expect(refNode?.kind).toBe("string");
		expect(refNode?.value).toBe("./schemas/Pet.yaml");

		const range = vc.locToRange(refNode!.loc);
		expect(range).toBeDefined();
		expect(range).not.toBeNull();

		// $ref is on line 3 (0-indexed)
		expect(range!.start.line).toBe(3);
		expect(range!.end.line).toBe(3);
	});
});

describe("collectRefLinks logic", () => {
	/**
	 * Simulates the collectRefLinks function from openapi-service.ts
	 */
	function collectRefLinks(
		node: IRNode,
		links: Array<{ ptr: string; value: string }>,
	): void {
		if (
			node.kind === "string" &&
			node.key === "$ref" &&
			typeof node.value === "string"
		) {
			links.push({ ptr: node.ptr, value: node.value });
		}

		if (node.children) {
			for (const child of node.children) {
				collectRefLinks(child, links);
			}
		}
	}

	it("should find $ref nodes in simple structure", () => {
		const yaml = `Pet:
  $ref: "./schemas/Pet.yaml"`;
		const document = YAML.parseDocument(yaml);
		const ir = buildIRFromYaml(
			"file:///test.yaml",
			document,
			yaml,
			"hash",
			Date.now(),
			"3.1",
		);

		const links: Array<{ ptr: string; value: string }> = [];
		collectRefLinks(ir.root, links);

		expect(links.length).toBe(1);
		expect(links[0].value).toBe("./schemas/Pet.yaml");
	});

	it("should find multiple $ref nodes", () => {
		const yaml = `components:
  schemas:
    Pet:
      $ref: "./schemas/Pet.yaml"
    User:
      $ref: "./schemas/User.yaml"
paths:
  /pets:
    $ref: "./paths/pets.yaml"`;
		const document = YAML.parseDocument(yaml);
		const ir = buildIRFromYaml(
			"file:///test.yaml",
			document,
			yaml,
			"hash",
			Date.now(),
			"3.1",
		);

		const links: Array<{ ptr: string; value: string }> = [];
		collectRefLinks(ir.root, links);

		expect(links.length).toBe(3);
		expect(links.map((l) => l.value)).toContain("./schemas/Pet.yaml");
		expect(links.map((l) => l.value)).toContain("./schemas/User.yaml");
		expect(links.map((l) => l.value)).toContain("./paths/pets.yaml");
	});

	it("should find $ref nodes with internal references", () => {
		const yaml = `schema:
  $ref: "#/components/schemas/User"`;
		const document = YAML.parseDocument(yaml);
		const ir = buildIRFromYaml(
			"file:///test.yaml",
			document,
			yaml,
			"hash",
			Date.now(),
			"3.1",
		);

		const links: Array<{ ptr: string; value: string }> = [];
		collectRefLinks(ir.root, links);

		expect(links.length).toBe(1);
		expect(links[0].value).toBe("#/components/schemas/User");
	});

	it("should find $ref nodes with external URLs", () => {
		const yaml = `schema:
  $ref: "https://example.com/schemas/Pet.yaml"`;
		const document = YAML.parseDocument(yaml);
		const ir = buildIRFromYaml(
			"file:///test.yaml",
			document,
			yaml,
			"hash",
			Date.now(),
			"3.1",
		);

		const links: Array<{ ptr: string; value: string }> = [];
		collectRefLinks(ir.root, links);

		expect(links.length).toBe(1);
		expect(links[0].value).toBe("https://example.com/schemas/Pet.yaml");
	});

	it("should not find non-$ref string nodes", () => {
		const yaml = `info:
  title: "My API"
  description: "API description"`;
		const document = YAML.parseDocument(yaml);
		const ir = buildIRFromYaml(
			"file:///test.yaml",
			document,
			yaml,
			"hash",
			Date.now(),
			"3.1",
		);

		const links: Array<{ ptr: string; value: string }> = [];
		collectRefLinks(ir.root, links);

		expect(links.length).toBe(0);
	});
});

describe("resolveRef with fragments", () => {
	it("should resolve relative refs with fragments", () => {
		const baseUri = URI.parse("file:///project/api/main.yaml");
		const ref =
			"./components/responses.yaml#/components/responses/ErrorResponse";

		const resolved = resolveRef(baseUri, ref);

		expect(resolved.path).toBe("/project/api/components/responses.yaml");
		expect(resolved.fragment).toBe("/components/responses/ErrorResponse");
		// The full URI should have a proper # separator, not %23
		expect(resolved.toString()).toContain("#");
		expect(resolved.toString()).not.toContain("%23");
	});

	it("should resolve relative refs without fragments", () => {
		const baseUri = URI.parse("file:///project/api/main.yaml");
		const ref = "./schemas/Pet.yaml";

		const resolved = resolveRef(baseUri, ref);

		expect(resolved.path).toBe("/project/api/schemas/Pet.yaml");
		expect(resolved.fragment).toBe("");
	});

	it("should resolve same-document refs", () => {
		const baseUri = URI.parse("file:///project/api/main.yaml");
		const ref = "#/components/schemas/User";

		const resolved = resolveRef(baseUri, ref);

		expect(resolved.path).toBe("/project/api/main.yaml");
		expect(resolved.fragment).toBe("/components/schemas/User");
	});

	it("should resolve parent directory refs with fragments", () => {
		const baseUri = URI.parse("file:///project/api/v1/main.yaml");
		const ref = "../common/schemas.yaml#/definitions/Error";

		const resolved = resolveRef(baseUri, ref);

		expect(resolved.path).toBe("/project/api/common/schemas.yaml");
		expect(resolved.fragment).toBe("/definitions/Error");
	});

	it("should resolve external URLs with fragments", () => {
		const baseUri = URI.parse("file:///project/api/main.yaml");
		const ref = "https://example.com/schemas/Pet.yaml#/definitions/Pet";

		const resolved = resolveRef(baseUri, ref);

		expect(resolved.scheme).toBe("https");
		expect(resolved.authority).toBe("example.com");
		expect(resolved.path).toBe("/schemas/Pet.yaml");
		expect(resolved.fragment).toBe("/definitions/Pet");
	});

	it("should handle absolute paths with fragments", () => {
		const baseUri = URI.parse("file:///project/api/main.yaml");
		const ref = "/schemas/Pet.yaml#/definitions/Pet";

		const resolved = resolveRef(baseUri, ref);

		expect(resolved.path).toBe("/schemas/Pet.yaml");
		expect(resolved.fragment).toBe("/definitions/Pet");
	});
});

describe("Document Links Integration", () => {
	it("should build links from OpenAPI document with $refs", () => {
		const yaml = `openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /pets:
    $ref: "./paths/pets.yaml"
components:
  schemas:
    Pet:
      $ref: "./schemas/Pet.yaml"
    User:
      $ref: "#/components/schemas/LocalUser"
    LocalUser:
      type: object`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const uri = "file:///test.yaml";
		const ir = vc.getIR(uri);

		// Simulate the link collection from provideDocumentLinks
		const links: Array<{ range: any; target: string }> = [];

		function collectRefLinks(node: IRNode): void {
			if (
				node.kind === "string" &&
				node.key === "$ref" &&
				typeof node.value === "string"
			) {
				const ref = node.value;
				const range = vc.locToRange(node.loc);
				if (!range) return;

				let target: string;
				if (/^https?:/i.test(ref)) {
					target = ref;
				} else if (ref.startsWith("#")) {
					target = `${uri}${ref}`;
				} else {
					target = `file:///resolved/${ref}`;
				}

				links.push({ range, target });
			}

			if (node.children) {
				for (const child of node.children) {
					collectRefLinks(child);
				}
			}
		}

		collectRefLinks(ir.root);

		// Should find 3 $ref nodes
		expect(links.length).toBe(3);

		// Check that ranges are valid
		for (const link of links) {
			expect(link.range).toBeDefined();
			expect(link.range.start.line).toBeGreaterThanOrEqual(0);
			expect(link.range.end.line).toBeGreaterThanOrEqual(link.range.start.line);
		}

		// Check targets
		const targets = links.map((l) => l.target);
		expect(targets).toContain("file:///resolved/./paths/pets.yaml");
		expect(targets).toContain("file:///resolved/./schemas/Pet.yaml");
		expect(targets).toContain(
			"file:///test.yaml#/components/schemas/LocalUser",
		);
	});

	it("should handle real-world OpenAPI structure", () => {
		const yaml = `openapi: 3.1.0
x-sailpoint-api:
  version: v1
  audience: external-public
info:
  title: API v1
  version: 1.0.0
  description: API version 1 with external references
tags:
  - name: Pets
    description: Pet operations
paths:
  /pets:
    $ref: "./v1/paths/pets.yaml"
  /users:
    $ref: "./v1/paths/users.yaml"
components:
  schemas:
    Pet:
      $ref: "./v1/schemas/Pet.yaml"
    User:
      $ref: "./v1/schemas/User.yaml"
  parameters:
    LimitParam:
      $ref: "./v1/components/parameters.yaml#/components/parameters/LimitParam"`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const uri = "file:///api-v1.yaml";
		const ir = vc.getIR(uri);

		const links: Array<{ range: any; target: string; value: string }> = [];

		function collectRefLinks(node: IRNode): void {
			if (
				node.kind === "string" &&
				node.key === "$ref" &&
				typeof node.value === "string"
			) {
				const ref = node.value;
				const range = vc.locToRange(node.loc);
				if (!range) return;
				links.push({ range, target: ref, value: ref });
			}

			if (node.children) {
				for (const child of node.children) {
					collectRefLinks(child);
				}
			}
		}

		collectRefLinks(ir.root);

		// Should find 5 $ref nodes
		expect(links.length).toBe(5);

		// Verify all refs were found
		const values = links.map((l) => l.value);
		expect(values).toContain("./v1/paths/pets.yaml");
		expect(values).toContain("./v1/paths/users.yaml");
		expect(values).toContain("./v1/schemas/Pet.yaml");
		expect(values).toContain("./v1/schemas/User.yaml");
		expect(values).toContain(
			"./v1/components/parameters.yaml#/components/parameters/LimitParam",
		);

		// All ranges should be valid
		for (const link of links) {
			expect(link.range).not.toBeNull();
			expect(link.range.start.line).toBeGreaterThanOrEqual(0);
		}
	});
});

describe("JSON Pointer Parsing", () => {
	/**
	 * Parse a JSON pointer string into path segments.
	 * Replicates the logic from openapi-service.ts for testing.
	 */
	function parseJsonPointer(pointer: string): (string | number)[] {
		if (!pointer || pointer === "/") return [];
		const parts = pointer.startsWith("/") ? pointer.substring(1) : pointer;
		return parts.split("/").map((segment) => {
			const unescaped = segment.replace(/~1/g, "/").replace(/~0/g, "~");
			const asNumber = Number(unescaped);
			return Number.isInteger(asNumber) && asNumber >= 0 ? asNumber : unescaped;
		});
	}

	it("should parse simple pointer", () => {
		const path = parseJsonPointer("/components/schemas/User");
		expect(path).toEqual(["components", "schemas", "User"]);
	});

	it("should parse pointer with array index", () => {
		const path = parseJsonPointer("/paths/~1users/get/responses/200");
		// Note: 200 is converted to a number since it's a valid non-negative integer
		expect(path).toEqual(["paths", "/users", "get", "responses", 200]);
	});

	it("should handle escaped characters", () => {
		// ~0 -> ~, ~1 -> /
		const path = parseJsonPointer("/a~0b/c~1d");
		expect(path).toEqual(["a~b", "c/d"]);
	});

	it("should handle numeric indices", () => {
		const path = parseJsonPointer("/items/0/name");
		expect(path).toEqual(["items", 0, "name"]);
	});

	it("should handle empty pointer", () => {
		expect(parseJsonPointer("")).toEqual([]);
		expect(parseJsonPointer("/")).toEqual([]);
	});
});

describe("Position Finding in YAML", () => {
	it("should find position at simple path", () => {
		const content = `openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0`;

		const doc = YAML.parseDocument(content, { keepSourceTokens: true });
		const lineOffsets = buildLineOffsets(content);

		// Find info/title node
		const node = doc.getIn(["info", "title"], true);
		expect(node).toBeDefined();
		expect((node as any).range).toBeDefined();

		const offset = (node as any).range[0];
		const pos = getLineCol(offset, lineOffsets);

		// "title" is on line 3 (1-indexed)
		expect(pos.line).toBe(3);
	});

	it("should find position at nested schema path", () => {
		const content = `components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string`;

		const doc = YAML.parseDocument(content, { keepSourceTokens: true });
		const lineOffsets = buildLineOffsets(content);

		// Find components/schemas/User node
		const node = doc.getIn(["components", "schemas", "User"], true);
		expect(node).toBeDefined();

		const offset = (node as any).range[0];
		const pos = getLineCol(offset, lineOffsets);

		// "User" content starts on line 4 (type: object)
		expect(pos.line).toBe(4);
	});
});

describe("Position Finding in JSON", () => {
	it("should find position at simple path", () => {
		const content = `{
  "openapi": "3.1.0",
  "info": {
    "title": "Test API",
    "version": "1.0.0"
  }
}`;

		const tree = jsonc.parseTree(content);
		expect(tree).toBeDefined();

		const lineOffsets = buildLineOffsets(content);

		// Find info/title node
		const node = jsonc.findNodeAtLocation(tree!, ["info", "title"]);
		expect(node).toBeDefined();

		const pos = getLineCol(node!.offset, lineOffsets);

		// "title" value is on line 4 (1-indexed)
		expect(pos.line).toBe(4);
	});

	it("should find position at nested path", () => {
		const content = `{
  "components": {
    "schemas": {
      "User": {
        "type": "object"
      }
    }
  }
}`;

		const tree = jsonc.parseTree(content);
		expect(tree).toBeDefined();

		const lineOffsets = buildLineOffsets(content);

		// Find components/schemas/User node
		const node = jsonc.findNodeAtLocation(tree!, [
			"components",
			"schemas",
			"User",
		]);
		expect(node).toBeDefined();

		const pos = getLineCol(node!.offset, lineOffsets);

		// User object starts on line 4 (1-indexed)
		expect(pos.line).toBe(4);
	});

	it("should find position at array index", () => {
		const content = `{
  "tags": [
    { "name": "Pets" },
    { "name": "Users" }
  ]
}`;

		const tree = jsonc.parseTree(content);
		expect(tree).toBeDefined();

		const lineOffsets = buildLineOffsets(content);

		// Find tags/1 (second array element)
		const node = jsonc.findNodeAtLocation(tree!, ["tags", 1]);
		expect(node).toBeDefined();

		const pos = getLineCol(node!.offset, lineOffsets);

		// Second tag is on line 4 (1-indexed)
		expect(pos.line).toBe(4);
	});
});

describe("IR-based Pointer Lookup", () => {
	/**
	 * Normalize a JSON pointer to the canonical format with leading #.
	 */
	function normalizePointer(pointer: string): string {
		if (!pointer) return "#";
		if (pointer.startsWith("#")) return pointer;
		if (pointer.startsWith("/")) return `#${pointer}`;
		return `#/${pointer}`;
	}

	/**
	 * Find a node in the IR tree by its JSON pointer.
	 */
	function findNodeByPointer(node: IRNode, pointer: string): IRNode | null {
		const normalizedPointer = normalizePointer(pointer);

		if (node.ptr === normalizedPointer) {
			return node;
		}

		if (node.children) {
			for (const child of node.children) {
				const found = findNodeByPointer(child, pointer);
				if (found) return found;
			}
		}

		return null;
	}

	it("should find node at /components/schemas/User", () => {
		const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const ir = vc.getIR("file:///test.yaml");

		const userNode = findNodeByPointer(ir.root, "/components/schemas/User");
		expect(userNode).not.toBeNull();
		expect(userNode?.key).toBe("User");
	});

	it("should find node at #/components/schemas/User (with # prefix)", () => {
		const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const ir = vc.getIR("file:///test.yaml");

		const userNode = findNodeByPointer(ir.root, "#/components/schemas/User");
		expect(userNode).not.toBeNull();
		expect(userNode?.key).toBe("User");
	});

	it("should find nested node at /paths/~1pets/get", () => {
		const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /pets:
    get:
      summary: List pets
      responses:
        '200':
          description: OK`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const ir = vc.getIR("file:///test.yaml");

		// In the IR, the path is stored as the actual path, not escaped
		// Look for /pets key first
		const petsPath = findNodeByPointer(ir.root, "#/paths/~1pets");
		expect(petsPath).not.toBeNull();

		// Then find the get method
		const getNode = findNodeByPointer(ir.root, "#/paths/~1pets/get");
		expect(getNode).not.toBeNull();
		expect(getNode?.key).toBe("get");
	});

	it("should return null for non-existent path", () => {
		const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const ir = vc.getIR("file:///test.yaml");

		const missing = findNodeByPointer(ir.root, "/components/schemas/Missing");
		expect(missing).toBeNull();
	});

	it("should find root node at #", () => {
		const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const ir = vc.getIR("file:///test.yaml");

		const rootNode = findNodeByPointer(ir.root, "#");
		expect(rootNode).not.toBeNull();
		expect(rootNode?.ptr).toBe("#");
	});
});

describe("Document Link Resolution", () => {
	it("should resolve same-document reference to correct position", () => {
		const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /users:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: integer`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const ir = vc.getIR("file:///test.yaml");

		// Find the User schema node using IR pointer
		function findNodeByPointer(node: IRNode, pointer: string): IRNode | null {
			const normalized = pointer.startsWith("#") ? pointer : `#${pointer}`;
			if (node.ptr === normalized) return node;
			if (node.children) {
				for (const child of node.children) {
					const found = findNodeByPointer(child, pointer);
					if (found) return found;
				}
			}
			return null;
		}

		const userNode = findNodeByPointer(ir.root, "#/components/schemas/User");
		expect(userNode).not.toBeNull();
		expect(userNode?.loc).toBeDefined();

		// Convert to position
		const range = vc.locToRange(userNode!.loc);
		expect(range).not.toBeNull();
		expect(range!.start.line).toBeGreaterThan(0);
	});

	it("should handle cross-file reference with fragment", () => {
		// Test the fragment extraction logic
		const ref = "./schemas/common.yaml#/definitions/Error";
		const sourceUri = URI.parse("file:///api/openapi.yaml");

		// Resolve the reference
		const resolved = resolveRef(sourceUri, ref);

		// Fragment should be extracted
		expect(resolved.fragment).toBe("/definitions/Error");

		// Base path should be correct
		expect(resolved.path).toContain("schemas/common.yaml");
	});

	it("should handle same-document reference without fragment", () => {
		const ref = "#/components/schemas/User";
		const sourceUri = URI.parse("file:///api/openapi.yaml");

		// Resolve the reference (same-document)
		const resolved = resolveRef(sourceUri, ref);

		// For same-document refs, the path should be the same
		expect(resolved.fragment).toBe("/components/schemas/User");
	});

	it("should find position using IR for complex nested paths", () => {
		const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /users/{userId}/posts/{postId}:
    get:
      parameters:
        - name: userId
          in: path
          required: true
        - name: postId
          in: path
          required: true
      responses:
        '200':
          description: Success
components:
  schemas:
    Post:
      type: object`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const ir = vc.getIR("file:///test.yaml");

		// Find Post schema
		function findNodeByPointer(node: IRNode, pointer: string): IRNode | null {
			const normalized = pointer.startsWith("#") ? pointer : `#${pointer}`;
			if (node.ptr === normalized) return node;
			if (node.children) {
				for (const child of node.children) {
					const found = findNodeByPointer(child, pointer);
					if (found) return found;
				}
			}
			return null;
		}

		const postNode = findNodeByPointer(ir.root, "#/components/schemas/Post");
		expect(postNode).not.toBeNull();

		// Verify position
		const range = vc.locToRange(postNode!.loc);
		expect(range).not.toBeNull();
		// Post schema is at the end of the document
		expect(range!.start.line).toBeGreaterThan(10);
	});
});

describe("JSON Pointer Normalization", () => {
	function normalizePointer(pointer: string): string {
		if (!pointer) return "#";
		if (pointer.startsWith("#")) return pointer;
		if (pointer.startsWith("/")) return `#${pointer}`;
		return `#/${pointer}`;
	}

	it("should add # prefix to bare pointer", () => {
		expect(normalizePointer("/components/schemas/User")).toBe(
			"#/components/schemas/User",
		);
	});

	it("should preserve existing # prefix", () => {
		expect(normalizePointer("#/components/schemas/User")).toBe(
			"#/components/schemas/User",
		);
	});

	it("should handle empty pointer", () => {
		expect(normalizePointer("")).toBe("#");
	});

	it("should handle bare path segment", () => {
		expect(normalizePointer("components/schemas/User")).toBe(
			"#/components/schemas/User",
		);
	});
});

describe("Enhanced JSON Pointer Parsing", () => {
	/**
	 * Parse a JSON pointer string into path segments.
	 * Handles both /path and #/path formats.
	 */
	function parseJsonPointer(pointer: string): (string | number)[] {
		if (!pointer || pointer === "/") return [];

		// Remove leading # if present
		let normalized = pointer;
		if (normalized.startsWith("#")) {
			normalized = normalized.substring(1);
		}
		if (!normalized || normalized === "/") return [];

		const parts = normalized.startsWith("/")
			? normalized.substring(1)
			: normalized;
		return parts.split("/").map((segment) => {
			const unescaped = segment.replace(/~1/g, "/").replace(/~0/g, "~");
			const asNumber = Number(unescaped);
			return Number.isInteger(asNumber) && asNumber >= 0 ? asNumber : unescaped;
		});
	}

	it("should parse pointer with # prefix", () => {
		const path = parseJsonPointer("#/components/schemas/User");
		expect(path).toEqual(["components", "schemas", "User"]);
	});

	it("should parse pointer without # prefix", () => {
		const path = parseJsonPointer("/components/schemas/User");
		expect(path).toEqual(["components", "schemas", "User"]);
	});

	it("should parse escaped path segments", () => {
		const path = parseJsonPointer("#/paths/~1users~1{id}/get");
		expect(path).toEqual(["paths", "/users/{id}", "get"]);
	});

	it("should handle root pointer", () => {
		expect(parseJsonPointer("#")).toEqual([]);
		expect(parseJsonPointer("#/")).toEqual([]);
	});
});

describe("Document Link Data Structure", () => {
	/**
	 * Simulate provideDocumentLinks logic to test link data structure.
	 */
	function createDocumentLink(
		ref: string,
		sourceUriString: string,
	): { target: string; data?: { fragment?: string; sourceUri?: string } } {
		let target: string;
		let fragment: string | undefined;
		let isSameDocument = false;

		if (/^https?:/i.test(ref)) {
			// External URL - use as-is
			target = ref;
		} else if (ref.startsWith("#")) {
			// Same-document reference
			target = sourceUriString;
			fragment = ref.substring(1);
			isSameDocument = true;
		} else {
			// Relative file path - simulate resolution
			const baseUri = URI.parse(sourceUriString);
			const resolved = resolveRef(baseUri, ref);
			fragment = resolved.fragment || undefined;
			target = resolved.with({ fragment: "" }).toString();
		}

		return {
			target,
			data: fragment
				? {
						fragment,
						sourceUri: isSameDocument ? sourceUriString : undefined,
					}
				: undefined,
		};
	}

	it("should store sourceUri for same-document references", () => {
		const sourceUri = "file:///api/openapi.yaml";
		const ref = "#/components/schemas/User";

		const link = createDocumentLink(ref, sourceUri);

		expect(link.target).toBe(sourceUri);
		expect(link.data?.fragment).toBe("/components/schemas/User");
		expect(link.data?.sourceUri).toBe(sourceUri);
	});

	it("should not store sourceUri for cross-file references", () => {
		const sourceUri = "file:///api/openapi.yaml";
		const ref = "./schemas/User.yaml#/definitions/User";

		const link = createDocumentLink(ref, sourceUri);

		expect(link.target).toContain("schemas/User.yaml");
		expect(link.data?.fragment).toBe("/definitions/User");
		expect(link.data?.sourceUri).toBeUndefined();
	});

	it("should not have data for external URL references", () => {
		const sourceUri = "file:///api/openapi.yaml";
		const ref = "https://example.com/schemas/User.yaml";

		const link = createDocumentLink(ref, sourceUri);

		expect(link.target).toBe(ref);
		expect(link.data).toBeUndefined();
	});

	it("should not have data for relative refs without fragment", () => {
		const sourceUri = "file:///api/openapi.yaml";
		const ref = "./schemas/User.yaml";

		const link = createDocumentLink(ref, sourceUri);

		expect(link.target).toContain("schemas/User.yaml");
		expect(link.data).toBeUndefined();
	});
});

describe("Same-Document Link Resolution", () => {
	it("should find correct position for same-document $ref", () => {
		const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /users:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: integer`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const uri = "file:///test.yaml";
		const ir = vc.getIR(uri);

		// Simulate same-document link resolution
		const pointer = "/components/schemas/User";

		// Find node by pointer
		function findNodeByPointer(node: IRNode, ptr: string): IRNode | null {
			const normalized = ptr.startsWith("#") ? ptr : `#${ptr}`;
			if (node.ptr === normalized) return node;
			if (node.children) {
				for (const child of node.children) {
					const found = findNodeByPointer(child, ptr);
					if (found) return found;
				}
			}
			return null;
		}

		const targetNode = findNodeByPointer(ir.root, pointer);
		expect(targetNode).not.toBeNull();
		expect(targetNode?.key).toBe("User");

		// Get position
		const range = vc.locToRange(targetNode!.loc);
		expect(range).not.toBeNull();

		// User schema should be after the paths section
		// Line 15 is where "User:" appears (0-indexed: line 14)
		expect(range!.start.line).toBeGreaterThanOrEqual(14);
	});

	it("should handle complex same-document paths with slashes", () => {
		const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /users/{id}/posts:
    get:
      responses:
        '200':
          description: OK
components:
  schemas:
    Post:
      type: object`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const ir = vc.getIR("file:///test.yaml");

		// Find the path item with escaped slashes in pointer
		function findNodeByPointer(node: IRNode, ptr: string): IRNode | null {
			const normalized = ptr.startsWith("#") ? ptr : `#${ptr}`;
			if (node.ptr === normalized) return node;
			if (node.children) {
				for (const child of node.children) {
					const found = findNodeByPointer(child, ptr);
					if (found) return found;
				}
			}
			return null;
		}

		// The pointer uses ~1 to escape /
		const pathPointer = "/paths/~1users~1{id}~1posts";
		const pathNode = findNodeByPointer(ir.root, pathPointer);
		expect(pathNode).not.toBeNull();

		// The key should be the actual path, not the escaped version
		expect(pathNode?.key).toBe("/users/{id}/posts");
	});
});

describe("Cross-File Link Resolution", () => {
	it("should parse fragment from cross-file reference", () => {
		const sourceUri = URI.parse("file:///api/v1/openapi.yaml");
		const ref = "../common/schemas.yaml#/components/schemas/Error";

		const resolved = resolveRef(sourceUri, ref);

		// Fragment should be extracted
		expect(resolved.fragment).toBe("/components/schemas/Error");

		// Path should be resolved correctly
		expect(resolved.path).toContain("common/schemas.yaml");
	});

	it("should handle reference to root of another file", () => {
		const sourceUri = URI.parse("file:///api/openapi.yaml");
		const ref = "./paths/users.yaml";

		const resolved = resolveRef(sourceUri, ref);

		// No fragment
		expect(resolved.fragment).toBeFalsy();

		// Path should be resolved
		expect(resolved.path).toContain("paths/users.yaml");
	});

	it("should handle deeply nested cross-file references", () => {
		const sourceUri = URI.parse("file:///project/api/v1/openapi.yaml");
		const ref =
			"../../shared/components.yaml#/components/parameters/LimitParam";

		const resolved = resolveRef(sourceUri, ref);

		expect(resolved.fragment).toBe("/components/parameters/LimitParam");
		expect(resolved.path).toContain("shared/components.yaml");
	});
});

describe("Position Accuracy", () => {
	it("should provide exact character position for schema definition", () => {
		const yaml = `components:
  schemas:
    User:
      type: object`;

		const snapshot = createSnapshot(yaml);
		const vc = new OpenAPIVirtualCode(snapshot, "yaml");
		const ir = vc.getIR("file:///test.yaml");

		function findNodeByPointer(node: IRNode, ptr: string): IRNode | null {
			const normalized = ptr.startsWith("#") ? ptr : `#${ptr}`;
			if (node.ptr === normalized) return node;
			if (node.children) {
				for (const child of node.children) {
					const found = findNodeByPointer(child, ptr);
					if (found) return found;
				}
			}
			return null;
		}

		const userNode = findNodeByPointer(ir.root, "/components/schemas/User");
		expect(userNode).not.toBeNull();

		const range = vc.locToRange(userNode!.loc);
		expect(range).not.toBeNull();

		// "User" is on line 3 (0-indexed: line 2), but the value starts on line 4
		// The loc points to the value (type: object), not the key
		expect(range!.start.line).toBeGreaterThanOrEqual(2);
		expect(range!.start.line).toBeLessThanOrEqual(3);
	});

	it("should handle JSON format positions correctly", () => {
		const json = `{
  "components": {
    "schemas": {
      "User": {
        "type": "object"
      }
    }
  }
}`;

		const snapshot = createSnapshot(json);
		const vc = new OpenAPIVirtualCode(snapshot, "json");
		const ir = vc.getIR("file:///test.json");

		function findNodeByPointer(node: IRNode, ptr: string): IRNode | null {
			const normalized = ptr.startsWith("#") ? ptr : `#${ptr}`;
			if (node.ptr === normalized) return node;
			if (node.children) {
				for (const child of node.children) {
					const found = findNodeByPointer(child, ptr);
					if (found) return found;
				}
			}
			return null;
		}

		const userNode = findNodeByPointer(ir.root, "/components/schemas/User");
		expect(userNode).not.toBeNull();

		const range = vc.locToRange(userNode!.loc);
		expect(range).not.toBeNull();

		// "User" key is on line 4 (0-indexed: line 3)
		expect(range!.start.line).toBe(3);
	});
});
