import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProject,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../../test-utils.js";
import componentExampleNameCapital from "./example-name-capital.js";

type Position = { line: number; character: number };
type Range = { start: Position; end: Position };

function buildLineOffsets(text: string): number[] {
	const offsets: number[] = [0];
	let idx = text.indexOf("\n", 0);
	while (idx !== -1) {
		offsets.push(idx + 1);
		idx = text.indexOf("\n", idx + 1);
	}
	return offsets;
}

function positionToOffset(
	lineOffsets: number[],
	pos: { line: number; character: number },
): number {
	return (lineOffsets[pos.line] ?? 0) + pos.character;
}

function sliceRange(text: string, range: Range): string {
	const lineOffsets = buildLineOffsets(text);
	const start = positionToOffset(lineOffsets, range.start);
	const end = positionToOffset(lineOffsets, range.end);
	return text.slice(start, end);
}

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

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"component-example-name-capital",
		);
		expect(diagnostics.length).toBeGreaterThan(0);
		const diag = diagnostics[0];
		if (diag) {
			const text = project.docs.get(getFirstUri(project))?.rawText ?? "";
			// Should highlight the component key ("petExample"), not the example value body.
			expect(sliceRange(text, diag.range).replaceAll('"', "")).toBe(
				"petExample",
			);
		}

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
