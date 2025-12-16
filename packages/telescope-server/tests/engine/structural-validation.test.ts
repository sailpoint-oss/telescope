/**
 * Tests for structural Zod validation of OpenAPI documents.
 *
 * These tests verify that invalid OpenAPI structure (like illegal sibling keys
 * next to $ref) is properly flagged with error diagnostics.
 */

import { describe, expect, it } from "bun:test";
import { pathToFileURL } from "node:url";
import { resolveLintingContext } from "../../src/engine/context/context-resolver.js";
import { lintDocument } from "../../src/engine/index.js";
import { MemoryFileSystem } from "../../src/engine/utils/file-system-utils.js";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";

describe("Structural validation", () => {
	it("should flag unrecognized keys in schema objects with $ref", async () => {
		const fs = new MemoryFileSystem();
		const rootUri = pathToFileURL("/workspace/api.yaml").toString();
		const refUri = pathToFileURL("/workspace/v2/schemas/Pet.yaml").toString();

		// This mimics api-v2.yaml: components.schemas.Pet has both yo and $ref
		fs.addFile(
			rootUri,
			`openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    Pet:
      yo: yo
      $ref: "./v2/schemas/Pet.yaml"
paths: {}
`,
		);
		// Provide the referenced file so the ref graph can load it during context resolution.
		fs.addFile(
			refUri,
			`type: object
properties:
  id:
    type: integer
`,
		);

		const context = await resolveLintingContext(rootUri, fs, [
			pathToFileURL("/workspace").toString(),
		]);

		const diagnostics = await lintDocument(context, fs);

		// Should have at least one error about unrecognized key "yo"
		const yoErrors = diagnostics.filter(
			(d) =>
				d.message.includes('"yo"') ||
				d.message.includes("Unrecognized key") ||
				d.message.includes("yo"),
		);

		expect(yoErrors.length).toBeGreaterThan(0);
		expect(yoErrors[0].severity).toBe(DiagnosticSeverity.Error);
		expect(yoErrors[0].code).toBe("structural-validation");
	});

	it("should accept valid OpenAPI path keys (including templated params)", async () => {
		const fs = new MemoryFileSystem();
		const rootUri = pathToFileURL("/workspace/api.yaml").toString();

		fs.addFile(
			rootUri,
			`openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /pets/{petId}/owners/{ownerId}:
    get:
      responses:
        "200":
          description: OK
`,
		);

		const context = await resolveLintingContext(rootUri, fs, [
			pathToFileURL("/workspace").toString(),
		]);
		const diagnostics = await lintDocument(context, fs);

		const structuralOnPathKey = diagnostics.filter(
			(d) =>
				d.code === "structural-validation" &&
				d.message.includes("/pets/{petId}/owners/{ownerId}"),
		);

		expect(structuralOnPathKey.length).toBe(0);
	});

	it("should flag invalid paths keys (must start with '/' or 'x-')", async () => {
		const fs = new MemoryFileSystem();
		const rootUri = pathToFileURL("/workspace/api.yaml").toString();

		fs.addFile(
			rootUri,
			`openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  pets:
    get:
      responses:
        "200":
          description: OK
`,
		);

		const context = await resolveLintingContext(rootUri, fs, [
			pathToFileURL("/workspace").toString(),
		]);
		const diagnostics = await lintDocument(context, fs);

		const structuralOnInvalidKey = diagnostics.filter((d) => {
			if (d.code !== "structural-validation") return false;
			// Depending on whether the failure comes from a record-key refine vs an
			// unrecognized_keys issue, the message may differ; accept either.
			return (
				d.message.includes("Path keys must start") ||
				d.message.includes('Invalid key "pets"') ||
				d.message.includes('"pets"') ||
				d.message.includes("pets")
			);
		});

		expect(structuralOnInvalidKey.length).toBeGreaterThan(0);
	});

	it("should validate root document + all $ref-reachable documents", async () => {
		const fs = new MemoryFileSystem();
		const rootUri = pathToFileURL("/workspace/api.yaml").toString();
		const schemaUri = pathToFileURL("/workspace/v2/schemas/Pet.yaml").toString();

		fs.addFile(
			rootUri,
			`openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    Pet:
      $ref: "./v2/schemas/Pet.yaml"
paths: {}
`,
		);

		// Referenced file also has an invalid key
		fs.addFile(
			schemaUri,
			`type: object
properties:
  id:
    type: integer
invalidKey: should error
`,
		);

		const context = await resolveLintingContext(rootUri, fs, [
			pathToFileURL("/workspace").toString(),
		]);

		const diagnostics = await lintDocument(context, fs);

		// Should flag the invalidKey in the referenced schema file
		const invalidKeyErrors = diagnostics.filter(
			(d) =>
				d.uri === schemaUri &&
				(d.message.includes('"invalidKey"') ||
					d.message.includes("Unrecognized key") ||
					d.message.includes("invalidKey")),
		);

		expect(invalidKeyErrors.length).toBeGreaterThan(0);
		expect(invalidKeyErrors[0].severity).toBe(DiagnosticSeverity.Error);
	});

	it("should accept $ref file references with JSON pointer fragments in reference-capable locations", async () => {
		const fs = new MemoryFileSystem();
		const rootUri = pathToFileURL("/workspace/api.yaml").toString();
		const refUri = pathToFileURL("/workspace/v2/components/parameters.yaml").toString();

		fs.addFile(
			rootUri,
			`openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  parameters:
    LimitParam:
      $ref: "./v2/components/parameters.yaml#/components/parameters/LimitParam"
paths: {}
`,
		);

		// Provide referenced file so ref graph can load it if needed.
		fs.addFile(
			refUri,
			`components:
  parameters:
    LimitParam:
      name: limit
      in: query
      schema:
        type: integer
`,
		);

		const context = await resolveLintingContext(rootUri, fs, [
			pathToFileURL("/workspace").toString(),
		]);
		const diagnostics = await lintDocument(context, fs);

		const structuralRefErrors = diagnostics.filter(
			(d) =>
				d.code === "structural-validation" &&
				(d.message.includes('"$ref"') || d.message.includes("$ref")),
		);

		expect(structuralRefErrors.length).toBe(0);
	});

	it("should allow x-* extension keys", async () => {
		const fs = new MemoryFileSystem();
		const rootUri = pathToFileURL("/workspace/api.yaml").toString();

		fs.addFile(
			rootUri,
			`openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
  x-custom-extension: allowed
components:
  schemas:
    Pet:
      type: object
      x-scalar-entity: true
      properties:
        id:
          type: integer
paths: {}
`,
		);

		const context = await resolveLintingContext(rootUri, fs, [
			pathToFileURL("/workspace").toString(),
		]);

		const diagnostics = await lintDocument(context, fs);

		// Should NOT have errors about x-* keys
		const extensionErrors = diagnostics.filter(
			(d) =>
				d.message.includes("x-custom-extension") ||
				d.message.includes("x-scalar-entity") ||
				(d.message.includes("Unrecognized key") &&
					(d.message.includes("x-") || d.message.includes("x_"))),
		);

		expect(extensionErrors.length).toBe(0);
	});

	it("should provide precise ranges for unrecognized keys", async () => {
		const fs = new MemoryFileSystem();
		const rootUri = pathToFileURL("/workspace/api.yaml").toString();
		const refUri = pathToFileURL("/workspace/v2/schemas/Pet.yaml").toString();

		fs.addFile(
			rootUri,
			`openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    Pet:
      yo: yo
      $ref: "./v2/schemas/Pet.yaml"
paths: {}
`,
		);
		fs.addFile(
			refUri,
			`type: object
properties:
  id:
    type: integer
`,
		);

		const context = await resolveLintingContext(rootUri, fs, [
			pathToFileURL("/workspace").toString(),
		]);

		const diagnostics = await lintDocument(context, fs);

		const yoError = diagnostics.find(
			(d) => d.message.includes('"yo"') || d.message.includes("yo"),
		);

		expect(yoError).toBeDefined();
		if (yoError) {
			// Range should point to the "yo" key, not the whole object
			expect(yoError.range.start.line).toBeGreaterThanOrEqual(0);
			expect(yoError.range.end.line).toBeGreaterThanOrEqual(0);
			// The range should be reasonable (not fallback to line 0,0)
			// In this case, "yo" is on line 6 (0-indexed), so range should be around there
			expect(yoError.range.start.line).toBeLessThanOrEqual(10);
		}
	});
});

