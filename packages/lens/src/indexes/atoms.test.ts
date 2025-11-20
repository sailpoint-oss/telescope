import { describe, expect, it } from "bun:test";
import { parseTree } from "jsonc-parser";
import { buildIRFromJson } from "../ir/builder-json.js";
import { extractAtoms } from "./atoms.js";

describe("extractAtoms", () => {
	it("should extract operations from paths", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
			paths: {
				"/users": {
					get: {
						operationId: "listUsers",
						tags: ["users"],
					},
					post: {
						operationId: "createUser",
						tags: ["users"],
					},
				},
			},
		});

		const ast = JSON.parse(json);
		const tree = parseTree(json);
		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			"hash",
			Date.now(),
			"3.1",
		);

		const atoms = extractAtoms(ir);

		expect(atoms.operations.length).toBe(2);
		expect(atoms.operations[0]?.operationId).toBe("listUsers");
		expect(atoms.operations[0]?.method).toBe("GET");
		expect(atoms.operations[0]?.path).toBe("/users");
		expect(atoms.operations[1]?.operationId).toBe("createUser");
		expect(atoms.operations[1]?.method).toBe("POST");
	});

	it("should extract components", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
			components: {
				schemas: {
					User: { type: "object" },
					Pet: { type: "object" },
				},
				responses: {
					NotFound: { description: "Not found" },
				},
			},
		});

		const ast = JSON.parse(json);
		const tree = parseTree(json);
		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			"hash",
			Date.now(),
			"3.1",
		);

		const atoms = extractAtoms(ir);

		expect(atoms.components.length).toBe(3);
		expect(
			atoms.components.some((c) => c.type === "schemas" && c.name === "User"),
		).toBe(true);
		expect(
			atoms.components.some((c) => c.type === "schemas" && c.name === "Pet"),
		).toBe(true);
		expect(
			atoms.components.some(
				(c) => c.type === "responses" && c.name === "NotFound",
			),
		).toBe(true);
	});

	it("should extract schemas separately", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
			components: {
				schemas: {
					User: { type: "object" },
					Pet: { type: "object" },
				},
			},
		});

		const ast = JSON.parse(json);
		const tree = parseTree(json);
		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			"hash",
			Date.now(),
			"3.1",
		);

		const atoms = extractAtoms(ir);

		expect(atoms.schemas.length).toBe(2);
		expect(atoms.schemas.some((s) => s.name === "User")).toBe(true);
		expect(atoms.schemas.some((s) => s.name === "Pet")).toBe(true);
	});

	it("should extract security schemes", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
			components: {
				securitySchemes: {
					bearerAuth: {
						type: "http",
						scheme: "bearer",
					},
					apiKey: {
						type: "apiKey",
						in: "header",
						name: "X-API-Key",
					},
				},
			},
		});

		const ast = JSON.parse(json);
		const tree = parseTree(json);
		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			"hash",
			Date.now(),
			"3.1",
		);

		const atoms = extractAtoms(ir);

		expect(atoms.securitySchemes.length).toBe(2);
		expect(atoms.securitySchemes.some((s) => s.name === "bearerAuth")).toBe(
			true,
		);
		expect(atoms.securitySchemes.some((s) => s.name === "apiKey")).toBe(true);
	});

	it("should set correct locations for atoms", () => {
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

		const ast = JSON.parse(json);
		const tree = parseTree(json);
		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			"hash",
			Date.now(),
			"3.1",
		);

		const atoms = extractAtoms(ir);

		expect(atoms.operations.length).toBe(1);
		const op = atoms.operations[0];
		expect(op?.loc.start).toBeGreaterThanOrEqual(0);
		expect(op?.loc.end).toBeLessThanOrEqual(json.length);
		expect(op?.uri).toBe("file:///test.json");
	});
});
