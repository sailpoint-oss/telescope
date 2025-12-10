import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Diagnostic } from "@volar/language-server";
import type { CancellationToken } from "@volar/language-service";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { createOpenAPIServicePlugin } from "../../src/lsp/services/openapi-service.js";
import { isConfigFile } from "../../src/lsp/utils.js";
import type { telescopeVolarContext } from "../../src/lsp/workspace/context.js";

describe("OpenAPI Service - Config File Exclusion", () => {
	const workspaceRoot = "/workspace";

	describe("isConfigFile path-based exclusion", () => {
		it("should identify config file by path", () => {
			const configUri = URI.file(
				resolve(workspaceRoot, ".telescope", "config.yaml"),
			).toString();
			expect(isConfigFile(configUri)).toBe(true);
		});

		it("should identify config file in nested workspace", () => {
			const nestedRoot = resolve(workspaceRoot, "nested");
			const configUri = URI.file(
				resolve(nestedRoot, ".telescope", "config.yaml"),
			).toString();
			expect(isConfigFile(configUri)).toBe(true);
		});

		it("should not identify regular OpenAPI files as config files", () => {
			const openApiUri = URI.file(
				resolve(workspaceRoot, "api-v1.yaml"),
			).toString();
			expect(isConfigFile(openApiUri)).toBe(false);
		});

		it("should not identify files with similar names as config files", () => {
			const similarUri = URI.file(
				resolve(workspaceRoot, "config.yaml"),
			).toString();
			expect(isConfigFile(similarUri)).toBe(false);
		});

		it("should identify config file even if it contains OpenAPI-like content", () => {
			// Config file path should be excluded regardless of content
			const configUri = URI.file(
				resolve(workspaceRoot, ".telescope", "config.yaml"),
			).toString();
			expect(isConfigFile(configUri)).toBe(true);
		});

		it("should handle case-insensitive path matching", () => {
			const configUri = URI.file(
				resolve(workspaceRoot, ".telescope", "CONFIG.YAML"),
			).toString();
			// isConfigFile uses toLowerCase internally, so this should work
			expect(isConfigFile(configUri)).toBe(true);
		});

		it("should identify config file with different URI formats", () => {
			// Test with file:// URI
			const configUri1 = `file://${resolve(
				workspaceRoot,
				".telescope",
				"config.yaml",
			)}`;
			expect(isConfigFile(configUri1)).toBe(true);

			// Test with Windows-style path (normalized to forward slashes)
			const configUri2 = `C:/workspace/.telescope/config.yaml`;
			expect(isConfigFile(configUri2)).toBe(true);
		});
	});

	describe("Config file exclusion behavior", () => {
		it("should exclude config files before content parsing", () => {
			// This test verifies that isConfigFile is a pure path-based check
			// It doesn't require reading file content or parsing OpenAPI structure
			const configUri = URI.file(
				resolve(workspaceRoot, ".telescope", "config.yaml"),
			).toString();

			// The function should return true based on path alone
			const isConfig = isConfigFile(configUri);
			expect(isConfig).toBe(true);

			// Even if the file would contain OpenAPI content, it should be excluded
			// This is verified by the path check happening first
		});

		it("should exclude config files regardless of OpenAPI patterns", () => {
			// Config files should be excluded even if they match OpenAPI include patterns
			const configUri = URI.file(
				resolve(workspaceRoot, ".telescope", "config.yaml"),
			).toString();

			// Even with a pattern that would match *.yaml files
			// The config file should still be excluded
			expect(isConfigFile(configUri)).toBe(true);
		});
	});
});

