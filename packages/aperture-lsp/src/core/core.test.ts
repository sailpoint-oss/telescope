import { beforeEach, describe, expect, it } from "bun:test";
import type { CancellationToken } from "@volar/language-service";
import type { ApertureVolarContext } from "../workspace/context.js";
import { Core } from "./core.js";

class MockContext implements Partial<ApertureVolarContext> {
	logger = {
		log: () => {},
		error: () => {},
		warn: () => {},
	};

	getLogger() {
		return this.logger;
	}

	addRootDocument(_uri: string): void {
		// Mock implementation
	}

	removeRootDocument(_uri: string): void {
		// Mock implementation
	}
}

describe("Core", () => {
	let core: Core;
	let context: ApertureVolarContext;

	beforeEach(() => {
		context = new MockContext() as unknown as ApertureVolarContext;
		core = new Core(context);
	});

	it("should update document and build IR", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
		});

		core.updateDocument("file:///test.json", json, "json", 1, undefined);

		const ir = core.getIR("file:///test.json");
		expect(ir).toBeDefined();
		expect(ir?.format).toBe("json");
		expect(ir?.version).toBe("3.1");
	});

	it("should extract atoms from document", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
			paths: {
				"/users": {
					get: {
						operationId: "listUsers",
					},
				},
			},
		});

		core.updateDocument("file:///test.json", json, "json", 1, undefined);

		const atoms = core.getAtoms("file:///test.json");
		expect(atoms).toBeDefined();
		expect(atoms?.operations.length).toBe(1);
		expect(atoms?.operations[0]?.operationId).toBe("listUsers");
	});

	it("should track affected URIs", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
		});

		core.updateDocument("file:///test.json", json, "json", 1, undefined);

		const affected = core.getAffectedUris();
		expect(affected).toContain("file:///test.json");
	});

	it("should remove document from cache", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
		});

		core.updateDocument("file:///test.json", json, "json", 1, undefined);
		expect(core.getIR("file:///test.json")).toBeDefined();

		core.removeDocument("file:///test.json");
		expect(core.getIR("file:///test.json")).toBeUndefined();
	});

	it("should handle YAML documents", () => {
		const yaml = "openapi: 3.1.0\ninfo:\n  title: Test\n  version: 1.0.0";

		core.updateDocument("file:///test.yaml", yaml, "yaml", 1, undefined);

		const ir = core.getIR("file:///test.yaml");
		expect(ir).toBeDefined();
		expect(ir?.format).toBe("yaml");
	});

	it("should respect cancellation token", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
		});

		const token: CancellationToken = {
			isCancellationRequested: true,
			onCancellationRequested: (listener) => ({ dispose: () => {} }),
		};

		core.updateDocument("file:///test.json", json, "json", 1, token);

		// Should not have processed the document
		const ir = core.getIR("file:///test.json");
		expect(ir).toBeUndefined();
	});

	it("should update graph index on document update", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
			components: {
				schemas: {
					User: {
						$ref: "./other.json#/definitions/User",
					},
				},
			},
		});

		core.updateDocument("file:///test.json", json, "json", 1, undefined);

		const graphIndex = core.getGraphIndex();
		// Check if there are any references from this URI (at any pointer level)
		const refs = graphIndex.getRefEdgesFrom("file:///test.json");
		expect(refs.length).toBeGreaterThan(0);
		expect(refs[0]?.ref).toContain("other.json");
	});

	it("should update operation ID index", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
			paths: {
				"/users": {
					get: {
						operationId: "listUsers",
					},
				},
			},
		});

		core.updateDocument("file:///test.json", json, "json", 1, undefined);

		const opIdIndex = core.getOpIdIndex();
		const occurrences = opIdIndex.getOccurrences("listUsers");
		expect(occurrences.length).toBe(1);
		expect(opIdIndex.isUnique("listUsers")).toBe(true);
	});

	it("should get linked URIs", () => {
		const json1 = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
			components: {
				schemas: {
					User: {
						type: "object",
					},
				},
			},
		});

		const json2 = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
			components: {
				schemas: {
					Profile: {
						$ref: "./test.json#/components/schemas/User",
					},
				},
			},
		});

		core.updateDocument("file:///test.json", json1, "json", 1, undefined);
		core.updateDocument("file:///other.json", json2, "json", 1, undefined);

		const linked = core.getLinkedUris("file:///test.json");
		expect(linked).toContain("file:///other.json");

		const linked2 = core.getLinkedUris("file:///other.json");
		expect(linked2).toContain("file:///test.json");
	});

	it("should convert Loc to Range", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
		});

		core.updateDocument("file:///test.json", json, "json", 1, undefined);

		const ir = core.getIR("file:///test.json");
		expect(ir).toBeDefined();

		if (ir) {
			const range = core.locToRange("file:///test.json", ir.root.loc);
			expect(range).toBeDefined();
			expect(range?.start.line).toBeGreaterThanOrEqual(0);
			expect(range?.start.character).toBeGreaterThanOrEqual(0);
			expect(range?.end.line).toBeGreaterThanOrEqual(range?.start.line ?? 0);
		}
	});

	it("should return null for locToRange when document not found", () => {
		const range = core.locToRange("file:///nonexistent.json", {
			start: 0,
			end: 10,
		});
		expect(range).toBeNull();
	});
});
