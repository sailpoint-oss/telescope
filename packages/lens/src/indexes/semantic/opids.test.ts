import { describe, expect, it } from "bun:test";
import type { OperationAtom } from "../indexes/atoms.js";
import { OperationIdIndex } from "./opids.js";

describe("OperationIdIndex", () => {
	it("should track operation IDs", () => {
		const index = new OperationIdIndex();

		const operations: OperationAtom[] = [
			{
				uri: "file:///test1.yaml",
				ptr: "#/paths/~1users/get",
				method: "GET",
				path: "/users",
				operationId: "listUsers",
				loc: { start: 0, end: 100 },
			},
			{
				uri: "file:///test2.yaml",
				ptr: "#/paths/~1pets/get",
				method: "GET",
				path: "/pets",
				operationId: "listPets",
				loc: { start: 0, end: 100 },
			},
		];

		const changed = index.updateForUri("file:///test1.yaml", operations);
		expect(changed.size).toBeGreaterThan(0);
		expect(changed.has("listUsers")).toBe(true);
	});

	it("should detect duplicate operation IDs", () => {
		const index = new OperationIdIndex();

		const operations1: OperationAtom[] = [
			{
				uri: "file:///test1.yaml",
				ptr: "#/paths/~1users/get",
				method: "GET",
				path: "/users",
				operationId: "listUsers",
				loc: { start: 0, end: 100 },
			},
		];

		const operations2: OperationAtom[] = [
			{
				uri: "file:///test2.yaml",
				ptr: "#/paths/~1pets/get",
				method: "GET",
				path: "/pets",
				operationId: "listUsers", // Duplicate!
				loc: { start: 0, end: 100 },
			},
		];

		index.updateForUri("file:///test1.yaml", operations1);
		index.updateForUri("file:///test2.yaml", operations2);

		expect(index.isUnique("listUsers")).toBe(false);
		const duplicates = index.getDuplicates();
		expect(duplicates).toContain("listUsers");
	});

	it("should remove operations when URI is updated", () => {
		const index = new OperationIdIndex();

		const operations1: OperationAtom[] = [
			{
				uri: "file:///test1.yaml",
				ptr: "#/paths/~1users/get",
				method: "GET",
				path: "/users",
				operationId: "listUsers",
				loc: { start: 0, end: 100 },
			},
		];

		index.updateForUri("file:///test1.yaml", operations1);
		expect(index.getOccurrences("listUsers").length).toBe(1);

		// Update with empty array (removes)
		index.updateForUri("file:///test1.yaml", []);
		expect(index.getOccurrences("listUsers").length).toBe(0);
	});

	it("should get all occurrences of an operation ID", () => {
		const index = new OperationIdIndex();

		const operations1: OperationAtom[] = [
			{
				uri: "file:///test1.yaml",
				ptr: "#/paths/~1users/get",
				method: "GET",
				path: "/users",
				operationId: "listUsers",
				loc: { start: 0, end: 100 },
			},
		];

		const operations2: OperationAtom[] = [
			{
				uri: "file:///test2.yaml",
				ptr: "#/paths/~1pets/get",
				method: "GET",
				path: "/pets",
				operationId: "listUsers",
				loc: { start: 0, end: 100 },
			},
		];

		index.updateForUri("file:///test1.yaml", operations1);
		index.updateForUri("file:///test2.yaml", operations2);

		const occurrences = index.getOccurrences("listUsers");
		expect(occurrences.length).toBe(2);
		expect(occurrences.some((o) => o.uri === "file:///test1.yaml")).toBe(true);
		expect(occurrences.some((o) => o.uri === "file:///test2.yaml")).toBe(true);
	});
});
