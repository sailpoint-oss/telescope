import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProject,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../test-utils";
import componentExampleNameCapital from "./example-name-capital";

describe("component-example-name-capital", () => {
	it("should error when example name does not start with capital letter", async () => {
		const project = await createTestProject(
			JSON.stringify({
				openapi: "3.1.0",
				info: { title: "Test", version: "1.0.0" },
				components: {
					examples: {
						petExample: {
							summary: "A pet example",
							value: { name: "Fluffy" },
						},
					},
				},
			}),
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [componentExampleNameCapital],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"component-example-name-capital",
				"must start with a capital letter",
			),
		).toBe(true);
	});

	it("should pass when example name starts with capital letter", async () => {
		const project = await createTestProject(
			JSON.stringify({
				openapi: "3.1.0",
				info: { title: "Test", version: "1.0.0" },
				components: {
					examples: {
						PetExample: {
							summary: "A pet example",
							value: { name: "Fluffy" },
						},
					},
				},
			}),
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [componentExampleNameCapital],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"component-example-name-capital",
		);
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when inline examples have lowercase names", async () => {
		const project = await createTestProject(
			JSON.stringify({
				openapi: "3.1.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {
					"/pets": {
						get: {
							responses: {
								"200": {
									content: {
										"application/json": {
											examples: {
												petExample: {
													summary: "A pet",
													value: { name: "Fluffy" },
												},
											},
										},
									},
								},
							},
						},
					},
				},
				components: {
					examples: {
						PetExample: {
							summary: "A pet example",
							value: { name: "Fluffy" },
						},
					},
				},
			}),
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [componentExampleNameCapital],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"component-example-name-capital",
		);
		expect(diagnostics.length).toBe(0);
	});
});