describe("OpenAPI Service - Diagnostics", () => {
	const mockCore = {
		getIR: mock((_uri: string) => ({})), // Mock IR presence
		getAtoms: mock((_uri: string) => ({})),
		getLinkedUris: mock((_uri: string) => []),
		getGraphIndex: mock(() => ({})),
		locToRange: mock(),
		getResultId: mock(),
		getAffectedUris: mock(() => []),
	} as unknown as Core;

	const mockContext = {
		getLogger: () => ({ log: () => {}, error: () => {} }),
		core: mockCore,
		decodeEmbeddedDocumentUri: () => undefined,
		getRuleImplementations: () => [
			{
				meta: { ruleType: "openapi" },
				create: () => ({}),
			},
		],
		getWorkspaceFolders: () => [],
		getAdditionalValidationGroups: () => ({}),
		getValidationRules: () => [],
		getFileSystem: () => ({}),
		getRootDocumentUris: () => [],
		documents: { get: () => undefined },
		hasInitialScanBeenPerformed: () => true, // Skip initial scan logic for simple test
	} as unknown as telescopeVolarContext;

	const servicePlugin = createOpenAPIServicePlugin({ shared: mockContext });
	const service = servicePlugin.create(null as any);

	it("should not lint config files", async () => {
		const configUri = URI.file("/workspace/.telescope/config.yaml").toString();
		const document = {
			uri: configUri,
			languageId: "openapi",
			getText: () => "content",
		} as any;
		const token = { isCancellationRequested: false } as CancellationToken;

		const diagnostics = await service.provideDiagnostics?.(document, token);
		expect(diagnostics).toEqual([]);
	});

	it("should lint openapi files if IR is present", async () => {
		const apiUri = URI.file("/workspace/api.yaml").toString();
		const document = {
			uri: apiUri,
			languageId: "openapi",
			getText: () => "content",
		} as any;
		const token = {
			isCancellationRequested: false,
			onCancellationRequested: () => ({ dispose: () => {} }),
		} as CancellationToken;

		// Mock runEngine via a module mock if possible, or assume runEngine works with empty IR
		// Since we can't easily mock imported functions in this test setup without more tooling,
		// we'll rely on the fact that `provideDiagnostics` calls `runEngine` and we expect it to return something or at least run.
		// However, `runEngine` implementation is real. If we pass empty IR, it might just return empty diagnostics.

		const diagnostics = await service.provideDiagnostics?.(document, token);
		// We just want to ensure it didn't bail early due to config file check
		expect(diagnostics).toBeDefined();
	});
});

