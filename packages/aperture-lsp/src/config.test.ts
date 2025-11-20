import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  type LintConfig,
  loadCustomOpenApiRule,
  loadGenericRule,
  matchesPattern,
  materializeGenericRules,
  materializeRules,
  resolveConfig,
} from "lens";
import { URI } from "vscode-uri";
import { ApertureVolarContext } from "./workspace/context.js";

describe("Config Loading", () => {
  const testDir = join(process.cwd(), ".test-config");
  const telescopeDir = join(testDir, ".telescope");
  const configFile1 = join(telescopeDir, "config.yaml");

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
    expect(config.ruleset).toEqual(["@telescope-openapi/default"]);
    expect(config.include).toEqual(["**/*.yaml", "**/*.yml", "**/*.json"]);
  });

  it("should load config from .telescope/config.yaml", () => {
    const yamlContent = `OpenAPI:
  base:
    - "@telescope-openapi/default"
  patterns:
    - "**/*.yaml"
    - "!**/node_modules/**"
`;
    writeFileSync(configFile1, yamlContent, "utf-8");

    const config = resolveConfig(testDir);
    expect(config.include).toEqual(["**/*.yaml"]);
    expect(config.exclude).toEqual(["**/node_modules/**"]);
  });

  it("should merge with defaults when config is partial", () => {
    const yamlContent = `OpenAPI:
  patterns:
    - "!**/test/**"
`;
    writeFileSync(configFile1, yamlContent, "utf-8");

    const config = resolveConfig(testDir);
    expect(config.exclude).toEqual(["**/test/**"]); // From config
    expect(config.include).toEqual(["**/*.yaml", "**/*.yml", "**/*.json"]); // From defaults
  });

  it("should handle invalid YAML gracefully", () => {
    const yamlContent = `invalid: yaml: content: [`;
    writeFileSync(configFile1, yamlContent, "utf-8");

    // Should not throw, should return defaults
    const config = resolveConfig(testDir);
    expect(config.ruleset).toEqual(["@telescope-openapi/default"]);
  });

  it("should return default config when workspaceRoot is undefined", () => {
    const config = resolveConfig(undefined);
    expect(config.include).toEqual(["**/*.yaml", "**/*.yml", "**/*.json"]);
  });
});

