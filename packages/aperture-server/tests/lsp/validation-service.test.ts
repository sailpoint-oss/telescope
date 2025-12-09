import { beforeEach, describe, expect, test } from "bun:test";
import type { Diagnostic } from "@volar/language-server";
import type { IScriptSnapshot } from "typescript";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import { DataVirtualCode } from "../../src/lsp/languages/virtualCodes/data-virtual-code";
import { typeboxErrorsToDiagnostics } from "../../src/lsp/services/shared/typebox-to-diag";
import {
	computeContentHash,
	computeValidationResultId,
	ValidationDiagnosticsCache,
} from "../../src/lsp/services/validation-service";

/**
 * Helper to create a DataVirtualCode from YAML text
 */
function createVirtualCode(text: string): DataVirtualCode {
	const snapshot: IScriptSnapshot = {
		getText: (start, end) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
	return new DataVirtualCode(snapshot, "yaml");
}

/**
 * Helper to create a mock diagnostic
 */
function createDiagnostic(
	line: number,
	character: number,
	message: string,
): Diagnostic {
	return {
		range: {
			start: { line, character },
			end: { line, character: character + 10 },
		},
		message,
		severity: DiagnosticSeverity.Error,
		source: "test",
	};
}

describe("Validation Service Integration", () => {
	describe("Caching Behavior", () => {
		let cache: ValidationDiagnosticsCache;

		beforeEach(() => {
			cache = new ValidationDiagnosticsCache();
		});

		test("should return 'unchanged' for cached files with same content hash", () => {
			const uri = "file:///test.yaml";
			const content = "name: test\nversion: 1.0.0";
			const contentHash = computeContentHash(content);
			const diagnostics = [createDiagnostic(0, 0, "Test error")];
			const resultId = computeValidationResultId(uri, diagnostics, contentHash);

			// Store in cache
			cache.set(uri, {
				resultId,
				diagnostics,
				contentHash,
				computedAt: Date.now(),
			});

			// Verify cache hit
			expect(cache.hasChanged(uri)).toBe(false);
			const cached = cache.get(uri);
			expect(cached).toBeDefined();
			expect(cached?.contentHash).toBe(contentHash);
			expect(cached?.resultId).toBe(resultId);
		});

		test("should return 'full' for files not in cache", () => {
			const uri = "file:///new.yaml";

			// New file should be marked as changed (needs full validation)
			expect(cache.hasChanged(uri)).toBe(true);
			expect(cache.get(uri)).toBeUndefined();
		});

		test("should return 'full' after file content changes", () => {
			const uri = "file:///test.yaml";
			const originalContent = "name: test\nversion: 1.0.0";
			const modifiedContent = "name: test\nversion: 2.0.0";

			const originalHash = computeContentHash(originalContent);
			const modifiedHash = computeContentHash(modifiedContent);

			// Cache original
			cache.set(uri, {
				resultId: "old-result",
				diagnostics: [],
				contentHash: originalHash,
				computedAt: Date.now(),
			});

			// Content hash changed, so we need to revalidate
			expect(originalHash).not.toBe(modifiedHash);

			// Simulate file watcher marking file as changed
			cache.markChanged(uri);
			expect(cache.hasChanged(uri)).toBe(true);
		});

		test("should invalidate cache on file watcher event", () => {
			const uri = "file:///watched.yaml";

			// Add to cache
			cache.set(uri, {
				resultId: "cached-result",
				diagnostics: [],
				contentHash: "hash",
				computedAt: Date.now(),
			});

			expect(cache.hasChanged(uri)).toBe(false);

			// Simulate file watcher event
			cache.invalidate(uri);

			// Should now need revalidation
			expect(cache.hasChanged(uri)).toBe(true);
			expect(cache.get(uri)).toBeUndefined();
		});

		test("should clear cache on configuration change", () => {
			// Add multiple entries
			cache.set("file:///a.yaml", {
				resultId: "a",
				diagnostics: [],
				contentHash: "hash-a",
				computedAt: Date.now(),
			});
			cache.set("file:///b.yaml", {
				resultId: "b",
				diagnostics: [],
				contentHash: "hash-b",
				computedAt: Date.now(),
			});

			// Simulate config change
			cache.clear();

			// All entries should be gone
			expect(cache.get("file:///a.yaml")).toBeUndefined();
			expect(cache.get("file:///b.yaml")).toBeUndefined();
		});
	});

	describe("TypeBox Validation Integration", () => {
		test("should run TypeBox validation on YAML content", () => {
			const yaml = `name: "Test Config"
version: 123`;

			const virtualCode = createVirtualCode(yaml);

			const schema = Type.Object({
				name: Type.String(),
				version: Type.String(), // This will fail - version is number
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThan(0);
			}
		});

		test("should produce no diagnostics for valid content", () => {
			const yaml = `name: "Test Config"
version: "1.0.0"`;

			const virtualCode = createVirtualCode(yaml);

			const schema = Type.Object({
				name: Type.String(),
				version: Type.String(),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(true);
		});

		test("should handle missing required fields", () => {
			const yaml = `name: "Test"`;

			const virtualCode = createVirtualCode(yaml);

			const schema = Type.Object({
				name: Type.String(),
				version: Type.String(), // Missing
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			}
		});
	});

	describe("Result ID Consistency", () => {
		test("should produce same result ID for identical validation runs", () => {
			const uri = "file:///test.yaml";
			const content = "name: test";
			const contentHash = computeContentHash(content);
			const diagnostics = [createDiagnostic(0, 0, "Error 1")];

			const id1 = computeValidationResultId(uri, diagnostics, contentHash);
			const id2 = computeValidationResultId(uri, diagnostics, contentHash);

			expect(id1).toBe(id2);
		});

		test("should produce different result ID when diagnostics change", () => {
			const uri = "file:///test.yaml";
			const content = "name: test";
			const contentHash = computeContentHash(content);

			const diags1 = [createDiagnostic(0, 0, "Error 1")];
			const diags2 = [createDiagnostic(0, 0, "Error 2")];

			const id1 = computeValidationResultId(uri, diags1, contentHash);
			const id2 = computeValidationResultId(uri, diags2, contentHash);

			expect(id1).not.toBe(id2);
		});

		test("should produce different result ID when content changes", () => {
			const uri = "file:///test.yaml";
			const diagnostics = [createDiagnostic(0, 0, "Error")];

			const hash1 = computeContentHash("content v1");
			const hash2 = computeContentHash("content v2");

			const id1 = computeValidationResultId(uri, diagnostics, hash1);
			const id2 = computeValidationResultId(uri, diagnostics, hash2);

			expect(id1).not.toBe(id2);
		});
	});

	describe("Workspace Diagnostics Flow", () => {
		test("should track files that need validation", () => {
			const cache = new ValidationDiagnosticsCache();

			// New files need validation
			expect(cache.hasChanged("file:///new1.yaml")).toBe(true);
			expect(cache.hasChanged("file:///new2.yaml")).toBe(true);

			// Cache one file
			cache.set("file:///new1.yaml", {
				resultId: "result-1",
				diagnostics: [],
				contentHash: "hash-1",
				computedAt: Date.now(),
			});

			// Cached file doesn't need validation
			expect(cache.hasChanged("file:///new1.yaml")).toBe(false);
			// Uncached file still needs validation
			expect(cache.hasChanged("file:///new2.yaml")).toBe(true);
		});

		test("should support incremental updates workflow", () => {
			const cache = new ValidationDiagnosticsCache();
			const files = [
				"file:///config1.yaml",
				"file:///config2.yaml",
				"file:///config3.yaml",
			];

			// Initial validation - all files need full processing
			for (const uri of files) {
				expect(cache.hasChanged(uri)).toBe(true);

				// Simulate validation
				const contentHash = computeContentHash(`content for ${uri}`);
				const diagnostics: Diagnostic[] = [];
				const resultId = computeValidationResultId(
					uri,
					diagnostics,
					contentHash,
				);

				cache.set(uri, {
					resultId,
					diagnostics,
					contentHash,
					computedAt: Date.now(),
				});
			}

			// Second request - all files can return 'unchanged'
			for (const uri of files) {
				expect(cache.hasChanged(uri)).toBe(false);
				expect(cache.getResultId(uri)).toBeDefined();
			}

			// File edit - one file marked as changed
			cache.markChanged("file:///config2.yaml");

			// Now only config2 needs revalidation
			expect(cache.hasChanged("file:///config1.yaml")).toBe(false);
			expect(cache.hasChanged("file:///config2.yaml")).toBe(true);
			expect(cache.hasChanged("file:///config3.yaml")).toBe(false);
		});
	});
});
