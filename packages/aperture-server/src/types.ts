import type {
	LanguageServiceContext,
	VirtualCode,
} from "@volar/language-service";
import type { TSchema } from "typebox";
import type { TextDocument } from "vscode-languageserver-textdocument";

// ============================================================================
// Custom LSP Protocol Types
// ============================================================================

/**
 * Parameters for the aperture/setOpenAPIFiles request.
 * Sent from client to server after workspace scan to communicate discovered files.
 */
export interface SetOpenAPIFilesParams {
	/** Array of file URIs classified as OpenAPI documents */
	files: string[];
}

/**
 * Parameters for the aperture/notifyFileChange notification.
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
	/** Optional TypeBox schema for validation */
	typeBoxSchema?: TSchema;
}

/**
 * Schema configuration format expected by language servers.
 * Includes optional TypeBox schema (which IS JSON Schema).
 */
export interface SchemaConfiguration {
	uri: string;
	fileMatch?: string[];
	schema?: Record<string, unknown>;
	folderUri?: string;
	/** Optional TypeBox schema (also serves as JSON Schema) */
	typeBoxSchema?: TSchema;
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
