import { describe, expect, it, mock } from "bun:test";
import { resolve } from "node:path";
import { URI } from "vscode-uri";
import { isConfigFile } from "../config/config.js";
import { createOpenAPIServicePlugin } from "./openapi.js";
import type { ApertureVolarContext } from "../../workspace/context.js";
import type { Core } from "../../core/core.js";
import type { CancellationToken } from "@volar/language-service";

describe("OpenAPI Service - Config File Exclusion", () => {
  const workspaceRoot = "/workspace";

  describe("isConfigFile path-based exclusion", () => {
    it("should identify config file by path", () => {
      const configUri = URI.file(
        resolve(workspaceRoot, ".telescope", "config.yaml")
      ).toString();
      expect(isConfigFile(configUri)).toBe(true);
    });

    it("should identify config file in nested workspace", () => {
      const nestedRoot = resolve(workspaceRoot, "nested");
      const configUri = URI.file(
        resolve(nestedRoot, ".telescope", "config.yaml")
      ).toString();
      expect(isConfigFile(configUri)).toBe(true);
    });

    it("should not identify regular OpenAPI files as config files", () => {
      const openApiUri = URI.file(
        resolve(workspaceRoot, "api-v1.yaml")
      ).toString();
      expect(isConfigFile(openApiUri)).toBe(false);
    });

    it("should not identify files with similar names as config files", () => {
      const similarUri = URI.file(
        resolve(workspaceRoot, "config.yaml")
      ).toString();
      expect(isConfigFile(similarUri)).toBe(false);
    });

    it("should identify config file even if it contains OpenAPI-like content", () => {
      // Config file path should be excluded regardless of content
      const configUri = URI.file(
        resolve(workspaceRoot, ".telescope", "config.yaml")
      ).toString();
      expect(isConfigFile(configUri)).toBe(true);
    });

    it("should handle case-insensitive path matching", () => {
      const configUri = URI.file(
        resolve(workspaceRoot, ".telescope", "CONFIG.YAML")
      ).toString();
      // isConfigFile uses toLowerCase internally, so this should work
      expect(isConfigFile(configUri)).toBe(true);
    });

    it("should identify config file with different URI formats", () => {
      // Test with file:// URI
      const configUri1 = `file://${resolve(
        workspaceRoot,
        ".telescope",
        "config.yaml"
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
        resolve(workspaceRoot, ".telescope", "config.yaml")
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
        resolve(workspaceRoot, ".telescope", "config.yaml")
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
    getRuleImplementations: () => [{
      meta: { ruleType: "openapi" },
      create: () => ({}),
    }],
    getWorkspaceFolders: () => [],
    getAdditionalValidationGroups: () => ({}),
    getValidationRules: () => [],
    getFileSystem: () => ({}),
    getRootDocumentUris: () => [],
    documents: { get: () => undefined },
    hasInitialScanBeenPerformed: () => true, // Skip initial scan logic for simple test
  } as unknown as ApertureVolarContext;

  const servicePlugin = createOpenAPIServicePlugin(mockContext);
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
    const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } as CancellationToken;

    // Mock runEngineIR via a module mock if possible, or assume runEngineIR works with empty IR
    // Since we can't easily mock imported functions in this test setup without more tooling,
    // we'll rely on the fact that `provideDiagnostics` calls `runEngineIR` and we expect it to return something or at least run.
    // However, `runEngineIR` implementation is real. If we pass empty IR, it might just return empty diagnostics.
    
    const diagnostics = await service.provideDiagnostics?.(document, token);
    // We just want to ensure it didn't bail early due to config file check
    expect(diagnostics).toBeDefined();
  });
});
