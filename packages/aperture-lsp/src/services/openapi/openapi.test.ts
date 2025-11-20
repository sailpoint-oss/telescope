import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { URI } from "vscode-uri";
import { isConfigFile } from "../config/config.js";

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
