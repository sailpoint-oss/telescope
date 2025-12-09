/**
 * Schema Registry - TypeBox OpenAPI JSON Schemas.
 *
 * All schemas are generated from the consolidated TypeBox OpenAPI module,
 * which produces compact JSON Schemas with proper $defs and $ref usage.
 *
 * The consolidated module generates ~26KB schemas (vs 2.3MB with separate files),
 * preventing stack overflow during validation of large OpenAPI documents.
 *
 * Architecture:
 * - Raw TypeBox schemas exported here for yaml-language-server's addSchema()
 * - Pre-computed, transformed schemas are in schema-cache.ts for language service providers
 * - ApertureVolarContext.getSchemaByKey() uses the cache for properly formatted schemas
 * - The resolveDocumentContext utility helps extract VirtualCode and schemaKey
 *
 * @see schema-cache.ts for pre-computed schemas with $id and title
 */

import type { LanguageServiceContext } from "@volar/language-service";
import type { TSchema } from "typebox";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import {
	CallbackSchema,
	ComponentsSchema,
	ExampleSchema,
	HeaderSchema,
	LinkSchema,
	OpenAPISchema,
	OperationSchema,
	ParameterSchema,
	PathItemSchema,
	RequestBodySchema,
	ResponseSchema,
	SchemaObjectSchema,
	SecuritySchemeSchema,
	TelescopeConfigSchema,
} from "../../../engine/schemas/index.js";
import type { DocumentType } from "../../../engine/utils/document-type-utils.js";
import type { DataVirtualCode } from "../../languages/virtualCodes/data-virtual-code.js";
import type { ApertureVolarContext } from "../../workspace/context.js";

// ============================================================================
// Schema Constants
// ============================================================================

/**
 * JSON Schema for Telescope config files.
 * TypeBox schemas ARE JSON Schema - no conversion needed.
 */
export const configJsonSchema = TelescopeConfigSchema;

/**
 * TypeBox schema for Telescope config files.
 * Used for validation via TypeBox Value module.
 */
export const configTypeBoxSchema = TelescopeConfigSchema;

/**
 * Map of OpenAPI document types to their raw TypeBox JSON Schemas.
 * All schemas come from the consolidated TypeBox module with proper $defs.
 *
 * NOTE: These are raw TypeBox schemas without $id/title transformation.
 * For language service providers (hover, completion), use getCachedSchema()
 * from schema-cache.ts instead.
 *
 * Used by:
 * - yaml-language-server's addSchema() for schema registration
 * - TypeBox Value module for runtime validation
 */
export const openapiJsonSchemas: Partial<Record<DocumentType, unknown>> = {
	root: OpenAPISchema,
	"path-item": PathItemSchema,
	operation: OperationSchema,
	components: ComponentsSchema,
	schema: SchemaObjectSchema,
	parameter: ParameterSchema,
	response: ResponseSchema,
	"request-body": RequestBodySchema,
	header: HeaderSchema,
	"security-scheme": SecuritySchemeSchema,
	example: ExampleSchema,
	link: LinkSchema,
	callback: CallbackSchema,
	// "json-schema" and "unknown" intentionally omitted - no schema provided
};

/**
 * Map of OpenAPI document types to their TypeBox schemas.
 * Used for TypeScript type inference and Value module validation.
 */
export const openapiTypeBoxSchemas: Partial<Record<DocumentType, TSchema>> = {
	root: OpenAPISchema,
	"path-item": PathItemSchema,
	operation: OperationSchema,
	components: ComponentsSchema,
	schema: SchemaObjectSchema,
	parameter: ParameterSchema,
	response: ResponseSchema,
	"request-body": RequestBodySchema,
	header: HeaderSchema,
	"security-scheme": SecuritySchemeSchema,
	example: ExampleSchema,
	link: LinkSchema,
	callback: CallbackSchema,
	// "json-schema" and "unknown" intentionally omitted - no schema provided
};

// ============================================================================
// Schema Lookup Functions
// ============================================================================

/**
 * Get the JSON Schema for a given OpenAPI document type.
 * Returns undefined if no schema is available for that type.
 */
export function getSchemaForDocumentType(
	docType: DocumentType,
): unknown | undefined {
	return openapiJsonSchemas[docType];
}

/**
 * Get the TypeBox schema for a given OpenAPI document type.
 * Returns undefined if no schema is available for that type.
 *
 * TypeBox schemas can be used with the Value module for validation.
 */
export function getTypeBoxSchemaForDocumentType(
	docType: DocumentType,
): TSchema | undefined {
	return openapiTypeBoxSchemas[docType];
}

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Type alias for JSON Schema objects.
 * TypeBox schemas ARE JSON Schema-compliant, but TypeScript's structural
 * typing requires explicit conversion when passing to APIs expecting plain objects.
 */
export type JsonSchemaObject = Record<string, unknown>;

/**
 * Convert a TypeBox schema to a plain JSON Schema object.
 * TypeBox schemas are inherently JSON Schema-compliant (they serialize to valid JSON Schema),
 * but TypeScript requires explicit casting due to TypeBox's complex generic types.
 *
 * @param schema - A TypeBox TSchema
 * @returns The same schema as a plain JSON Schema object
 */
export function toJsonSchema(schema: TSchema): JsonSchemaObject {
	// TypeBox schemas are JSON Schema at runtime - this is a type-level cast only
	return schema as unknown as JsonSchemaObject;
}

// ============================================================================
// VirtualCode Resolution Utilities
// ============================================================================

