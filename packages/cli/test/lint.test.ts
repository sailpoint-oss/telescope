import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { lint } from "../src/index";

const EXAMPLES_DIR = resolve(__dirname, "../../test-files");

describe("CLI lint", () => {
	it("reports no diagnostics for a valid OpenAPI document", async () => {
		const file = resolve(EXAMPLES_DIR, "openapi-3.1.yaml");
		const result = await lint([file]);
		const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));
		expect(ruleIds.has("path-params-match")).toBeFalse();
		expect(ruleIds.has("operationid-unique")).toBeFalse();
	});

	it("flags missing path parameters", async () => {
		const file = resolve(EXAMPLES_DIR, "missing-path-parameters.yaml");
		const result = await lint([file]);
		const mismatch = result.diagnostics.filter(
			(d) => d.ruleId === "path-params-match",
		);
		expect(mismatch.length).toBeGreaterThan(0);
	});
});
