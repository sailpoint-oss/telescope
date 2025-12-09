/**
 * Schema Cache - Pre-computed JSON Schemas for Language Services
 *
 * This module transforms TypeBox schemas into properly structured JSON Schemas
 * at module load time, providing O(1) lookups for language services.
 *
 * TypeBox Type.Module() generates schemas with $defs and root $ref:
 * { "$defs": { "OpenAPI": {...} }, "$ref": "OpenAPI" }
 *
 * This module transforms them into standard JSON Schema format:
 * { "$id": "telescope://...", "title": "...", "type": "object", ..., "$defs": {...} }
 *
 * Schemas are organized by OpenAPI version:
 * - openapi-3.0-* : OpenAPI 3.0.x schemas
 * - openapi-3.1-* : OpenAPI 3.1.x schemas
 * - openapi-3.2-* : OpenAPI 3.2.x schemas
 *
 * @module lsp/services/shared/schema-cache
 */

// Telescope Config Schema
import { TelescopeConfigSchema } from "../../../engine/schemas/config-schema.js";
// OpenAPI 3.0 Schemas
import {
	Callback30Schema,
	Components30Schema,
	Example30Schema,
	Header30Schema,
	Link30Schema,
	OpenAPI30Schema,
	Operation30Schema,
	Parameter30Schema,
	PathItem30Schema,
	RequestBody30Schema,
	Response30Schema,
	SchemaObject30Schema,
	SecurityScheme30Schema,
} from "../../../engine/schemas/openapi-3.0-module.js";
// OpenAPI 3.1 Schemas
import {
	Callback31Schema,
	Components31Schema,
	Example31Schema,
	Header31Schema,
	Link31Schema,
	OpenAPI31Schema,
	Operation31Schema,
	Parameter31Schema,
	PathItem31Schema,
	RequestBody31Schema,
	Response31Schema,
	SchemaObject31Schema,
	SecurityScheme31Schema,
} from "../../../engine/schemas/openapi-3.1-module.js";
// OpenAPI 3.2 Schemas
import {
	Callback32Schema,
	Components32Schema,
	Example32Schema,
	Header32Schema,
	Link32Schema,
	OpenAPI32Schema,
	Operation32Schema,
	Parameter32Schema,
	PathItem32Schema,
	RequestBody32Schema,
	Response32Schema,
	SchemaObject32Schema,
	SecurityScheme32Schema,
} from "../../../engine/schemas/openapi-3.2-module.js";

// ============================================================================
// Schema Metadata
// ============================================================================

/**
 * Metadata for each schema: human-readable title and the TypeBox schema.
 * This is the single source of truth for all built-in schemas.
 *
 * Organized by OpenAPI version for proper language service support.
 */
