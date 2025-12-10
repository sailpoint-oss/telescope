import { beforeEach, describe, expect, test } from "bun:test";
import type { Diagnostic } from "@volar/language-server";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import {
	DiagnosticsCache,
	computeContentHash,
	computeDiagnosticsResultId,
} from "../../src/lsp/services/shared/diagnostics-cache";

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

describe("DiagnosticsCache", () => {
	let cache: DiagnosticsCache;

	beforeEach(() => {
		cache = new DiagnosticsCache();
	});

	describe("get/set operations", () => {
		test("should return undefined for uncached URIs", () => {
			expect(cache.get("file:///unknown.yaml")).toBeUndefined();
		});

		test("should store and retrieve cache entries", () => {
			const diagnostics = [createDiagnostic(0, 0, "Test error")];
			cache.set("file:///test.yaml", diagnostics, "hash-1");

			const retrieved = cache.get("file:///test.yaml");
			expect(retrieved).toBeDefined();
			expect(retrieved?.diagnostics).toHaveLength(1);
			expect(retrieved?.contentHash).toBe("hash-1");
		});

		test("should overwrite existing entries", () => {
			cache.set("file:///test.yaml", [], "hash-1");
			cache.set("file:///test.yaml", [], "hash-2");

			const retrieved = cache.get("file:///test.yaml");
			expect(retrieved?.contentHash).toBe("hash-2");
		});
	});

	describe("change tracking", () => {
		test("should track changed files via markChanged()", () => {
			cache.markChanged("file:///changed.yaml");

			expect(cache.needsRevalidation("file:///changed.yaml")).toBe(true);
		});

		test("should report uncached files as needing validation", () => {
			expect(cache.needsRevalidation("file:///new.yaml")).toBe(true);
		});

		test("should report cached files as not needing validation", () => {
			cache.set("file:///test.yaml", [], "hash-1");

			expect(cache.needsRevalidation("file:///test.yaml")).toBe(false);
		});

		test("should clear change tracking after cache.set()", () => {
			cache.markChanged("file:///test.yaml");
			expect(cache.needsRevalidation("file:///test.yaml")).toBe(true);

			cache.set("file:///test.yaml", [], "hash-1");

			expect(cache.needsRevalidation("file:///test.yaml")).toBe(false);
		});
	});

	describe("getResultId", () => {
		test("should return result ID for cached entries", () => {
			cache.set("file:///test.yaml", [], "hash-1");

			const resultId = cache.getResultId("file:///test.yaml");
			expect(resultId).toBeDefined();
			expect(resultId?.length).toBe(16);
		});

		test("should return undefined for uncached URIs", () => {
			expect(cache.getResultId("file:///unknown.yaml")).toBeUndefined();
		});
	});

	describe("invalidate", () => {
		test("should remove entry from cache", () => {
			cache.set("file:///test.yaml", [], "hash-1");

			cache.invalidate("file:///test.yaml");

			expect(cache.get("file:///test.yaml")).toBeUndefined();
		});

		test("should mark URI as needing validation after invalidation", () => {
			cache.set("file:///test.yaml", [], "hash-1");

			cache.invalidate("file:///test.yaml");

			expect(cache.needsRevalidation("file:///test.yaml")).toBe(true);
		});
	});

	describe("clear", () => {
		test("should clear all cached data", () => {
			cache.set("file:///a.yaml", [], "hash-a");
			cache.set("file:///b.yaml", [], "hash-b");
			cache.markChanged("file:///c.yaml");

			cache.clear();

			expect(cache.get("file:///a.yaml")).toBeUndefined();
			expect(cache.get("file:///b.yaml")).toBeUndefined();
			// After clear, uncached files report as needing validation
			expect(cache.needsRevalidation("file:///c.yaml")).toBe(true);
		});
	});
});

describe("computeDiagnosticsResultId", () => {
	test("should produce consistent hashes for same input", () => {
		const diagnostics = [createDiagnostic(0, 0, "Error message")];

		const id1 = computeDiagnosticsResultId(
			"file:///test.yaml",
			diagnostics,
			"content-hash",
		);
		const id2 = computeDiagnosticsResultId(
			"file:///test.yaml",
			diagnostics,
			"content-hash",
		);

		expect(id1).toBe(id2);
	});

	test("should produce different IDs for different URIs", () => {
		const diagnostics = [createDiagnostic(0, 0, "Error message")];

		const id1 = computeDiagnosticsResultId(
			"file:///test1.yaml",
			diagnostics,
			"content-hash",
		);
		const id2 = computeDiagnosticsResultId(
			"file:///test2.yaml",
			diagnostics,
			"content-hash",
		);

		expect(id1).not.toBe(id2);
	});

	test("should produce different IDs for different content hashes", () => {
		const diagnostics = [createDiagnostic(0, 0, "Error message")];

		const id1 = computeDiagnosticsResultId(
			"file:///test.yaml",
			diagnostics,
			"hash-1",
		);
		const id2 = computeDiagnosticsResultId(
			"file:///test.yaml",
			diagnostics,
			"hash-2",
		);

		expect(id1).not.toBe(id2);
	});

	test("should produce different IDs for different diagnostics", () => {
		const id1 = computeDiagnosticsResultId(
			"file:///test.yaml",
			[createDiagnostic(0, 0, "Error 1")],
			"content-hash",
		);
		const id2 = computeDiagnosticsResultId(
			"file:///test.yaml",
			[createDiagnostic(0, 0, "Error 2")],
			"content-hash",
		);

		expect(id1).not.toBe(id2);
	});

	test("should handle empty diagnostics array", () => {
		const id = computeDiagnosticsResultId(
			"file:///test.yaml",
			[],
			"content-hash",
		);

		expect(id).toBeDefined();
		expect(id.length).toBe(16);
	});

	test("should include severity in hash", () => {
		const id1 = computeDiagnosticsResultId(
			"file:///test.yaml",
			[createDiagnostic(0, 0, "Error", DiagnosticSeverity.Error)],
			"hash",
		);
		const id2 = computeDiagnosticsResultId(
			"file:///test.yaml",
			[createDiagnostic(0, 0, "Error", DiagnosticSeverity.Warning)],
			"hash",
		);

		expect(id1).not.toBe(id2);
	});

	test("should produce 16-character hex string", () => {
		const id = computeDiagnosticsResultId(
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
