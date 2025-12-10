/**
 * Version Detection Utilities for OpenAPI Documents
 *
 * This module provides heuristic-based detection of OpenAPI specification versions
 * by analyzing document content for version-specific keywords and patterns.
 *
 * @module engine/utils/version-detection
 *
 * @example
 * ```typescript
 * import { detectVersionFromContent } from "telescope-server";
 *
 * const hint = detectVersionFromContent({
 *   type: "object",
 *   nullable: true,
 *   properties: { name: { type: "string" } }
 * });
 * // { version: "3.0", confidence: "high", indicators: ["nullable"] }
 * ```
 */

/**
 * Supported OpenAPI versions for detection.
 */
export type DetectedVersion = "3.0" | "3.1" | "3.2" | "unknown";

/**
 * Confidence level for version detection.
 *
 * - `high`: Multiple strong indicators or a definitive keyword
 * - `medium`: Some indicators found, reasonably confident
 * - `low`: Few or weak indicators, uncertain
 */
export type VersionConfidence = "high" | "medium" | "low";

/**
 * Result of heuristic version detection.
 *
 * @example
 * ```typescript
 * const hint: VersionHint = {
 *   version: "3.0",
 *   confidence: "high",
 *   indicators: ["nullable", "exclusiveMinimum (boolean)"]
 * };
 * ```
 */
export interface VersionHint {
	/** Detected OpenAPI version */
	version: DetectedVersion;
	/** Confidence level of the detection */
	confidence: VersionConfidence;
	/** List of keywords/patterns that led to this detection */
	indicators: string[];
}

// ============================================================================
// Version-Specific Indicators
// ============================================================================

/**
 * Keywords that indicate OpenAPI 3.0.x (and NOT 3.1+).
 * These are keywords that were removed or changed in 3.1.
 */
const V30_ONLY_INDICATORS = new Set([
	// `nullable` was replaced by type arrays in 3.1
	"nullable",
]);

/**
 * Keywords that indicate OpenAPI 3.1+ (not in 3.0).
 * These are new JSON Schema 2020-12 keywords or 3.1 additions.
 */
const V31_PLUS_INDICATORS = new Set([
	// JSON Schema 2020-12 keywords
	"prefixItems",
	"$dynamicRef",
	"$dynamicAnchor",
	"dependentRequired",
	"dependentSchemas",
	"unevaluatedItems",
	"unevaluatedProperties",
	"minContains",
	"maxContains",
	"$vocabulary",
]);

/**
 * Keywords that indicate OpenAPI 3.2+ (not in 3.0 or 3.1).
 * These are new fields added in OpenAPI 3.2.
 */
const V32_PLUS_INDICATORS = new Set([
	// Example object fields
	"dataValue",
	"serializedValue",
	// MediaType streaming fields
	"itemSchema",
	"itemEncoding",
	// Discriminator field
	"defaultMapping",
	// PathItem fields
	"additionalOperations",
]);

/**
 * Tag-specific fields that indicate 3.2 (when found on a tag object).
 */
const V32_TAG_FIELDS = new Set(["parent", "kind"]);

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Check if a value is a non-null object.
 */
function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Track detected indicators for each version.
 */
interface IndicatorTracker {
	v30: string[];
	v31: string[];
	v32: string[];
}

/**
 * Traverse an object recursively, collecting version indicators.
 *
 * @param value - Current value to traverse
 * @param tracker - Indicator tracker to populate
 * @param path - Current path for context (e.g., to detect tag-specific fields)
 */
function collectIndicators(
	value: unknown,
	tracker: IndicatorTracker,
	path: string[] = [],
): void {
	if (!isObject(value) && !Array.isArray(value)) {
		return;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			collectIndicators(item, tracker, path);
		}
		return;
	}

	const obj = value as Record<string, unknown>;

	for (const [key, val] of Object.entries(obj)) {
		// Check for 3.0-only indicators
		if (V30_ONLY_INDICATORS.has(key)) {
			// `nullable` must be a boolean to be a valid indicator
			if (key === "nullable" && typeof val === "boolean") {
				tracker.v30.push("nullable");
			}
		}

		// Check for 3.1+ indicators
		if (V31_PLUS_INDICATORS.has(key)) {
			tracker.v31.push(key);
		}

		// Check for 3.2+ indicators
		if (V32_PLUS_INDICATORS.has(key)) {
			tracker.v32.push(key);
		}

		// Check for tag-specific 3.2 fields
		// A tag object typically has "name" as a string
		if (V32_TAG_FIELDS.has(key) && typeof obj.name === "string") {
			tracker.v32.push(`tag.${key}`);
		}

		// Check for `exclusiveMinimum`/`exclusiveMaximum` with boolean (3.0) vs number (3.1+)
		if (key === "exclusiveMinimum" || key === "exclusiveMaximum") {
			if (typeof val === "boolean") {
				tracker.v30.push(`${key} (boolean)`);
			} else if (typeof val === "number") {
				tracker.v31.push(`${key} (number)`);
			}
		}

		// Check for type as array (3.1+)
		if (key === "type" && Array.isArray(val)) {
			tracker.v31.push("type (array)");
		}

		// Check for `example` vs `examples` in schema context
		// This is tricky because `example` exists in 3.1 too for Parameter/MediaType
		// but Schema.example was deprecated in favor of examples (plural)
		if (key === "example" && ("type" in obj || "properties" in obj)) {
			// This is in a schema context - weak indicator for 3.0
			// Don't add as strong indicator since example is still valid
		}

		// Check for `query` HTTP method (3.2+)
		if (
			key === "query" &&
			isObject(val) &&
			("responses" in val || "operationId" in val)
		) {
			tracker.v32.push("query (HTTP method)");
		}

		// Check for Server.name field (3.2+)
		if (key === "name" && "url" in obj && typeof obj.url === "string") {
			// This is a server object with a name field - 3.2 indicator
			// But need to be careful - name is common in other contexts
			if ("variables" in obj || path.includes("servers")) {
				tracker.v32.push("server.name");
			}
		}

		// Recurse into nested objects and arrays
		collectIndicators(val, tracker, [...path, key]);
	}
}