describe("Pattern Matching", () => {
  const workspaceRoots = ["/workspace"];

  it("should match files with include patterns", () => {
    expect(
      matchesPattern(
        "file:///workspace/api.yaml",
        ["**/*.yaml"],
        undefined,
        workspaceRoots
      )
    ).toBe(true);

    expect(
      matchesPattern(
        "file:///workspace/api.yaml",
        ["**/*.yml"],
        undefined,
        workspaceRoots
      )
    ).toBe(false);
  });

  it("should exclude files matching exclude patterns", () => {
    expect(
      matchesPattern(
        "file:///workspace/node_modules/test.yaml",
        ["**/*.yaml"],
        ["**/node_modules/**"],
        workspaceRoots
      )
    ).toBe(false);

    expect(
      matchesPattern(
        "file:///workspace/src/api.yaml",
        ["**/*.yaml"],
        ["**/node_modules/**"],
        workspaceRoots
      )
    ).toBe(true);
  });

  it("should use default include patterns when none specified", () => {
    expect(
      matchesPattern(
        "file:///workspace/api.yaml",
        undefined,
        undefined,
        workspaceRoots
      )
    ).toBe(true);

    expect(
      matchesPattern(
        "file:///workspace/api.txt",
        undefined,
        undefined,
        workspaceRoots
      )
    ).toBe(false);
  });

  it("should handle multiple include patterns", () => {
    expect(
      matchesPattern(
        "file:///workspace/api.yaml",
        ["**/*.yaml", "**/*.yml"],
        undefined,
        workspaceRoots
      )
    ).toBe(true);

    expect(
      matchesPattern(
        "file:///workspace/api.yml",
        ["**/*.yaml", "**/*.yml"],
        undefined,
        workspaceRoots
      )
    ).toBe(true);
  });

  it("should handle multiple exclude patterns", () => {
    expect(
      matchesPattern(
        "file:///workspace/test-api.yaml",
        ["**/*.yaml"],
        ["**/test-*.yaml", "**/node_modules/**"],
        workspaceRoots
      )
    ).toBe(false);

    expect(
      matchesPattern(
        "file:///workspace/api.yaml",
        ["**/*.yaml"],
        ["**/test-*.yaml", "**/node_modules/**"],
        workspaceRoots
      )
    ).toBe(true);
  });

  it("should handle file URIs correctly", () => {
    expect(
      matchesPattern(
        "file:///workspace/api.yaml",
        ["**/*.yaml"],
        undefined,
        workspaceRoots
      )
    ).toBe(true);
  });

  it("should handle relative paths from workspace root", () => {
    expect(
      matchesPattern(
        "file:///workspace/src/api.yaml",
        ["src/**/*.yaml"],
        undefined,
        workspaceRoots
      )
    ).toBe(true);

    expect(
      matchesPattern(
        "file:///workspace/other/api.yaml",
        ["src/**/*.yaml"],
        undefined,
        workspaceRoots
      )
    ).toBe(false);
  });

  it("should always exclude config files", () => {
    // Config files should be excluded regardless of include/exclude patterns
    expect(
      matchesPattern(
        "file:///workspace/.telescope/config.yaml",
        ["**/*.yaml"],
        undefined,
        workspaceRoots
      )
    ).toBe(false);

    expect(
      matchesPattern(
        "file:///workspace/subdir/.telescope/config.yaml",
        ["**/*.yaml"],
        undefined,
        workspaceRoots
      )
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

    expect(context.shouldProcessFile("file:///workspace/api.yaml")).toBe(true);
    expect(context.shouldProcessFile("file:///workspace/api.txt")).toBe(false);
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

    const yamlContent = `OpenAPI:
  patterns:
    - "!**/test/**"
`;
    writeFileSync(configFile, yamlContent, "utf-8");

    const context = new ApertureVolarContext();
    context.setWorkspaceFolders([URI.file(testDir)]);

    expect(context.shouldProcessFile(`file://${testDir}/test/api.yaml`)).toBe(
      false
    );
    expect(context.shouldProcessFile(`file://${testDir}/src/api.yaml`)).toBe(
      true
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

describe("Custom Rule Loading", () => {
  const testDir = join(process.cwd(), ".test-custom-rules");
  const telescopeDir = join(testDir, ".telescope");
  const rulesDir = join(telescopeDir, "rules");
  const schemasDir = join(telescopeDir, "schemas");

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    if (!existsSync(telescopeDir)) {
      mkdirSync(telescopeDir, { recursive: true });
    }
    if (!existsSync(rulesDir)) {
      mkdirSync(rulesDir, { recursive: true });
    }
    if (!existsSync(schemasDir)) {
      mkdirSync(schemasDir, { recursive: true });
    }
    // Create package.json and tsconfig.json files to enable module resolution for dynamic imports
    // Bun resolves modules relative to the imported file's directory, so we need
    // package.json files in both the test directory and the rules directory
    // Use absolute path to workspace lens package
    const workspaceRoot = process.cwd();
    const lensPath = join(workspaceRoot, "packages", "lens", "index.ts");
    const packageJson = {
      name: "test-custom-rules",
      version: "1.0.0",
      type: "module",
      dependencies: {
        lens: "workspace:*",
      },
    };
    const packageJsonPath = join(testDir, "package.json");
    writeFileSync(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2),
      "utf-8"
    );
    // Create tsconfig.json to help Bun resolve workspace packages
    const tsconfig = {
      extends: join(workspaceRoot, "tsconfig.base.json"),
      compilerOptions: {
        baseUrl: workspaceRoot,
        paths: {
          lens: [lensPath],
        },
      },
    };
    const tsconfigPath = join(testDir, "tsconfig.json");
    writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), "utf-8");
    // Also create package.json and tsconfig.json in .telescope/rules/ directory
    const rulesPackageJsonPath = join(rulesDir, "package.json");
    writeFileSync(
      rulesPackageJsonPath,
      JSON.stringify(packageJson, null, 2),
      "utf-8"
    );
    const rulesTsconfigPath = join(rulesDir, "tsconfig.json");
    writeFileSync(
      rulesTsconfigPath,
      JSON.stringify(tsconfig, null, 2),
      "utf-8"
    );
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

  it("should load custom OpenAPI rule from .telescope/rules/", async () => {
    const ruleFile = join(rulesDir, "test-rule.ts");
    // Use a simpler rule structure that can be loaded
    const ruleContent = `import { defineRule } from "lens";

export default defineRule({
  meta: {
    id: "test-openapi-rule",
    number: 999,
    docs: {
      description: "Test rule",
      recommended: false,
    },
    type: "problem",
    // ruleType is automatically set to "openapi" by defineRule
  },
  create(ctx) {
    return {
      Document(ref) {
        // Test rule
      }
    };
  }
});
`;
    writeFileSync(ruleFile, ruleContent, "utf-8");

    const rule = await loadCustomOpenApiRule("test-rule.ts", testDir);
    expect(rule).not.toBeNull();
    expect(rule?.meta.id).toBe("test-openapi-rule");
    expect(rule?.meta.ruleType).toBe("openapi");
  });

  it("should load custom OpenAPI rule from workspace root if not in .telescope/rules/", async () => {
    const ruleFile = join(testDir, "root-rule.ts");
    const ruleContent = `import { defineRule } from "lens";

export default defineRule({
  meta: {
    id: "root-openapi-rule",
    number: 999,
    docs: {
      description: "Test rule",
      recommended: false,
    },
    type: "problem",
    // ruleType is automatically set to "openapi" by defineRule
  },
  create(ctx) {
    return {
      Document(ref) {
        // Test rule
      }
    };
  }
});
`;
    writeFileSync(ruleFile, ruleContent, "utf-8");

    const rule = await loadCustomOpenApiRule("root-rule.ts", testDir);
    expect(rule).not.toBeNull();
    expect(rule?.meta.id).toBe("root-openapi-rule");
  });

  it("should load generic rule from .telescope/rules/", async () => {
    const ruleFile = join(rulesDir, "test-generic-rule.ts");
    // Generic rule doesn't need to import from engine - it can be a plain object
    const ruleContent = `export default {
  meta: {
    id: "test-generic-rule",
    docs: {
      description: "Test generic rule",
      recommended: false,
    },
    type: "problem",
    ruleType: "generic",
  },
  create(ctx) {
    return {
      Document(ref) {
        // Test rule
      }
    };
  }
};
`;
    writeFileSync(ruleFile, ruleContent, "utf-8");

    const rule = await loadGenericRule("test-generic-rule.ts", testDir);
    expect(rule).not.toBeNull();
    expect(rule?.meta.id).toBe("test-generic-rule");
    expect(rule?.meta.ruleType).toBe("generic");
  });

  it("should materialize custom OpenAPI rules from config", async () => {
    const ruleFile = join(rulesDir, "test-rule.ts");
    const ruleContent = `import { defineRule } from "lens";

export default defineRule({
  meta: {
    id: "test-openapi-rule",
    number: 999,
    docs: {
      description: "Test rule",
      recommended: false,
    },
    type: "problem",
    // ruleType is automatically set to "openapi" by defineRule
  },
  create(ctx) {
    return {
      Document(ref) {
        // Test rule
      }
    };
  }
});
`;
    writeFileSync(ruleFile, ruleContent, "utf-8");

    const config = {
      ruleset: [],
      customRules: [{ rule: "test-rule.ts", pattern: "**/*.yaml" }],
    } as LintConfig;

    const rules = await materializeRules(config, testDir);
    const customRule = rules.find((r) => r.id === "test-openapi-rule");
    expect(customRule).toBeDefined();
    expect(customRule?.rule.meta.ruleType).toBe("openapi");
  });

  it("should materialize generic rules from config", async () => {
    const ruleFile = join(rulesDir, "test-generic-rule.ts");
    // Generic rule doesn't need to import from engine - it can be a plain object
    const ruleContent = `export default {
  meta: {
    id: "test-generic-rule",
    docs: {
      description: "Test generic rule",
      recommended: false,
    },
    type: "problem",
    ruleType: "generic",
  },
  create(ctx) {
    return {
      Document(ref) {
        // Test rule
      }
    };
  }
};
`;
    writeFileSync(ruleFile, ruleContent, "utf-8");

    const config: LintConfig = {
      additionalValidation: {
        groups: {
          default: {
            rules: [{ rule: "test-generic-rule.ts", pattern: "**/*.yaml" }],
          },
        },
      },
    };

    const rules = await materializeGenericRules(config, testDir);
    expect(rules.length).toBe(1);
    expect(rules[0]?.meta.id).toBe("test-generic-rule");
    expect(rules[0]?.meta.ruleType).toBe("generic");
  });

  it("should handle missing rule files gracefully", async () => {
    const rule = await loadCustomOpenApiRule("nonexistent-rule.ts", testDir);
    expect(rule).toBeNull();
  });

  it("should handle invalid rule files gracefully", async () => {
    const ruleFile = join(rulesDir, "invalid-rule.ts");
    writeFileSync(ruleFile, "export const invalid = true;", "utf-8");

    const rule = await loadCustomOpenApiRule("invalid-rule.ts", testDir);
    expect(rule).toBeNull();
  });

  it("should load custom OpenAPI rule from .js file", async () => {
    const ruleFile = join(rulesDir, "test-rule.js");
    const ruleContent = `import { defineRule } from "lens";

export default defineRule({
  meta: {
    id: "test-openapi-rule-js",
    number: 999,
    docs: {
      description: "Test rule",
      recommended: false,
    },
    type: "problem",
  },
  create(ctx) {
    return {
      Document(ref) {
        // Test rule
      }
    };
  }
});
`;
    writeFileSync(ruleFile, ruleContent, "utf-8");

    const rule = await loadCustomOpenApiRule("test-rule.js", testDir);
    expect(rule).not.toBeNull();
    expect(rule?.meta.id).toBe("test-openapi-rule-js");
    expect(rule?.meta.ruleType).toBe("openapi");
  });

  it("should load generic rule from .js file", async () => {
    const ruleFile = join(rulesDir, "test-generic-rule.js");
    const ruleContent = `import { defineGenericRule } from "lens";

export default defineGenericRule({
  meta: {
    id: "test-generic-rule-js",
    docs: {
      description: "Test generic rule",
      recommended: false,
    },
    type: "problem",
  },
  create(ctx) {
    return {
      Document(ref) {
        // Test rule
      }
    };
  }
});
`;
    writeFileSync(ruleFile, ruleContent, "utf-8");

    const rule = await loadGenericRule("test-generic-rule.js", testDir);
    expect(rule).not.toBeNull();
    expect(rule?.meta.id).toBe("test-generic-rule-js");
    expect(rule?.meta.ruleType).toBe("generic");
  });

  it("should materialize custom OpenAPI rules from config with .js files", async () => {
    const ruleFile = join(rulesDir, "test-rule-js.js");
    const ruleContent = `import { defineRule } from "lens";

export default defineRule({
  meta: {
    id: "test-openapi-rule-js-config",
    number: 999,
    docs: {
      description: "Test rule",
      recommended: false,
    },
    type: "problem",
  },
  create(ctx) {
    return {
      Document(ref) {
        // Test rule
      }
    };
  }
});
`;
    writeFileSync(ruleFile, ruleContent, "utf-8");

    const config = {
      ruleset: [],
      customRules: [{ rule: "test-rule-js.js", pattern: "**/*.yaml" }],
    } as LintConfig;

    const rules = await materializeRules(config, testDir);
    const customRule = rules.find(
      (r) => r.id === "test-openapi-rule-js-config"
    );
    expect(customRule).toBeDefined();
    expect(customRule?.rule.meta.ruleType).toBe("openapi");
  });

  it("should materialize generic rules from config with .js files", async () => {
    const ruleFile = join(rulesDir, "test-generic-rule-js.js");
    const ruleContent = `import { defineGenericRule } from "lens";

export default defineGenericRule({
  meta: {
    id: "test-generic-rule-js-config",
    docs: {
      description: "Test generic rule",
      recommended: false,
    },
    type: "problem",
  },
  create(ctx) {
    return {
      Document(ref) {
        // Test rule
      }
    };
  }
});
`;
    writeFileSync(ruleFile, ruleContent, "utf-8");

    const config: LintConfig = {
      additionalValidation: {
        groups: {
          default: {
            rules: [{ rule: "test-generic-rule-js.js", pattern: "**/*.yaml" }],
          },
        },
      },
    };

    const rules = await materializeGenericRules(config, testDir);
    expect(rules.length).toBe(1);
    expect(rules[0]?.meta.id).toBe("test-generic-rule-js-config");
    expect(rules[0]?.meta.ruleType).toBe("generic");
  });

  it("should work with both .ts and .js files in the same config", async () => {
    const tsRuleFile = join(rulesDir, "mixed-ts-rule.ts");
    const jsRuleFile = join(rulesDir, "mixed-js-rule.js");

    const tsRuleContent = `import { defineRule } from "lens";

export default defineRule({
  meta: {
    id: "mixed-ts-rule",
    number: 999,
    docs: {
      description: "Test TS rule",
      recommended: false,
    },
    type: "problem",
  },
  create(ctx) {
    return {
      Document(ref) {
        // Test rule
      }
    };
  }
});
`;

    const jsRuleContent = `import { defineRule } from "lens";

export default defineRule({
  meta: {
    id: "mixed-js-rule",
    number: 999,
    docs: {
      description: "Test JS rule",
      recommended: false,
    },
    type: "problem",
  },
  create(ctx) {
    return {
      Document(ref) {
        // Test rule
      }
    };
  }
});
`;

    writeFileSync(tsRuleFile, tsRuleContent, "utf-8");
    writeFileSync(jsRuleFile, jsRuleContent, "utf-8");

    const config = {
      ruleset: [],
      customRules: [
        { rule: "mixed-ts-rule.ts", pattern: "**/*.yaml" },
        { rule: "mixed-js-rule.js", pattern: "**/*.yaml" },
      ],
    } as LintConfig;

    const rules = await materializeRules(config, testDir);
    expect(rules.length).toBeGreaterThanOrEqual(2);
    const tsRule = rules.find((r) => r.id === "mixed-ts-rule");
    const jsRule = rules.find((r) => r.id === "mixed-js-rule");
    expect(tsRule).toBeDefined();
    expect(jsRule).toBeDefined();
    expect(tsRule?.rule.meta.ruleType).toBe("openapi");
    expect(jsRule?.rule.meta.ruleType).toBe("openapi");
  });
});

describe("Preset Extension", () => {
  const testDir = join(process.cwd(), ".test-preset-extension");

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
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

  it("should apply default preset rules", async () => {
    const config = {
      ruleset: ["@telescope-openapi/default"],
    };

    const rules = await materializeRules(config, testDir);
    const ruleIds = rules.map((r) => r.id).sort();

    // Should include general rules but not SailPoint-specific ones
    expect(ruleIds).toContain("root-info");
    expect(ruleIds).toContain("operation-summary");
    expect(ruleIds).not.toContain("root-sailpoint-api");
    expect(ruleIds).not.toContain("operation-user-levels");
  });

  it("should apply sailpoint preset with extension", async () => {
    const config = {
      ruleset: ["@telescope-openapi/sailpoint"],
    };

    const rules = await materializeRules(config, testDir);
    const ruleIds = rules.map((r) => r.id).sort();

    // Should include default rules AND SailPoint-specific rules
    expect(ruleIds).toContain("root-info");
    expect(ruleIds).toContain("operation-summary");
    expect(ruleIds).toContain("root-sailpoint-api");
    expect(ruleIds).toContain("operation-user-levels");
  });

  it("should maintain backward compatibility with recommended31", async () => {
    const config = {
      ruleset: ["@telescope-openapi/recommended-3.1"],
    };

    const rules = await materializeRules(config, testDir);
    const ruleIds = rules.map((r) => r.id).sort();

    // Should include all rules (same as sailpoint preset)
    expect(ruleIds).toContain("root-info");
    expect(ruleIds).toContain("operation-summary");
    expect(ruleIds).toContain("root-sailpoint-api");
    expect(ruleIds).toContain("operation-user-levels");
  });

  it("should handle preset extension cycles gracefully", async () => {
    // This test ensures we don't get infinite loops
    const config = {
      ruleset: ["@telescope-openapi/default"],
    };

    // Should not throw or hang
    const rules = await materializeRules(config, testDir);
    expect(rules.length).toBeGreaterThan(0);
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
    const configContent = `AdditionalValidation:
  default:
    schemas:
      - schema: test-schema.json
        pattern: "**/*.yaml"
`;
    writeFileSync(configFile, configContent, "utf-8");

    const context = new ApertureVolarContext();
    context.setWorkspaceFolders([URI.file(testDir)]);

    // Wait for async rule/schema loading
    await new Promise((resolve) => setTimeout(resolve, 200));

    const schemas = context.getJsonSchemas();
    expect(schemas.length).toBe(1);
    expect(schemas[0]?.schemaPattern).toBe("**/*.yaml");
    expect(schemas[0]?.schema).toBeDefined();
    expect((schemas[0]?.schema as any)?.properties?.name).toBeDefined();
  });

  it("should load JSON schema from workspace root if not in .telescope/schemas/", async () => {
    const schemaFile = join(testDir, "root-schema.json");
    const schemaContent = JSON.stringify({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        version: { type: "string" },
      },
    });
    writeFileSync(schemaFile, schemaContent, "utf-8");

    // Create config file with schema reference
    const configFile = join(telescopeDir, "config.yaml");
    const configContent = `AdditionalValidation:
  default:
    schemas:
      - schema: root-schema.json
        pattern: "**/*.json"
`;
    writeFileSync(configFile, configContent, "utf-8");

    const context = new ApertureVolarContext();
    context.setWorkspaceFolders([URI.file(testDir)]);

    // Wait for async rule/schema loading
    await new Promise((resolve) => setTimeout(resolve, 200));

    const schemas = context.getJsonSchemas();
    expect(schemas.length).toBe(1);
    expect(schemas[0]?.schemaPattern).toBe("**/*.json");
    expect(schemas[0]?.schema).toBeDefined();
    expect((schemas[0]?.schema as any)?.properties?.version).toBeDefined();
  });
});
