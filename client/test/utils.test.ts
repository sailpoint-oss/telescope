import { describe, expect, it } from "bun:test";
import { matchesPatternList } from "../src/utils";

describe("matchesPatternList", () => {
	const workspaceRoot = "/workspace";
	const patterns = ["**/*.yaml", "**/*.yml", "**/*.json"];

	it("excludes legacy root config files", () => {
		expect(
			matchesPatternList(
				"/workspace/.telescope.yaml",
				patterns,
				workspaceRoot,
			),
		).toBe(false);
		expect(
			matchesPatternList(
				"/workspace/.telescope.yml",
				patterns,
				workspaceRoot,
			),
		).toBe(false);
	});

	it("excludes nested config directory files", () => {
		expect(
			matchesPatternList(
				"/workspace/.telescope/config.yaml",
				patterns,
				workspaceRoot,
			),
		).toBe(false);
		expect(
			matchesPatternList(
				"/workspace/.telescope/config.yml",
				patterns,
				workspaceRoot,
			),
		).toBe(false);
	});

	it("still matches regular OpenAPI candidate files", () => {
		expect(
			matchesPatternList(
				"/workspace/apis/openapi.yaml",
				patterns,
				workspaceRoot,
			),
		).toBe(true);
	});

	it("with empty patterns matches yaml, yml, json, and jsonc extensions only", () => {
		const root = "/workspace";
		expect(matchesPatternList(`${root}/api/a.yaml`, [], root)).toBe(true);
		expect(matchesPatternList(`${root}/api/a.yml`, [], root)).toBe(true);
		expect(matchesPatternList(`${root}/api/a.json`, [], root)).toBe(true);
		expect(matchesPatternList(`${root}/api/a.jsonc`, [], root)).toBe(true);
		expect(matchesPatternList(`${root}/api/a.md`, [], root)).toBe(false);
	});

});
