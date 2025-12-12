/**
 * Project Index Module
 *
 * This module builds a comprehensive index of all OpenAPI elements across
 * a project's documents. The index provides efficient lookup of:
 *
 * - Paths and PathItems
 * - Operations (GET, POST, etc.)
 * - Components (schemas, parameters, responses, etc.)
 * - All inline elements (schemas in responses, parameters in operations, etc.)
 * - $ref nodes throughout documents
 * - Scope context for any location
 *
 * The index is used by the rule engine to dispatch visitors to all relevant
 * elements without requiring rules to traverse the AST themselves.
 *
 * @module indexes/project-index
 */

import type { ParsedDocument } from "../types.js";
import { identifyDocumentType } from "../utils/document-type-utils.js";
import {
	getValueAtPointer,
	joinPointer,
	splitPointer,
} from "../utils/pointer-utils.js";
import type { RefGraph, Resolver } from "./graph-types.js";
import type {
	CallbackRefInput,
	ComponentRefInput,
	ExampleRefInput,
	HeaderRefInput,
	JsonPointer,
	LinkRefInput,
	MediaTypeRefInput,
	OperationRefInput,
	ParameterRefInput,
	PathItemRefInput,
	ProjectIndex,
	ReferenceRef,
	RequestBodyRefInput,
	ResponseRefInput,
	SchemaRefInput,
	ScopeContext,
	SecurityRequirementRef,
	WebhookRef,
} from "./types.js";

/** Options for building a project index */
export interface BuildIndexOptions {
	docs: Map<string, ParsedDocument>;
	graph: RefGraph;
	resolver: Resolver;
}

const HTTP_METHODS = [
	"get",
	"put",
	"post",
	"delete",
	"patch",
	"options",
	"head",
	"trace",
	"query", // OpenAPI 3.2+
] as const;

const COMPONENT_SECTIONS = [
	"schemas",
	"responses",
	"parameters",
	"headers",
	"examples",
	"requestBodies",
	"securitySchemes",
	"links",
	"callbacks",
] as const;

// ============================================================================
// Helper Types & Functions
// ============================================================================

/** All the index maps we're building */
interface IndexCollectors {
	pathsByString: Map<string, PathItemRefInput[]>;
	pathItemsToPaths: Map<string, string[]>;
	operationsByOwner: Map<string, OperationRefInput[]>;
	components: Record<string, Map<string, ComponentRefInput>>;
	schemas: Map<string, SchemaRefInput>;
	parameters: Map<string, ParameterRefInput>;
	responses: Map<string, ResponseRefInput>;
	requestBodies: Map<string, RequestBodyRefInput>;
	headers: Map<string, HeaderRefInput>;
	mediaTypes: Map<string, MediaTypeRefInput>;
	securityRequirements: Map<string, SecurityRequirementRef>;
	examples: Map<string, ExampleRefInput>;
	links: Map<string, LinkRefInput>;
	callbacks: Map<string, CallbackRefInput>;
	webhooks: Map<string, WebhookRef>;
	references: Map<string, ReferenceRef>;
	documents: Map<string, Record<string, unknown>>;
	pathItemsByPointer: Map<string, PathItemRefInput>;
	operationsByPointer: Map<string, OperationRefInput>;
}

/** Create unique key for a node */
function nodeKey(uri: string, pointer: JsonPointer): string {
	return `${uri}#${pointer}`;
}

/** Push to a map of arrays */
function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

/** Check if value is a non-null object */
function isObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Try to resolve a $ref, returns undefined on failure */
function tryDeref<T>(
	resolver: Resolver,
	origin: { uri: string; pointer: string },
	ref: string,
): T | undefined {
	try {
		const target = resolver.deref<T>(origin, ref);
		return target && typeof target === "object" ? target : undefined;
	} catch {
		return undefined;
	}
}

// ============================================================================
// Reference Collection (handles $ref as boundary - cycle safe)
// ============================================================================

