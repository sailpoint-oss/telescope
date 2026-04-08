import { describe, test, expect } from "bun:test";
import {
	buildRootRef,
	buildInfoRef,
	buildOperationRef,
	buildPathItemRef,
	buildSchemaRef,
	buildParameterRef,
	buildResponseRef,
	buildRequestBodyRef,
	buildComponentRef,
	buildTagRef,
	buildExampleRef,
	buildHeaderRef,
	buildSecuritySchemeRef,
	buildDocumentRef,
} from "./refs";
import { buildRuleContext, buildGenericContext } from "./context";
import type { SerializedDoc, RunRulesRequest } from "./types";

const mockDoc: SerializedDoc = {
	uri: "file:///test.yaml",
	ast: { openapi: "3.1.0", info: { title: "Test", version: "1.0.0" } },
	rawText: "openapi: 3.1.0",
	format: "yaml",
	version: "3.1.0",
	pointers: {},
};

describe("buildRootRef", () => {
	test("returns uri and empty pointer", () => {
		const ref = buildRootRef(mockDoc, mockDoc.ast);
		expect(ref.uri).toBe("file:///test.yaml");
		expect(ref.pointer).toBe("");
		expect(ref.node).toBe(mockDoc.ast);
	});
});

describe("buildInfoRef", () => {
	const node = {
		title: "Pet Store",
		version: "2.0.0",
		description: "A sample API",
		contact: { name: "Team" },
		license: { name: "MIT" },
	};

	test("exposes title, version, description accessors", () => {
		const ref = buildInfoRef(mockDoc, node, "/info");
		expect(ref.title()).toBe("Pet Store");
		expect(ref.version()).toBe("2.0.0");
		expect(ref.description()).toBe("A sample API");
	});

	test("hasContact and hasLicense reflect presence", () => {
		const ref = buildInfoRef(mockDoc, node, "/info");
		expect(ref.hasContact()).toBe(true);
		expect(ref.hasLicense()).toBe(true);
	});

	test("reports missing contact/license as false", () => {
		const ref = buildInfoRef(mockDoc, { title: "X", version: "1" }, "/info");
		expect(ref.hasContact()).toBe(false);
		expect(ref.hasLicense()).toBe(false);
	});
});

describe("buildOperationRef", () => {
	const node = {
		operationId: "listPets",
		summary: "List all pets",
		tags: ["Pets"],
		deprecated: true,
		parameters: [{ name: "limit", in: "query", required: false }],
		responses: { "200": { description: "ok" }, "404": { description: "not found" } },
	};

	test("exposes method, path, and scalar accessors", () => {
		const ref = buildOperationRef(mockDoc, node, "/paths/~1pets/get", "get", "/pets");
		expect(ref.method).toBe("get");
		expect(ref.path).toBe("/pets");
		expect(ref.operationId()).toBe("listPets");
		expect(ref.summary()).toBe("List all pets");
		expect(ref.tags()).toEqual(["Pets"]);
		expect(ref.deprecated()).toBe(true);
	});

	test("eachParameter iterates over inline parameters", () => {
		const ref = buildOperationRef(mockDoc, node, "/paths/~1pets/get", "get", "/pets");
		const names: string[] = [];
		ref.eachParameter((p) => names.push(p.paramName()));
		expect(names).toEqual(["limit"]);
	});

	test("eachResponse iterates over status codes", () => {
		const ref = buildOperationRef(mockDoc, node, "/paths/~1pets/get", "get", "/pets");
		const codes: string[] = [];
		ref.eachResponse((r) => codes.push(r.statusCode));
		expect(codes).toEqual(["200", "404"]);
	});

	test("eachParameter is a no-op when parameters are absent", () => {
		const ref = buildOperationRef(mockDoc, {}, "/paths/~1pets/get", "get", "/pets");
		const names: string[] = [];
		ref.eachParameter((p) => names.push(p.paramName()));
		expect(names).toEqual([]);
	});
});

describe("buildPathItemRef", () => {
	test("exposes path string", () => {
		const ref = buildPathItemRef(mockDoc, {}, "/paths/~1pets", "/pets");
		expect(ref.path).toBe("/pets");
		expect(ref.uri).toBe("file:///test.yaml");
	});
});

