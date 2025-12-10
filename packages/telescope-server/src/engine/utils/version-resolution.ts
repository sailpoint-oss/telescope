/**
 * Version Resolution Utilities for OpenAPI Documents
 *
 * This module combines multiple version detection methods to determine the
 * OpenAPI specification version for any document, including partial fragments.
 *
 * Resolution Strategy:
 * 1. **Explicit**: Check for `openapi` field in the document
 * 2. **Reference**: Trace $ref relationships to find root document's version
 * 3. **Heuristic**: Analyze content for version-specific keywords
 * 4. **Default**: Fall back to "3.1" if no version can be determined
 *
 * When both reference and heuristic methods provide a version, they are compared.
 * If they disagree, a warning is included and the reference-based version is preferred.
 *
 * @module engine/utils/version-resolution
 *
 * @example
 * ```typescript
 * import { resolveDocumentVersion } from "telescope-server";
 *
 * // With rootResolver for full project context
 * const result = resolveDocumentVersion(schemaDoc, schemaUri, rootResolver);
 * console.log(`Version: ${result.version}, Source: ${result.source}`);
 * if (result.warning) {
 *   console.warn(result.warning);
 * }
 *
 * // Without rootResolver (standalone document)
 * const result2 = resolveDocumentVersion(schemaDoc, schemaUri);
 * ```
 */

import type { RootResolver } from "../indexes/types.js";
import {
	type DetectedVersion,
	detectVersionFromContent,
	type VersionHint,
} from "./version-detection.js";

/**
 * Source of the resolved version.
 *
 * - `explicit`: Version from the document's `openapi` field
 * - `reference`: Version inherited from a root document via $ref tracing
 * - `heuristic`: Version detected from content analysis
 * - `default`: Fallback version when no other method succeeds
 */
export type VersionSource = "explicit" | "reference" | "heuristic" | "default";

/**
 * Result of version resolution.
 *
 * @example
 * ```typescript
 * const result: ResolvedVersion = {
 *   version: "3.1",
 *   source: "reference",
 *   heuristicHint: { version: "3.0", confidence: "high", indicators: ["nullable"] },
 *   warning: "Heuristic detection suggests 3.0 (based on: nullable), but reference tracing indicates 3.1"
 * };
 * ```
 */
export interface ResolvedVersion {
	/** The resolved OpenAPI version (e.g., "3.0", "3.1", "3.2") */
	version: string;

	/** How the version was determined */
	source: VersionSource;

	/**
	 * The heuristic detection result, if performed.
	 * Included even when not used as the final version for diagnostic purposes.
	 */
	heuristicHint?: VersionHint;

	/**
	 * Warning message when detection methods disagree.
	 * Set when heuristic and reference-based versions conflict.
	 */
	warning?: string;
}

/**
 * Default OpenAPI version when no version can be determined.
 * 3.1 is chosen as a reasonable middle ground (most common, good feature set).
 */
const DEFAULT_VERSION = "3.1";

/**
 * Resolve the OpenAPI version for a document using multiple detection methods.
 *
 * This function implements a comprehensive version detection strategy:
 *
 * 1. **Explicit Check**: First checks if the document has an `openapi` field.
 *    If found, this is the definitive version and no further detection is done.
 *
 * 2. **Reference Tracing**: If a rootResolver is provided, traces $ref
 *    relationships backwards to find a root document and uses its version.
 *    This is the most reliable method for partial documents that are part
 *    of a larger OpenAPI project.
 *
 * 3. **Heuristic Detection**: Analyzes the document content for version-specific
 *    keywords (e.g., `nullable` for 3.0, `prefixItems` for 3.1+, `itemSchema`
 *    for 3.2). This is useful for standalone fragments.
 *
 * 4. **Validation**: If both reference and heuristic methods provide a version,
 *    they are compared. If they disagree, a warning is generated and the
 *    reference-based version is preferred (as it's more reliable).
 *
 * 5. **Default**: If no version can be determined, falls back to "3.1".
 *
 * @param doc - The parsed document object
 * @param uri - The document URI (used for reference tracing)
 * @param rootResolver - Optional RootResolver for tracing $ref relationships.
 *                       Without this, only explicit and heuristic detection is used.
 * @returns Resolution result with version, source, and any warnings
 *
 * @example
 * ```typescript
 * // Full project context with reference tracing
 * const { rootResolver } = buildRefGraph({ docs });
 * const result = resolveDocumentVersion(schemaDoc, schemaUri, rootResolver);
 *
 * if (result.source === "reference") {
 *   console.log("Version inherited from root document");
 * }
 * if (result.warning) {
 *   // Heuristic and reference disagreed
 *   console.warn(result.warning);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Standalone document (no project context)
 * const result = resolveDocumentVersion(schemaDoc, schemaUri);
 * // Will use explicit or heuristic detection only
 * ```
 */
