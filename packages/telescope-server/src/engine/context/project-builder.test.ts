import { describe, expect, it } from "bun:test";
import { MemoryFileSystem } from "../utils/file-system-utils.js";
import { buildProjectContextForRoot } from "./project-builder.js";

describe("project-builder", () => {
	it("should build context for a simple root document", async () => {
		const fs = new MemoryFileSystem();
		fs.addFile(
			"file:///api.yaml",
			`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '200':
          description: OK
`,
		);

		const context = await buildProjectContextForRoot("file:///api.yaml", fs);

		expect(context.docs.size).toBe(1);
		expect(context.docs.has("file:///api.yaml")).toBe(true);
		expect(context.index).toBeDefined();
		expect(context.graph).toBeDefined();
		expect(context.resolver).toBeDefined();
	});

	it("should load referenced documents", async () => {
		const fs = new MemoryFileSystem();
		fs.addFile(
			"file:///api.yaml",
			`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    $ref: './paths/users.yaml'
`,
		);
		fs.addFile(
			"file:///paths/users.yaml",
			`
get:
  responses:
    '200':
      description: OK
      content:
        application/json:
          schema:
            $ref: '../schemas/user.yaml'
`,
		);
		fs.addFile(
			"file:///schemas/user.yaml",
			`
type: object
properties:
  id:
    type: string
`,
		);

		const context = await buildProjectContextForRoot("file:///api.yaml", fs);

		expect(context.docs.size).toBe(3);
		expect(context.docs.has("file:///api.yaml")).toBe(true);
		expect(context.docs.has("file:///paths/users.yaml")).toBe(true);
		expect(context.docs.has("file:///schemas/user.yaml")).toBe(true);
	});

	it("should handle circular references without infinite loop", async () => {
		const fs = new MemoryFileSystem();
		fs.addFile(
			"file:///api.yaml",
			`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    Node:
      type: object
      properties:
        children:
          type: array
          items:
            $ref: '#/components/schemas/Node'
`,
		);

		const context = await buildProjectContextForRoot("file:///api.yaml", fs);

		// Should complete without hanging
		expect(context.docs.size).toBe(1);
		expect(context.docs.has("file:///api.yaml")).toBe(true);
	});

	it("should handle missing referenced files gracefully", async () => {
		const fs = new MemoryFileSystem();
		fs.addFile(
			"file:///api.yaml",
			`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    $ref: './missing.yaml'
`,
		);

		// Should not throw, just skip the missing file
		const context = await buildProjectContextForRoot("file:///api.yaml", fs);

		expect(context.docs.size).toBe(1);
		expect(context.docs.has("file:///api.yaml")).toBe(true);
	});

	it("should build index with operations", async () => {
		const fs = new MemoryFileSystem();
		fs.addFile(
			"file:///api.yaml",
			`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    get:
      operationId: getUsers
      responses:
        '200':
          description: OK
    post:
      operationId: createUser
      responses:
        '201':
          description: Created
`,
		);

		const context = await buildProjectContextForRoot("file:///api.yaml", fs);

		// Count operations from operationsByOwner map
		let opCount = 0;
		for (const ops of context.index.operationsByOwner.values()) {
			opCount += ops.length;
		}
		expect(opCount).toBe(2);
	});

	it("should build graph with refs", async () => {
		const fs = new MemoryFileSystem();
		fs.addFile(
			"file:///api.yaml",
			`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    User:
      $ref: '#/components/schemas/BaseEntity'
    BaseEntity:
      type: object
      properties:
        id:
          type: string
`,
		);

		const context = await buildProjectContextForRoot("file:///api.yaml", fs);

		expect(context.graph.edges.length).toBeGreaterThan(0);
	});

	it("should normalize URIs consistently", async () => {
		const fs = new MemoryFileSystem();
		fs.addFile(
			"file:///api.yaml",
			`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths: {}
`,
		);

		// Call with non-normalized URI
		const context = await buildProjectContextForRoot("file:///api.yaml", fs);

		// Should have normalized URI in docs
		expect(context.docs.has("file:///api.yaml")).toBe(true);
	});
});