const SCHEMA_METADATA: Record<string, { title: string; schema: unknown }> = {
	// =========================================================================
	// OpenAPI 3.0 Schemas
	// =========================================================================
	"openapi-3.0-root": {
		title: "OpenAPI 3.0 Document",
		schema: OpenAPI30Schema,
	},
	"openapi-3.0-path-item": {
		title: "Path Item Object (3.0)",
		schema: PathItem30Schema,
	},
	"openapi-3.0-operation": {
		title: "Operation Object (3.0)",
		schema: Operation30Schema,
	},
	"openapi-3.0-components": {
		title: "Components Object (3.0)",
		schema: Components30Schema,
	},
	"openapi-3.0-schema": {
		title: "Schema Object (3.0)",
		schema: SchemaObject30Schema,
	},
	"openapi-3.0-parameter": {
		title: "Parameter Object (3.0)",
		schema: Parameter30Schema,
	},
	"openapi-3.0-response": {
		title: "Response Object (3.0)",
		schema: Response30Schema,
	},
	"openapi-3.0-request-body": {
		title: "Request Body Object (3.0)",
		schema: RequestBody30Schema,
	},
	"openapi-3.0-header": {
		title: "Header Object (3.0)",
		schema: Header30Schema,
	},
	"openapi-3.0-security-scheme": {
		title: "Security Scheme Object (3.0)",
		schema: SecurityScheme30Schema,
	},
	"openapi-3.0-example": {
		title: "Example Object (3.0)",
		schema: Example30Schema,
	},
	"openapi-3.0-link": {
		title: "Link Object (3.0)",
		schema: Link30Schema,
	},
	"openapi-3.0-callback": {
		title: "Callback Object (3.0)",
		schema: Callback30Schema,
	},

	// =========================================================================
	// OpenAPI 3.1 Schemas
	// =========================================================================
	"openapi-3.1-root": {
		title: "OpenAPI 3.1 Document",
		schema: OpenAPI31Schema,
	},
	"openapi-3.1-path-item": {
		title: "Path Item Object (3.1)",
		schema: PathItem31Schema,
	},
	"openapi-3.1-operation": {
		title: "Operation Object (3.1)",
		schema: Operation31Schema,
	},
	"openapi-3.1-components": {
		title: "Components Object (3.1)",
		schema: Components31Schema,
	},
	"openapi-3.1-schema": {
		title: "Schema Object (3.1)",
		schema: SchemaObject31Schema,
	},
	"openapi-3.1-parameter": {
		title: "Parameter Object (3.1)",
		schema: Parameter31Schema,
	},
	"openapi-3.1-response": {
		title: "Response Object (3.1)",
		schema: Response31Schema,
	},
	"openapi-3.1-request-body": {
		title: "Request Body Object (3.1)",
		schema: RequestBody31Schema,
	},
	"openapi-3.1-header": {
		title: "Header Object (3.1)",
		schema: Header31Schema,
	},
	"openapi-3.1-security-scheme": {
		title: "Security Scheme Object (3.1)",
		schema: SecurityScheme31Schema,
	},
	"openapi-3.1-example": {
		title: "Example Object (3.1)",
		schema: Example31Schema,
	},
	"openapi-3.1-link": {
		title: "Link Object (3.1)",
		schema: Link31Schema,
	},
	"openapi-3.1-callback": {
		title: "Callback Object (3.1)",
		schema: Callback31Schema,
	},

	// =========================================================================
	// OpenAPI 3.2 Schemas
	// =========================================================================
	"openapi-3.2-root": {
		title: "OpenAPI 3.2 Document",
		schema: OpenAPI32Schema,
	},
	"openapi-3.2-path-item": {
		title: "Path Item Object (3.2)",
		schema: PathItem32Schema,
	},
	"openapi-3.2-operation": {
		title: "Operation Object (3.2)",
		schema: Operation32Schema,
	},
	"openapi-3.2-components": {
		title: "Components Object (3.2)",
		schema: Components32Schema,
	},
	"openapi-3.2-schema": {
		title: "Schema Object (3.2)",
		schema: SchemaObject32Schema,
	},
	"openapi-3.2-parameter": {
		title: "Parameter Object (3.2)",
		schema: Parameter32Schema,
	},
	"openapi-3.2-response": {
		title: "Response Object (3.2)",
		schema: Response32Schema,
	},
	"openapi-3.2-request-body": {
		title: "Request Body Object (3.2)",
		schema: RequestBody32Schema,
	},
	"openapi-3.2-header": {
		title: "Header Object (3.2)",
		schema: Header32Schema,
	},
	"openapi-3.2-security-scheme": {
		title: "Security Scheme Object (3.2)",
		schema: SecurityScheme32Schema,
	},
	"openapi-3.2-example": {
		title: "Example Object (3.2)",
		schema: Example32Schema,
	},
	"openapi-3.2-link": {
		title: "Link Object (3.2)",
		schema: Link32Schema,
	},
	"openapi-3.2-callback": {
		title: "Callback Object (3.2)",
		schema: Callback32Schema,
	},

	// =========================================================================
	// Telescope Config
	// =========================================================================
	"telescope-config": {
		title: "Telescope Configuration",
		schema: TelescopeConfigSchema,
	},
};

// ============================================================================
// Schema Transformation
// ============================================================================

/**
 * Transform a TypeBox Module schema into a standard JSON Schema format.
 *
 * TypeBox Type.Module() generates:
 * { "$defs": { "MainType": {...}, "SubType": {...} }, "$ref": "MainType" }
 *
 * This transforms it to:
 * { "$id": "...", "title": "...", "type": "object", ..., "$defs": {...} }
 *
 * @param schema - The TypeBox schema to transform
 * @param schemaKey - The schema key (e.g., "openapi-3.1-root")
 * @param title - Human-readable title for the schema
 * @returns Transformed JSON Schema with $id, title, and inlined main definition
 */
