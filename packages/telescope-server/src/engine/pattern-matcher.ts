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
	const lowerPath = normalizedPath.toLowerCase();

	// Always exclude config files from OpenAPI linting
	if (
		lowerPath.endsWith("/.telescope/config.yaml") ||
		lowerPath.includes("/.telescope/config.yaml")
	) {
		return false;
	}

	// Always exclude known non-OpenAPI files from OpenAPI linting, even if patterns would match.
	// This prevents false positives like package.json being treated as OpenAPI just because it is JSON.
	const knownNonOpenAPIFiles = [
		// Node.js / JavaScript / TypeScript
		"package.json",
		"package-lock.json",
		"tsconfig.json",
		"jsconfig.json",
		".npmrc",
		// Package managers / lock files
		"pnpm-lock.yaml",
		"yarn.lock",
		"bun.lock",
		"bun.lockb",
		"composer.json",
		"composer.lock",
		// Linters / formatters
		"biome.json",
		"biome.jsonc",
		".prettierrc",
		".prettierrc.json",
		".prettierrc.yaml",
		".prettierrc.yml",
		".eslintrc",
		".eslintrc.json",
		".eslintrc.yaml",
		".eslintrc.yml",
		"eslint.config.json",
		".swcrc",
		// Bundlers / build tools
		"turbo.json",
		"nx.json",
		"lerna.json",
		".babelrc",
		".babelrc.json",
		// Testing
		"jest.config.json",
		"vitest.config.json",
		// CI / CD / DevOps
		"renovate.json",
		"docker-compose.yml",
		"docker-compose.yaml",
		// Hosting / deployment
		"vercel.json",
		"firebase.json",
		"netlify.json",
		// Spell checking
		"cspell.json",
		".cspell.json",
		// VS Code / Editor
		"settings.json",
		"launch.json",
		"tasks.json",
		"extensions.json",
		"devcontainer.json",
	];
	if (knownNonOpenAPIFiles.some((file) => lowerPath.endsWith(file))) {
		return false;
	}

	// Exclude well-known non-OpenAPI directory patterns.
	// Files inside these directories are never OpenAPI specs.
	const knownNonOpenAPIDirs = [
		".github/",
		".vscode/",
		".devcontainer/",
		"node_modules/",
		".git/",
	];
	if (knownNonOpenAPIDirs.some((dir) => lowerPath.includes(dir))) {
		return false;
	}

	// Default: when no patterns provided, only match YAML/JSON files
	if (!patterns || patterns.length === 0) {
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
