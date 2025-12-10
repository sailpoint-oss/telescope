import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import numericFormat from "./numeric-format.js";

describe("numeric-format", () => {
	it("should error when integer lacks format", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Data:
      type: object
      properties:
        count:
          type: integer
          description: A count value
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [numericFormat],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "numeric-format");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("int32 or int64");
	});

	it("should error when number lacks format", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Data:
      type: object
      properties:
        price:
          type: number
          description: A price value
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [numericFormat],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "numeric-format");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("float or double");
	});

	it("should pass when integer has int32 format", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Data:
      type: object
      properties:
        count:
          type: integer
          format: int32
          description: A count value
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [numericFormat],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "numeric-format");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when integer has int64 format", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Data:
      type: object
      properties:
        bigId:
          type: integer
          format: int64
          description: A large ID
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [numericFormat],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "numeric-format");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when number has float format", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Data:
      type: object
      properties:
        rating:
          type: number
          format: float
          description: A rating value
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [numericFormat],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "numeric-format");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when number has double format", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Data:
      type: object
      properties:
        precise:
          type: number
          format: double
          description: A precise value
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [numericFormat],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "numeric-format");
		expect(diagnostics.length).toBe(0);
	});

	it("should error when integer has invalid format", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Data:
      type: object
      properties:
        count:
          type: integer
          format: int16
          description: A count value
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [numericFormat],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "numeric-format");
		expect(diagnostics.length).toBe(1);
	});
});


