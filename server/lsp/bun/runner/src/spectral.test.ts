import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
	clearSpectralCache,
	runSpectralRulesets,
	spectralCacheSize,
} from "./spectral";

const tempDirs: string[] = [];

afterEach(() => {
	clearSpectralCache();
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function makeRulesetDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "telescope-spectral-"));
	tempDirs.push(dir);
	return dir;
}

describe("runSpectralRulesets", () => {
	test("uses cached custom rulesets until the cache is cleared", async () => {
		const rawText = `openapi: 3.1.0
info:
  title: Example
  version: 1.0.0
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: ok
`;
		expect(spectralCacheSize()).toBe(0);

		const first = await runSpectralRulesets(
			"file:///api.yaml",
			rawText,
			"yaml",
			["spectral:oas"],
		);
		expect(first.errors).toHaveLength(0);
		expect(first.diagnostics.length).toBeGreaterThan(0);
		expect(spectralCacheSize()).toBe(1);

		const cached = await runSpectralRulesets(
			"file:///api.yaml",
			rawText,
			"yaml",
			["spectral:oas"],
		);
		expect(cached.errors).toHaveLength(0);
		expect(cached.diagnostics.length).toBeGreaterThan(0);
		expect(spectralCacheSize()).toBe(1);

		await runSpectralRulesets(
			"file:///asyncapi.yaml",
			"asyncapi: 2.6.0\ninfo:\n  title: Example\n  version: 1.0.0\nchannels: {}\n",
			"yaml",
			["spectral:asyncapi"],
		);
		expect(spectralCacheSize()).toBe(2);

		clearSpectralCache();
		expect(spectralCacheSize()).toBe(0);
	});

	test("reports ruleset loading errors and keeps timings", async () => {
		const dir = makeRulesetDir();
		const rulesetPath = join(dir, "broken.json");
		writeFileSync(rulesetPath, "{not-json");

		const result = await runSpectralRulesets(
			"file:///api.yaml",
			`{"openapi":"3.1.0","info":{"title":"Example","version":"1.0.0"},"paths":{}}`,
			"json",
			[rulesetPath],
		);

		expect(result.diagnostics).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].ruleID).toBe(rulesetPath);
		expect(result.errors[0].phase).toBe("run");
		expect(result.rulesetTimings[rulesetPath]).toBeGreaterThanOrEqual(0);
	});
});
