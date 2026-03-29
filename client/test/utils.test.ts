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
});
