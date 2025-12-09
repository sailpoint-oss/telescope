import { beforeEach, describe, expect, test } from "bun:test";
import type { Diagnostic } from "@volar/language-server";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import {
	computeContentHash,
	computeValidationResultId,
	type ValidationCacheEntry,
	ValidationDiagnosticsCache,
} from "../../src/lsp/services/validation-service";

/**
 * Helper to create a mock diagnostic
 */
function createDiagnostic(
	line: number,
	character: number,
	message: string,
	severity: DiagnosticSeverity = DiagnosticSeverity.Error,
): Diagnostic {
	return {
		range: {
			start: { line, character },
			end: { line, character: character + 10 },
		},
		message,
		severity,
		source: "test",
	};
}

/**
 * Helper to create a cache entry
 */
function createCacheEntry(
	resultId: string,
	diagnostics: Diagnostic[] = [],
	contentHash = "abc123",
): ValidationCacheEntry {
	return {
		resultId,
		diagnostics,
		contentHash,
		computedAt: Date.now(),
	};
}

describe("ValidationDiagnosticsCache", () => {
	let cache: ValidationDiagnosticsCache;

	beforeEach(() => {
		cache = new ValidationDiagnosticsCache();
	});

	describe("get/set operations", () => {
		test("should return undefined for uncached URIs", () => {
			expect(cache.get("file:///unknown.yaml")).toBeUndefined();
		});

		test("should store and retrieve cache entries", () => {
			const entry = createCacheEntry("result-1", [
				createDiagnostic(0, 0, "Test error"),
			]);

			cache.set("file:///test.yaml", entry);

			const retrieved = cache.get("file:///test.yaml");
			expect(retrieved).toBeDefined();
			expect(retrieved?.resultId).toBe("result-1");
			expect(retrieved?.diagnostics).toHaveLength(1);
		});

		test("should overwrite existing entries", () => {
			const entry1 = createCacheEntry("result-1");
			const entry2 = createCacheEntry("result-2");

			cache.set("file:///test.yaml", entry1);
			cache.set("file:///test.yaml", entry2);

			const retrieved = cache.get("file:///test.yaml");
			expect(retrieved?.resultId).toBe("result-2");
		});
	});

	describe("change tracking", () => {
		test("should track changed files via markChanged()", () => {
			cache.markChanged("file:///changed.yaml");

			expect(cache.hasChanged("file:///changed.yaml")).toBe(true);
		});

		test("should report uncached files as changed", () => {
			expect(cache.hasChanged("file:///new.yaml")).toBe(true);
		});

		test("should report cached files as not changed", () => {
			const entry = createCacheEntry("result-1");
			cache.set("file:///test.yaml", entry);

			expect(cache.hasChanged("file:///test.yaml")).toBe(false);
		});

		test("should clear change tracking after cache.set()", () => {
			cache.markChanged("file:///test.yaml");
			expect(cache.hasChanged("file:///test.yaml")).toBe(true);

			const entry = createCacheEntry("result-1");
			cache.set("file:///test.yaml", entry);

			expect(cache.hasChanged("file:///test.yaml")).toBe(false);
		});
	});

	describe("getResultId", () => {
		test("should return result ID for cached entries", () => {
			const entry = createCacheEntry("my-result-id");
			cache.set("file:///test.yaml", entry);

			expect(cache.getResultId("file:///test.yaml")).toBe("my-result-id");
		});

		test("should return undefined for uncached URIs", () => {
			expect(cache.getResultId("file:///unknown.yaml")).toBeUndefined();
		});
	});

	describe("invalidate", () => {
		test("should remove entry from cache", () => {
			const entry = createCacheEntry("result-1");
			cache.set("file:///test.yaml", entry);

			cache.invalidate("file:///test.yaml");

			expect(cache.get("file:///test.yaml")).toBeUndefined();
		});

		test("should mark URI as changed after invalidation", () => {
			const entry = createCacheEntry("result-1");
			cache.set("file:///test.yaml", entry);

			cache.invalidate("file:///test.yaml");

			expect(cache.hasChanged("file:///test.yaml")).toBe(true);
		});
	});

	describe("clear", () => {
		test("should clear all cached data", () => {
			cache.set("file:///a.yaml", createCacheEntry("a"));
			cache.set("file:///b.yaml", createCacheEntry("b"));
			cache.markChanged("file:///c.yaml");

			cache.clear();

			expect(cache.get("file:///a.yaml")).toBeUndefined();
			expect(cache.get("file:///b.yaml")).toBeUndefined();
			// After clear, uncached files report as changed
			expect(cache.hasChanged("file:///c.yaml")).toBe(true);
		});
	});
});

