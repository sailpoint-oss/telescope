import type {
	LanguageServiceContext,
	VirtualCode,
} from "@volar/language-service";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { z } from "zod/v4";

// ============================================================================
// Custom LSP Protocol Types
// ============================================================================

/**
 * Parameters for the telescope/setOpenAPIFiles request.
 * Sent from client to server after workspace scan to communicate discovered files.
 */
export interface SetOpenAPIFilesParams {
	/** Array of file URIs classified as OpenAPI documents */
	files: string[];
}

/**
 * Parameters for the telescope/notifyFileChange notification.
 * Sent from client to server when files change outside of normal LSP events.
 */
export interface NotifyFileChangeParams {
	/** File URI that changed */
	uri: string;
	/** Type of change */
	type: "created" | "changed" | "deleted";
}

// ============================================================================
// Virtual Code Types
// ============================================================================

export interface ParsedContent extends VirtualCode {
	parsedObject: unknown;
	ast: unknown;
	type: "json" | "yaml";
}

export interface ValidationRule {
	id: string;
	label: string;
	patterns: string[];
	jsonSchema: Record<string, unknown>;
	/** Optional Zod schema for validation */
	zodSchema?: z.ZodType;
}

/**
 * Schema configuration format expected by language servers.
 * Includes optional Zod schema (convertible to JSON Schema via z.toJSONSchema()).
 */
export interface SchemaConfiguration {
	uri: string;
	fileMatch?: string[];
	schema?: Record<string, unknown>;
	folderUri?: string;
	/** Optional Zod schema (can be converted to JSON Schema) */
	zodSchema?: z.ZodType;
}

/**
 * Function type for resolving schemas for a document.
 */
export type SchemaResolver = (
	document: TextDocument,
	context?: LanguageServiceContext,
) =>
	| SchemaConfiguration[]
	| undefined
	| Promise<SchemaConfiguration[] | undefined>;