/** Collect all $ref nodes - stops at $ref boundaries for cycle safety */
function collectReferences(
	node: unknown,
	uri: string,
	segments: string[],
	references: Map<string, ReferenceRef>,
): void {
	if (!node || typeof node !== "object") return;

	const nodeObj = node as Record<string, unknown>;

	// $ref is a boundary - record it but don't traverse into it
	if (typeof nodeObj.$ref === "string") {
		const originPointer = joinPointer(segments);
		const refPointer = joinPointer([...segments, "$ref"]);
		references.set(nodeKey(uri, refPointer), {
			uri,
			pointer: originPointer,
			refPointer,
			ref: nodeObj.$ref,
			node: nodeObj,
		});
		return; // Don't traverse - cycle safety
	}

	// Continue traversing non-$ref nodes
	if (Array.isArray(node)) {
		node.forEach((item, index) => {
			collectReferences(item, uri, [...segments, String(index)], references);
		});
	} else {
		for (const [key, value] of Object.entries(nodeObj)) {
			collectReferences(value, uri, [...segments, key], references);
		}
	}
}

// ============================================================================
// Element Collectors
// ============================================================================

/** Collect a parameter (handles $ref resolution) */
function collectParameter(
	collectors: IndexCollectors,
	resolver: Resolver,
	uri: string,
	pointer: string,
	param: unknown,
	origin: { uri: string; pointer: string },
): void {
	if (!isObject(param)) return;

	let effective = param;
	if (typeof param.$ref === "string") {
		const resolved = tryDeref<Record<string, unknown>>(
			resolver,
			origin,
			param.$ref,
		);
		if (!resolved) return;
		effective = resolved;
	}

	collectors.parameters.set(nodeKey(uri, pointer), {
		uri,
		pointer,
		node: effective,
		name: typeof effective.name === "string" ? effective.name : undefined,
		in: typeof effective.in === "string" ? effective.in : undefined,
	});

	// Collect examples from parameter
	collectExamplesFromObject(collectors, uri, pointer, effective, "examples");
}

/** Collect a schema */
function collectSchema(
	collectors: IndexCollectors,
	uri: string,
	pointer: string,
	schema: unknown,
): void {
	if (!isObject(schema)) return;
	collectors.schemas.set(nodeKey(uri, pointer), { uri, pointer, node: schema });
}

/** Collect a response (handles $ref resolution) */
function collectResponse(
	collectors: IndexCollectors,
	resolver: Resolver,
	uri: string,
	pointer: string,
	response: unknown,
	origin: { uri: string; pointer: string },
	statusCode?: string,
): void {
	if (!isObject(response)) return;

	let effective = response;
	if (typeof response.$ref === "string") {
		const resolved = tryDeref<Record<string, unknown>>(
			resolver,
			origin,
			response.$ref,
		);
		if (!resolved) return;
		effective = resolved;
	}

	collectors.responses.set(nodeKey(uri, pointer), {
		uri,
		pointer,
		node: effective,
		statusCode,
	});

	// Collect nested elements
	collectHeadersFromResponse(collectors, resolver, uri, pointer, effective);
	collectMediaTypesFromContent(
		collectors,
		uri,
		pointer,
		effective.content,
		"content",
	);
	collectLinksFromResponse(collectors, uri, pointer, effective);
}

/** Collect headers from a response */
function collectHeadersFromResponse(
	collectors: IndexCollectors,
	resolver: Resolver,
	uri: string,
	responsePointer: string,
	response: Record<string, unknown>,
): void {
	const headers = response.headers;
	if (!isObject(headers)) return;

	for (const [name, value] of Object.entries(headers)) {
		if (!isObject(value)) continue;

		const headerPointer = joinPointer([
			...splitPointer(responsePointer),
			"headers",
			name,
		]);
		let effective = value;

		if (typeof value.$ref === "string") {
			const resolved = tryDeref<Record<string, unknown>>(
				resolver,
				{ uri, pointer: responsePointer },
				value.$ref,
			);
			if (!resolved) continue;
			effective = resolved;
		}

		collectors.headers.set(nodeKey(uri, headerPointer), {
			uri,
			pointer: headerPointer,
			node: effective,
			name,
		});

		collectExamplesFromObject(
			collectors,
			uri,
			headerPointer,
			effective,
			"examples",
		);
	}
}

/** Collect links from a response */
function collectLinksFromResponse(
	collectors: IndexCollectors,
	uri: string,
	responsePointer: string,
	response: Record<string, unknown>,
): void {
	const links = response.links;
	if (!isObject(links)) return;

	for (const [name, value] of Object.entries(links)) {
		if (!isObject(value)) continue;
		const linkPointer = joinPointer([
			...splitPointer(responsePointer),
			"links",
			name,
		]);
		collectors.links.set(nodeKey(uri, linkPointer), {
			uri,
			pointer: linkPointer,
			node: value,
			name,
		});
	}
}

