import { relative } from "node:path";
import { minimatch } from "minimatch";
import { URI } from "vscode-uri";

/**
 * Check if a URI matches the given include/exclude patterns.
 * Patterns are evaluated in order - last match wins.
 *
 * @param uri - The file URI to check
 * @param patterns - Array of glob patterns. Patterns starting with "!" are exclusions.
 * @param workspaceRoots - Array of workspace root paths (for relative path calculation)
 * @returns true if the file should be processed, false otherwise
 */
export function matchesPattern(
	uri: string,
	patterns: string[],
	workspaceRoots: string[] = [],
): boolean {
	// Convert URI to file path
	let filePath: string;
	try {
		const uriObj = URI.parse(uri);
		filePath = uriObj.fsPath;
	} catch {
		// Fallback: try to extract path from URI string
		if (uri.startsWith("file://")) {
			filePath = uri.replace(/^file:\/\//, "");
		} else {
			filePath = uri;
		}
	}

	// Convert to relative path from workspace root if possible
	let relativePath: string = filePath;
	if (workspaceRoots.length > 0) {
		// Try each workspace root to find a match
		for (const root of workspaceRoots) {
			try {
				const rel = relative(root, filePath);
				// relative() returns a path with ".." if outside root, so check for that
				if (!rel.startsWith("..") && !rel.startsWith("/")) {
					relativePath = rel;
					break;
				}
			} catch {
				// Continue to next root
			}
		}
	}

	// Normalize path separators for pattern matching
	const normalizedPath = relativePath.replace(/\\/g, "/");

	// Always exclude config files from OpenAPI linting
	if (
		normalizedPath.endsWith("/.telescope/config.yaml") ||
		normalizedPath.includes("/.telescope/config.yaml")
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

	// Iterate through patterns in order.
	// Last matching pattern determines the result.
	// If no pattern matches, default is false (unless only exclusions are present, but usually explicit include is needed)
	// Actually, standard behavior for glob lists (like in ESLint/Git):
	// - If no patterns match, it's excluded.
	// - We track the current "included" state.
	// - Exception: If the first pattern is an exclusion, we assume "include all" initially.
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