describe("buildSchemaRef", () => {
	test("exposes name and schemaType", () => {
		const ref = buildSchemaRef(mockDoc, { type: "object", properties: { id: {} } }, "/components/schemas/Pet", "Pet");
		expect(ref.name).toBe("Pet");
		expect(ref.schemaType()).toBe("object");
		expect(ref.properties()).toEqual({ id: {} });
	});

	test("isNullable returns true for nullable flag", () => {
		const ref = buildSchemaRef(mockDoc, { type: "string", nullable: true }, "/components/schemas/Name", "Name");
		expect(ref.isNullable()).toBe(true);
	});

	test("isNullable returns true for array type containing null", () => {
		const ref = buildSchemaRef(mockDoc, { type: ["string", "null"] }, "/components/schemas/Name", "Name");
		expect(ref.isNullable()).toBe(true);
	});

	test("isNullable returns false when not nullable", () => {
		const ref = buildSchemaRef(mockDoc, { type: "string" }, "/components/schemas/Name", "Name");
		expect(ref.isNullable()).toBe(false);
	});
});

describe("buildParameterRef", () => {
	test("exposes parameter name, in, and required", () => {
		const ref = buildParameterRef(mockDoc, { name: "id", in: "path", required: true }, "/paths/~1pets/parameters/0");
		expect(ref.paramName()).toBe("id");
		expect(ref.paramIn()).toBe("path");
		expect(ref.paramRequired()).toBe(true);
	});

	test("defaults to empty strings and false", () => {
		const ref = buildParameterRef(mockDoc, {}, "/parameters/0");
		expect(ref.paramName()).toBe("");
		expect(ref.paramIn()).toBe("");
		expect(ref.paramRequired()).toBe(false);
	});
});

describe("buildResponseRef", () => {
	test("exposes statusCode and description", () => {
		const ref = buildResponseRef(mockDoc, { description: "Success" }, "/responses/200", "200");
		expect(ref.statusCode).toBe("200");
		expect(ref.responseDescription()).toBe("Success");
	});
});

describe("buildRequestBodyRef", () => {
	test("exposes required and description", () => {
		const ref = buildRequestBodyRef(mockDoc, { required: true, description: "User payload" }, "/requestBody");
		expect(ref.requestBodyRequired()).toBe(true);
		expect(ref.requestBodyDescription()).toBe("User payload");
	});

	test("defaults required to false", () => {
		const ref = buildRequestBodyRef(mockDoc, {}, "/requestBody");
		expect(ref.requestBodyRequired()).toBe(false);
		expect(ref.requestBodyDescription()).toBeUndefined();
	});
});

describe("buildComponentRef", () => {
	test("exposes componentType and componentName", () => {
		const ref = buildComponentRef(mockDoc, {}, "/components/schemas/Pet", "schemas", "Pet");
		expect(ref.componentType).toBe("schemas");
		expect(ref.componentName).toBe("Pet");
	});
});

describe("buildTagRef", () => {
	test("exposes tagName and tagDescription", () => {
		const ref = buildTagRef(mockDoc, { name: "Users", description: "User ops" }, "/tags/0");
		expect(ref.tagName()).toBe("Users");
		expect(ref.tagDescription()).toBe("User ops");
	});

	test("defaults to empty name and undefined description", () => {
		const ref = buildTagRef(mockDoc, {}, "/tags/0");
		expect(ref.tagName()).toBe("");
		expect(ref.tagDescription()).toBeUndefined();
	});
});

describe("buildExampleRef", () => {
	test("exposes exampleName", () => {
		const ref = buildExampleRef(mockDoc, { value: 42 }, "/components/examples/Sample", "Sample");
		expect(ref.exampleName).toBe("Sample");
		expect(ref.uri).toBe("file:///test.yaml");
	});
});

describe("buildHeaderRef", () => {
	test("exposes headerName", () => {
		const ref = buildHeaderRef(mockDoc, {}, "/components/headers/X-Request-Id", "X-Request-Id");
		expect(ref.headerName).toBe("X-Request-Id");
	});
});

