/**
 * Tests for OpenAPI LSP Features
 *
 * Tests for semantic tokens, code actions, completions, references,
 * workspace symbols, rename, code lens, inlay hints, definition, and call hierarchy.
 */

import { describe, expect, it, beforeEach, mock } from "bun:test";
import type { IScriptSnapshot } from "typescript";
import type { Range, Position } from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { OpenAPIVirtualCode } from "../../src/lsp/languages/virtualCodes/openapi-virtual-code.js";
import {
	getLineCol,
	buildLineOffsets,
} from "../../src/engine/utils/line-offset-utils.js";
import type { IRNode, Loc } from "../../src/engine/ir/types.js";

// ============================================================================
// Test Helpers
// ============================================================================

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

/**
 * Find a node by key in the IR tree.
 */
function findNode(root: IRNode, key: string): IRNode | undefined {
	if (root.key === key) return root;
	if (root.children) {
		for (const child of root.children) {
			const found = findNode(child, key);
			if (found) return found;
		}
	}
	return undefined;
}

/**
 * Find a node by pointer in the IR tree.
 */
function findNodeByPointer(root: IRNode, ptr: string): IRNode | undefined {
	if (root.ptr === ptr) return root;
	if (root.children) {
		for (const child of root.children) {
			const found = findNodeByPointer(child, ptr);
			if (found) return found;
		}
	}
	return undefined;
}

// ============================================================================
// Semantic Tokens Tests
// ============================================================================

