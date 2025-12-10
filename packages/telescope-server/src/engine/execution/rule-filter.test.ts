import { describe, expect, it } from "bun:test";
import type { ProjectContext, Rule } from "../rules/types.js";
import { filterRulesByContext } from "./rule-filter.js";

describe("rule-filter", () => {
	// Mock rule helper
	const createMockRule = (id: string): Rule => ({
		meta: {
			id,
			number: 100,
			type: "problem",
			description: "Test rule",
			ruleType: "openapi",
		},
		check: () => ({}),
	});

	// Mock context - minimal structure needed
	const mockContext = {
		docs: new Map(),
		index: {
			version: "3.1.0",
			pathsByString: new Map(),
			pathItemsToPaths: new Map(),
			operationsByOwner: new Map(),
			components: {},
			schemas: new Map(),
			parameters: new Map(),
			responses: new Map(),
			requestBodies: new Map(),
			headers: new Map(),
			mediaTypes: new Map(),
			securityRequirements: new Map(),
			examples: new Map(),
			links: new Map(),
			callbacks: new Map(),
			references: new Map(),
			documents: new Map(),
		},
		graph: {
			edges: [],
			add: () => {},
			get: () => [],
			hasNode: () => false,
			hasCycle: () => false,
		},
		resolver: {
			deref: () => undefined,
			tryDeref: () => undefined,
			originOf: () => undefined,
		},
		rootResolver: () => undefined,
		version: "3.1.0",
	} as unknown as ProjectContext;

	it("should return all rules unchanged", () => {
		const rules = [
			createMockRule("rule-1"),
			createMockRule("rule-2"),
			createMockRule("rule-3"),
		];

		const result = filterRulesByContext(rules, mockContext);

		expect(result).toHaveLength(3);
		expect(result[0]?.meta.id).toBe("rule-1");
		expect(result[1]?.meta.id).toBe("rule-2");
		expect(result[2]?.meta.id).toBe("rule-3");
	});

	it("should return empty array for empty rules", () => {
		const result = filterRulesByContext([], mockContext);
		expect(result).toHaveLength(0);
	});

	it("should preserve rule order", () => {
		const rules = [
			createMockRule("z-rule"),
			createMockRule("a-rule"),
			createMockRule("m-rule"),
		];

		const result = filterRulesByContext(rules, mockContext);

		expect(result[0]?.meta.id).toBe("z-rule");
		expect(result[1]?.meta.id).toBe("a-rule");
		expect(result[2]?.meta.id).toBe("m-rule");
	});
});