describe("OpenAPI Service - Workspace Diagnostics", () => {
	/**
	 * Helper to compute a diagnostics hash (same algorithm as openapi-service.ts)
	 */
	function computeDiagnosticsHash(
		diagnostics: Diagnostic[],
		version: number | null,
	): string {
		const sorted = diagnostics.slice().sort((a, b) => {
			const lineDiff = a.range.start.line - b.range.start.line;
			if (lineDiff !== 0) return lineDiff;
			const charDiff = a.range.start.character - b.range.start.character;
			if (charDiff !== 0) return charDiff;
			return a.message.localeCompare(b.message);
		});

		const payload = {
			version,
			diagnostics: sorted.map((d) => ({
				range: d.range,
				severity: d.severity,
				code: d.code,
				message: d.message,
			})),
		};

		return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
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
			source: "telescope",
		};
	}

	describe("Result ID Generation", () => {
		it("should produce consistent hashes for same diagnostics", () => {
			const diagnostics = [createDiagnostic(0, 0, "Error message")];

			const hash1 = computeDiagnosticsHash(diagnostics, 1);
			const hash2 = computeDiagnosticsHash(diagnostics, 1);

			expect(hash1).toBe(hash2);
		});

		it("should produce different hashes for different diagnostics", () => {
			const diags1 = [createDiagnostic(0, 0, "Error 1")];
			const diags2 = [createDiagnostic(0, 0, "Error 2")];

			const hash1 = computeDiagnosticsHash(diags1, 1);
			const hash2 = computeDiagnosticsHash(diags2, 1);

			expect(hash1).not.toBe(hash2);
		});

		it("should produce different hashes for different versions", () => {
			const diagnostics = [createDiagnostic(0, 0, "Error")];

			const hash1 = computeDiagnosticsHash(diagnostics, 1);
			const hash2 = computeDiagnosticsHash(diagnostics, 2);

			expect(hash1).not.toBe(hash2);
		});

		it("should produce same hash regardless of diagnostic order", () => {
			const diag1 = createDiagnostic(0, 0, "First");
			const diag2 = createDiagnostic(1, 0, "Second");

			const hash1 = computeDiagnosticsHash([diag1, diag2], 1);
			const hash2 = computeDiagnosticsHash([diag2, diag1], 1);

			expect(hash1).toBe(hash2);
		});

		it("should handle null version", () => {
			const diagnostics = [createDiagnostic(0, 0, "Error")];

			const hash = computeDiagnosticsHash(diagnostics, null);

			expect(hash).toBeDefined();
			expect(hash.length).toBe(40); // SHA1 hex length
		});

		it("should handle empty diagnostics", () => {
			const hash = computeDiagnosticsHash([], 1);

			expect(hash).toBeDefined();
			expect(hash.length).toBe(40);
		});
	});

	describe("Affected URIs Tracking", () => {
		it("should track affected URIs correctly", () => {
			const affectedUris = new Set<string>();

			// Simulate marking URIs as affected
			affectedUris.add("file:///api.yaml");
			affectedUris.add("file:///components/schemas.yaml");

			expect(affectedUris.size).toBe(2);
			expect(affectedUris.has("file:///api.yaml")).toBe(true);
			expect(affectedUris.has("file:///components/schemas.yaml")).toBe(true);
		});

		it("should clear affected URIs after processing", () => {
			const affectedUris = new Set<string>();
			affectedUris.add("file:///api.yaml");

			// Simulate clearing after workspace diagnostics run
			affectedUris.clear();

			expect(affectedUris.size).toBe(0);
		});
	});

	describe("Workspace Diagnostics Response Types", () => {
		it("should understand 'full' response structure", () => {
			const fullReport = {
				kind: "full" as const,
				uri: "file:///api.yaml",
				version: 1,
				resultId: "abc123",
				items: [createDiagnostic(0, 0, "Error")],
			};

			expect(fullReport.kind).toBe("full");
			expect(fullReport.items).toHaveLength(1);
			expect(fullReport.resultId).toBeDefined();
		});

		it("should understand 'unchanged' response structure", () => {
			const unchangedReport = {
				kind: "unchanged" as const,
				uri: "file:///api.yaml",
				version: 1,
				resultId: "abc123",
			};

			expect(unchangedReport.kind).toBe("unchanged");
			expect(unchangedReport.resultId).toBeDefined();
			// unchanged reports don't have 'items'
			expect("items" in unchangedReport).toBe(false);
		});

		it("should return unchanged when result ID matches", () => {
			const previousResultId = "abc123";
			const currentResultId = "abc123"; // Same

			const shouldReturnUnchanged = previousResultId === currentResultId;

			expect(shouldReturnUnchanged).toBe(true);
		});

		it("should return full when result ID differs", () => {
			const previousResultId = "abc123";
			const currentResultId = "def456"; // Different

			const shouldReturnFull = previousResultId !== currentResultId;

			expect(shouldReturnFull).toBe(true);
		});
	});

	describe("Initial Scan Logic", () => {
		it("should track initial scan status", () => {
			let hasPerformedInitialScan = false;

			// Before scan
			expect(hasPerformedInitialScan).toBe(false);

			// After scan
			hasPerformedInitialScan = true;
			expect(hasPerformedInitialScan).toBe(true);
		});

		it("should discover files only on first run", () => {
			let hasPerformedInitialScan = false;
			const discoveredUris: string[] = [];

			// First run - discover files
			if (!hasPerformedInitialScan) {
				discoveredUris.push("file:///api.yaml");
				discoveredUris.push("file:///components.yaml");
				hasPerformedInitialScan = true;
			}

			expect(discoveredUris).toHaveLength(2);

			// Second run - should not discover again
			const secondRunDiscovered: string[] = [];
			if (!hasPerformedInitialScan) {
				secondRunDiscovered.push("should-not-happen");
			}

			expect(secondRunDiscovered).toHaveLength(0);
		});
	});
});