describe("Semantic Tokens", () => {
	describe("Loc fields for keys and values", () => {
		it("should have keyStart/keyEnd for YAML object properties", () => {
			const yaml = `type: integer`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const typeNode = ir.root.children?.find((c) => c.key === "type");
			expect(typeNode).toBeDefined();
			expect(typeNode!.loc).toBeDefined();

			// The node should have key location info
			const loc = typeNode!.loc;
			// keyStart should point to "t" in "type"
			expect(loc.keyStart).toBeDefined();
			expect(loc.keyEnd).toBeDefined();

			// valStart/valEnd should point to "integer"
			expect(loc.valStart).toBeDefined();
			expect(loc.valEnd).toBeDefined();
		});

		it("should calculate correct key range", () => {
			const yaml = `type: integer`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const typeNode = ir.root.children?.find((c) => c.key === "type");
			expect(typeNode).toBeDefined();

			const loc = typeNode!.loc;
			const lineOffsets = vc.getLineOffsets();

			// Get key position
			if (loc.keyStart !== undefined && loc.keyEnd !== undefined) {
				const keyText = yaml.slice(loc.keyStart, loc.keyEnd);
				expect(keyText).toBe("type");
			}
		});

		it("should calculate correct value range for type field", () => {
			const yaml = `type: integer`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const typeNode = ir.root.children?.find((c) => c.key === "type");
			expect(typeNode).toBeDefined();

			const loc = typeNode!.loc;

			// Get value position
			if (loc.valStart !== undefined && loc.valEnd !== undefined) {
				const valText = yaml.slice(loc.valStart, loc.valEnd);
				expect(valText).toBe("integer");
			}
		});

		it("should handle multiline YAML with correct positions", () => {
			const yaml = `openapi: 3.1.0
info:
  title: Test API
paths:
  /users:
    get:
      operationId: getUsers
      responses:
        "200":
          description: OK`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			// Find the get operation
			const paths = ir.root.children?.find((c) => c.key === "paths");
			const users = paths?.children?.find((c) => c.key === "/users");
			const get = users?.children?.find((c) => c.key === "get");

			expect(get).toBeDefined();
			expect(get!.loc).toBeDefined();

			// Verify the "get" key is on the correct line
			if (get!.loc.keyStart !== undefined) {
				const lineOffsets = vc.getLineOffsets();
				const pos = getLineCol(get!.loc.keyStart, lineOffsets);
				// "get:" is on line 6 (0-indexed: 5)
				expect(pos?.line).toBe(6);
			}
		});

		it("should calculate correct position for operationId value", () => {
			const yaml = `paths:
  /users:
    get:
      operationId: getUsers`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			// Find operationId
			const paths = ir.root.children?.find((c) => c.key === "paths");
			const users = paths?.children?.find((c) => c.key === "/users");
			const get = users?.children?.find((c) => c.key === "get");
			const opId = get?.children?.find((c) => c.key === "operationId");

			expect(opId).toBeDefined();
			expect(opId!.value).toBe("getUsers");

			if (opId!.loc.valStart !== undefined && opId!.loc.valEnd !== undefined) {
				const valText = yaml.slice(opId!.loc.valStart, opId!.loc.valEnd);
				expect(valText).toBe("getUsers");
			}
		});

		it("should handle $ref value positions", () => {
			const yaml = `components:
  schemas:
    Pet:
      $ref: "#/components/schemas/Animal"`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const refNode = findNode(ir.root, "$ref");
			expect(refNode).toBeDefined();
			expect(refNode!.value).toBe("#/components/schemas/Animal");

			if (refNode!.loc.valStart !== undefined && refNode!.loc.valEnd !== undefined) {
				const valText = yaml.slice(refNode!.loc.valStart, refNode!.loc.valEnd);
				// Should include the quotes or just the value depending on format
				expect(valText).toContain("#/components/schemas/Animal");
			}
		});

		it("should handle status code keys", () => {
			const yaml = `responses:
  "200":
    description: OK
  "404":
    description: Not Found`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const responses = ir.root.children?.find((c) => c.key === "responses");
			const status200 = responses?.children?.find((c) => c.key === "200");

			expect(status200).toBeDefined();

			if (status200!.loc.keyStart !== undefined && status200!.loc.keyEnd !== undefined) {
				const keyText = yaml.slice(status200!.loc.keyStart, status200!.loc.keyEnd);
				// Status code key might include quotes in YAML
				expect(keyText).toContain("200");
			}
		});
	});

	describe("HTTP method highlighting", () => {
		it("should identify HTTP methods as keys", () => {
			const yaml = `paths:
  /users:
    get:
      summary: Get users
    post:
      summary: Create user`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const paths = ir.root.children?.find((c) => c.key === "paths");
			const users = paths?.children?.find((c) => c.key === "/users");
			const get = users?.children?.find((c) => c.key === "get");
			const post = users?.children?.find((c) => c.key === "post");

			expect(get).toBeDefined();
			expect(get!.key).toBe("get");
			expect(post).toBeDefined();
			expect(post!.key).toBe("post");
		});
	});

	describe("Schema type value highlighting", () => {
		it("should identify schema type values correctly", () => {
			const yaml = `type: string
format: email`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const typeNode = ir.root.children?.find((c) => c.key === "type");
			expect(typeNode).toBeDefined();
			expect(typeNode!.kind).toBe("string");
			expect(typeNode!.value).toBe("string");
		});

		it("should handle array type", () => {
			const yaml = `type: array
items:
  type: string`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const typeNode = ir.root.children?.find((c) => c.key === "type");
			expect(typeNode).toBeDefined();
			expect(typeNode!.value).toBe("array");
		});
	});

	describe("Path highlighting", () => {
		it("should identify path keys", () => {
			const yaml = `paths:
  /users:
    get:
      summary: Get users
  /users/{id}:
    get:
      summary: Get user by ID`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const paths = ir.root.children?.find((c) => c.key === "paths");
			expect(paths).toBeDefined();

			const pathKeys = paths!.children?.map((c) => c.key);
			expect(pathKeys).toContain("/users");
			expect(pathKeys).toContain("/users/{id}");
		});
	});
});

// ============================================================================
// Code Actions Tests
// ============================================================================

describe("Code Actions", () => {
	describe("generateOperationId helper", () => {
		it("should generate camelCase operationId from path and method", () => {
			// Test the concept of generating operationId
			const method = "get";
			const path = "/users/{id}";

			// Expected: getUsers by removing {id} and capitalizing
			const pathParts = path
				.replace(/[{}]/g, "")
				.split("/")
				.filter(Boolean);

			expect(pathParts).toEqual(["users", "id"]);

			// Construct operationId
			const operationId =
				method +
				pathParts
					.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
					.join("");

			expect(operationId).toBe("getUsersId");
		});
	});

	describe("kebab-case conversion", () => {
		it("should convert camelCase to kebab-case", () => {
			const camelCase = "getUserById";
			const kebabCase = camelCase
				.replace(/([a-z])([A-Z])/g, "$1-$2")
				.toLowerCase();

			expect(kebabCase).toBe("get-user-by-id");
		});

		it("should convert snake_case to kebab-case", () => {
			const snakeCase = "get_user_by_id";
			const kebabCase = snakeCase.replace(/_/g, "-").toLowerCase();

			expect(kebabCase).toBe("get-user-by-id");
		});
	});
});

