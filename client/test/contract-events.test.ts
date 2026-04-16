import { describe, expect, test } from "bun:test";
import { summarizeContractPayload } from "../src/contract-events";

describe("summarizeContractPayload", () => {
	test("aggregates OpenAPI and Arazzo totals", () => {
		const summary = summarizeContractPayload({
			runId: "run-1",
			baseUrl: "http://localhost:8080",
			result: {
				pass: false,
				openapi: {
					passed: 2,
					total: 3,
					results: [{ operationId: "listPets" }],
				},
				arazzo: {
					passed: 1,
					total: 2,
					workflows: [{ workflowId: "smoke" }],
				},
			},
			wiretapFindings: [{ message: "bad request body" }],
		});

		expect(summary.runId).toBe("run-1");
		expect(summary.baseUrl).toBe("http://localhost:8080");
		expect(summary.pass).toBe(false);
		expect(summary.passed).toBe(3);
		expect(summary.total).toBe(5);
		expect(summary.operationCount).toBe(1);
		expect(summary.workflowCount).toBe(1);
		expect(summary.hasWiretapFindings).toBe(true);
	});

	test("treats missing results without errors as passing", () => {
		const summary = summarizeContractPayload({});
		expect(summary.pass).toBe(true);
		expect(summary.passed).toBe(0);
		expect(summary.total).toBe(0);
	});
});
