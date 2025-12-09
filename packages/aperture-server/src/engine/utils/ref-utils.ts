/**
 * Reference Resolution Utilities
 *
 * This module provides utilities for resolving $ref references in OpenAPI
 * documents. It handles various reference formats:
 *
 * - Absolute URLs (http://, https://)
 * - Same-document references (#/components/schemas/User)
 * - Relative file paths (./schemas/User.yaml)
 * - Absolute file paths (/schemas/User.yaml)
 *
 * @module utils/ref-utils
 *
 * @see {@link buildRefGraph} - Uses this for building the reference graph
 *
 * @example
 * ```typescript
 * import { resolveRef } from "aperture-server";
 * import { URI } from "vscode-uri";
 *
 * const baseUri = URI.parse("file:///project/api/main.yaml");
 *
 * // Resolve relative reference
 * resolveRef(baseUri, "../schemas/User.yaml");
 * // file:///project/schemas/User.yaml
 *
 * // Resolve same-document reference
 * resolveRef(baseUri, "#/components/schemas/User");
 * // file:///project/api/main.yaml#/components/schemas/User
 *
 * // Resolve absolute URL
 * resolveRef(baseUri, "https://api.example.com/schemas/User.yaml");
 * // https://api.example.com/schemas/User.yaml
 * ```
 */

import { URI } from "vscode-uri";

/**
 * Resolve a $ref path to an absolute URI.
 *
 * Handles multiple reference formats:
 * - **HTTP/HTTPS URLs**: Parsed directly as-is
 * - **Same-document refs**: "#..." → adds fragment to base URI
 * - **Absolute paths**: "/path/..." → replaces path in base URI
 * - **Relative paths**: "./path" or "../path" → resolved relative to base
 *
 * @param fromUri - The base URI to resolve from (typically the containing document)
 * @param ref - The reference string to resolve
 * @returns The resolved absolute URI
 *
 * @example
 * ```typescript
 * const baseUri = URI.parse("file:///api/v1/main.yaml");
 *
 * // External URL (unchanged)
 * resolveRef(baseUri, "https://example.com/schema.yaml");
 * // → https://example.com/schema.yaml
 *
 * // Same-document reference
 * resolveRef(baseUri, "#/components/schemas/User");
 * // → file:///api/v1/main.yaml with fragment "components/schemas/User"
 *
 * // Relative path (sibling file)
 * resolveRef(baseUri, "./schemas/User.yaml");
 * // → file:///api/v1/schemas/User.yaml
 *
 * // Relative path (parent directory)
 * resolveRef(baseUri, "../common/Error.yaml");
 * // → file:///api/common/Error.yaml
 *
 * // Absolute path
 * resolveRef(baseUri, "/schemas/User.yaml");
 * // → file:///schemas/User.yaml
 * ```
 */
export function resolveRef(fromUri: URI, ref: string): URI {
	// Handle external refs (http/https)
	if (/^https?:/i.test(ref)) {
		const [uri, fragment] = ref.split("#", 2);
		const parsed = URI.parse(uri ?? ref);
		// Preserve the fragment if present
		return fragment ? parsed.with({ fragment }) : parsed;
	}

	// Handle same-document reference (#pointer)
	if (ref.startsWith("#")) {
		return fromUri.with({ fragment: ref.substring(1) });
	}

	// Extract fragment from ref if present (e.g., "./file.yaml#/path/to/element")
	const [refPath, fragment] = ref.split("#", 2);

	// Handle absolute paths
	if (refPath.startsWith("/")) {
		const result = fromUri.with({ path: refPath, fragment: "" });
		return fragment ? result.with({ fragment }) : result;
	}

	// Get the directory of the base URI
	const basePath = fromUri.path;
	const baseDir = basePath.substring(0, basePath.lastIndexOf("/") + 1);

	// Resolve relative path, handling . and .. segments
	const segments = refPath.split("/");
	const resolvedSegments: string[] = baseDir.split("/").filter(Boolean);

	for (const segment of segments) {
		if (segment === "." || segment === "") {
			// Skip current directory
		} else if (segment === "..") {
			// Go up one directory
			if (resolvedSegments.length > 0) {
				resolvedSegments.pop();
			}
		} else {
			// Add segment
			resolvedSegments.push(segment);
		}
	}

	// Reconstruct the path and normalize
	const resolvedPath = `/${resolvedSegments.join("/")}`;
	const result = fromUri.with({ path: resolvedPath, fragment: "" });
	// Apply fragment if present
	return fragment ? result.with({ fragment }) : result;
}

/**
 * Normalize a URI to a consistent string representation for use as map keys.
 *
 * This function ensures that equivalent URIs produce identical strings,
 * which is essential for consistent document storage and lookup in maps.
 *
 * Normalization:
 * - Parses the URI and re-stringifies via `URI.parse().toString()`
 * - Strips fragments (JSON pointers) since they represent positions within
 *   a file, not file identity
 *
 * @param uri - The URI to normalize (string or URI object)
 * @returns Normalized URI string without fragment
 *
 * @example
 * ```typescript
 * // File URIs
 * normalizeUri("file:///path/to/file.yaml");
 * // → "file:///path/to/file.yaml"
 *
 * // Strips fragments
 * normalizeUri("file:///path/to/file.yaml#/components/schemas/User");
 * // → "file:///path/to/file.yaml"
 *
 * // HTTPS URIs
 * normalizeUri("https://example.com/schema.yaml#/definitions/Pet");
 * // → "https://example.com/schema.yaml"
 *
 * // Idempotent
 * normalizeUri(normalizeUri(uri)) === normalizeUri(uri);
 * ```
 */
export function normalizeUri(uri: string | URI): string {
	const parsed = typeof uri === "string" ? URI.parse(uri) : uri;
	// Strip fragment for file identity - fragments are JSON pointers within the file
	return parsed.with({ fragment: "" }).toString();
}
