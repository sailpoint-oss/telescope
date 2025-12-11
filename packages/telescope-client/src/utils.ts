/**
 * Shared utilities for the Telescope VS Code extension.
 */

import * as path from "node:path";
import { minimatch } from "minimatch";
import * as vscode from "vscode";
import { isOpenAPIDocument } from "./classifier";

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default patterns for OpenAPI file discovery.
 */
export const DEFAULT_OPENAPI_PATTERNS = [
	"**/*.yaml",
	"**/*.yml",
	"**/*.json",
	"**/*.jsonc",
];

// ============================================================================
// Logging Utilities
// ============================================================================

// biome-ignore lint/suspicious/noExplicitAny: These should ACTUALLY be any
export function formatSetupLog(message: any, ...args: any[]): string {
	return `[Setup] ${message} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`;
}

// ============================================================================
// Node.js Runtime Detection
// ============================================================================

/**
 * Find the Node.js executable path.
 * VS Code extensions run in a Node.js environment, so we can use process.execPath.
 */
export function findNodePath(): string {
	// Use the Node.js executable that VS Code is running on
	return process.execPath;
}

/**
 * Get Node.js version string.
 */
export function getNodeVersion(): string {
	return process.version;
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Check if a file path matches a list of glob patterns.
 * Patterns starting with "!" are exclusions.
 *
 * @param filePath - Absolute file path
 * @param patterns - Array of glob patterns
 * @param workspaceRoot - Workspace root for relative path calculation
 * @returns true if the file matches patterns
 */
export function matchesPatternList(
	filePath: string,
	patterns: string[],
	workspaceRoot: string,
): boolean {
	// Convert to relative path from workspace root
	let relativePath = filePath;
	if (workspaceRoot) {
		const rel = path.relative(workspaceRoot, filePath);
		if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
			relativePath = rel;
		}
	}

	// Normalize path separators
	const normalizedPath = relativePath.replace(/\\/g, "/");

	// Always exclude config files
	if (
		normalizedPath.endsWith("/.telescope/config.yaml") ||
		normalizedPath.includes("/.telescope/config.yaml") ||
		normalizedPath === ".telescope/config.yaml"
	) {
		return false;
	}

	// Default: when no patterns provided, only match YAML/JSON files
	if (!patterns || patterns.length === 0) {
		const lowerPath = normalizedPath.toLowerCase();
		return (
			lowerPath.endsWith(".yaml") ||
			lowerPath.endsWith(".yml") ||
			lowerPath.endsWith(".json") ||
			lowerPath.endsWith(".jsonc")
		);
	}

	// Iterate through patterns in order - last match wins
	let included = patterns[0]?.startsWith("!") ?? false;

	for (const pattern of patterns) {
		const isNegated = pattern.startsWith("!");
		const cleanPattern = isNegated ? pattern.slice(1) : pattern;

		if (minimatch(normalizedPath, cleanPattern)) {
			included = !isNegated;
		}
	}

	return included;
}

// ============================================================================
// Document Classification Utilities
// ============================================================================

/**
 * Extract top-level YAML keys using a single regex scan.
 * This is optimized for classification - we only need key names, not values.
 *
 * Performance optimizations:
 * - Only scans first 4KB (root keys are always at the top)
 * - Uses matchAll() iterator with early break after 20 keys
 * - O(min(n, 4096)) single pass
 */
export function extractYAMLTopLevelKeys(text: string): Set<string> {
	const keys = new Set<string>();
	// Only scan first 4KB - root keys are always at the top of the file
	const searchText = text.length > 4096 ? text.slice(0, 4096) : text;
	// Match top-level keys: start of line, valid identifier, followed by colon
	// Uses 'gm' flags for global + multiline (^ matches line start)
	const regex = /^([a-zA-Z_$][a-zA-Z0-9_$-]*):/gm;

	for (const match of searchText.matchAll(regex)) {
		if (match[1]) {
			keys.add(match[1]);
		}
		if (keys.size >= 20) break;
	}
	return keys;
}

/**
 * Convert a Set of keys to a Record for the classifier.
 * The classifier only checks key existence, so values are placeholders.
 */
export function keysToRecord(keys: Set<string>): Record<string, unknown> | null {
	if (keys.size === 0) return null;
	const result: Record<string, unknown> = {};
	for (const key of keys) {
		result[key] = true;
	}
	return result;
}

/**
 * Get the base language for a file based on its extension.
 * Returns "yaml", "json", or undefined for other files.
 */
export function getBaseLanguageFromExtension(
	filePath: string,
): "yaml" | "json" | undefined {
	const lowerPath = filePath.toLowerCase();
	if (lowerPath.endsWith(".yaml") || lowerPath.endsWith(".yml")) {
		return "yaml";
	}
	if (lowerPath.endsWith(".json")) {
		return "json";
	}
	return undefined;
}

/**
 * Get the correct OpenAPI language ID based on file extension.
 * Returns "openapi-yaml" for YAML files and "openapi-json" for JSON files.
 */
export function getOpenAPILanguageId(
	filePath: string,
): "openapi-yaml" | "openapi-json" {
	const lowerPath = filePath.toLowerCase();
	if (lowerPath.endsWith(".json")) {
		return "openapi-json";
	}
	return "openapi-yaml";
}

/**
 * Check if a language ID is an OpenAPI language.
 */
export function isOpenAPILanguage(languageId: string): boolean {
	return languageId === "openapi-yaml" || languageId === "openapi-json";
}

/**
 * Extract top-level keys from JSON content.
 * Only parses first 4KB for performance.
 */
export function extractJSONTopLevelKeys(text: string): Set<string> {
	const keys = new Set<string>();
	try {
		// Only parse first portion of the file for performance
		const searchText = text.length > 8192 ? text.slice(0, 8192) : text;
		const parsed = JSON.parse(searchText);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			for (const key of Object.keys(parsed)) {
				keys.add(key);
				if (keys.size >= 20) break;
			}
		}
	} catch {
		// If JSON parsing fails on truncated content, try full parse
		try {
			const parsed = JSON.parse(text);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				for (const key of Object.keys(parsed)) {
					keys.add(key);
					if (keys.size >= 20) break;
				}
			}
		} catch {
			// Invalid JSON - return empty set
		}
	}
	return keys;
}

/**
 * Classifies a document and returns "openapi" if it's an OpenAPI document.
 * Supports both YAML and JSON files.
 *
 * Uses optimized key extraction that avoids full parsing for large YAML files.
 */
export function classifyDocument(doc: vscode.TextDocument): string | undefined {
	const languageId = doc.languageId;
	const filePath = doc.uri.fsPath;

	// Determine the file type based on languageId or extension
	let fileType: "yaml" | "json" | undefined;

	if (languageId === "yaml" || languageId === "openapi-yaml") {
		fileType = "yaml";
	} else if (
		languageId === "json" ||
		languageId === "jsonc" ||
		languageId === "openapi-json"
	) {
		fileType = "json";
	} else if (languageId === "plaintext") {
		// Try to detect from file extension
		fileType = getBaseLanguageFromExtension(filePath);
	}

	if (!fileType) {
		return undefined;
	}

	// Extract keys based on file type
	let root: Record<string, unknown> | null;
	if (fileType === "yaml") {
		root = keysToRecord(extractYAMLTopLevelKeys(doc.getText()));
	} else {
		root = keysToRecord(extractJSONTopLevelKeys(doc.getText()));
	}

	if (!root) return undefined;

	return isOpenAPIDocument(root) ? "openapi" : undefined;
}

