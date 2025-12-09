import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProject,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../../test-utils.js";
import componentSchemaNameCapital from "./schema-name-capital";

describe("component-schema-name-capital", () => {
	it("should error when schema name does not start with capital letter", async () => {
		const project = await createTestProject(
			JSON.stringify({
				openapi: "3.1.0",
				info: { title: "Test", version: "1.0.0" },
				components: {
					schemas: {
						pet: {
							type: "object",
							properties: {
								name: { type: "string" },
							},
						},
					},
				},
			}),
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [componentSchemaNameCapital],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"component-schema-name-capital",
				"must start with a capital letter",
			),
		).toBe(true);
	});

	it("should pass when schema name starts with capital letter", async () => {
		const project = await createTestProject(
			JSON.stringify({
				openapi: "3.1.0",
				info: { title: "Test", version: "1.0.0" },
				components: {
					schemas: {
						Pet: {
							type: "object",
							properties: {
								name: { type: "string" },
							},
						},
					},
				},
			}),
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [componentSchemaNameCapital],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"component-schema-name-capital",
		);
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when non-schema components have lowercase names", async () => {
		const project = await createTestProject(
			JSON.stringify({
				openapi: "3.1.0",
				info: { title: "Test", version: "1.0.0" },
				components: {
					parameters: {
						petId: {
							name: "petId",
							in: "path",
							schema: { type: "string" },
						},
					},
					schemas: {
						Pet: {
							type: "object",
							properties: {
								name: { type: "string" },
							},
						},
					},
				},
			}),
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [componentSchemaNameCapital],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"component-schema-name-capital",
		);
		expect(diagnostics.length).toBe(0);
	});
});