describe("buildSecuritySchemeRef", () => {
	test("exposes schemeName and schemeType", () => {
		const ref = buildSecuritySchemeRef(mockDoc, { type: "http" }, "/components/securitySchemes/Bearer", "Bearer");
		expect(ref.schemeName).toBe("Bearer");
		expect(ref.schemeType()).toBe("http");
	});

	test("defaults schemeType to empty string", () => {
		const ref = buildSecuritySchemeRef(mockDoc, {}, "/components/securitySchemes/X", "X");
		expect(ref.schemeType()).toBe("");
	});
});

describe("buildDocumentRef", () => {
	test("exposes uri, pointer, and node", () => {
		const ref = buildDocumentRef(mockDoc, mockDoc.ast, "");
		expect(ref.uri).toBe("file:///test.yaml");
		expect(ref.pointer).toBe("");
		expect(ref.node).toBe(mockDoc.ast);
	});
});

// ---------------------------------------------------------------------------
// context.ts
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<RunRulesRequest> = {}): RunRulesRequest {
	return {
		documentURI: "file:///workspace/spec.yaml",
		ruleIDs: ["test-rule"],
		document: {
			uri: "file:///workspace/spec.yaml",
			ast: { openapi: "3.1.0", info: { title: "Spec", version: "1.0.0" } },
			rawText: "openapi: 3.1.0\ninfo:\n  title: Spec\n",
			format: "yaml",
			version: "3.1.0",
			pointers: {
				"/info": [1, 0, 2, 14],
				"/info/title": [2, 2, 2, 14],
			},
		},
		project: {
			operationIds: {},
			componentRefs: {},
			tags: {},
		},
		...overrides,
	};
}

describe("buildRuleContext", () => {
	test("report pushes a diagnostic with correct fields", () => {
		const ctx = buildRuleContext(makeRequest());
		ctx.report({
			uri: "file:///workspace/spec.yaml",
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
			message: "bad openapi key",
			severity: "error",
			code: "my-rule",
		});
		expect(ctx._diagnostics).toHaveLength(1);
		expect(ctx._diagnostics[0].severity).toBe(1);
		expect(ctx._diagnostics[0].code).toBe("my-rule");
		expect(ctx._diagnostics[0].message).toBe("bad openapi key");
	});

	test("reportAt falls back to ref pointer when field pointer is missing", () => {
		const ctx = buildRuleContext(makeRequest());
		ctx._defaultCode = "info-check";
		ctx.reportAt(
			{ uri: "file:///workspace/spec.yaml", pointer: "/info" } as never,
			"nonexistent",
			{ message: "missing field" },
		);
		expect(ctx._diagnostics[0].startLine).toBe(1);
		expect(ctx._diagnostics[0].code).toBe("info-check");
	});

	test("offsetToRange returns undefined for out-of-bounds offsets", () => {
		const ctx = buildRuleContext(makeRequest());
		expect(ctx.offsetToRange(-1, 5)).toBeUndefined();
		expect(ctx.offsetToRange(9999, 10000)).toBeUndefined();
	});

	test("fix is callable without error", () => {
		const ctx = buildRuleContext(makeRequest());
		expect(() => ctx.fix({ uri: "file:///x", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "" })).not.toThrow();
	});
});

describe("buildGenericContext", () => {
	test("report records diagnostics with default severity", () => {
		const ctx = buildGenericContext(makeRequest());
		ctx.report({
			uri: "file:///workspace/spec.yaml",
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
			message: "generic issue",
		});
		expect(ctx._diagnostics).toHaveLength(1);
		expect(ctx._diagnostics[0].severity).toBe(2);
	});

	test("offsetToRange computes positions across newlines", () => {
		const ctx = buildGenericContext(makeRequest());
		const range = ctx.offsetToRange(0, 15);
		expect(range).toBeDefined();
		expect(range!.start.line).toBe(0);
		expect(range!.end.line).toBe(1);
	});

	test("exposes file metadata", () => {
		const ctx = buildGenericContext(makeRequest());
		expect(ctx.file.uri).toBe("file:///workspace/spec.yaml");
		expect(ctx.file.ast.openapi).toBe("3.1.0");
	});
});
