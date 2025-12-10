import { describe, expect, it } from "bun:test";
import {
	FieldMissingError,
	NodeAccessor,
	accessor,
	withAccessor,
} from "./node-accessor.js";

describe("NodeAccessor", () => {
	describe("getString", () => {
		it("should return string value", () => {
			const $ = new NodeAccessor({ name: "test" });
			expect($.getString("name")).toBe("test");
		});

		it("should return undefined for missing field", () => {
			const $ = new NodeAccessor({});
			expect($.getString("name")).toBeUndefined();
		});

		it("should return undefined for non-string value", () => {
			const $ = new NodeAccessor({ name: 123 });
			expect($.getString("name")).toBeUndefined();
		});
	});

	describe("requireString", () => {
		it("should return string value", () => {
			const $ = new NodeAccessor({ name: "test" });
			expect($.requireString("name")).toBe("test");
		});

		it("should throw FieldMissingError for missing field", () => {
			const $ = new NodeAccessor({});
			expect(() => $.requireString("name")).toThrow(FieldMissingError);
		});
	});

	describe("getNumber", () => {
		it("should return number value", () => {
			const $ = new NodeAccessor({ count: 42 });
			expect($.getNumber("count")).toBe(42);
		});

		it("should return undefined for missing field", () => {
			const $ = new NodeAccessor({});
			expect($.getNumber("count")).toBeUndefined();
		});

		it("should return undefined for non-number value", () => {
			const $ = new NodeAccessor({ count: "42" });
			expect($.getNumber("count")).toBeUndefined();
		});
	});

	describe("getBoolean", () => {
		it("should return boolean value", () => {
			const $ = new NodeAccessor({ active: true });
			expect($.getBoolean("active")).toBe(true);
		});

		it("should return undefined for missing field", () => {
			const $ = new NodeAccessor({});
			expect($.getBoolean("active")).toBeUndefined();
		});

		it("should return undefined for non-boolean value", () => {
			const $ = new NodeAccessor({ active: "true" });
			expect($.getBoolean("active")).toBeUndefined();
		});
	});

	describe("getArray", () => {
		it("should return array value", () => {
			const $ = new NodeAccessor({ tags: ["a", "b"] });
			expect($.getArray("tags")).toEqual(["a", "b"]);
		});

		it("should return undefined for missing field", () => {
			const $ = new NodeAccessor({});
			expect($.getArray("tags")).toBeUndefined();
		});

		it("should return undefined for non-array value", () => {
			const $ = new NodeAccessor({ tags: "not-array" });
			expect($.getArray("tags")).toBeUndefined();
		});
	});

	describe("getObject", () => {
		it("should return object value", () => {
			const $ = new NodeAccessor({ info: { title: "Test" } });
			expect($.getObject("info")).toEqual({ title: "Test" });
		});

		it("should return undefined for missing field", () => {
			const $ = new NodeAccessor({});
			expect($.getObject("info")).toBeUndefined();
		});

		it("should return undefined for array value", () => {
			const $ = new NodeAccessor({ info: [] });
			expect($.getObject("info")).toBeUndefined();
		});

		it("should return undefined for primitive value", () => {
			const $ = new NodeAccessor({ info: "string" });
			expect($.getObject("info")).toBeUndefined();
		});
	});

	describe("has", () => {
		it("should return true for existing field", () => {
			const $ = new NodeAccessor({ name: "test" });
			expect($.has("name")).toBe(true);
		});

		it("should return true for null value", () => {
			const $ = new NodeAccessor({ name: null });
			expect($.has("name")).toBe(true);
		});

		it("should return true for undefined value", () => {
			const $ = new NodeAccessor({ name: undefined });
			expect($.has("name")).toBe(true);
		});

		it("should return false for missing field", () => {
			const $ = new NodeAccessor({});
			expect($.has("name")).toBe(false);
		});
	});

	describe("get", () => {
		it("should return raw value", () => {
			const $ = new NodeAccessor({ data: { nested: true } });
			expect($.get("data")).toEqual({ nested: true });
		});

		it("should return undefined for missing field", () => {
			const $ = new NodeAccessor({});
			expect($.get("data")).toBeUndefined();
		});
	});

	describe("raw", () => {
		it("should return the underlying object", () => {
			const obj = { name: "test", count: 42 };
			const $ = new NodeAccessor(obj);
			expect($.raw()).toEqual(obj);
		});
	});

	describe("edge cases", () => {
		it("should handle null node", () => {
			const $ = new NodeAccessor(null);
			expect($.getString("name")).toBeUndefined();
			expect($.has("name")).toBe(false);
		});

		it("should handle undefined node", () => {
			const $ = new NodeAccessor(undefined);
			expect($.getString("name")).toBeUndefined();
		});

		it("should handle array node", () => {
			const $ = new NodeAccessor(["a", "b"]);
			expect($.getString("0")).toBeUndefined();
		});

		it("should handle primitive node", () => {
			const $ = new NodeAccessor("string");
			expect($.getString("name")).toBeUndefined();
		});
	});
});

describe("accessor function", () => {
	it("should create a NodeAccessor", () => {
		const $ = accessor({ name: "test" });
		expect($.getString("name")).toBe("test");
	});
});

describe("withAccessor function", () => {
	it("should extend ref with accessor", () => {
		const ref = {
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get",
			node: { summary: "List users", operationId: "listUsers" },
		};

		const extended = withAccessor(ref);

		expect(extended.uri).toBe(ref.uri);
		expect(extended.pointer).toBe(ref.pointer);
		expect(extended.node).toBe(ref.node);
		expect(extended.$.getString("summary")).toBe("List users");
		expect(extended.$.getString("operationId")).toBe("listUsers");
	});
});

