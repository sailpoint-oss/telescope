export type MessageType =
	| "loadRules"
	| "loadResponse"
	| "runRules"
	| "ruleResult"
	| "ruleError"
	| "runSpectral"
	| "spectralResult"
	| "runZod"
	| "zodResult"
	| "ready"
	| "health"
	| "healthResponse"
	| "ping"
	| "pong"
	| "shutdown";

export interface Envelope {
	id: string;
	type: MessageType;
	payload?: unknown;
}

export interface RuleConfig {
	id: string;
	path: string;
	kind: "openapi" | "generic" | "schema";
	severity?: string;
	patterns?: string[];
	options?: Record<string, unknown>;
}

export interface LoadRulesRequest {
	rules: RuleConfig[];
	workDir: string;
}

export interface SerializedRange {
	startLine: number;
	startChar: number;
	endLine: number;
	endChar: number;
}

export interface SerializedDoc {
	uri: string;
	ast: Record<string, unknown>;
	rawText: string;
	format: string;
	version: string;
	pointers: Record<string, [number, number, number, number]>;
}

export interface SerializedProjectIndex {
	operationIds: Record<string, string[]>;
	componentRefs: Record<string, string[]>;
	tags: Record<string, string[]>;
}

export interface RunRulesRequest {
	documentURI: string;
	ruleIDs: string[];
	document: SerializedDoc;
	project: SerializedProjectIndex;
}

export interface SerializedDiagnostic {
	startLine: number;
	startChar: number;
	endLine: number;
	endChar: number;
	severity: number;
	code: string;
	message: string;
	source: string;
}

export interface RuleRunError {
	ruleID: string;
	error: string;
	phase: string;
}

export interface LoadedRule {
	config: RuleConfig;
	rule: unknown;
	kind: "openapi" | "generic" | "schema";
}

export interface RunSpectralRequest {
	documentURI: string;
	document: SerializedDoc;
	rulesetPaths: string[];
}

export interface RunZodRequest {
	documentURI: string;
	document: SerializedDoc;
	schemas: ZodSchemaConfig[];
}

export interface ZodSchemaConfig {
	schemaPath: string;
	pointers?: string[];
}