/**
 * Detect the OpenAPI version from document content using heuristic analysis.
 *
 * This function analyzes a document (typically a partial/fragment document)
 * for version-specific keywords and patterns to infer which OpenAPI
 * specification version it was likely written for.
 *
 * Detection priority (highest version wins when multiple indicators found):
 * 1. 3.2-specific keywords -> 3.2
 * 2. 3.1-specific keywords -> 3.1
 * 3. 3.0-specific keywords -> 3.0
 * 4. No indicators -> unknown
 *
 * @param obj - The parsed document object to analyze
 * @returns Version hint with detected version, confidence, and evidence
 *
 * @example
 * ```typescript
 * // 3.0 document with nullable
 * detectVersionFromContent({
 *   type: "string",
 *   nullable: true
 * });
 * // { version: "3.0", confidence: "high", indicators: ["nullable"] }
 *
 * // 3.1 document with type array
 * detectVersionFromContent({
 *   type: ["string", "null"]
 * });
 * // { version: "3.1", confidence: "high", indicators: ["type (array)"] }
 *
 * // 3.2 document with streaming
 * detectVersionFromContent({
 *   schema: { type: "object" },
 *   itemSchema: { type: "string" }
 * });
 * // { version: "3.2", confidence: "high", indicators: ["itemSchema"] }
 * ```
 */
export function detectVersionFromContent(obj: unknown): VersionHint {
	// Fast fail for non-objects
	if (!isObject(obj)) {
		return {
			version: "unknown",
			confidence: "low",
			indicators: [],
		};
	}

	// Check for explicit openapi field first
	const openapi = obj.openapi;
	if (typeof openapi === "string") {
		if (openapi.startsWith("3.2")) {
			return {
				version: "3.2",
				confidence: "high",
				indicators: [`openapi: ${openapi}`],
			};
		}
		if (openapi.startsWith("3.1")) {
			return {
				version: "3.1",
				confidence: "high",
				indicators: [`openapi: ${openapi}`],
			};
		}
		if (openapi.startsWith("3.0")) {
			return {
				version: "3.0",
				confidence: "high",
				indicators: [`openapi: ${openapi}`],
			};
		}
	}

	// Collect indicators by traversing the document
	const tracker: IndicatorTracker = {
		v30: [],
		v31: [],
		v32: [],
	};

	collectIndicators(obj, tracker);

	// Determine version based on indicators (highest version wins)
	// 3.2 indicators take precedence
	if (tracker.v32.length > 0) {
		return {
			version: "3.2",
			confidence: tracker.v32.length >= 2 ? "high" : "medium",
			indicators: tracker.v32,
		};
	}

	// 3.1 indicators
	if (tracker.v31.length > 0) {
		// If we also have 3.0 indicators, there's a conflict
		// Still report 3.1 but with lower confidence
		if (tracker.v30.length > 0) {
			return {
				version: "3.1",
				confidence: "medium",
				indicators: [
					...tracker.v31,
					`(conflicts with 3.0: ${tracker.v30.join(", ")})`,
				],
			};
		}
		return {
			version: "3.1",
			confidence: tracker.v31.length >= 2 ? "high" : "medium",
			indicators: tracker.v31,
		};
	}

	// 3.0 indicators only
	if (tracker.v30.length > 0) {
		return {
			version: "3.0",
			confidence: tracker.v30.length >= 2 ? "high" : "medium",
			indicators: tracker.v30,
		};
	}

	// No indicators found
	return {
		version: "unknown",
		confidence: "low",
		indicators: [],
	};
}

/**
 * Check if a version hint indicates a specific version.
 *
 * @param hint - The version hint to check
 * @param version - The version to check for
 * @returns True if the hint indicates the specified version
 */
export function isVersion(
	hint: VersionHint,
	version: DetectedVersion,
): boolean {
	return hint.version === version;
}

/**
 * Get the minimum confidence required for a given use case.
 *
 * @param hint - The version hint to check
 * @param minConfidence - Minimum required confidence level
 * @returns True if the hint meets the minimum confidence
 */
export function meetsConfidence(
	hint: VersionHint,
	minConfidence: VersionConfidence,
): boolean {
	const confidenceLevels: Record<VersionConfidence, number> = {
		low: 1,
		medium: 2,
		high: 3,
	};
	return confidenceLevels[hint.confidence] >= confidenceLevels[minConfidence];
}