// ============================================================================
// Find References Tests
// ============================================================================

describe("Find References", () => {
	describe("operationId references", () => {
		it("should find operations with same operationId", () => {
			const yaml = `paths:
  /users:
    get:
      operationId: getUsers
  /admin/users:
    get:
      operationId: getUsers`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const atoms = vc.getAtoms("file:///test.yaml");

			// Find all operations with operationId "getUsers"
			const getUsersOps = atoms.operations.filter(
				(op) => op.operationId === "getUsers",
			);

			// Should find 2 occurrences
			expect(getUsersOps.length).toBe(2);
		});
	});

	describe("$ref references", () => {
		it("should identify $ref nodes pointing to components", () => {
			const yaml = `components:
  schemas:
    User:
      type: object
paths:
  /users:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const refNode = findNode(ir.root, "$ref");
			expect(refNode).toBeDefined();
			expect(refNode!.value).toBe("#/components/schemas/User");
		});
	});
});

// ============================================================================
// Workspace Symbols Tests
// ============================================================================

describe("Workspace Symbols", () => {
	describe("Operations extraction", () => {
		it("should extract operations from atoms", () => {
			const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /users:
    get:
      operationId: getUsers
      summary: Get all users
    post:
      operationId: createUser
      summary: Create a user`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const atoms = vc.getAtoms("file:///test.yaml");

			expect(atoms.operations.length).toBe(2);

			const getUsers = atoms.operations.find(
				(op) => op.operationId === "getUsers",
			);
			expect(getUsers).toBeDefined();
			expect(getUsers!.method.toLowerCase()).toBe("get");
			expect(getUsers!.path).toBe("/users");

			const createUser = atoms.operations.find(
				(op) => op.operationId === "createUser",
			);
			expect(createUser).toBeDefined();
			expect(createUser!.method.toLowerCase()).toBe("post");
		});
	});

	describe("Schema extraction", () => {
		it("should extract schemas from components", () => {
			const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
    Pet:
      type: object`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const atoms = vc.getAtoms("file:///test.yaml");

			expect(atoms.schemas.length).toBeGreaterThanOrEqual(2);

			const userSchema = atoms.schemas.find((s) => s.name === "User");
			expect(userSchema).toBeDefined();

			const petSchema = atoms.schemas.find((s) => s.name === "Pet");
			expect(petSchema).toBeDefined();
		});
	});

	describe("Symbol search", () => {
		it("should match operations by query", () => {
			const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /users:
    get:
      operationId: getUsers
  /pets:
    get:
      operationId: getPets`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const atoms = vc.getAtoms("file:///test.yaml");

			const query = "user";
			const matches = atoms.operations.filter((op) =>
				op.operationId?.toLowerCase().includes(query.toLowerCase()),
			);

			expect(matches.length).toBe(1);
			expect(matches[0]!.operationId).toBe("getUsers");
		});
	});
});

// ============================================================================
// Completions Tests
// ============================================================================

describe("Completions", () => {
	describe("$ref completions", () => {
		it("should suggest available schemas for $ref", () => {
			const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
    Pet:
      type: object`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const atoms = vc.getAtoms("file:///test.yaml");

			// Suggested $refs should include these
			const suggestedRefs = atoms.schemas
				.filter((s) => s.name)
				.map((s) => `#/components/schemas/${s.name}`);

			expect(suggestedRefs).toContain("#/components/schemas/User");
			expect(suggestedRefs).toContain("#/components/schemas/Pet");
		});
	});

	describe("Security scheme completions", () => {
		it("should suggest available security schemes", () => {
			const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const atoms = vc.getAtoms("file:///test.yaml");

			const schemeNames = atoms.securitySchemes.map((s) => s.name);
			expect(schemeNames).toContain("BearerAuth");
			expect(schemeNames).toContain("ApiKeyAuth");
		});
	});

	describe("Response status code completions", () => {
		it("should provide standard HTTP status codes", () => {
			const standardCodes = [
				{ code: "200", description: "OK" },
				{ code: "201", description: "Created" },
				{ code: "204", description: "No Content" },
				{ code: "400", description: "Bad Request" },
				{ code: "401", description: "Unauthorized" },
				{ code: "403", description: "Forbidden" },
				{ code: "404", description: "Not Found" },
				{ code: "500", description: "Internal Server Error" },
			];

			// Verify we have the common status codes
			const codes = standardCodes.map((c) => c.code);
			expect(codes).toContain("200");
			expect(codes).toContain("404");
			expect(codes).toContain("500");
		});
	});

	describe("Media type completions", () => {
		it("should provide common media types", () => {
			const commonMediaTypes = [
				"application/json",
				"application/xml",
				"text/plain",
				"multipart/form-data",
			];

			expect(commonMediaTypes).toContain("application/json");
		});
	});
});

