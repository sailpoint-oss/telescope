/**
 * Schema Cache - Pre-computed JSON Schemas for Language Services
 *
 * This module transforms Zod schemas into properly structured JSON Schemas
 * at module load time, providing O(1) lookups for language services.
 *
 * Zod's z.toJSONSchema() generates schemas with proper $defs and refs,
 * and the .meta() and .describe() methods provide title and description.
 *
 * Schemas are organized by OpenAPI version:
 * - openapi-2.0-* : OpenAPI 2.0 (Swagger 2.0) schemas
 * - openapi-3.0-* : OpenAPI 3.0.x schemas
 * - openapi-3.1-* : OpenAPI 3.1.x schemas
 * - openapi-3.2-* : OpenAPI 3.2.x schemas
 *
 * @module lsp/services/shared/schema-cache
 */

import { z } from "zod";

/** @deprecated No longer needed -- Zod schemas now natively allow x-* extensions via looseObject */
function stripXExtensions(value: unknown): unknown {
	return value;
}

// Telescope Config Schema
import { TelescopeConfigSchema } from "../../../engine/schemas/config-schema.js";
// OpenAPI 2.0 Schemas
import {
	OpenAPI2Schema,
	Operation2Schema,
	Parameter2Schema,
	PathItem2Schema,
	Response2Schema,
	SchemaObject2Schema,
} from "../../../engine/schemas/openapi-2.0-module.js";
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
import { OpenAPI32Schema } from "../../../engine/schemas/index.js";

// ============================================================================
// Schema Metadata
// ============================================================================

/**
 * Metadata for each schema: human-readable title and the Zod schema.
 * This is the single source of truth for all built-in schemas.
 *
 * Organized by OpenAPI version for proper language service support.
 */
const SCHEMA_METADATA: Record<string, { title: string; schema: z.ZodType }> = {
	// =========================================================================
	// OpenAPI 2.0 Schemas (Swagger 2.0)
	// =========================================================================
	"openapi-2.0-root": {
		title: "OpenAPI 2.0 Document (Swagger 2.0)",
		schema: OpenAPI2Schema,
	},
	"openapi-2.0-path-item": {
		title: "Path Item Object (2.0)",
		schema: PathItem2Schema,
	},
	"openapi-2.0-operation": {
		title: "Operation Object (2.0)",
		schema: Operation2Schema,
	},
	"openapi-2.0-schema": {
		title: "Schema Object (2.0)",
		schema: SchemaObject2Schema,
	},
	"openapi-2.0-parameter": {
		title: "Parameter Object (2.0)",
		schema: Parameter2Schema,
	},
	"openapi-2.0-response": {
		title: "Response Object (2.0)",
		schema: Response2Schema,
	},

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
		schema: PathItem31Schema,
	},
	"openapi-3.2-operation": {
		title: "Operation Object (3.2)",
		schema: Operation31Schema,
	},
	"openapi-3.2-components": {
		title: "Components Object (3.2)",
		schema: Components31Schema,
	},
	"openapi-3.2-schema": {
		title: "Schema Object (3.2)",
		schema: SchemaObject31Schema,
	},
	"openapi-3.2-parameter": {
		title: "Parameter Object (3.2)",
		schema: Parameter31Schema,
	},
	"openapi-3.2-response": {
		title: "Response Object (3.2)",
		schema: Response31Schema,
	},
	"openapi-3.2-request-body": {
		title: "Request Body Object (3.2)",
		schema: RequestBody31Schema,
	},
	"openapi-3.2-header": {
		title: "Header Object (3.2)",
		schema: Header31Schema,
	},
	"openapi-3.2-security-scheme": {
		title: "Security Scheme Object (3.2)",
		schema: SecurityScheme31Schema,
	},
	"openapi-3.2-example": {
		title: "Example Object (3.2)",
		schema: Example31Schema,
	},
	"openapi-3.2-link": {
		title: "Link Object (3.2)",
		schema: Link31Schema,
	},
	"openapi-3.2-callback": {
		title: "Callback Object (3.2)",
		schema: Callback31Schema,
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
 * Transform a Zod schema into a standard JSON Schema format using z.toJSONSchema().
 *
 * Zod's toJSONSchema() automatically:
 * - Generates proper $defs for reused schemas
 * - Uses correct JSON Pointer refs (#/$defs/Name)
 * - Includes title from .meta({ title: "..." })
 * - Includes description from .describe("...")
 *
 * @param zodSchema - The Zod schema to transform
 * @param schemaKey - The schema key (e.g., "openapi-3.1-root")
 * @param title - Human-readable title for the schema (fallback if not in meta)
 * @returns Transformed JSON Schema with $id
 */
function transformSchema(
	zodSchema: z.ZodType,
	schemaKey: string,
	title: string,
): Record<string, unknown> {
	// Use Zod v4's built-in toJSONSchema
	const jsonSchema = z.toJSONSchema(zodSchema, {
		target: "draft-2020-12",
		reused: "ref", // Extract reused schemas to $defs with proper #/$defs/ refs
		unrepresentable: "any", // Use "any" for z.any() types
	}) as Record<string, unknown>;

	// Add $id and ensure title is set
	return {
		$id: `telescope://${schemaKey}`,
		title: (jsonSchema.title as string) || title,
		...jsonSchema,
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
	const transformed = transformSchema(schema, key, title);
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
 * - title: Human-readable name (from .meta() or fallback)
 * - description: From .describe()
 * - $defs: For reused type definitions
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
 * Get the original Zod schema by its key.
 *
 * Use this for Zod validation (safeParse, parse).
 * The original schema is not transformed.
 *
 * @param schemaKey - The schema key (e.g., "openapi-3.1-root", "telescope-config")
 * @returns The original Zod schema, or undefined if not found
 */
export function getZodSchema(schemaKey: string): z.ZodType | undefined {
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
 * Get all schema entries for registration with language services.
 *
 * This is used by yaml-language-server and json-language-server to
 * register all built-in schemas via addSchema().
 *
 * @returns Array of { id, schema } entries
 *
 * @example
 * ```typescript
 * for (const { id, schema } of getAllSchemaEntries()) {
 *   yamlLanguageService.addSchema(id, schema);
 * }
 * ```
 */
export function getAllSchemaEntries(): Array<{
	id: string;
	schema: Record<string, unknown>;
}> {
	return Array.from(schemaCache.entries()).map(([id, schema]) => ({
		id,
		schema,
	}));
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
	return "3.1";
}

/**
 * Get all supported OpenAPI versions.
 *
 * @returns Array of supported version strings
 */
export function getSupportedVersions(): string[] {
	return ["2.0", "3.0", "3.1", "3.2"];
}
