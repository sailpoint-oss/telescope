/**
 * Rule Engine Execution Module
 *
 * This module is the core of the Telescope validation engine. It orchestrates
 * the execution of rules against OpenAPI documents by:
 *
 * 1. Creating rule contexts for each file
 * 2. Dispatching visitors for each OpenAPI element type
 * 3. Collecting diagnostics and fixes reported by rules
 *
 * The engine uses a visitor pattern where rules define callbacks for different
 * OpenAPI elements (operations, schemas, parameters, etc.). The engine traverses
 * the project index and invokes the appropriate callbacks.
 *
 * @module execution/runner
 *
 * @see {@link Rule} - The rule interface that defines check methods
 * @see {@link RuleContext} - The context object passed to rules
 * @see {@link ProjectContext} - The project data structure
 *
 * @example
 * ```typescript
 * import { runEngine, createRuleContext } from "telescope-server";
 *
 * const result = runEngine(projectContext, ["file:///api.yaml"], {
 *   rules: [myRule1, myRule2]
 * });
 *
 * for (const diagnostic of result.diagnostics) {
 *   console.log(`${diagnostic.ruleId}: ${diagnostic.message}`);
 * }
 * ```
 */

import type { CancellationToken } from "@volar/language-service";
import type { Range } from "vscode-languageserver-protocol";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import {
	enrichCallbackRef,
	enrichComponentRef,
	enrichExampleRef,
	enrichHeaderRef,
	enrichInfoRef,
	enrichLinkRef,
	enrichMediaTypeRef,
	enrichOperationRef,
	enrichParameterRef,
	enrichPathItemRef,
	enrichRequestBodyRef,
	enrichResponseRef,
	enrichRootRef,
	enrichSchemaRef,
	enrichTagRef,
} from "../indexes/ref-enrichment.js";
import type { SchemaLocation, SchemaRef } from "../indexes/types.js";
import { findNodeByPointer } from "../ir/context.js";
import type { Loc } from "../ir/types.js";
import type {
	Diagnostic,
	EngineRunOptions,
	EngineRunResult,
	FilePatch,
	OpenAPIVersion,
	ProjectContext,
	Rule,
	RuleContext,
	RuleFieldsDeclaration,
	VisitorFieldConstraints,
	VisitorName,
	Visitors,
} from "../rules/types.js";
import { buildLineOffsets, getLineCol } from "../utils/line-offset-utils.js";

// ============================================================================
// Schema Traversal Utility
// ============================================================================

/**
 * Generate all child schemas from a parent schema.
 *
 * This generator yields child SchemaRefs for all nested schema locations:
 * - properties (object schemas)
 * - items (array schemas)
 * - allOf, oneOf, anyOf (composition schemas)
 * - additionalProperties
 * - patternProperties
 *
 * Each child includes navigation context (parent, depth, location) to help
 * rules understand the schema's position in the hierarchy.
 *
 * @param schemaRef - The parent schema reference
 * @yields Child SchemaRef for each nested schema
 */
