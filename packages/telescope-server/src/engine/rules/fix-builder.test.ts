import { describe, expect, it } from "bun:test";
import {
	FixBuilder,
	addFieldFix,
	fix,
	removeFieldFix,
	setFieldFix,
} from "./fix-builder.js";

describe("FixBuilder", () => {
	describe("addField", () => {
		it("should add a field operation", () => {
			const patch = new FixBuilder("file:///test.yaml", "#/info")
				.addField("title", "My API")
				.build();

			expect(patch.uri).toBe("file:///test.yaml");
			expect(patch.ops).toHaveLength(1);
			expect(patch.ops[0]).toEqual({
				op: "add",
				path: "#/info/title",
				value: "My API",
			});
		});

		it("should escape special characters in field names", () => {
			const patch = new FixBuilder("file:///test.yaml")
				.addField("foo/bar", "value")
				.build();

			expect(patch.ops[0]).toEqual({
				op: "add",
				path: "/foo~1bar",
				value: "value",
			});
		});

		it("should escape tilde in field names", () => {
			const patch = new FixBuilder("file:///test.yaml")
				.addField("foo~bar", "value")
				.build();

			expect(patch.ops[0]).toEqual({
				op: "add",
				path: "/foo~0bar",
				value: "value",
			});
		});
	});

	describe("addAtPath", () => {
		it("should add at nested path", () => {
			const patch = new FixBuilder("file:///test.yaml", "#/paths/~1users/get")
				.addAtPath(["responses", "200", "description"], "Success")
				.build();

			expect(patch.ops[0]).toEqual({
				op: "add",
				path: "#/paths/~1users/get/responses/200/description",
				value: "Success",
			});
		});
	});

	describe("setField", () => {
		it("should replace a field value", () => {
			const patch = new FixBuilder("file:///test.yaml", "#/info")
				.setField("version", "2.0.0")
				.build();

			expect(patch.ops[0]).toEqual({
				op: "replace",
				path: "#/info/version",
				value: "2.0.0",
			});
		});
	});

	describe("removeField", () => {
		it("should remove a field", () => {
			const patch = new FixBuilder("file:///test.yaml", "#/info")
				.removeField("deprecated")
				.build();

			expect(patch.ops[0]).toEqual({
				op: "remove",
				path: "#/info/deprecated",
			});
		});
	});

	describe("chaining", () => {
		it("should support chaining multiple operations", () => {
			const patch = new FixBuilder("file:///test.yaml", "#/paths/~1users/get")
				.addField("summary", "List users")
				.addField("description", "Returns all users")
				.setField("operationId", "listUsers")
				.removeField("deprecated")
				.build();

			expect(patch.ops).toHaveLength(4);
			expect(patch.ops[0]).toEqual({
				op: "add",
				path: "#/paths/~1users/get/summary",
				value: "List users",
			});
			expect(patch.ops[1]).toEqual({
				op: "add",
				path: "#/paths/~1users/get/description",
				value: "Returns all users",
			});
			expect(patch.ops[2]).toEqual({
				op: "replace",
				path: "#/paths/~1users/get/operationId",
				value: "listUsers",
			});
			expect(patch.ops[3]).toEqual({
				op: "remove",
				path: "#/paths/~1users/get/deprecated",
			});
		});
	});

	describe("hasOps", () => {
		it("should return false for empty builder", () => {
			const builder = new FixBuilder("file:///test.yaml");
			expect(builder.hasOps()).toBe(false);
		});

		it("should return true after adding operations", () => {
			const builder = new FixBuilder("file:///test.yaml").addField(
				"foo",
				"bar",
			);
			expect(builder.hasOps()).toBe(true);
		});
	});
});

describe("fix function", () => {
	it("should create a FixBuilder", () => {
		const builder = fix("file:///test.yaml", "#/info");
		expect(builder).toBeInstanceOf(FixBuilder);
	});

	it("should work without pointer", () => {
		const patch = fix("file:///test.yaml").addField("openapi", "3.1.0").build();

		expect(patch.ops[0]).toEqual({
			op: "add",
			path: "/openapi",
			value: "3.1.0",
		});
	});
});

describe("addFieldFix", () => {
	it("should create a patch for adding a field", () => {
		const ref = { uri: "file:///test.yaml", pointer: "#/paths/~1users/get" };
		const patch = addFieldFix(ref, "summary", "List users");

		expect(patch.uri).toBe("file:///test.yaml");
		expect(patch.ops).toHaveLength(1);
		expect(patch.ops[0]).toEqual({
			op: "add",
			path: "#/paths/~1users/get/summary",
			value: "List users",
		});
	});
});

describe("setFieldFix", () => {
	it("should create a patch for replacing a field", () => {
		const ref = { uri: "file:///test.yaml", pointer: "#/info" };
		const patch = setFieldFix(ref, "version", "2.0.0");

		expect(patch.ops).toHaveLength(1);
		expect(patch.ops[0]).toEqual({
			op: "replace",
			path: "#/info/version",
			value: "2.0.0",
		});
	});
});

describe("removeFieldFix", () => {
	it("should create a patch for removing a field", () => {
		const ref = { uri: "file:///test.yaml", pointer: "#/info" };
		const patch = removeFieldFix(ref, "deprecated");

		expect(patch.ops).toHaveLength(1);
		expect(patch.ops[0]).toEqual({
			op: "remove",
			path: "#/info/deprecated",
		});
	});
});

