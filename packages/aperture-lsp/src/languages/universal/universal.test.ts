import { describe, expect, it } from "bun:test";
import { URI } from "vscode-uri";
import type { ApertureVolarContext } from "../../workspace/context.js";
import { createUniversalLanguagePlugin } from "./universal-plugin.js";

describe("UniversalLanguagePlugin", () => {
	const mockContext = {
		getLogger: () => ({ log: () => {} }),
		getConfig: () => ({
			openapi: {
				base: [],
				patterns: ["**/*.openapi.yaml", "**/*.openapi.json"],
			},
		}),
		getWorkspaceFolders: () => ["file:///workspace"],
		getWorkspacePaths: () => ["/workspace"], // Added mock
	} as unknown as ApertureVolarContext;

	const plugin = createUniversalLanguagePlugin(mockContext);

	it("should identify JSON files", () => {
		const uri = URI.parse("file:///workspace/data.json");
		const languageId = plugin.getLanguageId(uri);
		expect(languageId).toBe("json");
	});

	it("should identify YAML files", () => {
		const uri = URI.parse("file:///workspace/data.yaml");
		const languageId = plugin.getLanguageId(uri);
		expect(languageId).toBe("yaml");
	});

	it("should exclude files matching OpenAPI patterns", () => {
		const uri = URI.parse("file:///workspace/api.openapi.yaml");
		const languageId = plugin.getLanguageId(uri);
		expect(languageId).toBeUndefined();
	});

	it("should exclude files matching OpenAPI patterns (JSON)", () => {
		const uri = URI.parse("file:///workspace/api.openapi.json");
		const languageId = plugin.getLanguageId(uri);
		expect(languageId).toBeUndefined();
	});

	it("should not identify other files", () => {
		const uri = URI.parse("file:///workspace/readme.md");
		const languageId = plugin.getLanguageId(uri);
		expect(languageId).toBeUndefined();
	});

	it("should create virtual code for supported files", () => {
		const uri = URI.parse("file:///workspace/data.json");
		const snapshot = {
			getText: (start: number, end: number) => "{}".substring(start, end),
			getLength: () => 2,
			getChangeRange: () => undefined,
		};

		const code = plugin.createVirtualCode?.(uri, "json", snapshot);
		expect(code).toBeDefined();
		expect(code?.languageId).toBe("json");
	});

	it("should not create virtual code for unsupported languageId", () => {
		const uri = URI.parse("file:///workspace/data.json");
		const snapshot = {
			getText: () => "{}",
			getLength: () => 2,
			getChangeRange: () => undefined,
		};

		const code = plugin.createVirtualCode?.(uri, "other", snapshot);
		expect(code).toBeUndefined();
	});
});