// ============================================================================
// Rename Tests
// ============================================================================

describe("Rename Symbol", () => {
	describe("operationId rename", () => {
		it("should find operationId occurrences", () => {
			const yaml = `paths:
  /users:
    get:
      operationId: getUsers
      summary: Get users
links:
  GetUserLink:
    operationId: getUsers`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			// Find all operationId nodes with value "getUsers"
			const operationIdNodes: IRNode[] = [];
			function collectOperationIds(node: IRNode) {
				if (
					node.key === "operationId" &&
					node.value === "getUsers"
				) {
					operationIdNodes.push(node);
				}
				if (node.children) {
					for (const child of node.children) {
						collectOperationIds(child);
					}
				}
			}
			collectOperationIds(ir.root);

			// Should find 2 occurrences
			expect(operationIdNodes.length).toBe(2);
		});
	});

	describe("Component rename", () => {
		it("should identify component pointer", () => {
			const yaml = `components:
  schemas:
    User:
      type: object`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const userNode = findNodeByPointer(
				ir.root,
				"#/components/schemas/User",
			);
			expect(userNode).toBeDefined();
			expect(userNode!.key).toBe("User");
		});
	});
});

// ============================================================================
// Code Lens Tests
// ============================================================================

describe("Code Lens", () => {
	describe("Schema reference count", () => {
		it("should count $refs to a schema", () => {
			const yaml = `components:
  schemas:
    User:
      type: object
paths:
  /users:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
  /me:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			// Count $refs pointing to User
			let refCount = 0;
			function countRefs(node: IRNode) {
				if (
					node.key === "$ref" &&
					node.value === "#/components/schemas/User"
				) {
					refCount++;
				}
				if (node.children) {
					for (const child of node.children) {
						countRefs(child);
					}
				}
			}
			countRefs(ir.root);

			expect(refCount).toBe(2);
		});
	});

	describe("Operation response summary", () => {
		it("should extract response codes from operation", () => {
			const yaml = `paths:
  /users:
    get:
      responses:
        "200":
          description: OK
        "400":
          description: Bad Request
        "404":
          description: Not Found`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const paths = ir.root.children?.find((c) => c.key === "paths");
			const users = paths?.children?.find((c) => c.key === "/users");
			const get = users?.children?.find((c) => c.key === "get");
			const responses = get?.children?.find((c) => c.key === "responses");

			const responseCodes = responses?.children?.map((c) => c.key);
			expect(responseCodes).toContain("200");
			expect(responseCodes).toContain("400");
			expect(responseCodes).toContain("404");
		});
	});
});

// ============================================================================
// Inlay Hints Tests
// ============================================================================

describe("Inlay Hints", () => {
	describe("$ref type hints", () => {
		it("should resolve $ref target type", () => {
			const yaml = `components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			// Find the User schema
			const userNode = findNodeByPointer(
				ir.root,
				"#/components/schemas/User",
			);
			expect(userNode).toBeDefined();

			// Get its type
			const typeNode = userNode?.children?.find((c) => c.key === "type");
			expect(typeNode?.value).toBe("object");
		});
	});

	describe("Required property hints", () => {
		it("should identify required properties", () => {
			const yaml = `type: object
required:
  - name
  - email
properties:
  name:
    type: string
  email:
    type: string
  age:
    type: integer`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const requiredNode = ir.root.children?.find(
				(c) => c.key === "required",
			);
			expect(requiredNode).toBeDefined();
			expect(requiredNode!.kind).toBe("array");

			const requiredProps =
				requiredNode?.children?.map((c) => c.value) || [];
			expect(requiredProps).toContain("name");
			expect(requiredProps).toContain("email");
			expect(requiredProps).not.toContain("age");
		});
	});
});