/** Collect a request body (handles $ref resolution) */
function collectRequestBody(
	collectors: IndexCollectors,
	resolver: Resolver,
	uri: string,
	pointer: string,
	requestBody: unknown,
	origin: { uri: string; pointer: string },
): void {
	if (!isObject(requestBody)) return;

	let effective = requestBody;
	if (typeof requestBody.$ref === "string") {
		const resolved = tryDeref<Record<string, unknown>>(
			resolver,
			origin,
			requestBody.$ref,
		);
		if (!resolved) return;
		effective = resolved;
	}

	collectors.requestBodies.set(nodeKey(uri, pointer), {
		uri,
		pointer,
		node: effective,
	});

	collectMediaTypesFromContent(
		collectors,
		uri,
		pointer,
		effective.content,
		"content",
	);
}

/** Collect media types from a content object */
function collectMediaTypesFromContent(
	collectors: IndexCollectors,
	uri: string,
	parentPointer: string,
	content: unknown,
	contentKey: string,
): void {
	if (!isObject(content)) return;

	for (const [mediaType, value] of Object.entries(content)) {
		if (!isObject(value)) continue;

		const mediaTypePointer = joinPointer([
			...splitPointer(parentPointer),
			contentKey,
			mediaType,
		]);
		collectors.mediaTypes.set(nodeKey(uri, mediaTypePointer), {
			uri,
			pointer: mediaTypePointer,
			node: value,
			mediaType,
		});

		// Collect schema
		if (isObject(value.schema)) {
			const schemaPointer = joinPointer([
				...splitPointer(mediaTypePointer),
				"schema",
			]);
			collectSchema(collectors, uri, schemaPointer, value.schema);
		}

		// Collect examples
		collectExamplesFromObject(
			collectors,
			uri,
			mediaTypePointer,
			value,
			"examples",
		);
	}
}

/** Collect examples from an object's examples field */
function collectExamplesFromObject(
	collectors: IndexCollectors,
	uri: string,
	parentPointer: string,
	obj: Record<string, unknown>,
	examplesKey: string,
): void {
	const examples = obj[examplesKey];
	if (!isObject(examples)) return;

	for (const [name, value] of Object.entries(examples)) {
		if (!isObject(value)) continue;
		const examplePointer = joinPointer([
			...splitPointer(parentPointer),
			examplesKey,
			name,
		]);
		collectors.examples.set(nodeKey(uri, examplePointer), {
			uri,
			pointer: examplePointer,
			node: value,
			name,
		});
	}
}

/** Collect security requirements */
function collectSecurityRequirements(
	collectors: IndexCollectors,
	uri: string,
	basePointer: string,
	security: unknown,
	level: "root" | "operation",
): void {
	if (!Array.isArray(security)) return;

	for (let i = 0; i < security.length; i++) {
		const req = security[i];
		if (!isObject(req)) continue;
		const pointer = joinPointer([
			...splitPointer(basePointer),
			"security",
			String(i),
		]);
		collectors.securityRequirements.set(nodeKey(uri, pointer), {
			uri,
			pointer,
			node: req,
			level,
		});
	}
}

/** Collect callbacks */
function collectCallbacks(
	collectors: IndexCollectors,
	uri: string,
	opPointer: string,
	callbacks: unknown,
): void {
	if (!isObject(callbacks)) return;

	for (const [name, value] of Object.entries(callbacks)) {
		if (!isObject(value)) continue;
		const callbackPointer = joinPointer([
			...splitPointer(opPointer),
			"callbacks",
			name,
		]);
		collectors.callbacks.set(nodeKey(uri, callbackPointer), {
			uri,
			pointer: callbackPointer,
			node: value,
			name,
		});
	}
}

// ============================================================================
// Operation & Path Processing
// ============================================================================

