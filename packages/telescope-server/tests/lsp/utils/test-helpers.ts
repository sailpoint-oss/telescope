/**
 * Test Helpers for LSP Testing
 *
 * Shared utilities for creating test fixtures and asserting on diagnostics.
 *
 * @module tests/lsp/utils/test-helpers
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Diagnostic } from "vscode-languageserver-protocol";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";

/**
 * Create a TextDocument from YAML text for testing.
 *
 * @param yaml - The YAML content
 * @param uri - Optional URI for the document
 * @returns A TextDocument instance
 */
export function createDocumentFromYAML(
	yaml: string,
	uri = "file:///test.yaml",
): TextDocument {
	return TextDocument.create(uri, "yaml", 1, yaml);
}

/**
 * Create a TextDocument from JSON text for testing.
 *
 * @param json - The JSON content
 * @param uri - Optional URI for the document
 * @returns A TextDocument instance
 */
export function createDocumentFromJSON(
	json: string,
	uri = "file:///test.json",
): TextDocument {
	return TextDocument.create(uri, "json", 1, json);
}

/**
 * Create a mock diagnostic for testing.
 *
 * @param line - The line number (0-indexed)
 * @param character - The character position (0-indexed)
 * @param message - The diagnostic message
 * @param severity - Optional severity (defaults to Error)
 * @returns A Diagnostic object
 */
export function createDiagnostic(
	line: number,
	character: number,
	message: string,
	severity: DiagnosticSeverity = DiagnosticSeverity.Error,
): Diagnostic {
	return {
		range: {
			start: { line, character },
			end: { line, character: character + 10 },
		},
		message,
		severity,
		source: "test",
	};
}

/**
 * Find a diagnostic that mentions a specific path in its message.
 *
 * @param diagnostics - Array of diagnostics to search
 * @param pathSegments - Path segments to search for (e.g., ["info", "title"])
 * @returns The matching diagnostic, or undefined
 */
export function findDiagnosticByPath(
	diagnostics: Diagnostic[],
	pathSegments: string[],
): Diagnostic | undefined {
	const pathString = pathSegments.join(".");
	return diagnostics.find(
		(d) =>
			d.message.includes(pathString) ||
			pathSegments.every((segment) => d.message.includes(segment)),
	);
}

/**
 * Find a diagnostic on a specific line.
 *
 * @param diagnostics - Array of diagnostics to search
 * @param line - The line number (0-indexed)
 * @returns The matching diagnostic, or undefined
 */
export function findDiagnosticOnLine(
	diagnostics: Diagnostic[],
	line: number,
): Diagnostic | undefined {
	return diagnostics.find((d) => d.range.start.line === line);
}

/**
 * Assert that a diagnostic exists at a specific path.
 * Throws if no matching diagnostic is found.
 *
 * @param diagnostics - Array of diagnostics to check
 * @param pathSegments - Path segments to search for
 * @throws Error if no matching diagnostic is found
 */
export function expectDiagnosticAtPath(
	diagnostics: Diagnostic[],
	pathSegments: string[],
): void {
	const diagnostic = findDiagnosticByPath(diagnostics, pathSegments);
	if (!diagnostic) {
		const pathString = pathSegments.join(".");
		const messages = diagnostics.map((d) => d.message).join("\n  - ");
		throw new Error(
			`Expected diagnostic at path "${pathString}" but none found.\nDiagnostics:\n  - ${messages || "(none)"}`,
		);
	}
}

/**
 * Assert that a diagnostic exists on a specific line.
 * Throws if no matching diagnostic is found.
 *
 * @param diagnostics - Array of diagnostics to check
 * @param line - The line number (0-indexed)
 * @throws Error if no matching diagnostic is found
 */
export function expectDiagnosticOnLine(
	diagnostics: Diagnostic[],
	line: number,
): void {
	const diagnostic = findDiagnosticOnLine(diagnostics, line);
	if (!diagnostic) {
		const lines = diagnostics.map((d) => d.range.start.line).join(", ");
		throw new Error(
			`Expected diagnostic on line ${line} but none found. Diagnostics on lines: ${lines || "(none)"}`,
		);
	}
}

/**
 * Assert that diagnostics contain a specific message substring.
 *
 * @param diagnostics - Array of diagnostics to check
 * @param messageSubstring - Substring to search for in messages
 * @throws Error if no matching diagnostic is found
 */
