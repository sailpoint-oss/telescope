/**
 * Unit tests for pure helpers in src/utils.ts (no VS Code runtime).
 */
import { describe, expect, it } from "bun:test";
import {
	extractJSONTopLevelKeys,
	extractYAMLTopLevelKeys,
	getOpenAPILanguageId,
	matchesPatternList,
} from "../src/utils";

describe("matchesPatternList", () => {
	const root = "/workspace";

	it("excludes Telescope config paths from default YAML matching", () => {
		expect(
			matchesPatternList(`${root}/svc/.telescope.yaml`, ["**/*.yaml"], root),
		).toBe(false);
		expect(
			matchesPatternList(`${root}/svc/.telescope.yml`, ["**/*.yml"], root),
		).toBe(false);
		expect(
			matchesPatternList(`${root}/.telescope/config.yaml`, ["**/*.yaml"], root),
		).toBe(false);
	});

	it("includes normal OpenAPI paths", () => {
		expect(
			matchesPatternList(`${root}/api/openapi.yaml`, ["**/*.yaml"], root),
		).toBe(true);
	});

	it("applies negated patterns", () => {
		expect(
			matchesPatternList(
				`${root}/pkg/ignore.yaml`,
				["**/*.yaml", "!**/ignore.yaml"],
				root,
			),
		).toBe(false);
	});
});

describe("getOpenAPILanguageId", () => {
	it("maps json to openapi-json", () => {
		expect(getOpenAPILanguageId("/x/spec.JSON")).toBe("openapi-json");
	});
	it("defaults to openapi-yaml", () => {
		expect(getOpenAPILanguageId("/x/spec.yaml")).toBe("openapi-yaml");
	});
});

describe("extractYAMLTopLevelKeys", () => {
	it("reads root keys", () => {
		const keys = extractYAMLTopLevelKeys("openapi: 3.0.0\ninfo:\n  title: A\npaths: {}");
		expect(keys.has("openapi")).toBe(true);
		expect(keys.has("info")).toBe(true);
		expect(keys.has("paths")).toBe(true);
	});
});

describe("extractJSONTopLevelKeys", () => {
	it("reads object keys from JSON", () => {
		const keys = extractJSONTopLevelKeys('{"openapi":"3.0.0","paths":{}}');
		expect(keys.has("openapi")).toBe(true);
		expect(keys.has("paths")).toBe(true);
	});
});
