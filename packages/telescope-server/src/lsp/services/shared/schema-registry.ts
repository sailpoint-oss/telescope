/**
 * Schema Registry - Telescope Schema Registration Utilities.
 *
 * This module provides utilities for registering and resolving schemas
 * in the YAML and JSON language services.
 *
 * Architecture:
 * - Version-specific schemas are served from schema-cache.ts
 * - getBuiltInSchemaEntries() uses the cache for consistent registration
 * - telescopeVolarContext.getSchemaByKey() uses the cache for properly formatted schemas
 * - The resolveDocumentContext utility helps extract VirtualCode and schemaKey
 *
 * @see schema-cache.ts for pre-computed schemas with $id and title
 */

import type { LanguageServiceContext } from "@volar/language-service";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { TelescopeConfigSchema } from "../../../engine/schemas/index.js";
import type { DataVirtualCode } from "../../languages/virtualCodes/data-virtual-code.js";
import type { telescopeVolarContext } from "../../workspace/context.js";
import { getAllSchemaEntries } from "./schema-cache.js";

/**
 * Type for a class constructor that produces DataVirtualCode instances.
 * Used for instanceof checks in resolveDocumentContext.
 */
type DataVirtualCodeConstructor = new (...args: unknown[]) => DataVirtualCode;

// ============================================================================
// Schema Constants
// ============================================================================

/**
 * Zod schema for Telescope config files.
 * Used for validation via Zod safeParse.
 */
export const configZodSchema = TelescopeConfigSchema;

// Backwards compatibility alias
export const configTypeBoxSchema = TelescopeConfigSchema;
export const configJsonSchema = TelescopeConfigSchema;

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Type alias for JSON Schema objects.
 */
export type JsonSchemaObject = Record<string, unknown>;

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
 * Uses version-specific schemas from schema-cache.ts:
 * - openapi-3.0-root, openapi-3.0-schema, etc.
 * - openapi-3.1-root, openapi-3.1-schema, etc.
 * - openapi-3.2-root, openapi-3.2-schema, etc.
 * - telescope-config
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
	// Use version-specific schemas from the cache
	// This ensures schema IDs match what DataVirtualCode.schemaKey produces
	return getAllSchemaEntries();
}

/**
 * Build a schema request service function for resolving telescope:// URIs.
 * Used by vscode-json-languageservice to fetch schemas on demand.
 *
 * @param shared - The telescopeVolarContext for schema lookup
 * @param logger - Optional logger for debugging
 * @returns A function that resolves schema URIs to schema content
 */
export function createSchemaRequestService(
	shared: telescopeVolarContext,
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
		// Note: global fetch requires Node.js 18+ (available in VS Code's Electron)
		if (typeof fetch === "undefined") {
			logger?.log(
				`[Schema Request] fetch not available (requires Node.js 18+): ${uri}`,
			);
			return "{}";
		}
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
	DataVirtualCodeClass: DataVirtualCodeConstructor,
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