/** Process an operation and collect all its elements */
function processOperation(
	collectors: IndexCollectors,
	resolver: Resolver,
	uri: string,
	pathString: string,
	method: string,
	operationValue: Record<string, unknown>,
	pathItemRef: string | undefined,
	definitionUri: string,
	definitionPointer: string,
): OperationRefInput {
	const opPointer = joinPointer(["paths", pathString, method]);
	const opDefinitionPointer = joinPointer([
		...splitPointer(definitionPointer),
		method,
	]);

	const operation: OperationRefInput = {
		uri,
		pointer: opPointer,
		definitionUri,
		definitionPointer: opDefinitionPointer,
		referenceUri: pathItemRef ? uri : undefined,
		referencePointer: pathItemRef ? opPointer : undefined,
		method,
		node: operationValue,
	};

	collectors.operationsByPointer.set(nodeKey(uri, opPointer), operation);

	const origin = { uri, pointer: opPointer };

	// Collect parameters
	const params = operationValue.parameters;
	if (Array.isArray(params)) {
		for (let i = 0; i < params.length; i++) {
			const paramPointer = joinPointer([
				...splitPointer(opPointer),
				"parameters",
				String(i),
			]);
			collectParameter(
				collectors,
				resolver,
				uri,
				paramPointer,
				params[i],
				origin,
			);
		}
	}

	// Collect request body
	if (operationValue.requestBody) {
		const rbPointer = joinPointer([...splitPointer(opPointer), "requestBody"]);
		collectRequestBody(
			collectors,
			resolver,
			uri,
			rbPointer,
			operationValue.requestBody,
			origin,
		);
	}

	// Collect responses
	const responses = operationValue.responses;
	if (isObject(responses)) {
		for (const [statusCode, responseValue] of Object.entries(responses)) {
			const responsePointer = joinPointer([
				...splitPointer(opPointer),
				"responses",
				statusCode,
			]);
			collectResponse(
				collectors,
				resolver,
				uri,
				responsePointer,
				responseValue,
				origin,
				statusCode,
			);
		}
	}

	// Collect security requirements
	collectSecurityRequirements(
		collectors,
		uri,
		opPointer,
		operationValue.security,
		"operation",
	);

	// Collect callbacks
	collectCallbacks(collectors, uri, opPointer, operationValue.callbacks);

	return operation;
}

/** Process a path item and its operations */
function processPathItem(
	collectors: IndexCollectors,
	resolver: Resolver,
	uri: string,
	pathString: string,
	pathItemValue: Record<string, unknown>,
): void {
	const pointer = joinPointer(["paths", pathString]);

	// Resolve $ref if present
	let effectivePathItem: Record<string, unknown> | undefined = pathItemValue;
	let definitionUri = uri;
	let definitionPointer = pointer;
	const maybeRef = pathItemValue.$ref;

	if (typeof maybeRef === "string") {
		const target = tryDeref<Record<string, unknown>>(
			resolver,
			{ uri, pointer },
			maybeRef,
		);
		if (target) {
			const targetOrigin = resolver.originOf(target);
			if (targetOrigin) {
				definitionUri = targetOrigin.uri;
				definitionPointer = targetOrigin.pointer;
			}
			effectivePathItem = target;
		} else {
			effectivePathItem = undefined;
		}
	}

	const pathItem: PathItemRefInput = {
		uri,
		pointer,
		definitionUri,
		definitionPointer,
		referenceUri: typeof maybeRef === "string" ? uri : undefined,
		referencePointer: typeof maybeRef === "string" ? pointer : undefined,
		node: pathItemValue,
	};

	pushMap(collectors.pathsByString, pathString, pathItem);
	collectors.pathItemsByPointer.set(nodeKey(uri, pointer), pathItem);
	pushMap(collectors.pathItemsToPaths, nodeKey(uri, pointer), pathString);

	if (!effectivePathItem) return;

	// Collect path-level parameters
	const pathParams = effectivePathItem.parameters;
	if (Array.isArray(pathParams)) {
		for (let i = 0; i < pathParams.length; i++) {
			const paramPointer = joinPointer([
				"paths",
				pathString,
				"parameters",
				String(i),
			]);
			collectParameter(collectors, resolver, uri, paramPointer, pathParams[i], {
				uri,
				pointer,
			});
		}
	}

	// Process operations
	const operations: OperationRefInput[] = [];
	for (const method of HTTP_METHODS) {
		const opValue = effectivePathItem[method];
		if (!isObject(opValue)) continue;

		const operation = processOperation(
			collectors,
			resolver,
			uri,
			pathString,
			method,
			opValue,
			typeof maybeRef === "string" ? maybeRef : undefined,
			definitionUri,
			definitionPointer,
		);
		operations.push(operation);
	}

	collectors.operationsByOwner.set(nodeKey(uri, pointer), operations);
}

// ============================================================================
// Component Processing
// ============================================================================