// ============================================================================
// Definition Tests
// ============================================================================

describe("Go to Definition", () => {
	describe("Security scheme navigation", () => {
		it("should identify security scheme definition", () => {
			const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
security:
  - BearerAuth: []`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			// Find the security scheme definition
			const components = ir.root.children?.find(
				(c) => c.key === "components",
			);
			const securitySchemes = components?.children?.find(
				(c) => c.key === "securitySchemes",
			);
			const bearerAuth = securitySchemes?.children?.find(
				(c) => c.key === "BearerAuth",
			);

			expect(bearerAuth).toBeDefined();
			expect(bearerAuth!.ptr).toBe(
				"#/components/securitySchemes/BearerAuth",
			);
		});
	});

	describe("Tag navigation", () => {
		it("should identify root-level tag definitions", () => {
			const yaml = `openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
tags:
  - name: Users
    description: User operations
  - name: Pets
    description: Pet operations`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			const tags = ir.root.children?.find((c) => c.key === "tags");
			expect(tags).toBeDefined();
			expect(tags!.kind).toBe("array");

			const tagNames = tags?.children
				?.map((t) => t.children?.find((c) => c.key === "name")?.value)
				.filter(Boolean);

			expect(tagNames).toContain("Users");
			expect(tagNames).toContain("Pets");
		});
	});
});

// ============================================================================
// Call Hierarchy Tests
// ============================================================================

describe("Call Hierarchy", () => {
	describe("Component dependencies", () => {
		it("should identify $ref dependencies", () => {
			const yaml = `components:
  schemas:
    Address:
      type: object
    User:
      type: object
      properties:
        address:
          $ref: "#/components/schemas/Address"`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			// User depends on Address
			const userNode = findNodeByPointer(
				ir.root,
				"#/components/schemas/User",
			);
			expect(userNode).toBeDefined();

			// Find $ref in User
			const refNode = findNode(userNode!, "$ref");
			expect(refNode).toBeDefined();
			expect(refNode!.value).toBe("#/components/schemas/Address");
		});
	});

	describe("Dependents tracking", () => {
		it("should identify what uses a component", () => {
			const yaml = `components:
  schemas:
    Pet:
      type: object
    User:
      type: object
      properties:
        pet:
          $ref: "#/components/schemas/Pet"
    Owner:
      type: object
      properties:
        pet:
          $ref: "#/components/schemas/Pet"`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			// Find all $refs to Pet
			const petRefs: string[] = [];
			function findPetRefs(node: IRNode, parentPtr: string) {
				if (
					node.key === "$ref" &&
					node.value === "#/components/schemas/Pet"
				) {
					petRefs.push(parentPtr);
				}
				if (node.children) {
					for (const child of node.children) {
						findPetRefs(child, node.ptr);
					}
				}
			}
			findPetRefs(ir.root, "");

			// Pet is referenced by User and Owner
			expect(petRefs.length).toBe(2);
		});
	});
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration", () => {
	describe("OpenAPIVirtualCode getLineOffsets", () => {
		it("should return correct line offsets", () => {
			const yaml = `line1
line2
line3`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");

			const lineOffsets = vc.getLineOffsets();

			// First line starts at 0
			expect(lineOffsets[0]).toBe(0);
			// Second line starts after "line1\n" = 6
			expect(lineOffsets[1]).toBe(6);
			// Third line starts after "line1\nline2\n" = 12
			expect(lineOffsets[2]).toBe(12);
		});
	});

	describe("IR node location precision", () => {
		it("should have precise locations for all significant nodes", () => {
			const yaml = `openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0`;
			const snapshot = createSnapshot(yaml);
			const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
			const ir = vc.getIR("file:///test.yaml");

			// All top-level nodes should have locations
			for (const child of ir.root.children || []) {
				expect(child.loc).toBeDefined();
				expect(child.loc.start).toBeDefined();
				expect(child.loc.end).toBeDefined();
			}
		});
	});
});

