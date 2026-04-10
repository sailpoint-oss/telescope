import { describe, test, expect } from "bun:test";
import type * as vscode from "vscode";
import {
	formatSetupLog,
	keysToRecord,
	getBaseLanguageFromExtension,
	isOpenAPILanguage,
	extractYAMLTopLevelKeys,
	extractJSONTopLevelKeys,
	classifyDocument,
	getOpenAPILanguageId,
} from "../src/utils";

function textDoc(opts: {
	languageId: string;
	fsPath: string;
	text: string;
}): vscode.TextDocument {
	return {
		languageId: opts.languageId,
		uri: { fsPath: opts.fsPath } as vscode.Uri,
		getText: () => opts.text,
	} as vscode.TextDocument;
}

describe("formatSetupLog", () => {
	test("prefixes message with [Setup]", () => {
		expect(formatSetupLog("server started")).toBe("[Setup] server started ");
	});

	test("serializes extra arguments as JSON", () => {
		expect(formatSetupLog("config", { port: 8080 }, 42)).toBe(
			'[Setup] config {"port":8080} 42',
		);
	});

	test("handles no extra arguments", () => {
		expect(formatSetupLog("init")).toBe("[Setup] init ");
	});
});

describe("keysToRecord", () => {
	test("returns null for an empty set", () => {
		expect(keysToRecord(new Set())).toBeNull();
	});

	test("converts a set to a record with true values", () => {
		expect(keysToRecord(new Set(["openapi", "info"]))).toEqual({
			openapi: true,
			info: true,
		});
	});

	test("preserves single-element sets", () => {
		expect(keysToRecord(new Set(["paths"]))).toEqual({ paths: true });
	});
});

describe("getBaseLanguageFromExtension", () => {
	test("returns yaml for .yaml files", () => {
		expect(getBaseLanguageFromExtension("/api/spec.yaml")).toBe("yaml");
	});

	test("returns yaml for .yml files", () => {
		expect(getBaseLanguageFromExtension("openapi.YML")).toBe("yaml");
	});

	test("returns json for .json files", () => {
		expect(getBaseLanguageFromExtension("/api/spec.JSON")).toBe("json");
	});

	test("returns undefined for unsupported extensions", () => {
		expect(getBaseLanguageFromExtension("readme.md")).toBeUndefined();
		expect(getBaseLanguageFromExtension("spec.txt")).toBeUndefined();
	});
});

describe("isOpenAPILanguage", () => {
	test("returns true for openapi-yaml", () => {
		expect(isOpenAPILanguage("openapi-yaml")).toBe(true);
	});

	test("returns true for openapi-json", () => {
		expect(isOpenAPILanguage("openapi-json")).toBe(true);
	});

	test("returns false for plain yaml/json", () => {
		expect(isOpenAPILanguage("yaml")).toBe(false);
		expect(isOpenAPILanguage("json")).toBe(false);
	});

	test("returns false for arbitrary strings", () => {
		expect(isOpenAPILanguage("typescript")).toBe(false);
		expect(isOpenAPILanguage("")).toBe(false);
	});
});

describe("extractYAMLTopLevelKeys edge cases", () => {
	test("truncates text beyond 4KB and still extracts keys before the cutoff", () => {
		const prefix = "openapi: 3.0.0\ninfo:\n  title: Test\n";
		const padding = "x".repeat(5000);
		const keys = extractYAMLTopLevelKeys(prefix + padding);
		expect(keys.has("openapi")).toBe(true);
		expect(keys.has("info")).toBe(true);
	});

	test("caps at 20 keys", () => {
		const lines = Array.from({ length: 30 }, (_, i) => `key${i}: val`).join(
			"\n",
		);
		const keys = extractYAMLTopLevelKeys(lines);
		expect(keys.size).toBe(20);
	});

	test("returns empty set for blank input", () => {
		expect(extractYAMLTopLevelKeys("").size).toBe(0);
	});

	test("ignores indented keys", () => {
		const text = "root:\n  nested: value\nanother: value";
		const keys = extractYAMLTopLevelKeys(text);
		expect(keys.has("root")).toBe(true);
		expect(keys.has("another")).toBe(true);
		expect(keys.has("nested")).toBe(false);
	});
});

describe("extractJSONTopLevelKeys edge cases", () => {
	test("returns empty set for a JSON array", () => {
		expect(extractJSONTopLevelKeys("[1,2,3]").size).toBe(0);
	});

	test("returns empty set for invalid JSON", () => {
		expect(extractJSONTopLevelKeys("{broken").size).toBe(0);
	});

	test("falls back to full parse when truncated slice is invalid", () => {
		const obj: Record<string, number> = {};
		for (let i = 0; i < 5; i++) obj[`k${i}`] = i;
		const json = JSON.stringify(obj);
		const padded = json + " ".repeat(10000);
		const keys = extractJSONTopLevelKeys(padded);
		expect(keys.size).toBe(5);
	});

	test("caps at 20 keys", () => {
		const obj: Record<string, number> = {};
		for (let i = 0; i < 30; i++) obj[`key${i}`] = i;
		const keys = extractJSONTopLevelKeys(JSON.stringify(obj));
		expect(keys.size).toBe(20);
	});

	test("returns empty set for empty string", () => {
		expect(extractJSONTopLevelKeys("").size).toBe(0);
	});
});

describe("getOpenAPILanguageId", () => {
	test("maps json extension to openapi-json", () => {
		expect(getOpenAPILanguageId("/x/spec.JSON")).toBe("openapi-json");
	});

	test("defaults non-json to openapi-yaml", () => {
		expect(getOpenAPILanguageId("/x/spec.yaml")).toBe("openapi-yaml");
	});
});

describe("classifyDocument", () => {
	test("classifies yaml document with openapi root", () => {
		const doc = textDoc({
			languageId: "yaml",
			fsPath: "/w/api.yaml",
			text: "openapi: 3.0.0\ninfo:\n  title: T\n  version: '1'\npaths: {}\n",
		});
		expect(classifyDocument(doc)).toBe("openapi");
	});

	test("classifies openapi-yaml language id", () => {
		const doc = textDoc({
			languageId: "openapi-yaml",
			fsPath: "/w/api.yaml",
			text: "openapi: 3.0.0\ninfo:\n  title: T\n  version: '1'\npaths: {}\n",
		});
		expect(classifyDocument(doc)).toBe("openapi");
	});

	test("classifies json document", () => {
		const doc = textDoc({
			languageId: "json",
			fsPath: "/w/api.json",
			text: '{"openapi":"3.0.0","info":{"title":"T","version":"1"},"paths":{}}',
		});
		expect(classifyDocument(doc)).toBe("openapi");
	});

	test("returns undefined for unsupported language without yaml/json extension", () => {
		const doc = textDoc({
			languageId: "typescript",
			fsPath: "/w/x.ts",
			text: "export {}",
		});
		expect(classifyDocument(doc)).toBeUndefined();
	});

	test("uses plaintext extension fallback for yaml files", () => {
		const doc = textDoc({
			languageId: "plaintext",
			fsPath: "/w/spec.yaml",
			text: "openapi: 3.0.0\ninfo:\n  title: T\n  version: '1'\npaths: {}\n",
		});
		expect(classifyDocument(doc)).toBe("openapi");
	});

	test("returns undefined when keys do not look like OpenAPI", () => {
		const doc = textDoc({
			languageId: "yaml",
			fsPath: "/w/other.yaml",
			text: "foo: bar\n",
		});
		expect(classifyDocument(doc)).toBeUndefined();
	});
});