/** Process all components in a document */
function processComponents(
	collectors: IndexCollectors,
	resolver: Resolver,
	uri: string,
	componentRoot: Record<string, unknown>,
): void {
	for (const section of COMPONENT_SECTIONS) {
		const entries = componentRoot[section];
		if (!isObject(entries)) continue;

		const bucket = collectors.components[section];
		for (const [name, value] of Object.entries(entries)) {
			if (!isObject(value)) continue;

			const pointer = joinPointer(["components", section, name]);
			bucket?.set(name, { uri, pointer, node: value });

			// Index into type-specific maps
			switch (section) {
				case "schemas":
					collectSchema(collectors, uri, pointer, value);
					break;

				case "parameters":
					collectors.parameters.set(nodeKey(uri, pointer), {
						uri,
						pointer,
						node: value,
						name: typeof value.name === "string" ? value.name : undefined,
						in: typeof value.in === "string" ? value.in : undefined,
					});
					break;

				case "responses":
					collectResponse(
						collectors,
						resolver,
						uri,
						pointer,
						value,
						{ uri, pointer },
						name,
					);
					break;

				case "requestBodies":
					collectors.requestBodies.set(nodeKey(uri, pointer), {
						uri,
						pointer,
						node: value,
					});
					collectMediaTypesFromContent(
						collectors,
						uri,
						pointer,
						value.content,
						"content",
					);
					break;

				case "headers":
					collectors.headers.set(nodeKey(uri, pointer), {
						uri,
						pointer,
						node: value,
						name,
					});
					collectExamplesFromObject(
						collectors,
						uri,
						pointer,
						value,
						"examples",
					);
					break;

				case "examples":
					collectors.examples.set(nodeKey(uri, pointer), {
						uri,
						pointer,
						node: value,
						name,
					});
					break;

				case "links":
					collectors.links.set(nodeKey(uri, pointer), {
						uri,
						pointer,
						node: value,
						name,
					});
					break;

				case "callbacks":
					collectors.callbacks.set(nodeKey(uri, pointer), {
						uri,
						pointer,
						node: value,
						name,
					});
					break;
			}
		}
	}
}

// ============================================================================
// Fragment Document Processing
// ============================================================================

/** Process a standalone fragment document (not a full OpenAPI doc) */
function processFragmentDocument(
	collectors: IndexCollectors,
	resolver: Resolver,
	uri: string,
	root: Record<string, unknown>,
): void {
	const docType = identifyDocumentType(root);

	// Standalone schema
	const looksLikeSchema =
		typeof root.type === "string" &&
		root.properties !== undefined &&
		typeof root.properties === "object";

	if (looksLikeSchema || docType === "schema") {
		collectSchema(collectors, uri, "#", root);
	}

	// Standalone parameter
	if (docType === "parameter") {
		collectors.parameters.set(nodeKey(uri, "#"), {
			uri,
			pointer: "#",
			node: root,
			name: typeof root.name === "string" ? root.name : undefined,
			in: typeof root.in === "string" ? root.in : undefined,
		});
	}

	// Standalone response
	if (docType === "response") {
		collectors.responses.set(nodeKey(uri, "#"), {
			uri,
			pointer: "#",
			node: root,
			statusCode:
				typeof root.statusCode === "string" ? root.statusCode : undefined,
		});
	}

	// Standalone requestBody (has content but no OpenAPI markers)
	if (
		root.content !== undefined &&
		typeof root.content === "object" &&
		!("openapi" in root) &&
		!("info" in root) &&
		!("paths" in root) &&
		!("components" in root) &&
		!("name" in root) &&
		!("in" in root)
	) {
		collectors.requestBodies.set(nodeKey(uri, "#"), {
			uri,
			pointer: "#",
			node: root,
		});
	}

	// Standalone example
	if (docType === "example") {
		collectors.examples.set(nodeKey(uri, "#"), {
			uri,
			pointer: "#",
			node: root,
		});
	}

	// Standalone PathItem fragment
	if (docType === "path-item") {
		processPathItemFragment(collectors, resolver, uri, root);
	}
}