function transformSchema(
	schema: Record<string, unknown>,
	schemaKey: string,
	title: string,
): Record<string, unknown> {
	const $defs = schema.$defs as Record<string, unknown> | undefined;
	const $ref = schema.$ref as string | undefined;

	// If schema has $defs and root $ref, inline the main definition at root
	if ($defs && $ref && $defs[$ref]) {
		const mainDef = $defs[$ref] as Record<string, unknown>;
		// Remove the inner $id from the main definition (we set it at root level)
		const { $id: _innerId, ...rest } = mainDef;

		return {
			$id: `telescope://${schemaKey}`,
			title,
			...rest,
			$defs, // Keep $defs for internal $ref resolution
		};
	}

	// Otherwise just add $id and title at root
	return {
		$id: `telescope://${schemaKey}`,
		title,
		...schema,
	};
}

// ============================================================================
// Pre-computed Cache
// ============================================================================

/**
 * Pre-computed cache of transformed JSON Schemas.
 * Populated at module load time for O(1) lookups.
 */
const schemaCache = new Map<string, Record<string, unknown>>();

// Build cache once at module initialization
for (const [key, { title, schema }] of Object.entries(SCHEMA_METADATA)) {
	const transformed = transformSchema(
		schema as Record<string, unknown>,
		key,
		title,
	);
	schemaCache.set(key, transformed);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a pre-computed JSON Schema by its key.
 *
 * The schema is already transformed with:
 * - $id: telescope://{schemaKey}
 * - title: Human-readable name
 * - Main definition inlined at root
 * - $defs preserved for internal references
 *
 * @param schemaKey - The schema key (e.g., "openapi-3.1-root", "telescope-config")
 * @returns The transformed JSON Schema, or undefined if not found
 */
export function getCachedSchema(
	schemaKey: string,
): Record<string, unknown> | undefined {
	return schemaCache.get(schemaKey);
}

/**
 * Get the original TypeBox schema by its key.
 *
 * Use this for TypeBox Value module validation (Check, Parse, Errors).
 * The original schema is not transformed.
 *
 * @param schemaKey - The schema key (e.g., "openapi-3.1-root", "telescope-config")
 * @returns The original TypeBox schema, or undefined if not found
 */
export function getTypeBoxSchema(schemaKey: string): unknown | undefined {
	return SCHEMA_METADATA[schemaKey]?.schema;
}

/**
 * Check if a schema key exists in the cache.
 *
 * @param schemaKey - The schema key to check
 * @returns true if the schema exists
 */
export function hasSchema(schemaKey: string): boolean {
	return schemaCache.has(schemaKey);
}

/**
 * Get all available schema keys.
 *
 * @returns Array of all schema keys
 */
export function getSchemaKeys(): string[] {
	return Array.from(schemaCache.keys());
}

/**
 * Generate a version-specific schema key from document type and OpenAPI version.
 *
 * @param docType - The document type (e.g., "root", "operation", "schema")
 * @param version - The OpenAPI version string (e.g., "3.0", "3.1", "3.2")
 * @returns The versioned schema key (e.g., "openapi-3.1-root")
 */
export function getVersionedSchemaKey(
	docType: string,
	version: string,
): string {
	// Normalize version to major.minor format
	const normalizedVersion = normalizeVersion(version);
	return `openapi-${normalizedVersion}-${docType}`;
}

/**
 * Normalize an OpenAPI version string to major.minor format.
 *
 * @param version - Full version string (e.g., "3.1.0", "3.2.1")
 * @returns Normalized version (e.g., "3.1", "3.2")
 */
function normalizeVersion(version: string): string {
	// Extract major.minor from version string
	const match = version.match(/^(\d+\.\d+)/);
	if (match) {
		const majorMinor = match[1];
		// Ensure we support this version
		if (majorMinor === "3.0" || majorMinor === "3.1" || majorMinor === "3.2") {
			return majorMinor;
		}
	}
	// Default to 3.1 for unknown versions
	return "3.1";
}

/**
 * Get all supported OpenAPI versions.
 *
 * @returns Array of supported version strings
 */
export function getSupportedVersions(): string[] {
	return ["3.0", "3.1", "3.2"];
}