export function* walkSchemaChildren(
	schemaRef: SchemaRef,
): Generator<SchemaRef> {
	const schema = schemaRef.node as Record<string, unknown>;
	if (!schema || typeof schema !== "object") return;

	const currentDepth = schemaRef.depth ?? 0;
	const requiredList = Array.isArray(schema.required)
		? (schema.required as string[])
		: [];

	// Properties
	if (schema.properties && typeof schema.properties === "object") {
		const properties = schema.properties as Record<string, unknown>;
		for (const [name, propSchema] of Object.entries(properties)) {
			if (!propSchema || typeof propSchema !== "object") continue;
			yield {
				uri: schemaRef.uri,
				pointer: `${schemaRef.pointer}/properties/${name}`,
				node: propSchema,
				propertyName: name,
				isRequired: requiredList.includes(name),
				depth: currentDepth + 1,
				location: "properties",
				parent: schemaRef,
			};
		}
	}

	// Items
	if (schema.items && typeof schema.items === "object") {
		yield {
			uri: schemaRef.uri,
			pointer: `${schemaRef.pointer}/items`,
			node: schema.items,
			depth: currentDepth + 1,
			location: "items",
			parent: schemaRef,
		};
	}

	// Composition schemas (allOf, oneOf, anyOf)
	for (const comp of ["allOf", "oneOf", "anyOf"] as const) {
		const compArray = schema[comp];
		if (Array.isArray(compArray)) {
			for (let index = 0; index < compArray.length; index++) {
				const subSchema = compArray[index];
				if (!subSchema || typeof subSchema !== "object") continue;
				yield {
					uri: schemaRef.uri,
					pointer: `${schemaRef.pointer}/${comp}/${index}`,
					node: subSchema,
					depth: currentDepth + 1,
					location: comp as SchemaLocation,
					locationIndex: index,
					parent: schemaRef,
				};
			}
		}
	}

	// Additional properties
	if (
		schema.additionalProperties &&
		typeof schema.additionalProperties === "object" &&
		!Array.isArray(schema.additionalProperties)
	) {
		yield {
			uri: schemaRef.uri,
			pointer: `${schemaRef.pointer}/additionalProperties`,
			node: schema.additionalProperties,
			depth: currentDepth + 1,
			location: "additionalProperties",
			parent: schemaRef,
		};
	}

	// Pattern properties
	if (
		schema.patternProperties &&
		typeof schema.patternProperties === "object"
	) {
		const patternProps = schema.patternProperties as Record<string, unknown>;
		for (const [pattern, patternSchema] of Object.entries(patternProps)) {
			if (!patternSchema || typeof patternSchema !== "object") continue;
			// Escape special JSON pointer characters in pattern
			const escapedPattern = pattern.replace(/~/g, "~0").replace(/\//g, "~1");
			yield {
				uri: schemaRef.uri,
				pointer: `${schemaRef.pointer}/patternProperties/${escapedPattern}`,
				node: patternSchema,
				propertyName: pattern,
				depth: currentDepth + 1,
				location: "patternProperties",
				parent: schemaRef,
			};
		}
	}
}

/**
 * Get cached line offsets for a document, building them if needed.
 *
 * @param doc - The parsed document
 * @returns Array of byte offsets for each line start
 *
 * @internal
 */
function getLineOffsets(doc: {
	rawText: string;
	_lineOffsets?: number[];
}): number[] {
	if (!doc._lineOffsets) {
		doc._lineOffsets = buildLineOffsets(doc.rawText);
	}
	return doc._lineOffsets;
}

/**
 * Convert IR byte offsets (Loc) to LSP Range using line offsets.
 *
 * This internal helper transforms the byte-based location information from
 * the IR into line/character-based ranges that LSP clients expect.
 *
 * @param rawText - The raw source text of the document
 * @param loc - Location with start/end byte offsets
 * @param lineOffsets - Optional pre-computed line offsets for caching
 * @param options - Optional options for range conversion
 * @returns LSP Range with line/character positions (0-based)
 *
 * @internal
 */
function locToRange(
	rawText: string,
	loc: Loc,
	lineOffsets?: number[],
	options?: { preferKey?: boolean },
): Range {
	const offsets = lineOffsets ?? buildLineOffsets(rawText);

	// Use key range if preferKey and key offsets are available
	const start =
		options?.preferKey && loc.keyStart !== undefined ? loc.keyStart : loc.start;
	const end =
		options?.preferKey && loc.keyEnd !== undefined ? loc.keyEnd : loc.end;

	const startPos = getLineCol(start, offsets);
	const endPos = getLineCol(end, offsets);
	return {
		start: { line: startPos.line - 1, character: startPos.col - 1 },
		end: { line: endPos.line - 1, character: endPos.col - 1 },
	};
}

/**
 * Convert string severity to LSP DiagnosticSeverity enum.
 *
 * @param severity - String severity ("error", "warning", "info", "hint")
 * @returns LSP DiagnosticSeverity enum value
 *
 * @internal
 */
function severityToEnum(
	severity: "error" | "warning" | "info" | "hint" | undefined,
): DiagnosticSeverity {
	switch (severity) {
		case "error":
			return DiagnosticSeverity.Error;
		case "warning":
			return DiagnosticSeverity.Warning;
		case "info":
			return DiagnosticSeverity.Information;
		case "hint":
			return DiagnosticSeverity.Hint;
		default:
			return DiagnosticSeverity.Error;
	}
}

/**
 * Check if a field value is "present" (non-empty).
 * - Strings: non-empty after trim
 * - Arrays: length > 0
 * - Other: !== undefined
 *
 * @internal
 */
function isFieldPresent(value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (typeof value === "string") return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

/**
 * Generate visitors from a rule's `fields` declaration.
 *
 * This creates visitor functions that validate field presence based on
 * the required/suggested/recommended constraints in the declaration.
 *
 * @param fields - The fields declaration from a rule
 * @param ctx - The rule context for reporting
 * @returns Visitors object with generated field validation visitors
 *
 * @internal
 */
function generateFieldVisitors(
	fields: RuleFieldsDeclaration,
	ctx: RuleContext,
): Visitors {
	const visitors: Visitors = {};

	for (const [visitorName, constraints] of Object.entries(fields)) {
		const name = visitorName as VisitorName;
		const fieldConstraints = constraints as VisitorFieldConstraints;

		// Create a visitor that validates all declared fields
		const validateFields = (ref: {
			uri: string;
			pointer: string;
			node: unknown;
		}) => {
			const node = ref.node as Record<string, unknown> | null | undefined;
			if (!node || typeof node !== "object") return;

			// Check required fields (severity: error)
			if (fieldConstraints.required) {
				for (const [field, message] of Object.entries(
					fieldConstraints.required,
				)) {
					if (!isFieldPresent(node[field])) {
						ctx.reportAt(ref, field, { message, severity: "error" });
					}
				}
			}

			// Check suggested fields (severity: warning)
			if (fieldConstraints.suggested) {
				for (const [field, message] of Object.entries(
					fieldConstraints.suggested,
				)) {
					if (!isFieldPresent(node[field])) {
						ctx.reportAt(ref, field, { message, severity: "warning" });
					}
				}
			}

			// Check recommended fields (severity: info)
			if (fieldConstraints.recommended) {
				for (const [field, message] of Object.entries(
					fieldConstraints.recommended,
				)) {
					if (!isFieldPresent(node[field])) {
						ctx.reportAt(ref, field, { message, severity: "info" });
					}
				}
			}
		};

		// Assign the validator to the appropriate visitor
		switch (name) {
			case "Document":
				visitors.Document = validateFields;
				break;
			case "Root":
				visitors.Root = validateFields;
				break;
			case "Info":
				visitors.Info = validateFields;
				break;
			case "Tag":
				visitors.Tag = validateFields;
				break;
			case "PathItem":
				visitors.PathItem = validateFields;
				break;
			case "Operation":
				visitors.Operation = validateFields;
				break;
			case "Component":
				visitors.Component = validateFields;
				break;
			case "Schema":
				visitors.Schema = validateFields;
				break;
			case "Parameter":
				visitors.Parameter = validateFields;
				break;
			case "Response":
				visitors.Response = validateFields;
				break;
			case "RequestBody":
				visitors.RequestBody = validateFields;
				break;
			case "Header":
				visitors.Header = validateFields;
				break;
			case "MediaType":
				visitors.MediaType = validateFields;
				break;
			case "SecurityRequirement":
				visitors.SecurityRequirement = validateFields;
				break;
			case "Example":
				visitors.Example = validateFields;
				break;
			case "Link":
				visitors.Link = validateFields;
				break;
			case "Callback":
				visitors.Callback = validateFields;
				break;
			case "Reference":
				visitors.Reference = validateFields;
				break;
		}
	}

	return visitors;
}

/**
 * Merge two visitor objects, combining visitor functions when both define the same visitor.
 *
 * @internal
 */
function mergeVisitors(a: Visitors, b: Visitors): Visitors {
	const result: Visitors = { ...a };

	for (const [key, bFn] of Object.entries(b)) {
		const aFn = (a as Record<string, unknown>)[key];
		if (typeof aFn === "function" && typeof bFn === "function") {
			// Both define the same visitor - combine them
			(result as Record<string, unknown>)[key] = (payload: unknown) => {
				(aFn as (p: unknown) => void)(payload);
				(bFn as (p: unknown) => void)(payload);
			};
		} else if (typeof bFn === "function") {
			// Only b defines this visitor
			(result as Record<string, unknown>)[key] = bFn;
		}
	}

	return result;
}

/**
 * Run the rule engine against a project.
 *
 * This is the main entry point for rule execution. It creates contexts for each
 * rule, traverses the project index to find OpenAPI elements, and dispatches
 * visitor callbacks to rules for each element found.
 *
 * The execution flow is:
 * 1. Initialize rule state (if rules have state factories)
 * 2. For each file, create rule contexts and collect visitors
 * 3. For each file, dispatch visitors for all OpenAPI elements
 * 4. After all files, dispatch Project visitor for aggregate checks
 * 5. Return collected diagnostics and fixes
 *
 * @param project - The project context containing documents and indexes
 * @param files - Array of file URIs to validate
 * @param options - Engine options including rules to run
 * @param token - Optional cancellation token for early termination
 * @returns Result containing diagnostics and fixes
 *
 * @example
 * ```typescript
 * const { graph, resolver, rootResolver } = buildRefGraph({ docs });
 * const index = buildIndex({ docs, graph, resolver });
 * const project = { docs, index, resolver, graph, rootResolver, version: "3.1" };
 *
 * const result = runEngine(project, ["file:///api.yaml"], {
 *   rules: [operationDescription, schemaRequired]
 * });
 *
 * console.log(`Found ${result.diagnostics.length} issues`);
 * ```
 */
export function runEngine(
	project: ProjectContext,
	files: string[],
	options: EngineRunOptions,
	token?: CancellationToken,
): EngineRunResult {
	// Early exit if cancelled
	if (token?.isCancellationRequested) {
		return { diagnostics: [], fixes: [] };
	}

	// Guard against invalid inputs
	if (!files || files.length === 0) {
		return { diagnostics: [], fixes: [] };
	}

	if (!options.rules || options.rules.length === 0) {
		return { diagnostics: [], fixes: [] };
	}

	const diagnostics: Diagnostic[] = [];
	const fixes: FilePatch[] = [];
	const visitorSets = new Map<string, Visitors[]>();

	// Initialize state for each rule (called once per lint run)
	const ruleStates = options.rules.map((rule) => rule.state?.() ?? {});

	for (const fileUri of files) {
		if (token?.isCancellationRequested) break;

		// Create a context for each rule so we can pass the rule to report()
		const visitors = options.rules
			.filter((rule) => rule != null)
			.map((rule, index) => {
				const ctx = createRuleContext(
					project,
					fileUri,
					diagnostics,
					fixes,
					rule,
				);
				const state = ruleStates[index];

				// Handle rules with fields declarations
				let fieldVisitors: Visitors = {};
				if (rule.fields) {
					fieldVisitors = generateFieldVisitors(rule.fields, ctx);
				}

				// Handle rules with check() function
				let checkVisitors: Visitors = {};
				if (rule.check) {
					checkVisitors = rule.check(ctx, state);
				}

				// Merge field visitors and check visitors
				// Field visitors run first, then check visitors
				return mergeVisitors(fieldVisitors, checkVisitors);
			});
		visitorSets.set(fileUri, visitors);
	}

	for (const fileUri of files) {
		if (token?.isCancellationRequested) break;

		const visitors = visitorSets.get(fileUri);
		if (!visitors) {
			continue;
		}
		const fileIndex = project.index;
		const docAst = project.docs.get(fileUri)?.ast;

		// Dispatch Document visitor for ALL files (general file checks)
		dispatch(visitors, "Document", {
			uri: fileUri,
			pointer: "#",
			node: docAst,
		});

		// Dispatch Root visitor only for root-level OpenAPI documents
		// (documents containing openapi or swagger keys at root level)
		const isRootDocument =
			docAst &&
			typeof docAst === "object" &&
			("openapi" in (docAst as Record<string, unknown>) ||
				"swagger" in (docAst as Record<string, unknown>));

		if (isRootDocument) {
			dispatch(
				visitors,
				"Root",
				{
					uri: fileUri,
					pointer: "#",
					node: docAst,
				},
				fileIndex.pathsByString,
			);

			// Dispatch Info visitor for the info section
			const infoNode = (docAst as Record<string, unknown>).info;
			if (infoNode && typeof infoNode === "object") {
				dispatch(visitors, "Info", {
					uri: fileUri,
					pointer: "#/info",
					node: infoNode,
				});
			}

			// Dispatch Tag visitor for each tag definition
			const tagsArray = (docAst as Record<string, unknown>).tags;
			if (Array.isArray(tagsArray)) {
				for (let i = 0; i < tagsArray.length; i++) {
					const tagNode = tagsArray[i];
					if (tagNode && typeof tagNode === "object") {
						dispatch(visitors, "Tag", {
							uri: fileUri,
							pointer: `#/tags/${i}`,
							node: tagNode,
							index: i,
						});
					}
				}
			}
		}

		for (const [
			pathString,
			pathItemRefs,
		] of fileIndex.pathsByString.entries()) {
			for (const ref of pathItemRefs) {
				if (ref.uri !== fileUri) continue;
				// Get all path strings for this path item
				const key = `${ref.uri}#${ref.pointer}`;
				const allPathStrings = fileIndex.pathItemsToPaths.get(key) ?? [
					pathString,
				];
				dispatch(visitors, "PathItem", ref, undefined, allPathStrings);
				const ownerKey = `${ref.uri}#${ref.pointer}`;
				const ops = fileIndex.operationsByOwner.get(ownerKey) ?? [];
				for (const op of ops) {
					dispatch(visitors, "Operation", op);
				}
			}
		}
		for (const bucket of Object.values(fileIndex.components)) {
			for (const component of bucket.values()) {
				if (component.uri !== fileUri) continue;
				dispatch(visitors, "Component", component);
			}
		}

		// Dispatch Schema visitors recursively for all schemas (components, fragments, inline)
		// This walks into nested schemas (properties, items, allOf, oneOf, anyOf, etc.)
		for (const schema of fileIndex.schemas.values()) {
			if (schema.uri !== fileUri) continue;
			// Determine the location based on pointer
			const location: SchemaLocation = schema.pointer.startsWith(
				"/components/schemas/",
			)
				? "component"
				: "inline";
			dispatchSchemaRecursively(visitors, {
				...schema,
				depth: 0,
				location,
			});
		}

		// Dispatch Parameter visitors for all parameters (components, path-level, operation-level, fragments)
		for (const parameter of fileIndex.parameters.values()) {
			if (parameter.uri !== fileUri) continue;
			dispatch(visitors, "Parameter", parameter);
		}

		// Dispatch Response visitors for all responses (components, operation-level, fragments)
		for (const response of fileIndex.responses.values()) {
			if (response.uri !== fileUri) continue;
			dispatch(visitors, "Response", response);
		}

		// Dispatch RequestBody visitors for all request bodies (components, operation-level, fragments)
		for (const requestBody of fileIndex.requestBodies.values()) {
			if (requestBody.uri !== fileUri) continue;
			dispatch(visitors, "RequestBody", requestBody);
		}

		// Dispatch Header visitors for all headers (components, response-level, fragments)
		for (const header of fileIndex.headers.values()) {
			if (header.uri !== fileUri) continue;
			dispatch(visitors, "Header", header);
		}

		// Dispatch MediaType visitors for all media types (requestBody.content, response.content)
		for (const mediaType of fileIndex.mediaTypes.values()) {
			if (mediaType.uri !== fileUri) continue;
			dispatch(visitors, "MediaType", mediaType);
		}

		// Dispatch SecurityRequirement visitors for all security requirements (root, operation-level)
		for (const securityReq of fileIndex.securityRequirements.values()) {
			if (securityReq.uri !== fileUri) continue;
			dispatch(visitors, "SecurityRequirement", securityReq);
		}

		// Dispatch Example visitors for all examples (components, inline under media types, parameters, headers)
		for (const example of fileIndex.examples.values()) {
			if (example.uri !== fileUri) continue;
			dispatch(visitors, "Example", example);
		}

		// Dispatch Link visitors for all links (components, response-level)
		for (const link of fileIndex.links.values()) {
			if (link.uri !== fileUri) continue;
			dispatch(visitors, "Link", link);
		}

		// Dispatch Callback visitors for all callbacks (components, operation-level)
		for (const callback of fileIndex.callbacks.values()) {
			if (callback.uri !== fileUri) continue;
			dispatch(visitors, "Callback", callback);
		}

		// Dispatch Reference visitors for all $ref nodes throughout the document
		for (const reference of fileIndex.references.values()) {
			if (reference.uri !== fileUri) continue;
			dispatch(visitors, "Reference", reference);
		}
	}

	// Dispatch Project visitor once per rule after all files are processed
	// This is for aggregate/project-level checks
	for (let i = 0; i < options.rules.length; i++) {
		// Get the visitors from any file (they share state)
		const visitors = visitorSets.values().next().value as
			| Visitors[]
			| undefined;
		if (!visitors) continue;
		const visitor = visitors[i];
		if (!visitor) continue;

		const projectVisitor = visitor.Project;
		if (typeof projectVisitor === "function") {
			projectVisitor({ index: project.index });
		}
	}

	return { diagnostics, fixes };
}

/**
 * Create a rule context for a specific file.
 *
 * The rule context provides rules with:
 * - Access to the project data (documents, index, resolver)
 * - Methods to report diagnostics and fixes
 * - Methods to locate nodes in source documents
 * - Schema navigation helpers
 *
 * @param project - The project context
 * @param fileUri - URI of the file being validated
 * @param diagnostics - Array to collect diagnostics into
 * @param fixes - Array to collect fixes into
 * @param rule - Optional rule for auto-filling ruleId in diagnostics
 * @returns A RuleContext instance
 *
 * @throws Error if the document for fileUri is not found in project.docs
 *
 * @example
 * ```typescript
 * const diagnostics: Diagnostic[] = [];
 * const fixes: FilePatch[] = [];
 * const ctx = createRuleContext(project, "file:///api.yaml", diagnostics, fixes, myRule);
 *
 * // Use the context
 * const range = ctx.locate("file:///api.yaml", "#/paths/~1users/get");
 * ctx.report({ message: "Issue found", uri: "file:///api.yaml", range, severity: "error" });
 * ```
 */
/**
 * Detect the OpenAPI version from a document.
 * Normalizes versions like "3.0.0" to "3.0", "3.1.1" to "3.1", etc.
 */
function detectOpenAPIVersion(document: {
	parsed?: unknown;
}): OpenAPIVersion | "unknown" {
	const parsed = document.parsed as Record<string, unknown> | undefined;
	if (!parsed) return "unknown";

	// Check for OpenAPI 3.x
	const openapi = parsed.openapi;
	if (typeof openapi === "string") {
		if (openapi.startsWith("3.2")) return "3.2";
		if (openapi.startsWith("3.1")) return "3.1";
		if (openapi.startsWith("3.0")) return "3.0";
	}

	// Check for Swagger 2.0
	const swagger = parsed.swagger;
	if (typeof swagger === "string" && swagger.startsWith("2.")) {
		return "2.0";
	}

	return "unknown";
}

export function createRuleContext(
	project: ProjectContext,
	fileUri: string,
	diagnostics: Diagnostic[],
	fixes: FilePatch[],
	rule?: Rule,
): RuleContext {
	const document = project.docs.get(fileUri);
	if (!document) {
		throw new Error(`Document not found for ${fileUri}`);
	}

	// Detect OpenAPI version
	const detectedVersion = detectOpenAPIVersion(document);

	// Build line offsets cache for offset-to-range conversion

	return {
		project,
		file: { uri: fileUri, document },
		version: detectedVersion,
		isVersion(version: OpenAPIVersion): boolean {
			return detectedVersion === version;
		},
		report(diag) {
			// Use code from diagnostic if provided, otherwise construct from rule.meta
			const ruleId = diag.code ?? rule?.meta.id ?? "unknown";
			// Construct composite diagnostic code from rule number and id
			let compositeCode = ruleId;
			if (rule && rule.meta.number !== undefined) {
				compositeCode = `rule-${rule.meta.number}-${ruleId}`;
			}
			// Build codeDescription from rule.meta.url if not already provided
			const codeDescription =
				diag.codeDescription ??
				(rule?.meta.url ? { href: rule.meta.url } : undefined);
			diagnostics.push({
				...diag,
				code: compositeCode,
				source: diag.source ?? "telescope",
				severity: severityToEnum(diag.severity),
				codeDescription,
			});
		},
		reportAt(ref, field, opts) {
			const { uri, pointer } = ref;
			const doc = project.docs.get(uri);
			if (!doc) return false;

			// Build field pointer
			const fieldPath = Array.isArray(field) ? field : [field];
			const fieldPointer = `${pointer}/${fieldPath.map((f) => f.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;

			// Try to locate the field
			let range: Range | null = null;
			let precision: "exact" | "key" | "parent" | "firstChild" | "fallback" =
				"exact";

			if (doc.ir) {
				const node = findNodeByPointer(doc.ir, fieldPointer);
				if (node?.loc) {
					const lineOffsets = getLineOffsets(doc);
					range = locToRange(doc.rawText, node.loc, lineOffsets, {
						preferKey: opts.preferKey,
					});
					precision = opts.preferKey ? "key" : "exact";
				}
			}

			// Fallback: try sourceMap for field
			if (!range) {
				range = doc.sourceMap.pointerToRange(fieldPointer);
				if (range) precision = "exact";
			}

			// Fallback: try intermediate parents progressively
			// For field path ["components", "securitySchemes"], if securitySchemes doesn't exist,
			// try "components" before falling back to the ref's base pointer
			if (!range && doc.ir && fieldPath.length > 1) {
				const lineOffsets = getLineOffsets(doc);
				const escapeSegment = (f: string) =>
					f.replace(/~/g, "~0").replace(/\//g, "~1");
				for (let i = fieldPath.length - 1; i >= 1; i--) {
					const intermediateSegments = fieldPath.slice(0, i);
					const intermediatePointer = `${pointer}/${intermediateSegments.map(escapeSegment).join("/")}`;
					const intermediateNode = findNodeByPointer(
						doc.ir,
						intermediatePointer,
					);
					if (intermediateNode?.loc) {
						// Found an intermediate parent - highlight its key
						const keyStart =
							intermediateNode.loc.keyStart ?? intermediateNode.loc.start;
						const keyEnd =
							intermediateNode.loc.keyEnd ?? intermediateNode.loc.end;
						range = locToRange(
							doc.rawText,
							{ start: keyStart, end: keyEnd },
							lineOffsets,
						);
						precision = "parent";
						break;
					}
				}
			}

			// Fallback: try first child of parent
			if (!range && doc.ir) {
				const parentNode = findNodeByPointer(doc.ir, pointer);
				if (
					parentNode?.kind === "object" &&
					parentNode.children?.length &&
					parentNode.children[0]?.loc
				) {
					const firstChild = parentNode.children[0];
					const keyStart = firstChild.loc.keyStart ?? firstChild.loc.start;
					const keyEnd = firstChild.loc.keyEnd ?? firstChild.loc.end;
					const lineOffsets = getLineOffsets(doc);
					range = locToRange(
						doc.rawText,
						{ start: keyStart, end: keyEnd },
						lineOffsets,
					);
					precision = "firstChild";
				}
			}

			// Fallback: try parent pointer (use key range for better specificity on missing fields)
			if (!range) {
				if (doc.ir) {
					const parentNode = findNodeByPointer(doc.ir, pointer);
					if (parentNode?.loc) {
						const lineOffsets = getLineOffsets(doc);
						// Use parent's key range if available (for missing field errors)
						// This highlights just "get:" instead of the entire operation block
						const keyStart = parentNode.loc.keyStart ?? parentNode.loc.start;
						const keyEnd = parentNode.loc.keyEnd ?? parentNode.loc.end;
						range = locToRange(
							doc.rawText,
							{ start: keyStart, end: keyEnd },
							lineOffsets,
						);
						precision = "parent";
					}
				}
				if (!range) {
					range = doc.sourceMap.pointerToRange(pointer);
					if (range) precision = "parent";
				}
			}

			// Final fallback: document start
			if (!range) {
				range = {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				};
				precision = "fallback";
			}

			// Report the diagnostic
			const ruleId = rule?.meta.id ?? "unknown";
			let compositeCode = ruleId;
			if (rule && rule.meta.number !== undefined) {
				compositeCode = `rule-${rule.meta.number}-${ruleId}`;
			}
			const codeDescription = rule?.meta.url
				? { href: rule.meta.url }
				: undefined;
			diagnostics.push({
				code: compositeCode,
				source: "telescope",
				message: opts.message,
				uri,
				range,
				severity: severityToEnum(opts.severity),
				codeDescription,
				rangePrecision: precision,
			});

			return precision !== "fallback";
		},
		reportHere(ref, opts) {
			const { uri, pointer } = ref;
			const doc = project.docs.get(uri);
			if (!doc) return false;

			// Try to locate the node itself
			let range: Range | null = null;
			let precision: "exact" | "key" | "parent" | "firstChild" | "fallback" =
				"exact";

			if (doc.ir) {
				const node = findNodeByPointer(doc.ir, pointer);
				if (node?.loc) {
					const lineOffsets = getLineOffsets(doc);
					range = locToRange(doc.rawText, node.loc, lineOffsets);
				}
			}

			// Fallback: try sourceMap
			if (!range) {
				range = doc.sourceMap.pointerToRange(pointer);
			}

			// Final fallback: document start
			if (!range) {
				range = {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				};
				precision = "fallback";
			}

			// Report the diagnostic
			const ruleId = rule?.meta.id ?? "unknown";
			let compositeCode = ruleId;
			if (rule && rule.meta.number !== undefined) {
				compositeCode = `rule-${rule.meta.number}-${ruleId}`;
			}
			const codeDescription = rule?.meta.url
				? { href: rule.meta.url }
				: undefined;
			diagnostics.push({
				code: compositeCode,
				source: "telescope",
				message: opts.message,
				uri,
				range,
				severity: severityToEnum(opts.severity),
				codeDescription,
				rangePrecision: precision,
			});

			return precision !== "fallback";
		},
		fix(patch) {
			if (Array.isArray(patch)) fixes.push(...patch);
			else fixes.push(patch);
		},
		getScopeContext(uri, pointer) {
			return project.index.scopeProvider?.(uri, pointer) ?? null;
		},
		locate(uri, pointer) {
			const doc = project.docs.get(uri);
			if (!doc) return null;

			// Prefer IR-based location if available (more accurate byte offsets)
			if (doc.ir) {
				const node = findNodeByPointer(doc.ir, pointer);
				if (node?.loc) {
					const lineOffsets = getLineOffsets(doc);
					return locToRange(doc.rawText, node.loc, lineOffsets);
				}
			}

			// Fallback to sourceMap
			return doc.sourceMap.pointerToRange(pointer) ?? null;
		},
		locateKey(uri, pointer) {
			const doc = project.docs.get(uri);
			if (!doc?.ir) return null;

			const node = findNodeByPointer(doc.ir, pointer);
			if (!node?.loc?.keyStart || !node?.loc?.keyEnd) return null;

			const lineOffsets = getLineOffsets(doc);
			return locToRange(
				doc.rawText,
				{ start: node.loc.keyStart, end: node.loc.keyEnd },
				lineOffsets,
			);
		},
		locateFirstChild(uri, pointer) {
			const doc = project.docs.get(uri);
			if (!doc?.ir) return null;

			const node = findNodeByPointer(doc.ir, pointer);
			if (!node || node.kind !== "object" || !node.children?.length)
				return null;

			const firstChild = node.children[0];
			if (!firstChild?.loc) return null;

			// Use keyStart/keyEnd if available, otherwise fall back to the child's full range
			const keyStart = firstChild.loc.keyStart ?? firstChild.loc.start;
			const keyEnd = firstChild.loc.keyEnd ?? firstChild.loc.end;

			const lineOffsets = getLineOffsets(doc);
			return locToRange(
				doc.rawText,
				{ start: keyStart, end: keyEnd },
				lineOffsets,
			);
		},
		offsetToRange(uri, startOffset, endOffset) {
			const doc = project.docs.get(uri);
			if (!doc || !doc.rawText) return null;

			const lineOffsets = getLineOffsets(doc);
			const end = endOffset ?? startOffset + 1;
			const startPos = getLineCol(startOffset, lineOffsets);
			const endPos = getLineCol(end, lineOffsets);

			return {
				start: { line: startPos.line - 1, character: startPos.col - 1 },
				end: { line: endPos.line - 1, character: endPos.col - 1 },
			};
		},
		findKeyRange(uri, parentPointer, keyName) {
			const doc = project.docs.get(uri);
			if (!doc || !doc.rawText) return null;

			// Get the value range for the key (pointer points to the value)
			const valuePointer = `${parentPointer}/${keyName}`;
			const valueRange = project.docs
				.get(uri)
				?.sourceMap.pointerToRange(valuePointer);
			if (!valueRange) return null;

			// Get parent range to know where to search
			const parentRange = project.docs
				.get(uri)
				?.sourceMap.pointerToRange(parentPointer);
			if (!parentRange) return null;

			const rawText = doc.rawText;
			const lineOffsets = getLineOffsets(doc);

			// Convert value range start to byte offset
			const valueStartLine = valueRange.start.line;
			const valueStartChar = valueRange.start.character;
			const valueStartOffset =
				(lineOffsets[valueStartLine] ?? 0) + valueStartChar;

			// Search backwards from value start to find the key name
			// Look for the key name followed by ":" or ": "
			const searchStart = Math.max(
				0,
				valueStartOffset - keyName.length - 10, // Search up to 10 chars back
			);
			const searchText = rawText.slice(searchStart, valueStartOffset);
			const keyPattern = new RegExp(
				`(${keyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\s*:`,
			);
			const match = searchText.match(keyPattern);
			if (!match || !match.index) return null;

			const keyStartOffset = searchStart + match.index;
			const keyEndOffset = keyStartOffset + keyName.length;

			const startPos = getLineCol(keyStartOffset, lineOffsets);
			const endPos = getLineCol(keyEndOffset, lineOffsets);

			return {
				start: { line: startPos.line - 1, character: startPos.col - 1 },
				end: { line: endPos.line - 1, character: endPos.col - 1 },
			};
		},
		getRootDocuments(targetUri?: string, pointer?: string): string[] {
			const uri = targetUri ?? fileUri;
			const ptr = pointer ?? "#";
			return project.rootResolver.findRootsForNode(uri, ptr);
		},
		getPrimaryRoot(targetUri?: string, pointer?: string): string | null {
			const uri = targetUri ?? fileUri;
			const ptr = pointer ?? "#";
			return project.rootResolver.getPrimaryRoot(uri, ptr);
		},

		// Schema navigation methods

		getChildSchemas(schemaRef: SchemaRef): SchemaRef[] {
			return [...walkSchemaChildren(schemaRef)];
		},

		getPropertySchema(
			schemaRef: SchemaRef,
			propertyName: string,
		): SchemaRef | null {
			const schema = schemaRef.node as Record<string, unknown>;
			if (!schema || typeof schema !== "object") return null;

			if (!schema.properties || typeof schema.properties !== "object")
				return null;
			const properties = schema.properties as Record<string, unknown>;
			const propSchema = properties[propertyName];
			if (!propSchema || typeof propSchema !== "object") return null;

			const currentDepth = schemaRef.depth ?? 0;
			const requiredList = Array.isArray(schema.required)
				? (schema.required as string[])
				: [];

			return {
				uri: schemaRef.uri,
				pointer: `${schemaRef.pointer}/properties/${propertyName}`,
				node: propSchema,
				propertyName,
				isRequired: requiredList.includes(propertyName),
				depth: currentDepth + 1,
				location: "properties",
				parent: schemaRef,
			};
		},

		getItemsSchema(schemaRef: SchemaRef): SchemaRef | null {
			const schema = schemaRef.node as Record<string, unknown>;
			if (!schema || typeof schema !== "object") return null;

			if (!schema.items || typeof schema.items !== "object") return null;

			const currentDepth = schemaRef.depth ?? 0;
			return {
				uri: schemaRef.uri,
				pointer: `${schemaRef.pointer}/items`,
				node: schema.items,
				depth: currentDepth + 1,
				location: "items",
				parent: schemaRef,
			};
		},

		getRequiredProperties(schemaRef: SchemaRef): string[] {
			const schema = schemaRef.node as Record<string, unknown>;
			if (!schema || typeof schema !== "object") return [];

			if (!Array.isArray(schema.required)) return [];
			return schema.required as string[];
		},
	};
}

/**
 * Dispatch a visitor callback to all rules for a specific element type.
 *
 * This internal helper invokes the appropriate visitor function on each
 * rule's visitors object for the given element kind. Refs are enriched
 * with typed accessor methods before being passed to visitors.
 *
 * @param visitors - Array of visitor objects from all rules
 * @param kind - The type of element (e.g., "Operation", "Schema")
 * @param payload - The element reference to pass to visitors
 *
 * @internal
 */
function dispatch(
	visitors: Visitors[],
	kind: keyof Visitors,
	payload: unknown,
	pathItemsByPath?: Map<string, import("../indexes/types.js").PathItemRef[]>,
	pathStrings?: string[],
) {
	// Enrich refs with typed accessor methods
	let enrichedPayload = payload;
	switch (kind) {
		case "Document":
			// Document visitor receives simple payload (no enrichment)
			// for general file checks that run on all files
			break;
		case "Root":
			// Root visitor receives enriched RootRef for OpenAPI-specific checks
			enrichedPayload = enrichRootRef(
				payload as Parameters<typeof enrichRootRef>[0],
				pathItemsByPath,
			);
			break;
		case "Info":
			// Info visitor receives enriched InfoRef
			{
				const p = payload as { uri: string; pointer: string; node: unknown };
				enrichedPayload = enrichInfoRef(p.uri, p.pointer, p.node);
			}
			break;
		case "Tag":
			// Tag visitor receives enriched TagRef
			{
				const p = payload as {
					uri: string;
					pointer: string;
					node: unknown;
					index: number;
				};
				enrichedPayload = enrichTagRef(p.uri, p.pointer, p.node, p.index);
			}
			break;
		case "PathItem":
			enrichedPayload = enrichPathItemRef(
				payload as Parameters<typeof enrichPathItemRef>[0],
				pathStrings,
			);
			break;
		case "Operation":
			enrichedPayload = enrichOperationRef(
				payload as Parameters<typeof enrichOperationRef>[0],
			);
			break;
		case "Schema":
			enrichedPayload = enrichSchemaRef(
				payload as Parameters<typeof enrichSchemaRef>[0],
			);
			break;
		case "Parameter":
			enrichedPayload = enrichParameterRef(
				payload as Parameters<typeof enrichParameterRef>[0],
			);
			break;
		case "Response":
			enrichedPayload = enrichResponseRef(
				payload as Parameters<typeof enrichResponseRef>[0],
			);
			break;
		case "RequestBody":
			enrichedPayload = enrichRequestBodyRef(
				payload as Parameters<typeof enrichRequestBodyRef>[0],
			);
			break;
		case "Header":
			enrichedPayload = enrichHeaderRef(
				payload as Parameters<typeof enrichHeaderRef>[0],
			);
			break;
		case "MediaType":
			enrichedPayload = enrichMediaTypeRef(
				payload as Parameters<typeof enrichMediaTypeRef>[0],
			);
			break;
		case "Example":
			enrichedPayload = enrichExampleRef(
				payload as Parameters<typeof enrichExampleRef>[0],
			);
			break;
		case "Link":
			enrichedPayload = enrichLinkRef(
				payload as Parameters<typeof enrichLinkRef>[0],
			);
			break;
		case "Callback":
			enrichedPayload = enrichCallbackRef(
				payload as Parameters<typeof enrichCallbackRef>[0],
			);
			break;
		case "Component":
			enrichedPayload = enrichComponentRef(
				payload as Parameters<typeof enrichComponentRef>[0],
			);
			break;
	}

	for (const visitor of visitors) {
		const fn = visitor[kind];
		if (typeof fn === "function") {
			(fn as (p: unknown) => void)(enrichedPayload);
		}
	}
}

/**
 * Recursively dispatch Schema visitors for nested schemas.
 *
 * This function walks the schema tree depth-first, dispatching the Schema
 * visitor for each schema encountered. Uses walkSchemaChildren for traversal.
 * Note: dispatch() handles enrichment, so we pass the raw ref.
 *
 * @param visitors - Array of visitor objects from all rules
 * @param schemaRef - The current schema reference to process
 *
 * @internal
 */
function dispatchSchemaRecursively(
	visitors: Visitors[],
	schemaRef: SchemaRef,
): void {
	const schema = schemaRef.node as Record<string, unknown>;
	if (!schema || typeof schema !== "object" || "$ref" in schema) return;

	// Dispatch for this schema (dispatch() handles enrichment)
	dispatch(visitors, "Schema", schemaRef);

	// Recurse into all child schemas
	for (const childSchema of walkSchemaChildren(schemaRef)) {
		dispatchSchemaRecursively(visitors, childSchema);
	}
}