describe("computeValidationResultId", () => {
	test("should produce consistent hashes for same input", () => {
		const diagnostics = [createDiagnostic(0, 0, "Error message")];

		const id1 = computeValidationResultId(
			"file:///test.yaml",
			diagnostics,
			"content-hash",
		);
		const id2 = computeValidationResultId(
			"file:///test.yaml",
			diagnostics,
			"content-hash",
		);

		expect(id1).toBe(id2);
	});

	test("should produce different IDs for different URIs", () => {
		const diagnostics = [createDiagnostic(0, 0, "Error message")];

		const id1 = computeValidationResultId(
			"file:///test1.yaml",
			diagnostics,
			"content-hash",
		);
		const id2 = computeValidationResultId(
			"file:///test2.yaml",
			diagnostics,
			"content-hash",
		);

		expect(id1).not.toBe(id2);
	});

	test("should produce different IDs for different content hashes", () => {
		const diagnostics = [createDiagnostic(0, 0, "Error message")];

		const id1 = computeValidationResultId(
			"file:///test.yaml",
			diagnostics,
			"hash-1",
		);
		const id2 = computeValidationResultId(
			"file:///test.yaml",
			diagnostics,
			"hash-2",
		);

		expect(id1).not.toBe(id2);
	});

	test("should produce different IDs for different diagnostics", () => {
		const id1 = computeValidationResultId(
			"file:///test.yaml",
			[createDiagnostic(0, 0, "Error 1")],
			"content-hash",
		);
		const id2 = computeValidationResultId(
			"file:///test.yaml",
			[createDiagnostic(0, 0, "Error 2")],
			"content-hash",
		);

		expect(id1).not.toBe(id2);
	});

	test("should produce same ID regardless of diagnostic order", () => {
		const diag1 = createDiagnostic(0, 0, "First error");
		const diag2 = createDiagnostic(1, 5, "Second error");

		const id1 = computeValidationResultId(
			"file:///test.yaml",
			[diag1, diag2],
			"content-hash",
		);
		const id2 = computeValidationResultId(
			"file:///test.yaml",
			[diag2, diag1],
			"content-hash",
		);

		expect(id1).toBe(id2);
	});

	test("should handle empty diagnostics array", () => {
		const id = computeValidationResultId(
			"file:///test.yaml",
			[],
			"content-hash",
		);

		expect(id).toBeDefined();
		expect(id.length).toBe(16);
	});

	test("should include severity in hash", () => {
		const id1 = computeValidationResultId(
			"file:///test.yaml",
			[createDiagnostic(0, 0, "Error", DiagnosticSeverity.Error)],
			"hash",
		);
		const id2 = computeValidationResultId(
			"file:///test.yaml",
			[createDiagnostic(0, 0, "Error", DiagnosticSeverity.Warning)],
			"hash",
		);

		expect(id1).not.toBe(id2);
	});

	test("should produce 16-character hex string", () => {
		const id = computeValidationResultId(
			"file:///test.yaml",
			[createDiagnostic(0, 0, "Test")],
			"content-hash",
		);

		expect(id.length).toBe(16);
		expect(/^[0-9a-f]+$/.test(id)).toBe(true);
	});
});

describe("computeContentHash", () => {
	test("should produce consistent hashes for same content", () => {
		const hash1 = computeContentHash("hello world");
		const hash2 = computeContentHash("hello world");

		expect(hash1).toBe(hash2);
	});

	test("should produce different hashes for different content", () => {
		const hash1 = computeContentHash("content A");
		const hash2 = computeContentHash("content B");

		expect(hash1).not.toBe(hash2);
	});

	test("should detect content changes", () => {
		const original = "name: test\nversion: 1.0.0";
		const modified = "name: test\nversion: 2.0.0";

		const hash1 = computeContentHash(original);
		const hash2 = computeContentHash(modified);

		expect(hash1).not.toBe(hash2);
	});

	test("should handle empty string", () => {
		const hash = computeContentHash("");

		expect(hash).toBeDefined();
		expect(hash.length).toBe(16);
	});

	test("should handle unicode content", () => {
		const hash = computeContentHash("名前: テスト");

		expect(hash).toBeDefined();
		expect(hash.length).toBe(16);
	});

	test("should produce 16-character hex string", () => {
		const hash = computeContentHash("test content");

		expect(hash.length).toBe(16);
		expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
	});
});
