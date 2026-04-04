import { describe, expect, test, beforeEach } from "bun:test";
import { validateWithJsonSchema, validateWithZod, clearSchemaCache } from "./schema-validator";
import type { ValidateSchemaRequest, SerializedDoc } from "./types";
import { resolve } from "node:path";

function makeDoc(rawText: string): SerializedDoc {
	return {
		uri: "file:///test.yaml",
		ast: {},
		rawText,
		format: "yaml",
		version: "1",
		pointers: {
			"": [0, 0, 0, 0],
			"/": [0, 0, 0, 0],
			"/name": [0, 0, 0, 4],
			"/version": [1, 0, 1, 7],
		},
	};
}

const jsonSchemaPath = resolve(__dirname, "__fixtures__/test-schema.json");
const zodSchemaPath = resolve(__dirname, "__fixtures__/test-zod-schema.ts");

beforeEach(() => {
	clearSchemaCache();
});

describe("validateWithJsonSchema", () => {
	test("valid document produces no diagnostics", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: "my-app", version: "1.0.0" })),
			schemaPath: jsonSchemaPath,
			schemaType: "json-schema",
			groupName: "test-group",
		};
		const result = await validateWithJsonSchema(req);
		expect(result.diagnostics).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});

	test("missing required field produces diagnostic", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: "my-app" })),
			schemaPath: jsonSchemaPath,
			schemaType: "json-schema",
			groupName: "test-group",
		};
		const result = await validateWithJsonSchema(req);
		expect(result.diagnostics.length).toBeGreaterThan(0);
		const versionError = result.diagnostics.find(d => d.message.includes("version") || d.message.includes("required"));
		expect(versionError).toBeDefined();
		expect(versionError!.source).toBe("test-group");
		expect(result.errors).toHaveLength(0);
	});

	test("wrong type produces diagnostic", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: 123, version: "1.0.0" })),
			schemaPath: jsonSchemaPath,
			schemaType: "json-schema",
			groupName: "test-group",
		};
		const result = await validateWithJsonSchema(req);
		expect(result.diagnostics.length).toBeGreaterThan(0);
		const typeError = result.diagnostics.find(d => d.code.includes("type"));
		expect(typeError).toBeDefined();
	});

	test("additional properties produce diagnostic", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: "app", version: "1.0.0", extra: true })),
			schemaPath: jsonSchemaPath,
			schemaType: "json-schema",
			groupName: "test-group",
		};
		const result = await validateWithJsonSchema(req);
		expect(result.diagnostics.length).toBeGreaterThan(0);
	});

	test("invalid schema path produces error", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: "app" })),
			schemaPath: "/nonexistent/schema.json",
			schemaType: "json-schema",
			groupName: "test-group",
		};
		const result = await validateWithJsonSchema(req);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0].ruleID).toBe("json-schema:test-group");
		expect(result.errors[0].phase).toBe("run");
	});

	test("YAML document is parsed correctly", async () => {
		const yamlContent = `name: my-app
version: "1.0.0"
`;
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(yamlContent),
			schemaPath: jsonSchemaPath,
			schemaType: "json-schema",
			groupName: "test-group",
		};
		const result = await validateWithJsonSchema(req);
		expect(result.diagnostics).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});

	test("diagnostic has correct structure", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: "app" })),
			schemaPath: jsonSchemaPath,
			schemaType: "json-schema",
			groupName: "my-validation",
		};
		const result = await validateWithJsonSchema(req);
		expect(result.diagnostics.length).toBeGreaterThan(0);
		const diag = result.diagnostics[0];
		expect(diag).toHaveProperty("startLine");
		expect(diag).toHaveProperty("startChar");
		expect(diag).toHaveProperty("endLine");
		expect(diag).toHaveProperty("endChar");
		expect(diag).toHaveProperty("severity");
		expect(diag).toHaveProperty("code");
		expect(diag).toHaveProperty("message");
		expect(diag).toHaveProperty("source");
		expect(diag.severity).toBe(1);
	});
});

describe("validateWithZod", () => {
	test("valid document produces no diagnostics", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: "my-app", version: "1.0.0" })),
			schemaPath: zodSchemaPath,
			schemaType: "zod",
			groupName: "test-zod",
		};
		const result = await validateWithZod(req);
		expect(result.diagnostics).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});

	test("missing required field produces diagnostic", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: "my-app" })),
			schemaPath: zodSchemaPath,
			schemaType: "zod",
			groupName: "test-zod",
		};
		const result = await validateWithZod(req);
		expect(result.diagnostics.length).toBeGreaterThan(0);
		const versionError = result.diagnostics.find(d =>
			d.message.toLowerCase().includes("required") || d.code.includes("zod"),
		);
		expect(versionError).toBeDefined();
	});

	test("wrong type produces diagnostic", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: 123, version: "1.0.0" })),
			schemaPath: zodSchemaPath,
			schemaType: "zod",
			groupName: "test-zod",
		};
		const result = await validateWithZod(req);
		expect(result.diagnostics.length).toBeGreaterThan(0);
	});

	test("invalid pattern produces diagnostic", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: "app", version: "not-a-version" })),
			schemaPath: zodSchemaPath,
			schemaType: "zod",
			groupName: "test-zod",
		};
		const result = await validateWithZod(req);
		expect(result.diagnostics.length).toBeGreaterThan(0);
	});

	test("invalid schema path produces error", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: "app" })),
			schemaPath: "/nonexistent/schema.ts",
			schemaType: "zod",
			groupName: "test-zod",
		};
		const result = await validateWithZod(req);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0].ruleID).toBe("zod-schema:test-zod");
	});

	test("diagnostic source comes from groupName", async () => {
		const req: ValidateSchemaRequest = {
			documentURI: "file:///test.yaml",
			document: makeDoc(JSON.stringify({ name: "app" })),
			schemaPath: zodSchemaPath,
			schemaType: "zod",
			groupName: "custom-group",
		};
		const result = await validateWithZod(req);
		expect(result.diagnostics.length).toBeGreaterThan(0);
		for (const diag of result.diagnostics) {
			expect(diag.source).toBe("custom-group");
		}
	});
});
