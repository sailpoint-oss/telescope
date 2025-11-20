import { relative } from "node:path";
import minimatch from "minimatch";
import { URI } from "vscode-uri";

/**
 * Check if a URI matches the given include/exclude patterns.
 * Patterns are evaluated in order - first match wins.
 * Include patterns take precedence over exclude patterns.
 *
 * @param uri - The file URI to check
 * @param includePatterns - Array of include glob patterns
 * @param excludePatterns - Array of exclude glob patterns
 * @param workspaceRoots - Array of workspace root paths (for relative path calculation)
 * @returns true if the file should be processed, false otherwise
 */
export function matchesPattern(
	uri: string,
	includePatterns: string[] | undefined,
	excludePatterns: string[] | undefined,
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

	// If no include patterns specified, use default behavior (include all)
	// But still check exclude patterns
	if (!includePatterns || includePatterns.length === 0) {
		// Default: include all files that match common OpenAPI extensions
		const hasOpenApiExtension = /\.(yaml|yml|json)$/i.test(normalizedPath);
		if (!hasOpenApiExtension) {
			return false;
		}
	} else {
		// Check if file matches any include pattern
		const matchesInclude = includePatterns.some((pattern) => {
			// Handle negation patterns (though typically exclude should be used)
			if (pattern.startsWith("!")) {
				return !minimatch(normalizedPath, pattern.slice(1));
			}
			return minimatch(normalizedPath, pattern);
		});

		if (!matchesInclude) {
			return false;
		}
	}

	// Check exclude patterns
	if (excludePatterns && excludePatterns.length > 0) {
		const matchesExclude = excludePatterns.some((pattern) => {
			// Handle negation patterns
			if (pattern.startsWith("!")) {
				return !minimatch(normalizedPath, pattern.slice(1));
			}
			return minimatch(normalizedPath, pattern);
		});

		if (matchesExclude) {
			return false;
		}
	}

	return true;
}
