import type { ProjectIndex, RefGraph, Resolver, RootResolver } from "indexer";
import type { ParsedDocument, Range } from "loader";

export interface Diagnostic {
	ruleId: string;
	message: string;
	uri: string;
	range: Range;
	severity: "error" | "warning" | "info";
	link?: string;
	related?: {
		uri: string;
		range: Range;
		message?: string;
	}[];
	suggest?: Array<{ title: string; fix: FilePatch | FilePatch[] }>;
}

export interface FilePatch {
	uri: string;
	ops: Array<
		| { op: "add"; path: string; value: unknown }
		| { op: "remove"; path: string }
		| { op: "replace"; path: string; value: unknown }
	>;
}

export interface ProjectContext {
	docs: Map<string, ParsedDocument>;
	index: ProjectIndex;
	resolver: Resolver;
	graph: RefGraph;
	rootResolver: RootResolver;
	version: string;
}

export interface ScopeLocator {
	getScopeContext(
		uri: string,
		pointer: string,
	): import("indexer").ScopeContext | null;
}

export type DiagnosticInput = Omit<Diagnostic, "ruleId"> & {
	ruleId?: string; // Optional, will be auto-filled from rule metadata if not provided
};

export interface RuleContext {
	project: ProjectContext;
	file: { uri: string; document: ParsedDocument };
	report(diagnostic: DiagnosticInput): void;
	fix(patch: FilePatch | FilePatch[]): void;
	getScopeContext(
		uri: string,
		pointer: string,
	): import("indexer").ScopeContext | null;
	locate(uri: string, pointer: string): Range | null;
	/**
	 * Convert byte offsets in raw text to a Range (line/character positions).
	 * Useful for finding exact positions when working with raw text content.
	 */
	offsetToRange(
		uri: string,
		startOffset: number,
		endOffset?: number,
	): Range | null;
	/**
	 * Find the range of a key name in an object, given the parent pointer and key name.
	 * This searches backwards from the value's position to find the key name.
	 */
	findKeyRange(
		uri: string,
		parentPointer: string,
		keyName: string,
	): Range | null;
	/**
	 * Get root document URI(s) for the current file or a specific node.
	 * Returns empty array if no roots found, or [uri] if file is itself a root.
	 *
	 * @param uri - Optional URI (defaults to current file URI)
	 * @param pointer - Optional JSON pointer (defaults to document root "#")
	 * @returns Array of root document URIs
	 */
	getRootDocuments(uri?: string, pointer?: string): string[];
	/**
	 * Get the primary root document URI for the current file or a specific node.
	 * Returns null if not connected to any root.
	 *
	 * @param uri - Optional URI (defaults to current file URI)
	 * @param pointer - Optional JSON pointer (defaults to document root "#")
	 * @returns Primary root document URI, or null if not found
	 */
	getPrimaryRoot(uri?: string, pointer?: string): string | null;
}

export type Visitors = {
	Document?(node: { uri: string; pointer: string; node: unknown }): void;
	PathItem?(node: import("indexer").PathItemRef): void;
	Operation?(node: import("indexer").OperationRef): void;
	Component?(node: import("indexer").ComponentRef): void;
	Schema?(node: import("indexer").SchemaRef): void;
	Parameter?(node: import("indexer").ParameterRef): void;
	Response?(node: import("indexer").ResponseRef): void;
	RequestBody?(node: import("indexer").RequestBodyRef): void;
	Header?(node: import("indexer").HeaderRef): void;
	MediaType?(node: import("indexer").MediaTypeRef): void;
	SecurityRequirement?(node: import("indexer").SecurityRequirementRef): void;
	Example?(node: import("indexer").ExampleRef): void;
	Link?(node: import("indexer").LinkRef): void;
	Callback?(node: import("indexer").CallbackRef): void;
	Reference?(node: import("indexer").ReferenceRef): void;
};

export interface RuleMeta {
	id: string;
	number: number; // Rule number (e.g., 401, 402, etc.)
	docs: {
		description: string;
		recommended: boolean;
		url?: string;
	};
	type: "problem" | "suggestion" | "layout";
	schema?: unknown;
	fixable?: boolean;
	oas?: string[];
	contextRequirements?: {
		requiresRoot?: boolean; // Rule needs root document context
		requiresPaths?: boolean; // Rule needs paths section
		requiresComponents?: boolean; // Rule needs components section
		requiresSpecificSection?: string[]; // Custom section requirements (e.g., ["info", "security"])
	};
}

export interface Rule {
	meta: RuleMeta;
	create(ctx: RuleContext): Visitors;
}

export interface EngineRunOptions {
	rules: Rule[];
}

export interface EngineRunResult {
	diagnostics: Diagnostic[];
	fixes: FilePatch[];
}

export const defineRule = <T extends Rule>(rule: T): T => rule;