export function resolveDocumentVersion(
	doc: unknown,
	uri: string,
	rootResolver?: RootResolver,
): ResolvedVersion {
	// Step 1: Check for explicit openapi field
	const explicitVersion = extractExplicitVersion(doc);
	if (explicitVersion) {
		return {
			version: explicitVersion,
			source: "explicit",
		};
	}

	// Step 2: Try reference-based resolution (if rootResolver available)
	let referenceVersion: string | undefined;
	if (rootResolver) {
		referenceVersion = rootResolver.getVersionForPartial(uri);
	}

	// Step 3: Try heuristic detection
	const heuristicHint = detectVersionFromContent(doc);
	const heuristicVersion =
		heuristicHint.version !== "unknown" ? heuristicHint.version : undefined;

	// Step 4: Compare and validate
	if (referenceVersion && heuristicVersion) {
		// Both methods provided a version - check for agreement
		const normalizedRef = normalizeVersion(referenceVersion);
		const normalizedHeuristic = normalizeVersion(heuristicVersion);

		if (normalizedRef !== normalizedHeuristic) {
			// Versions disagree - warn and prefer reference
			const indicatorsList = heuristicHint.indicators.join(", ");
			return {
				version: normalizedRef,
				source: "reference",
				heuristicHint,
				warning:
					`Version mismatch: Heuristic detection suggests ${heuristicVersion} ` +
					`(based on: ${indicatorsList || "no strong indicators"}), ` +
					`but reference tracing indicates ${referenceVersion}. ` +
					`Using reference-based version.`,
			};
		}

		// Versions agree - use reference (more authoritative)
		return {
			version: normalizedRef,
			source: "reference",
			heuristicHint,
		};
	}

	// Step 5: Use whichever method succeeded
	if (referenceVersion) {
		return {
			version: normalizeVersion(referenceVersion),
			source: "reference",
			heuristicHint:
				heuristicHint.version !== "unknown" ? heuristicHint : undefined,
		};
	}

	if (heuristicVersion) {
		return {
			version: normalizeVersion(heuristicVersion),
			source: "heuristic",
			heuristicHint,
		};
	}

	// Step 6: Fall back to default
	return {
		version: DEFAULT_VERSION,
		source: "default",
		heuristicHint:
			heuristicHint.version !== "unknown" ? heuristicHint : undefined,
	};
}

/**
 * Extract the explicit OpenAPI version from a document.
 *
 * @param doc - The parsed document object
 * @returns The version string (e.g., "3.0", "3.1"), or undefined if not found
 */
function extractExplicitVersion(doc: unknown): string | undefined {
	if (!doc || typeof doc !== "object") {
		return undefined;
	}

	const data = doc as Record<string, unknown>;
	const openapi = data.openapi;
	const swagger = data.swagger;

	if (typeof swagger === "string" && swagger.startsWith("2.0")) {
		return "2.0";
	}

	if (typeof openapi === "string") {
		// Extract major.minor version
		const match = openapi.match(/^(\d+\.\d+)/);
		if (match) {
			return match[1];
		}
	}

	return undefined;
}

/**
 * Normalize a version string to supported format.
 *
 * @param version - The version to normalize
 * @returns Normalized version string
 */
function normalizeVersion(version: string): string {
	// Extract major.minor from version string
	const match = version.match(/^(\d+\.\d+)/);
	if (match) {
		const majorMinor = match[1];
		// Ensure we support this version
		if (
			majorMinor === "2.0" ||
			majorMinor === "3.0" ||
			majorMinor === "3.1" ||
			majorMinor === "3.2"
		) {
			return majorMinor;
		}
	}
	// Default to 3.1 for unknown versions
	return DEFAULT_VERSION;
}

/**
 * Quick helper to check if a resolved version indicates a specific version.
 *
 * @param resolved - The resolved version result
 * @param version - The version to check for
 * @returns True if the resolved version matches
 */
export function isResolvedVersion(
	resolved: ResolvedVersion,
	version: DetectedVersion,
): boolean {
	return resolved.version === version;
}

/**
 * Get the confidence level of a resolved version.
 *
 * - `explicit`: Always "high" (definitive)
 * - `reference`: Always "high" (authoritative)
 * - `heuristic`: Uses the heuristic detection's confidence
 * - `default`: Always "low" (fallback)
 *
 * @param resolved - The resolved version result
 * @returns Confidence level
 */
export function getVersionConfidence(
	resolved: ResolvedVersion,
): "high" | "medium" | "low" {
	switch (resolved.source) {
		case "explicit":
		case "reference":
			return "high";
		case "heuristic":
			return resolved.heuristicHint?.confidence ?? "medium";
		case "default":
			return "low";
	}
}
