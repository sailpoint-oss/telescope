import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Diagnostic, ProjectContext } from "lens";
import { getValueAtPointer } from "lens";
import { buildIndex, buildRefGraph } from "lens";
import { loadDocument } from "lens"; // Fixed import
import { MemoryFileSystem } from "shared/file-system-utils";
import { URI } from "vscode-uri";

// Get test-files directory path - from packages/blueprint/src/rules to packages/test-files
const examplesDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../../test-files",
);

async function readExample(name: string): Promise<string> {
	const filePath = join(examplesDir, name);
	return readFile(filePath, "utf8");
}

// Re-export MemoryFileSystem from shared package
export { MemoryFileSystem };

/**
 * Create a test project context from a YAML or JSON string
 */
export async function createTestProject(
	content: string,
	uri: string = "file:///test.yaml",
): Promise<ProjectContext> {
	const fileSystem = new MemoryFileSystem();
	fileSystem.addFile(uri, content);
	const doc = await loadDocument({ fileSystem, uri });
	const docs = new Map([[uri, doc]]);
	const { graph, resolver, rootResolver } = buildRefGraph({ docs });
	const index = buildIndex({ docs, graph, resolver });
	return {
		docs,
		index,
		resolver,
		graph,
		rootResolver,
		version: index.version,
	};
}

/**
 * Create a test project from multiple files
 */
export async function createTestProjectFromFiles(
	files: Array<{ uri: string; content: string }>,
): Promise<ProjectContext> {
	const fileSystem = new MemoryFileSystem();
	const docs = new Map();

	for (const { uri, content } of files) {
		fileSystem.addFile(uri, content);
		const doc = await loadDocument({ fileSystem, uri });
		docs.set(uri, doc);
	}

	const { graph, resolver, rootResolver } = buildRefGraph({ docs });
	const index = buildIndex({ docs, graph, resolver });
	return {
		docs,
		index,
		resolver,
		graph,
		rootResolver,
		version: index.version,
	};
}


/**
 * Helper to find diagnostics by rule ID
 */
export function findDiagnostics(
	diagnostics: Diagnostic[],
	ruleId: string,
): Diagnostic[] {
	return diagnostics.filter(
		(d) => d.ruleId === ruleId || d.ruleId.includes(ruleId),
	);
}

/**
 * Helper to check if a diagnostic with a specific message exists
 */
export function hasDiagnostic(
	diagnostics: Diagnostic[],
	ruleId: string,
	messageContains: string,
): boolean {
	return diagnostics.some(
		(d) =>
			(d.ruleId === ruleId || d.ruleId.includes(ruleId)) &&
			d.message.includes(messageContains),
	);
}

/**
 * Get the first URI from a project's documents map.
 * Throws if no documents exist.
 */
export function getFirstUri(project: ProjectContext): string {
	const firstUri = project.docs.keys().next().value;
	if (!firstUri) {
		throw new Error("Project has no documents");
	}
	return firstUri;
}

/**
 * Create a test project from an example file
 */
export async function createTestProjectFromExample(
	exampleName: string,
	uri?: string,
): Promise<ProjectContext> {
	const content = await readExample(exampleName);
	const fileUri = uri || `file:///test-files/${exampleName}`;
	return createTestProject(content, fileUri);
}

/**
 * Create a test project from multiple example files
 */
export async function createTestProjectFromExamples(
	examples: Array<{ name: string; uri?: string }>,
): Promise<ProjectContext> {
	const files = await Promise.all(
		examples.map(async ({ name, uri }) => ({
			uri: uri || `file:///test-files/${name}`,
			content: await readExample(name),
		})),
	);
	return createTestProjectFromFiles(files);
}

/**
 * Extract a specific path from a comprehensive test document
 * Creates a minimal valid OpenAPI document containing only the specified path
 */