/** Process a standalone PathItem fragment */
function processPathItemFragment(
	collectors: IndexCollectors,
	resolver: Resolver,
	uri: string,
	root: Record<string, unknown>,
): void {
	const pathItemPointer = "#";
	const fragmentPathKey = `__fragment__${uri}`;

	const pathItem: PathItemRefInput = {
		uri,
		pointer: pathItemPointer,
		definitionUri: uri,
		definitionPointer: pathItemPointer,
		node: root,
	};

	pushMap(collectors.pathsByString, fragmentPathKey, pathItem);
	collectors.pathItemsByPointer.set(nodeKey(uri, pathItemPointer), pathItem);
	pushMap(
		collectors.pathItemsToPaths,
		nodeKey(uri, pathItemPointer),
		fragmentPathKey,
	);

	// Process operations
	for (const method of HTTP_METHODS) {
		const opValue = root[method];
		if (!isObject(opValue)) continue;

		const opPointer = joinPointer([method]);
		const operation: OperationRefInput = {
			uri,
			pointer: opPointer,
			definitionUri: uri,
			definitionPointer: opPointer,
			method,
			node: opValue,
		};

		collectors.operationsByPointer.set(nodeKey(uri, opPointer), operation);
		pushMap(
			collectors.operationsByOwner,
			`${uri}#${pathItemPointer}`,
			operation,
		);

		const origin = { uri, pointer: opPointer };

		// Parameters
		const params = opValue.parameters;
		if (Array.isArray(params)) {
			for (let i = 0; i < params.length; i++) {
				const paramPointer = joinPointer([method, "parameters", String(i)]);
				collectParameter(
					collectors,
					resolver,
					uri,
					paramPointer,
					params[i],
					origin,
				);
			}
		}

		// Request body
		if (opValue.requestBody) {
			const rbPointer = joinPointer([method, "requestBody"]);
			collectRequestBody(
				collectors,
				resolver,
				uri,
				rbPointer,
				opValue.requestBody,
				origin,
			);
		}

		// Responses
		const responses = opValue.responses;
		if (isObject(responses)) {
			for (const [statusCode, responseValue] of Object.entries(responses)) {
				const responsePointer = joinPointer([method, "responses", statusCode]);
				collectResponse(
					collectors,
					resolver,
					uri,
					responsePointer,
					responseValue,
					origin,
					statusCode,
				);
			}
		}

		// Security
		collectSecurityRequirements(
			collectors,
			uri,
			opPointer,
			opValue.security,
			"operation",
		);
	}

	// Path-level parameters
	const pathParams = root.parameters;
	if (Array.isArray(pathParams)) {
		for (let i = 0; i < pathParams.length; i++) {
			const paramPointer = joinPointer(["parameters", String(i)]);
			collectParameter(collectors, resolver, uri, paramPointer, pathParams[i], {
				uri,
				pointer: pathItemPointer,
			});
		}
	}
}

// ============================================================================
// Scope Provider
// ============================================================================

function createScopeProvider(
	documents: Map<string, Record<string, unknown>>,
	_pathItems: Map<string, PathItemRefInput>,
	_operations: Map<string, OperationRefInput>,
) {
	return (uri: string, pointer: JsonPointer): ScopeContext | null => {
		const document = documents.get(uri);
		if (!document) return null;

		const segments = splitPointer(pointer);
		const ancestors: Array<{ kind: string; pointer: JsonPointer }> = [];
		let pathContext: ScopeContext["path"];
		let operationContext: ScopeContext["operation"];
		let parameterContext: ScopeContext["parameter"];
		let securityContext: ScopeContext["security"];
		let componentContext: ScopeContext["component"];

		for (let i = 0; i < segments.length; i++) {
			const kind = segments[i];
			if (!kind) continue;
			const ancestorPointer = joinPointer(segments.slice(0, i + 1));
			ancestors.push({ kind, pointer: ancestorPointer });

			if (kind === "paths" && i + 1 < segments.length) {
				const pathName = segments[i + 1];
				if (!pathName) continue;
				pathContext = {
					name: pathName,
					pointer: joinPointer(["paths", pathName]),
				};
			}

			if (pathContext && !operationContext && i + 1 < segments.length) {
				const candidate = segments[i + 1];
				if (
					candidate &&
					HTTP_METHODS.includes(candidate as (typeof HTTP_METHODS)[number])
				) {
					operationContext = {
						method: candidate,
						pointer: joinPointer(["paths", pathContext.name, candidate]),
					};
				}
			}

			if (kind === "parameters" && i + 1 < segments.length) {
				const paramPointer = joinPointer(segments.slice(0, i + 2));
				const param = getValueAtPointer(document, paramPointer) as
					| Record<string, unknown>
					| undefined;
				if (param && typeof param === "object") {
					parameterContext = {
						pointer: paramPointer,
						name: typeof param.name === "string" ? param.name : undefined,
						in: typeof param.in === "string" ? param.in : undefined,
					};
				}
			}

			if (kind === "security") {
				const secPointer = joinPointer(segments.slice(0, i + 1));
				const level = operationContext ? "operation" : "root";
				const requirement = getValueAtPointer(document, secPointer);
				const scheme =
					Array.isArray(requirement) && requirement.length
						? Object.keys((requirement[0] as Record<string, unknown>) ?? {})[0]
						: undefined;
				securityContext = { level, pointer: secPointer, scheme };
			}

			if (segments[0] === "components" && segments.length >= 3) {
				const section = segments[1];
				const name = segments[2];
				if (typeof section === "string" && typeof name === "string") {
					componentContext = {
						type: section,
						name,
						pointer: joinPointer(["components", section, name]),
					};
				}
			}
		}

		return {
			documentUri: uri,
			pointer,
			ancestors,
			path: pathContext,
			operation: operationContext,
			parameter: parameterContext,
			security: securityContext,
			component: componentContext,
		};
	};
}

