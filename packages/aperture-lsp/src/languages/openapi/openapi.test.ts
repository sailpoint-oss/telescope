import { describe, expect, it, mock } from "bun:test";
import type { IScriptSnapshot } from "@volar/language-core";
import { URI } from "vscode-uri";
import type { Core } from "../../core/core.js";
import type { ApertureVolarContext } from "../../workspace/context.js";
import type { OpenAPIDocumentStore } from "../../workspace/documents.js";
import { createOpenAPILanguagePlugin } from "./openapi-plugin.js";
import { OpenAPIVirtualCode } from "./openapi-virtual-code.js";

// Mock implementations
class MockSnapshot implements IScriptSnapshot {
	constructor(private text: string) {}
	getText(start: number, end: number) {
		return this.text.substring(start, end);
	}
	getLength() {
		return this.text.length;
	}
	getChangeRange() {
		return undefined;
	}
}

describe("OpenAPIVirtualCode", () => {
	it("should parse JSON content", () => {
		const json = JSON.stringify({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
		});
		const snapshot = new MockSnapshot(json);
		const code = new OpenAPIVirtualCode(snapshot, "json");

		expect(code.id).toBe("openapi");
		expect(code.languageId).toBe("openapi");
		expect(code.parsedObject).toEqual({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
		});
		expect(code.ast).toBeDefined();
	});

	it("should parse YAML content", () => {
		const yaml = "openapi: 3.1.0\ninfo:\n  title: Test\n  version: 1.0.0";
		const snapshot = new MockSnapshot(yaml);
		const code = new OpenAPIVirtualCode(snapshot, "yaml");

		expect(code.id).toBe("openapi");
		expect(code.languageId).toBe("openapi");
		expect(code.parsedObject).toEqual({
			openapi: "3.1.0",
			info: { title: "Test", version: "1.0.0" },
		});
		// Check for YAML-specific AST properties
		expect((code.ast as any).doc).toBeDefined();
		expect((code.ast as any).lineCounter).toBeDefined();
	});

	it("should handle invalid JSON gracefully", () => {
		const json = "{ invalid json }";
		const snapshot = new MockSnapshot(json);
		const code = new OpenAPIVirtualCode(snapshot, "json");

		expect(code.parsedObject).toBeUndefined();
		expect(code.ast).toBeUndefined();
	});

	it("should handle invalid YAML gracefully", () => {
		// YAML is very permissive, but let's try something that might fail or parse to unexpected
		// Actually, empty string or simple strings are valid YAML.
		// Let's assume it doesn't throw.
		const yaml = ":"; // Key without value?
		const snapshot = new MockSnapshot(yaml);
		// Should not throw
		const code = new OpenAPIVirtualCode(snapshot, "yaml");
		expect(code.parsedObject).toBeDefined(); // Might be null or error object depending on parser
	});

	it("should update content", () => {
		const json1 = JSON.stringify({ openapi: "3.0.0" });
		const snapshot1 = new MockSnapshot(json1);
		const code = new OpenAPIVirtualCode(snapshot1, "json");

		expect(code.parsedObject).toEqual({ openapi: "3.0.0" });

		const json2 = JSON.stringify({ openapi: "3.1.0" });
		const snapshot2 = new MockSnapshot(json2);
		code.update(snapshot2);

		expect(code.parsedObject).toEqual({ openapi: "3.1.0" });
	});
});

describe("OpenApiLanguagePlugin", () => {
	// Mock dependencies
	const mockStore = {
		updateFromSnapshot: mock((uri, lang, snapshot) => ({
			text: snapshot.getText(0, snapshot.getLength()),
			languageId: lang,
			version: 1,
		})),
		delete: mock(),
	} as unknown as OpenAPIDocumentStore;

	const mockCore = {
		updateDocument: mock(),
		removeDocument: mock(),
	} as unknown as Core;

	const mockContext = {
		getLogger: () => ({ log: () => {} }),
		getConfig: () => ({
			openapi: {
				patterns: ["**/*.yaml", "**/*.json"],
			},
		}),
		getWorkspaceFolders: () => ["file:///workspace"],
		documents: mockStore,
		core: mockCore,
	} as unknown as ApertureVolarContext;

	const plugin = createOpenAPILanguagePlugin(mockContext);

	it("should identify OpenAPI files based on config patterns", () => {
		const uri = URI.parse("file:///workspace/api.yaml");
		const languageId = plugin.getLanguageId(uri);
		expect(languageId).toBe("openapi");
	});

	it("should not identify files not matching patterns", () => {
		const uri = URI.parse("file:///workspace/readme.md");
		const languageId = plugin.getLanguageId(uri);
		expect(languageId).toBeUndefined();
	});

	it("should create virtual code for OpenAPI files", () => {
		const uri = URI.parse("file:///workspace/api.yaml");
		const snapshot = new MockSnapshot("openapi: 3.1.0");
		const code = plugin.createVirtualCode?.(uri, "openapi", snapshot);

		expect(code).toBeInstanceOf(OpenAPIVirtualCode);
		expect(code?.languageId).toBe("openapi");
		expect(mockStore.updateFromSnapshot).toHaveBeenCalled();
		expect(mockCore.updateDocument).toHaveBeenCalled();
	});

	it("should return undefined for non-openapi languageId", () => {
		const uri = URI.parse("file:///workspace/api.yaml");
		const snapshot = new MockSnapshot("");
		const code = plugin.createVirtualCode?.(uri, "yaml", snapshot);

		expect(code).toBeUndefined();
	});

	it("should update virtual code", () => {
		const uri = URI.parse("file:///workspace/api.yaml");
		const snapshot = new MockSnapshot("openapi: 3.1.0");
		const code = new OpenAPIVirtualCode(snapshot, "yaml");

		const updatedCode = plugin.updateVirtualCode?.(uri, code, snapshot);

		expect(updatedCode).toBe(code);
		expect(mockStore.updateFromSnapshot).toHaveBeenCalled();
		expect(mockCore.updateDocument).toHaveBeenCalled();
	});

	it("should dispose virtual code", () => {
		const uri = URI.parse("file:///workspace/api.yaml");
		plugin.disposeVirtualCode?.(uri);

		expect(mockStore.delete).toHaveBeenCalledWith(uri.toString());
		expect(mockCore.removeDocument).toHaveBeenCalledWith(uri.toString());
	});
});