export function extractPathFromDocument(
	content: string,
	targetPath: string,
): string {
	try {
		const doc = JSON.parse(content) as Record<string, unknown>;
		const paths = doc.paths as Record<string, unknown> | undefined;

		if (!paths || typeof paths !== "object") {
			throw new Error(`No paths found in document`);
		}

		const pathItem = paths[targetPath];
		if (!pathItem) {
			throw new Error(`Path ${targetPath} not found in document`);
		}

		// Create minimal document with just this path
		const extracted: Record<string, unknown> = {
			openapi: doc.openapi || "3.1.0",
			info: doc.info || { title: "Test", version: "1.0.0" },
			paths: {
				[targetPath]: pathItem,
			},
		};

		// Preserve x-sailpoint-api if present
		if (doc["x-sailpoint-api"]) {
			extracted["x-sailpoint-api"] = doc["x-sailpoint-api"];
		}

		// Preserve tags if present
		if (doc.tags) {
			extracted.tags = doc.tags;
		}

		// Preserve components if present (for securitySchemes, etc.)
		if (doc.components) {
			extracted.components = doc.components;
		}

		return JSON.stringify(extracted, null, 2);
	} catch {
		// If JSON parsing fails, try YAML parsing (simplified - just extract the path section)
		// For YAML, we'll do a simple string extraction
		const lines = content.split("\n");
		let inPaths = false;
		let inTargetPath = false;
		let indentLevel = 0;
		const extracted: string[] = [];

		// Add header
		extracted.push("openapi: 3.1.0");
		extracted.push("info:");
		extracted.push("  title: Test");
		extracted.push("  version: 1.0.0");
		extracted.push("paths:");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;
			const trimmed = line.trim();

			if (trimmed.startsWith("paths:")) {
				inPaths = true;
				continue;
			}

			if (inPaths && trimmed.startsWith(`${targetPath}:`)) {
				inTargetPath = true;
				extracted.push(`  ${targetPath}:`);
				indentLevel = line.match(/^(\s*)/)?.[1]?.length || 0;
				continue;
			}

			if (inTargetPath) {
				const currentIndent = line.match(/^(\s*)/)?.[1]?.length || 0;
				// End of path item if we encounter another path item (same indent level, starts with /)
				if (
					trimmed &&
					currentIndent === indentLevel &&
					trimmed.startsWith("/") &&
					trimmed.endsWith(":")
				) {
					break;
				}
				// End if we've gone back to a higher level (like back to "paths:" or a new top-level key)
				if (trimmed && currentIndent < indentLevel) {
					break;
				}
				// Extract the path item content (adjust indentation)
				const contentIndent = currentIndent - indentLevel;
				if (contentIndent > 0) {
					extracted.push("  " + line.substring(indentLevel));
				} else if (currentIndent >= indentLevel) {
					extracted.push(line);
				} else {
					break;
				}
			}
		}

		// Add components if they exist in original (for securitySchemes)
		const componentsMatch = content.match(/^components:\s*$/m);
		if (componentsMatch) {
			extracted.push("");
			extracted.push("components:");
			// Extract securitySchemes if present
			const securityMatch = content.match(
				/^\s+securitySchemes:\s*$([\s\S]*?)(?=^\s+\w|$)/m,
			);
			if (securityMatch) {
				extracted.push("  securitySchemes:");
				const schemesLines = securityMatch[1]!.split("\n");
				for (const schemeLine of schemesLines) {
					if (schemeLine.trim()) {
						extracted.push("  " + schemeLine);
					}
				}
			}
		}

		return extracted.join("\n");
	}
}

/**
 * Filter diagnostics by path
 * Returns diagnostics that relate to the specified path
 */
export function filterDiagnosticsByPath(
	diagnostics: Diagnostic[],
	project: ProjectContext,
	targetPath: string,
): Diagnostic[] {
	return diagnostics.filter((diag) => {
		// Convert range to pointer using source map
		const doc = project.docs.get(diag.uri);
		if (!doc || !project.index.scopeProvider) return false;

		const pointer = doc.sourceMap.rangeToPointer(diag.range);
		if (!pointer) return false;

		const scope = project.index.scopeProvider(diag.uri, pointer);
		return scope?.path?.name === targetPath;
	});
}

/**
 * Filter diagnostics by operationId
 * Returns diagnostics that relate to the specified operationId
 */
export function filterDiagnosticsByOperationId(
	diagnostics: Diagnostic[],
	project: ProjectContext,
	targetOperationId: string,
): Diagnostic[] {
	return diagnostics.filter((diag) => {
		// Convert range to pointer using source map
		const doc = project.docs.get(diag.uri);
		if (!doc || !project.index.scopeProvider) return false;

		const pointer = doc.sourceMap.rangeToPointer(diag.range);
		if (!pointer) return false;

		const scope = project.index.scopeProvider(diag.uri, pointer);
		if (!scope?.operation) return false;

		// Get the operation node to check operationId
		const operation = getValueAtPointer(doc.ast, scope.operation.pointer) as
			| Record<string, unknown>
			| undefined;

		return operation?.operationId === targetOperationId;
	});
}

// getValueAtPointer is now imported from engine

/**
 * Create a test project from a comprehensive document, filtering to a specific path
 * This extracts the path and creates a minimal document for testing
 */
export async function createTestProjectFromComprehensiveDocument(
	documentName: string,
	targetPath: string,
	uri?: string,
): Promise<ProjectContext> {
	const content = await readExample(documentName);
	const extracted = extractPathFromDocument(content, targetPath);
	const fileUri = uri || `file:///test-files/${documentName}#${targetPath}`;
	return createTestProject(extracted, fileUri);
}