/**
 * Result of resolving a document's virtual code and URI context.
 */
export interface ResolvedDocumentContext {
	/** The source URI (decoded from embedded URI) */
	sourceUri: URI;
	/** The source URI as string */
	sourceUriString: string;
	/** The embedded code ID */
	embeddedCodeId: string;
	/** The resolved virtual code */
	virtualCode: DataVirtualCode;
}

// ============================================================================
// Shared Schema Registration
// ============================================================================

/**
 * Common schema URI prefix for telescope schemas.
 * Used by both JSON and YAML language services.
 */
export const TELESCOPE_SCHEMA_PREFIX = "telescope://";

/**
 * Get the list of built-in OpenAPI schema entries for registration.
 * Returns an array of { id, schema } entries that can be registered with
 * either yaml-language-server or vscode-json-languageservice.
 *
 * @returns Array of schema entries with id and schema
 *
 * @example
 * ```typescript
 * for (const { id, schema } of getBuiltInSchemaEntries()) {
 *   yamlLanguageService.addSchema(id, schema);
 * }
 * ```
 */
export function getBuiltInSchemaEntries(): Array<{
	id: string;
	schema: unknown;
}> {
	const entries: Array<{ id: string; schema: unknown }> = [];
	for (const [docType, schema] of Object.entries(openapiJsonSchemas)) {
		if (schema) {
			entries.push({
				id: `openapi-${docType}`,
				schema,
			});
		}
	}
	return entries;
}

/**
 * Build a schema request service function for resolving telescope:// URIs.
 * Used by vscode-json-languageservice to fetch schemas on demand.
 *
 * @param shared - The ApertureVolarContext for schema lookup
 * @param logger - Optional logger for debugging
 * @returns A function that resolves schema URIs to schema content
 */
export function createSchemaRequestService(
	shared: ApertureVolarContext,
	logger?: { log: (msg: string) => void },
): (uri: string) => Promise<string> {
	return async (uri: string): Promise<string> => {
		// Handle telescope:// schema URIs
		if (uri.startsWith(TELESCOPE_SCHEMA_PREFIX)) {
			const schemaKey = uri.slice(TELESCOPE_SCHEMA_PREFIX.length);
			const schema = shared.getSchemaByKey(schemaKey);
			if (schema) {
				logger?.log(`[Schema Request] Resolved ${schemaKey}`);
				return JSON.stringify(schema);
			}
			logger?.log(`[Schema Request] Not found: ${schemaKey}`);
			return "{}";
		}

		// Fetch remote schemas
		try {
			const response = await fetch(uri);
			return await response.text();
		} catch {
			logger?.log(`[Schema Request] Failed to fetch: ${uri}`);
			return "{}";
		}
	};
}

// ============================================================================
// Document Context Resolution
// ============================================================================

/**
 * Resolve the virtual code and URI context for a document.
 *
 * This utility is used by language services to:
 * 1. Decode embedded document URIs
 * 2. Find the corresponding VirtualCode
 * 3. Access the schemaKey for schema resolution
 *
 * @param document - The text document
 * @param context - The Volar language service context
 * @param DataVirtualCodeClass - The DataVirtualCode class for instanceof checks
 * @returns The resolved context, or undefined if resolution fails
 *
 * @example
 * ```typescript
 * const resolved = resolveDocumentContext(document, context, DataVirtualCode);
 * if (resolved) {
 *   const schemaKey = resolved.virtualCode.schemaKey;
 *   // Use schemaKey to look up schema via shared.getSchemaByKey(schemaKey)
 * }
 * ```
 */
export function resolveDocumentContext(
	document: TextDocument,
	context: LanguageServiceContext,
	// biome-ignore lint/suspicious/noExplicitAny: Need to accept class constructor
	DataVirtualCodeClass: any,
): ResolvedDocumentContext | undefined {
	// Decode embedded URI to get source file and embedded code ID
	const parsedUri = URI.parse(document.uri);
	const decoded = context.decodeEmbeddedDocumentUri(parsedUri);
	if (!decoded) {
		return undefined;
	}

	const [sourceUri, embeddedCodeId] = decoded;
	const sourceUriString = sourceUri.toString();

	// Get virtual code - handle both root and embedded cases
	// For generic files: embeddedCodeId = "root", use root
	// For OpenAPI embedded files: embeddedCodeId = "format", use embeddedCodes.get("format")
	const sourceScript = context.language.scripts.get(sourceUri);
	if (!sourceScript?.generated) {
		return undefined;
	}

	let virtualCode: unknown;

	if (embeddedCodeId === "root") {
		// For root documents, get the root virtual code
		virtualCode = sourceScript.generated.root;
	} else {
		// For embedded documents, try the Map lookup first
		virtualCode = sourceScript.generated.embeddedCodes.get(embeddedCodeId);

		// If Map lookup fails, fall back to searching the root's embeddedCodes array
		// This handles cases where Volar's internal Map doesn't have the expected ID
		if (!virtualCode && sourceScript.generated.root?.embeddedCodes) {
			const rootEmbeddedCodes = sourceScript.generated.root.embeddedCodes;
			for (const code of rootEmbeddedCodes) {
				if (code.id === embeddedCodeId) {
					virtualCode = code;
					break;
				}
			}
		}
	}

	if (!virtualCode || !(virtualCode instanceof DataVirtualCodeClass)) {
		return undefined;
	}

	return {
		sourceUri,
		sourceUriString,
		embeddedCodeId,
		virtualCode: virtualCode as DataVirtualCode,
	};
}
