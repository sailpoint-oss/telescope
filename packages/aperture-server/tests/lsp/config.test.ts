import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	spyOn,
} from "bun:test";
import {
	existsSync,
	mkdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { URI } from "vscode-uri";
import {
	loadCustomOpenAPIRule,
	loadGenericRule,
	matchesPattern,
	materializeGenericRules,
	materializeRules,
	resolveConfig,
} from "../../src/engine/index.js";
import { ApertureVolarContext } from "../../src/lsp/workspace/context.js";

describe("Config Loading", () => {
	const testDir = join(process.cwd(), ".test-config");
	const telescopeDir = join(testDir, ".telescope");
	const configFile1 = join(telescopeDir, "config.yaml");

	let warnSpy: ReturnType<typeof spyOn> | undefined;

	beforeAll(() => {
		// Silence expected warning noise from test fixtures (missing/invalid custom rules/schemas)
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});

	afterAll(() => {
		warnSpy?.mockRestore();
	});

	beforeEach(() => {
		// Create test directory
		if (!existsSync(testDir)) {
			mkdirSync(testDir, { recursive: true });
		}
		if (!existsSync(telescopeDir)) {
			mkdirSync(telescopeDir, { recursive: true });
		}
	});

	afterEach(() => {
		// Clean up test files
		if (existsSync(configFile1)) {
			unlinkSync(configFile1);
		}
		if (existsSync(telescopeDir)) {
			try {
				rmSync(telescopeDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}
		if (existsSync(testDir)) {
			try {
				rmSync(testDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}
	});

	it("should return default config when no config file exists", () => {
		const config = resolveConfig(testDir);
		expect(config.openapi?.patterns).toEqual([
			"**/*.yaml",
			"**/*.yml",
			"**/*.json",
			"**/*.jsonc",
		]);
	});

	it("should load config from .telescope/config.yaml", () => {
		const yamlContent = `openapi:
  patterns:
    - "**/*.yaml"
    - "!**/node_modules/**"
`;
		writeFileSync(configFile1, yamlContent, "utf-8");

		const config = resolveConfig(testDir);
		expect(config.openapi?.patterns).toContain("**/*.yaml");
		expect(config.openapi?.patterns).toContain("!**/node_modules/**");
	});

	it("should merge with defaults when config is partial", () => {
		const yamlContent = `openapi:
  patterns:
    - "!**/test/**"
`;
		writeFileSync(configFile1, yamlContent, "utf-8");

		const config = resolveConfig(testDir);
		expect(config.openapi?.patterns).toContain("!**/test/**");
		// Default is overwritten if provided, but patterns field itself overrides default patterns
	});

	it("should handle invalid YAML gracefully", () => {
		const yamlContent = `invalid: yaml: content: [`;
		writeFileSync(configFile1, yamlContent, "utf-8");

		// Silence expected parse error noise
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});

		// Should not throw, should return defaults
		const config = resolveConfig(testDir);
		expect(config.openapi?.patterns).toEqual([
			"**/*.yaml",
			"**/*.yml",
			"**/*.json",
			"**/*.jsonc",
		]);

		errorSpy.mockRestore();
	});

	it("should return default config when workspaceRoot is undefined", () => {
		const config = resolveConfig(undefined);
		expect(config.openapi?.patterns).toEqual([
			"**/*.yaml",
			"**/*.yml",
			"**/*.json",
			"**/*.jsonc",
		]);
	});
});

describe("Pattern Matching", () => {
	const workspaceRoots = ["/workspace"];

	it("should match files with include patterns", () => {
		expect(
			matchesPattern(
				"file:///workspace/api.yaml",
				["**/*.yaml"],
				workspaceRoots,
			),
		).toBe(true);

		expect(
			matchesPattern(
				"file:///workspace/api.yaml",
				["**/*.yml"],
				workspaceRoots,
			),
		).toBe(false);
	});

	it("should exclude files matching exclude patterns", () => {
		// Note: matchesPattern supports explicit excludes array, but new config merges them into patterns with ! prefix.
		// Testing raw function support here.
		expect(
			matchesPattern(
				"file:///workspace/node_modules/test.yaml",
				["**/*.yaml", "!**/node_modules/**"],
				workspaceRoots,
			),
		).toBe(false);

		expect(
			matchesPattern(
				"file:///workspace/src/api.yaml",
				["**/*.yaml", "!**/node_modules/**"],
				workspaceRoots,
			),
		).toBe(true);
	});

	it("should use default include patterns when none specified", () => {
		expect(
			matchesPattern(
				"file:///workspace/api.yaml",
				undefined as any,
				workspaceRoots,
			),
		).toBe(true);

		expect(
			matchesPattern(
				"file:///workspace/api.txt",
				undefined as any,
				workspaceRoots,
			),
		).toBe(false);
	});

	it("should handle multiple include patterns", () => {
		expect(
			matchesPattern(
				"file:///workspace/api.yaml",
				["**/*.yaml", "**/*.yml"],
				workspaceRoots,
			),
		).toBe(true);

		expect(
			matchesPattern(
				"file:///workspace/api.yml",
				["**/*.yaml", "**/*.yml"],
				workspaceRoots,
			),
		).toBe(true);
	});

	it("should handle multiple exclude patterns", () => {
		expect(
			matchesPattern(
				"file:///workspace/test-api.yaml",
				["**/*.yaml", "!**/test-*.yaml", "!**/node_modules/**"],
				workspaceRoots,
			),
		).toBe(false);

		expect(
			matchesPattern(
				"file:///workspace/api.yaml",
				["**/*.yaml", "!**/test-*.yaml", "!**/node_modules/**"],
				workspaceRoots,
			),
		).toBe(true);
	});

	it("should handle file URIs correctly", () => {
		expect(
			matchesPattern(
				"file:///workspace/api.yaml",
				["**/*.yaml"],
				workspaceRoots,
			),
		).toBe(true);
	});

	it("should handle relative paths from workspace root", () => {
		expect(
			matchesPattern(
				"file:///workspace/src/api.yaml",
				["src/**/*.yaml"],
				workspaceRoots,
			),
		).toBe(true);

		expect(
			matchesPattern(
				"file:///workspace/other/api.yaml",
				["src/**/*.yaml"],
				workspaceRoots,
			),
		).toBe(false);
	});

	it("should always exclude config files", () => {
		// Config files should be excluded regardless of include/exclude patterns
		expect(
			matchesPattern(
				"file:///workspace/.telescope/config.yaml",
				["**/*.yaml"],
				workspaceRoots,
			),
		).toBe(false);

		expect(
			matchesPattern(
				"file:///workspace/subdir/.telescope/config.yaml",
				["**/*.yaml"],
				workspaceRoots,
			),
		).toBe(false);
	});
});

describe("ApertureVolarContext Pattern Filtering", () => {
	it("should have shouldProcessFile method", () => {
		const context = new ApertureVolarContext();
		expect(typeof context.shouldProcessFile).toBe("function");
	});

	it("should process files matching default patterns", () => {
		const context = new ApertureVolarContext();
		// Set workspace folders for pattern matching
		context.setWorkspaceFolders([URI.parse("file:///workspace")]);

		expect(
			context.shouldProcessFile("file:///workspace/api.yaml").shouldProcess,
		).toBe(true);
		expect(
			context.shouldProcessFile("file:///workspace/api.txt").shouldProcess,
		).toBe(false);
	});

	it("should reload config when workspace folders change", () => {
		const testDir = join(process.cwd(), ".test-config-reload");
		const telescopeDir = join(testDir, ".telescope");
		const configFile = join(telescopeDir, "config.yaml");

		// Setup
		if (!existsSync(testDir)) {
			mkdirSync(testDir, { recursive: true });
		}
		if (!existsSync(telescopeDir)) {
			mkdirSync(telescopeDir, { recursive: true });
		}

		const yamlContent = `openapi:
  patterns:
    - "src/**/*.yaml"
`;
		writeFileSync(configFile, yamlContent, "utf-8");

		const context = new ApertureVolarContext();
		context.setWorkspaceFolders([URI.file(testDir)]);

		// Test the OpenAPI pattern matching directly
		// Files in src/ directory should be identified as OpenAPI files
		expect(context.isOpenAPIFile(`file://${testDir}/src/api.yaml`)).toBe(true);
		// Files outside src/ should NOT be identified as OpenAPI files
		expect(context.isOpenAPIFile(`file://${testDir}/other/api.yaml`)).toBe(
			false,
		);

		// Cleanup
		if (existsSync(configFile)) {
			unlinkSync(configFile);
		}
		if (existsSync(telescopeDir)) {
			try {
				rmSync(telescopeDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}
		if (existsSync(testDir)) {
			try {
				rmSync(testDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}
	});
});

describe("Custom Rule Loading with test-files repo", () => {
	// Use the existing test-files package which has proper pnpm workspace setup
	// import.meta.dir is the directory containing this test file (tests/lsp/)
	// From there we need to go up to reach packages/test-files
	const testFilesRoot = join(import.meta.dir, "../../../../packages/test-files");

	it("should load custom OpenAPI rule from .telescope/rules/", async () => {
		const rule = await loadCustomOpenAPIRule(
			"example-custom-openapi-rule.ts",
			testFilesRoot,
		);
		expect(rule).not.toBeNull();
		expect(rule?.meta.id).toBe("custom-operation-summary");
		expect(rule?.meta.ruleType).toBe("openapi");
	});

	it("should load generic rule from .telescope/rules/", async () => {
		const rule = await loadGenericRule(
			"generic-rule",
			"example-generic-rule.ts",
			testFilesRoot,
		);
		expect(rule).not.toBeNull();
		expect(rule?.meta.id).toBe("custom-version-required");
		expect(rule?.meta.ruleType).toBe("generic");
	});

	it("should materialize custom OpenAPI rules from config", async () => {
		const config = resolveConfig(testFilesRoot);
		const rules = await materializeRules(config, testFilesRoot);
		const customRule = rules.find((r) => r.id === "custom-operation-summary");
		expect(customRule).toBeDefined();
		expect(customRule?.rule.meta.ruleType).toBe("openapi");
	});

	it("should materialize generic rules from config with patterns", async () => {
		const config = resolveConfig(testFilesRoot);
		const resolvedRules = await materializeGenericRules(config, testFilesRoot);
		const resolvedRule = resolvedRules.find(
			(r) => r.rule.meta.id === "custom-version-required",
		);
		expect(resolvedRule).toBeDefined();
		expect(resolvedRule?.rule.meta.ruleType).toBe("generic");
		// Verify patterns are included from config
		expect(resolvedRule?.patterns).toBeDefined();
		expect(resolvedRule?.patterns).toContain("custom/custom-generic-*.yaml");
		expect(resolvedRule?.label).toBe("generic-rule");
	});

	it("should filter generic rules by pattern in context", async () => {
		const context = new ApertureVolarContext();
		context.setWorkspaceFolders([URI.file(testFilesRoot)]);
		await context.rulesLoadPromise;

		// File matching the pattern should get the generic rule
		const matchingUri = `file://${testFilesRoot}/custom/custom-generic-valid.yaml`;
		const matchingRules = context.getGenericRulesForUri(matchingUri);
		expect(matchingRules.length).toBeGreaterThan(0);
		expect(
			matchingRules.some((r) => r.meta.id === "custom-version-required"),
		).toBe(true);

		// File NOT matching the pattern should NOT get the generic rule
		const nonMatchingUri = `file://${testFilesRoot}/openapi/api-v1.yaml`;
		const nonMatchingRules = context.getGenericRulesForUri(nonMatchingUri);
		expect(
			nonMatchingRules.some((r) => r.meta.id === "custom-version-required"),
		).toBe(false);
	});

	it("should handle missing rule files gracefully", async () => {
		const rule = await loadCustomOpenAPIRule(
			"nonexistent-rule.ts",
			testFilesRoot,
		);
		expect(rule).toBeNull();
	});

	it("should handle invalid rule files gracefully", async () => {
		// Test with a file that doesn't export a valid rule structure
		// We use an existing schema file which won't have the right structure
		const rule = await loadCustomOpenAPIRule(
			"../schemas/example-json-schema.json",
			testFilesRoot,
		);
		expect(rule).toBeNull();
	});
});

describe("Schema Loading", () => {
	const testDir = join(process.cwd(), ".test-schemas");
	const telescopeDir = join(testDir, ".telescope");
	const schemasDir = join(telescopeDir, "schemas");

	beforeEach(() => {
		if (!existsSync(testDir)) {
			mkdirSync(testDir, { recursive: true });
		}
		if (!existsSync(telescopeDir)) {
			mkdirSync(telescopeDir, { recursive: true });
		}
		if (!existsSync(schemasDir)) {
			mkdirSync(schemasDir, { recursive: true });
		}
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			try {
				rmSync(testDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
		}
	});

	it("should load JSON schema from .telescope/schemas/", async () => {
		const schemaFile = join(schemasDir, "test-schema.json");
		const schemaContent = JSON.stringify({
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string" },
			},
			required: ["name"],
		});
		writeFileSync(schemaFile, schemaContent, "utf-8");

		// Create config file with schema reference
		const configFile = join(telescopeDir, "config.yaml");
		const configContent = `additionalValidation:
  default:
    schemas:
      - schema: test-schema.json
        patterns:
          - "**/*.yaml"
`;
		writeFileSync(configFile, configContent, "utf-8");

		const context = new ApertureVolarContext();
		context.setWorkspaceFolders([URI.file(testDir)]);

		// Wait for async rule/schema loading
		await context.rulesLoadPromise;

		const rules = context.getValidationRules();
		const schemaRule = rules.find((r) => r.jsonSchema);
		expect(schemaRule).toBeDefined();
		expect(schemaRule?.patterns).toContain("**/*.yaml");
		expect(schemaRule?.jsonSchema).toBeDefined();
	});
});