export function expectDiagnosticWithMessage(
	diagnostics: Diagnostic[],
	messageSubstring: string,
): void {
	const diagnostic = diagnostics.find((d) =>
		d.message.includes(messageSubstring),
	);
	if (!diagnostic) {
		const messages = diagnostics.map((d) => d.message).join("\n  - ");
		throw new Error(
			`Expected diagnostic with message containing "${messageSubstring}" but none found.\nDiagnostics:\n  - ${messages || "(none)"}`,
		);
	}
}

/**
 * Assert that no diagnostics were produced.
 *
 * @param diagnostics - Array of diagnostics to check
 * @throws Error if any diagnostics exist
 */
export function expectNoDiagnostics(diagnostics: Diagnostic[]): void {
	if (diagnostics.length > 0) {
		const messages = diagnostics.map((d) => d.message).join("\n  - ");
		throw new Error(
			`Expected no diagnostics but found ${diagnostics.length}:\n  - ${messages}`,
		);
	}
}

/**
 * Count diagnostics with a specific severity.
 *
 * @param diagnostics - Array of diagnostics to count
 * @param severity - The severity to count
 * @returns Number of diagnostics with the given severity
 */
export function countDiagnosticsBySeverity(
	diagnostics: Diagnostic[],
	severity: DiagnosticSeverity,
): number {
	return diagnostics.filter((d) => d.severity === severity).length;
}

/**
 * Minimal valid OpenAPI 3.0 document for testing.
 */
export const VALID_OPENAPI_30 = `openapi: "3.0.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}
`;

/**
 * Minimal valid OpenAPI 3.1 document for testing.
 */
export const VALID_OPENAPI_31 = `openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}
`;

/**
 * Minimal valid OpenAPI 3.2 document for testing.
 */
export const VALID_OPENAPI_32 = `openapi: "3.2.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}
`;

/**
 * OpenAPI document missing required info.title.
 */
export const INVALID_OPENAPI_MISSING_TITLE = `openapi: "3.1.0"
info:
  version: "1.0.0"
paths: {}
`;

/**
 * OpenAPI document with invalid type for version.
 */
export const INVALID_OPENAPI_WRONG_TYPE = `openapi: "3.1.0"
info:
  title: Test API
  version: 123
paths: {}
`;

/**
 * OpenAPI document with unknown/typo key.
 */
export const INVALID_OPENAPI_UNKNOWN_KEY = `openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
  descrption: This is a typo
paths: {}
`;

// ============================================================================
// Fixture Loading Utilities
// ============================================================================

/**
 * Path to the fixtures directory
 */
const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");

/**
 * Load a fixture file by name.
 *
 * @param name - The fixture file name (with extension)
 * @returns The fixture file contents as a string
 */
export function loadFixture(name: string): string {
	const fixturePath = path.join(FIXTURES_DIR, name);
	return fs.readFileSync(fixturePath, "utf-8");
}

/**
 * Load a fixture and create a TextDocument from it.
 *
 * @param name - The fixture file name
 * @param uri - Optional URI for the document
 * @returns A TextDocument instance
 */
export function loadFixtureAsDocument(
	name: string,
	uri?: string,
): TextDocument {
	const content = loadFixture(name);
	const languageId = name.endsWith(".json") ? "json" : "yaml";
	const docUri = uri ?? `file:///fixtures/${name}`;
	return TextDocument.create(docUri, languageId, 1, content);
}

/**
 * Get all fixture file names in the fixtures directory.
 *
 * @returns Array of fixture file names
 */
export function getFixtureNames(): string[] {
	try {
		return fs
			.readdirSync(FIXTURES_DIR)
			.filter((f) => f.endsWith(".yaml") || f.endsWith(".json"));
	} catch {
		return [];
	}
}

/**
 * Get all valid fixture file names.
 *
 * @returns Array of fixture file names that start with "valid-"
 */
export function getValidFixtureNames(): string[] {
	return getFixtureNames().filter((f) => f.startsWith("valid-"));
}

/**
 * Get all invalid fixture file names.
 *
 * @returns Array of fixture file names that start with "invalid-"
 */
export function getInvalidFixtureNames(): string[] {
	return getFixtureNames().filter((f) => f.startsWith("invalid-"));
}