// ============================================================================
// Webhook Processing (OpenAPI 3.1+)
// ============================================================================

/**
 * Process webhooks defined at the root level (OpenAPI 3.1+).
 * Webhooks have the same structure as PathItems but are defined under
 * the `webhooks` key rather than `paths`.
 */
function processWebhooks(
	collectors: IndexCollectors,
	resolver: Resolver,
	uri: string,
	webhooksObj: Record<string, unknown>,
): void {
	for (const [webhookName, webhookValue] of Object.entries(webhooksObj)) {
		if (!isObject(webhookValue)) continue;

		const pointer = joinPointer(["webhooks", webhookName]);

		// Resolve $ref if present
		let effectiveWebhook: Record<string, unknown> | undefined = webhookValue;
		let definitionUri = uri;
		let definitionPointer = pointer;
		const maybeRef = webhookValue.$ref;

		if (typeof maybeRef === "string") {
			const target = tryDeref<Record<string, unknown>>(
				resolver,
				{ uri, pointer },
				maybeRef,
			);
			if (target) {
				const targetOrigin = resolver.originOf(target);
				if (targetOrigin) {
					definitionUri = targetOrigin.uri;
					definitionPointer = targetOrigin.pointer;
				}
				effectiveWebhook = target;
			} else {
				effectiveWebhook = undefined;
			}
		}

		const webhook: WebhookRef = {
			uri,
			pointer,
			name: webhookName,
			definitionUri,
			definitionPointer,
			referenceUri: typeof maybeRef === "string" ? uri : undefined,
			referencePointer: typeof maybeRef === "string" ? pointer : undefined,
			node: webhookValue,
		};

		collectors.webhooks.set(nodeKey(uri, pointer), webhook);

		if (!effectiveWebhook) continue;

		// Webhooks also get their operations indexed (like paths)
		// Process webhook-level parameters
		const webhookParams = effectiveWebhook.parameters;
		if (Array.isArray(webhookParams)) {
			for (let i = 0; i < webhookParams.length; i++) {
				const paramPointer = joinPointer([
					"webhooks",
					webhookName,
					"parameters",
					String(i),
				]);
				collectParameter(
					collectors,
					resolver,
					uri,
					paramPointer,
					webhookParams[i],
					{ uri, pointer },
				);
			}
		}

		// Process operations within webhooks
		const operations: OperationRefInput[] = [];
		for (const method of HTTP_METHODS) {
			const opValue = effectiveWebhook[method];
			if (!isObject(opValue)) continue;

			const opPointer = joinPointer(["webhooks", webhookName, method]);
			const opDefinitionPointer = joinPointer([
				...splitPointer(definitionPointer),
				method,
			]);

			const operation: OperationRefInput = {
				uri,
				pointer: opPointer,
				definitionUri,
				definitionPointer: opDefinitionPointer,
				referenceUri: typeof maybeRef === "string" ? uri : undefined,
				referencePointer: typeof maybeRef === "string" ? opPointer : undefined,
				method,
				node: opValue,
			};

			collectors.operationsByPointer.set(nodeKey(uri, opPointer), operation);

			const origin = { uri, pointer: opPointer };

			// Collect parameters
			const params = opValue.parameters;
			if (Array.isArray(params)) {
				for (let i = 0; i < params.length; i++) {
					const paramPointer = joinPointer([
						...splitPointer(opPointer),
						"parameters",
						String(i),
					]);
					collectParameter(
						collectors,
						resolver,
						uri,
						paramPointer,
						params[i],
						origin,
					);
				}
			}

			// Collect request body
			if (opValue.requestBody) {
				const rbPointer = joinPointer([
					...splitPointer(opPointer),
					"requestBody",
				]);
				collectRequestBody(
					collectors,
					resolver,
					uri,
					rbPointer,
					opValue.requestBody,
					origin,
				);
			}

			// Collect responses
			const responses = opValue.responses;
			if (isObject(responses)) {
				for (const [statusCode, responseValue] of Object.entries(responses)) {
					const responsePointer = joinPointer([
						...splitPointer(opPointer),
						"responses",
						statusCode,
					]);
					collectResponse(
						collectors,
						resolver,
						uri,
						responsePointer,
						responseValue,
						origin,
						statusCode,
					);
				}
			}

			// Collect security requirements
			collectSecurityRequirements(
				collectors,
				uri,
				opPointer,
				opValue.security,
				"operation",
			);

			// Collect callbacks
			collectCallbacks(collectors, uri, opPointer, opValue.callbacks);

			operations.push(operation);
		}

		collectors.operationsByOwner.set(nodeKey(uri, pointer), operations);
	}
}

