import type { LanguageServiceContext, VirtualCode } from "@volar/language-service";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { z } from "zod";

export interface ParsedContent extends VirtualCode {
	parsedObject: unknown;
	ast: unknown;
	type: "json" | "yaml";
}

export interface ValidationRule {
	id: string;
	label: string;
	patterns: string[];
	jsonSchema?: Record<string, unknown>;
	zodSchema?: z.ZodType<unknown>;
}

/**
 * Schema configuration format expected by language servers.
 */
export interface SchemaConfiguration {
	uri: string;
	fileMatch?: string[];
	schema?: Record<string, unknown>;
	folderUri?: string;
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
