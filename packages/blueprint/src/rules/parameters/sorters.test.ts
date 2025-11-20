import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
  createTestProjectFromComprehensiveDocument,
  findDiagnostics,
  getFirstUri,
  hasDiagnostic,
} from "../test-utils";
import parameterSorters from "./sorters";

describe("parameter-sorters", () => {
  it("should error when sorters parameter lacks description", async () => {
    const project = await createTestProjectFromComprehensiveDocument(
      "test-errors.yaml",
      "/test/parameter-sorters-missing-description"
    );

    const result = runEngine(project, [getFirstUri(project)], {
      rules: [parameterSorters],
    });

    expect(
      hasDiagnostic(
        result.diagnostics,
        "parameter-sorters",
        "standard collection parameter"
      )
    ).toBe(true);
  });

  it("should error when sorters description lacks required link", async () => {
    const project = await createTestProjectFromComprehensiveDocument(
      "test-errors.yaml",
      "/test/parameter-sorters-description-lacks-link"
    );

    const result = runEngine(project, [getFirstUri(project)], {
      rules: [parameterSorters],
    });

    expect(
      hasDiagnostic(
        result.diagnostics,
        "parameter-sorters",
        "description must reference"
      )
    ).toBe(true);
  });

  it("should pass when sorters has proper description", async () => {
    const project = await createTestProjectFromComprehensiveDocument(
      "test-valid.yaml",
      "/test/parameter-sorters-valid"
    );

    const result = runEngine(project, [getFirstUri(project)], {
      rules: [parameterSorters],
    });

    const diagnostics = findDiagnostics(
      result.diagnostics,
      "parameter-sorters"
    );
    expect(diagnostics.length).toBe(0);
  });
});