// ============================================================================
// Main Build Function
// ============================================================================

/** Build a comprehensive index of all OpenAPI elements in a project */
export function buildIndex(options: BuildIndexOptions): ProjectIndex {
	const collectors: IndexCollectors = {
		pathsByString: new Map(),
		pathItemsToPaths: new Map(),
		operationsByOwner: new Map(),
		components: Object.fromEntries(
			COMPONENT_SECTIONS.map((s) => [s, new Map<string, ComponentRefInput>()]),
		) as Record<string, Map<string, ComponentRefInput>>,
		schemas: new Map(),
		parameters: new Map(),
		responses: new Map(),
		requestBodies: new Map(),
		headers: new Map(),
		mediaTypes: new Map(),
		securityRequirements: new Map(),
		examples: new Map(),
		links: new Map(),
		callbacks: new Map(),
		webhooks: new Map(),
		references: new Map(),
		documents: new Map(),
		pathItemsByPointer: new Map(),
		operationsByPointer: new Map(),
	};

	for (const [uri, doc] of options.docs) {
		const root = doc.ast as Record<string, unknown> | undefined;
		if (!root || typeof root !== "object") continue;

		collectors.documents.set(uri, root);

		// Collect all $ref nodes (cycle-safe traversal)
		collectReferences(root, uri, [], collectors.references);

		// Root-level security
		collectSecurityRequirements(collectors, uri, "", root.security, "root");

		// Process paths
		const paths = root.paths;
		if (isObject(paths)) {
			for (const [pathString, pathItemValue] of Object.entries(paths)) {
				if (!isObject(pathItemValue)) continue;
				processPathItem(
					collectors,
					options.resolver,
					uri,
					pathString,
					pathItemValue,
				);
			}
		}

		// Process webhooks (OpenAPI 3.1+)
		const webhooks = root.webhooks;
		if (isObject(webhooks)) {
			processWebhooks(collectors, options.resolver, uri, webhooks);
		}

		// Process components
		const componentRoot = root.components;
		if (isObject(componentRoot)) {
			processComponents(collectors, options.resolver, uri, componentRoot);
		}

		// Handle fragment documents
		const isRootOpenAPIDoc =
			typeof root.openapi === "string" ||
			root.info !== undefined ||
			root.paths !== undefined ||
			root.components !== undefined ||
			root.webhooks !== undefined;

		if (!isRootOpenAPIDoc) {
			processFragmentDocument(collectors, options.resolver, uri, root);
		}
	}

	// Determine version
	let version = "unknown";
	for (const doc of options.docs.values()) {
		if (doc.version !== "unknown") {
			version = doc.version;
			break;
		}
	}

	return {
		version,
		pathsByString: collectors.pathsByString,
		pathItemsToPaths: collectors.pathItemsToPaths,
		operationsByOwner: collectors.operationsByOwner,
		components: collectors.components,
		schemas: collectors.schemas,
		parameters: collectors.parameters,
		responses: collectors.responses,
		requestBodies: collectors.requestBodies,
		headers: collectors.headers,
		mediaTypes: collectors.mediaTypes,
		securityRequirements: collectors.securityRequirements,
		examples: collectors.examples,
		links: collectors.links,
		callbacks: collectors.callbacks,
		webhooks: collectors.webhooks,
		references: collectors.references,
		documents: collectors.documents,
		scopeProvider: createScopeProvider(
			collectors.documents,
			collectors.pathItemsByPointer,
			collectors.operationsByPointer,
		),
	};
}
