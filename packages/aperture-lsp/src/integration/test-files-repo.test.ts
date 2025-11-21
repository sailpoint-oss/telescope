import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	runEngineIR,
	runGenericRules,
	type IRProjectContext,
} from "lens";
import { URI } from "vscode-uri";
import YAML from "yaml";
import { ApertureVolarContext } from "../workspace/context.js";

describe("Test Files Integration", () => {
	const testFilesRoot = join(process.cwd(), "packages/test-files");
	let context: ApertureVolarContext;

	beforeEach(async () => {
		context = new ApertureVolarContext();
		context.setWorkspaceFolders([URI.file(testFilesRoot)]);
		// Wait for rules to load
		await context.rulesLoadPromise;
	});

	it("should load configuration correctly", () => {
		const config = context.getConfig();
		expect(config.openapi).toBeDefined();
		expect(config.openapi?.patterns).toContain("**/*.yaml");
		expect(config.additionalValidation?.groups).toBeDefined();
		expect(config.additionalValidation?.groups["zod-schema-validation"]).toBeDefined();
	});

	it("should load custom OpenAPI rules", () => {
		const rules = context.getResolvedRules();
		// The rule ID is generated or taken from meta.
		// The custom rule file is example-custom-openapi-rule.ts
        // ID in file: example-custom-openapi-rule
        // Check if we have any custom rule loaded.
		const hasCustomRules = rules.some(r => r.id.includes("custom"));
		expect(rules.length).toBeGreaterThan(0);
	});

	it("should load validation rules (Schemas)", () => {
		const validationRules = context.getValidationRules();
		expect(validationRules.length).toBeGreaterThan(0);
		
		const zodRule = validationRules.find(r => r.label === "zod-schema-validation");
		expect(zodRule).toBeDefined();
		expect(zodRule?.patterns).toContain("**/custom-zod-schema-*.yaml");
		expect(zodRule?.zodSchema).toBeDefined();

		const jsonRule = validationRules.find(r => r.label === "json-schema-validation");
		expect(jsonRule).toBeDefined();
		expect(jsonRule?.jsonSchema).toBeDefined();
	});

	it("should load generic rules", () => {
		const genericRules = context.getGenericRules();
		expect(genericRules.length).toBeGreaterThan(0);
		const customGeneric = genericRules.find(r => r.meta.id === "custom-version-required");
		expect(customGeneric).toBeDefined();
	});

    // Functional Test: OpenAPI Custom Rule
    it("should validate OpenAPI files with custom rule", () => {
        const validFile = join(testFilesRoot, "custom-openapi-valid.yaml");
        const invalidFile = join(testFilesRoot, "custom-openapi-invalid.yaml");
        const validUri = URI.file(validFile).toString();
        const invalidUri = URI.file(invalidFile).toString();

        // Load content
        const validContent = readFileSync(validFile, "utf-8");
        const invalidContent = readFileSync(invalidFile, "utf-8");

        // Update Core
        context.core.updateDocument(validUri, validContent, "yaml", 1);
        context.core.updateDocument(invalidUri, invalidContent, "yaml", 1);

        const irProject: IRProjectContext = {
            docs: new Map(),
            atoms: new Map(),
            graph: context.core.getGraphIndex(),
            core: {
                locToRange: (u, l) => context.core.locToRange(u, l),
                getLinkedUris: (u) => context.core.getLinkedUris(u)
            }
        };
        // Populate IR maps
        const validIr = context.core.getIR(validUri);
        const validAtoms = context.core.getAtoms(validUri);
        if (validIr && validAtoms) {
            irProject.docs.set(validUri, validIr);
            irProject.atoms.set(validUri, validAtoms);
        }

        const invalidIr = context.core.getIR(invalidUri);
        const invalidAtoms = context.core.getAtoms(invalidUri);
        if (invalidIr && invalidAtoms) {
            irProject.docs.set(invalidUri, invalidIr);
            irProject.atoms.set(invalidUri, invalidAtoms);
        }

        const rules = context.getRuleImplementations();
        
        const validResult = runEngineIR(irProject, [validUri], { rules });
        // custom-openapi-valid.yaml should pass the custom rule check
        const customRuleId = "rule-999-custom-operation-summary"; // Format: rule-<number>-<id>
        const validCustomDiags = validResult.diagnostics.filter(d => d.ruleId === customRuleId);
        expect(validCustomDiags.length).toBe(0);
        
        const invalidResult = runEngineIR(irProject, [invalidUri], { rules });
        
        const invalidCustomDiags = invalidResult.diagnostics.filter(d => d.ruleId === customRuleId);
        // We expect at least one error from our custom rule
        expect(invalidCustomDiags.length).toBeGreaterThan(0);
    });

    // Functional Test: Generic Rule
    it("should validate files with generic rule", async () => {
        const validFile = join(testFilesRoot, "custom-generic-valid.yaml");
        const invalidFile = join(testFilesRoot, "custom-generic-invalid.yaml");
        const validUri = URI.file(validFile).toString();
        const invalidUri = URI.file(invalidFile).toString();
        
        const validContent = readFileSync(validFile, "utf-8");
        const invalidContent = readFileSync(invalidFile, "utf-8");

        const genericRules = context.getGenericRules();
        expect(genericRules.length).toBeGreaterThan(0);

        const validAst = YAML.parse(validContent);
        const invalidAst = YAML.parse(invalidContent);

        const validResult = await runGenericRules(
            validUri,
            validAst,
            validContent,
            { rules: genericRules }
        );
        expect(validResult.diagnostics.length).toBe(0);

        const invalidResult = await runGenericRules(
            invalidUri,
            invalidAst,
            invalidContent,
            { rules: genericRules }
        );
        expect(invalidResult.diagnostics.length).toBeGreaterThan(0);
        expect(invalidResult.diagnostics[0].ruleId).toBe("custom-version-required");
    });
});
