/**
 * Ref Enrichment Module
 *
 * Provides factory functions to enrich visitor refs with typed accessor methods.
 * These methods allow rules to access node properties without manual casting
 * or using the accessor() helper.
 *
 * ## Architecture
 *
 * The enrichment system adds typed accessor methods to "refs" (visitor payloads)
 * at runtime. This provides a clean API for rule authors while maintaining
 * type safety and performance through caching.
 *
 * ### Supported Ref Types
 *
 * | Ref Type | Enrichment Function | Key Methods |
 * |----------|---------------------|-------------|
 * | RootRef | enrichRootRef | openapi(), info(), servers(), eachPath() |
 * | PathItemRef | enrichPathItemRef | path(), operations(), hasOperation() |
 * | OperationRef | enrichOperationRef | summary(), tags(), eachParameter(), eachResponse() |
 * | SchemaRef | enrichSchemaRef | type(), isArray(), eachProperty(), eachAllOf() |
 * | ParameterRef | enrichParameterRef | getName(), getIn(), isQuery(), hasExample() |
 * | ResponseRef | enrichResponseRef | description(), isSuccess(), eachHeader(), eachMediaType() |
 * | RequestBodyRef | enrichRequestBodyRef | required(), content(), eachMediaType() |
 * | HeaderRef | enrichHeaderRef | description(), schema(), eachExample() |
 * | MediaTypeRef | enrichMediaTypeRef | schema(), example(), encoding() |
 * | ExampleRef | enrichExampleRef | value(), externalValue(), isExternal() |
 * | LinkRef | enrichLinkRef | operationId(), parameters(), description() |
 * | CallbackRef | enrichCallbackRef | expressions(), eachPathItem() |
 * | ComponentRef | enrichComponentRef | componentType(), componentName(), isSchema() |
 * | TagRef | enrichTagRef | name(), description(), parent() |
 * | SecuritySchemeRef | enrichSecuritySchemeRef | type(), flows(), apiKeyIn() |
 *
 * ### Caching Strategy
 *
 * All accessor methods use lazy-evaluated caching to ensure:
 * - Values are computed only once per ref (not per access)
 * - Multiple rules can access the same ref efficiently
 * - Memory is conserved by only caching accessed values
 *
 * ### Usage in Rules
 *
 * Rules receive enriched refs automatically when using the visitor pattern:
 *
 * ```typescript
 * export default defineRule({
 *   meta: { id: "my-rule", ... },
 *   check(ctx) {
 *     return {
 *       Operation(op) {
 *         // Use typed accessors directly - no casting needed
 *         const summary = op.summary();
 *         const tags = op.tags();
 *
 *         // Iteration with auto-constructed refs
 *         op.eachParameter((param, paramRef) => {
 *           if (paramRef.isQuery() && !paramRef.hasExample()) {
 *             ctx.reportAt(paramRef, "example", { ... });
 *           }
 *         });
 *       },
 *       Schema(schema) {
 *         if (schema.isRef()) return; // Skip $ref schemas
 *         if (schema.isArray() && !schema.hasItems()) {
 *           ctx.reportHere(schema, { message: "Array needs items", ... });
 *         }
 *       }
 *     };
 *   }
 * });
 * ```
 *
 * @module indexes/ref-enrichment
 *
 * @see {@link ../rules/types.ts} - Ref type definitions
 * @see {@link ../execution/runner.ts} - Where enrichment is applied
 * @see {@link ../rules/node-accessor.ts} - Alternative accessor for edge cases
 */

import type {
	CallbackRef,
	ComponentRef,
	ComponentsNode,
	ExampleRef,
	ExternalDocsNode,
	HeaderRef,
	InfoNode,
	ItemRef,
	LinkRef,
	MediaTypeRef,
	OAuthFlowNode,
	OAuthFlowRef,
	OAuthFlowsNode,
	OAuthFlowType,
	OperationRef,
	ParameterLocation,
	ParameterRef,
	PathItemRef,
	RequestBodyRef,
	ResponseRef,
	RootRef,
	SchemaRef,
	SecuritySchemeRef,
	ServerNode,
	TagRef,
} from "./types.js";

// ============================================================================
// Caching Infrastructure
// ============================================================================

/**
 * Create a cached getter factory for a ref.
 *
 * Returns a function that lazily computes and caches values by key.
 * This ensures expensive computations (like parsing or string operations)
 * are only performed once per ref, even when accessed multiple times
 * by different rules.
 *
 * @returns A caching function that takes a key and compute function
 *
 * @example
 * ```typescript
 * const $ = createCache();
 * // First call computes and caches
 * const summary = $("summary", () => getString(node, "summary"));
 * // Second call returns cached value
 * const summary2 = $("summary", () => getString(node, "summary"));
 * ```
 *
 * @internal
 */
function createCache() {
	const cache = new Map<string, unknown>();

	return function cached<T>(key: string, compute: () => T): T {
		if (cache.has(key)) {
			return cache.get(key) as T;
		}
		const value = compute();
		cache.set(key, value);
		return value;
	};
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Safely extract a string field from an unknown node.
 *
 * Handles null, undefined, non-object, and wrong type values gracefully
 * by returning undefined instead of throwing.
 *
 * @param node - The node to extract from (may be null/undefined/non-object)
 * @param field - Field name to extract
 * @returns The string value, or undefined if not a string or field doesn't exist
 *
 * @example
 * ```typescript
 * getString({ name: "test" }, "name") // "test"
 * getString({ name: 123 }, "name")    // undefined
 * getString(null, "name")             // undefined
 * ```
 *
 * @internal
 */
function getString(node: unknown, field: string): string | undefined {
	if (!node || typeof node !== "object") return undefined;
	const obj = node as Record<string, unknown>;
	const val = obj[field];
	return typeof val === "string" ? val : undefined;
}

/**
 * Safely extract a boolean field from an unknown node.
 *
 * Returns true only if the field value is exactly `true`.
 * Returns false for missing fields, non-boolean values, or null/undefined nodes.
 *
 * @param node - The node to extract from (may be null/undefined/non-object)
 * @param field - Field name to extract
 * @returns true if field value is exactly true, false otherwise
 *
 * @example
 * ```typescript
 * getBoolean({ active: true }, "active")   // true
 * getBoolean({ active: false }, "active")  // false
 * getBoolean({ active: "true" }, "active") // false (wrong type)
 * getBoolean({}, "active")                 // false (missing)
 * ```
 *
 * @internal
 */
function getBoolean(node: unknown, field: string): boolean {
	if (!node || typeof node !== "object") return false;
	const obj = node as Record<string, unknown>;
	return obj[field] === true;
}

/**
 * Safely extract an array field from an unknown node.
 *
 * Returns an empty array if the field is missing, not an array, or node is invalid.
 *
 * @typeParam T - The expected element type of the array
 * @param node - The node to extract from (may be null/undefined/non-object)
 * @param field - Field name to extract
 * @returns The array value, or empty array if not found/not an array
 *
 * @example
 * ```typescript
 * getArray<string>({ tags: ["a", "b"] }, "tags") // ["a", "b"]
 * getArray<string>({ tags: "not-array" }, "tags") // []
 * getArray<string>({}, "tags")                    // []
 * ```
 *
 * @internal
 */
function getArray<T>(node: unknown, field: string): T[] {
	if (!node || typeof node !== "object") return [];
	const obj = node as Record<string, unknown>;
	const val = obj[field];
	return Array.isArray(val) ? (val as T[]) : [];
}

/**
 * Safely extract an object field from an unknown node.
 *
 * Returns undefined if the field is missing, not an object, is an array,
 * or the node is invalid.
 *
 * @param node - The node to extract from (may be null/undefined/non-object)
 * @param field - Field name to extract
 * @returns The object value, or undefined if not found/not an object
 *
 * @example
 * ```typescript
 * getObject({ info: { title: "API" } }, "info") // { title: "API" }
 * getObject({ info: [] }, "info")               // undefined (array)
 * getObject({ info: "string" }, "info")         // undefined
 * ```
 *
 * @internal
 */
function getObject(
	node: unknown,
	field: string,
): Record<string, unknown> | undefined {
	if (!node || typeof node !== "object") return undefined;
	const obj = node as Record<string, unknown>;
	const val = obj[field];
	if (val && typeof val === "object" && !Array.isArray(val)) {
		return val as Record<string, unknown>;
	}
	return undefined;
}

/**
 * Check if a node has a $ref field.
 *
 * Used to detect JSON Reference objects in OpenAPI documents.
 *
 * @param node - The node to check
 * @returns true if node is an object containing a "$ref" property
 *
 * @example
 * ```typescript
 * hasRef({ "$ref": "#/components/schemas/User" }) // true
 * hasRef({ type: "object" })                       // false
 * hasRef(null)                                     // false
 * ```
 *
 * @internal
 */
function hasRef(node: unknown): boolean {
	if (!node || typeof node !== "object") return false;
	return "$ref" in (node as Record<string, unknown>);
}

/**
 * Get any field value from a node without type checking.
 *
 * Use when the field type is unknown or varies. For typed access,
 * prefer getString, getBoolean, getArray, or getObject.
 *
 * @param node - The node to extract from
 * @param field - Field name to extract
 * @returns The raw field value, or undefined if not found
 *
 * @example
 * ```typescript
 * getAny({ example: [1, 2, 3] }, "example") // [1, 2, 3]
 * getAny({ example: "string" }, "example")  // "string"
 * ```
 *
 * @internal
 */
function getAny(node: unknown, field: string): unknown {
	if (!node || typeof node !== "object") return undefined;
	return (node as Record<string, unknown>)[field];
}

/**
 * Check if a node has a field defined.
 *
 * Uses `in` operator, so returns true even if field value is undefined or null.
 *
 * @param node - The node to check
 * @param field - Field name to check for
 * @returns true if field exists in node
 *
 * @example
 * ```typescript
 * hasField({ name: "test" }, "name")      // true
 * hasField({ name: undefined }, "name")   // true
 * hasField({}, "name")                    // false
 * ```
 *
 * @internal
 */
function hasField(node: unknown, field: string): boolean {
	if (!node || typeof node !== "object") return false;
	return field in (node as Record<string, unknown>);
}

/**
 * Safely extract a number field from an unknown node.
 *
 * Returns undefined if the field is missing or not a number.
 *
 * @param node - The node to extract from
 * @param field - Field name to extract
 * @returns The number value, or undefined if not found/not a number
 *
 * @example
 * ```typescript
 * getNumber({ minLength: 5 }, "minLength") // 5
 * getNumber({ minLength: "5" }, "minLength") // undefined
 * getNumber({}, "minLength") // undefined
 * ```
 *
 * @internal
 */
function getNumber(node: unknown, field: string): number | undefined {
	if (!node || typeof node !== "object") return undefined;
	const obj = node as Record<string, unknown>;
	const val = obj[field];
	return typeof val === "number" ? val : undefined;
}

/**
 * HTTP methods to check for operations.
 * Includes "query" for OpenAPI 3.2+ support.
 */
const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace", "query"];

// ============================================================================
// RootRef Enrichment
// ============================================================================

/**
 * Enrich a RootRef with typed accessor methods.
 *
 * Provides cached, typed access to root-level OpenAPI document properties
 * including info, servers, paths, components, and security.
 *
 * @param ref - The raw document reference containing uri, pointer, and node
 * @param pathItemsByPath - Optional map of path items for eachPath iteration
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * Document(doc) {
 *   const version = doc.openapi();      // "3.1.0"
 *   const info = doc.info();            // { title, version, ... }
 *   const servers = doc.servers();      // ServerNode[]
 *
 *   // Iterate with typed refs
 *   doc.eachPath((pathStr, pathItem, ref) => {
 *     console.log(`Path: ${pathStr}`);
 *   });
 *
 *   doc.eachSecurityScheme((name, scheme, ref) => {
 *     if (ref.type() === "oauth2") { ... }
 *   });
 * }
 * ```
 *
 * @see {@link RootRef} - Type definition
 * @see {@link enrichPathItemRef} - Related enrichment for path items
 */
export function enrichRootRef(
	ref: Pick<RootRef, "uri" | "pointer" | "node">,
	pathItemsByPath?: Map<string, PathItemRef[]>,
): RootRef {
	const node = ref.node;
	const $ = createCache();

	return {
		...ref,

		// Root-level field accessors
		openapi: () => $(
			"openapi",
			() => getString(node, "openapi"),
		),
		info: () => $(
			"info",
			() => getObject(node, "info") as InfoNode | undefined,
		),
		servers: () => $(
			"servers",
			() => getArray<ServerNode>(node, "servers"),
		),
		paths: () => $(
			"paths",
			() => getObject(node, "paths"),
		),
		components: () => $(
			"components",
			() => getObject(node, "components") as ComponentsNode | undefined,
		),
		security: () => $(
			"security",
			() => getArray<Record<string, string[]>>(node, "security"),
		),
		tags: () => $(
			"tags",
			() => getArray<{ name: string; description?: string }>(node, "tags"),
		),
		externalDocs: () => $(
			"externalDocs",
			() => getObject(node, "externalDocs") as ExternalDocsNode | undefined,
		),

		// Component shortcuts
		schemas: () => $(
			"schemas",
			() => {
				const components = getObject(node, "components");
				return components ? getObject(components, "schemas") : undefined;
			},
		),
		securitySchemes: () => $(
			"securitySchemes",
			() => {
				const components = getObject(node, "components");
				return components ? getObject(components, "securitySchemes") : undefined;
			},
		),
		componentParameters: () => $(
			"componentParameters",
			() => {
				const components = getObject(node, "components");
				return components ? getObject(components, "parameters") : undefined;
			},
		),
		componentResponses: () => $(
			"componentResponses",
			() => {
				const components = getObject(node, "components");
				return components ? getObject(components, "responses") : undefined;
			},
		),
		componentRequestBodies: () => $(
			"componentRequestBodies",
			() => {
				const components = getObject(node, "components");
				return components ? getObject(components, "requestBodies") : undefined;
			},
		),
		componentHeaders: () => $(
			"componentHeaders",
			() => {
				const components = getObject(node, "components");
				return components ? getObject(components, "headers") : undefined;
			},
		),
		componentExamples: () => $(
			"componentExamples",
			() => {
				const components = getObject(node, "components");
				return components ? getObject(components, "examples") : undefined;
			},
		),

		// Iteration helpers (not cached - iterate fresh each time)
		eachServer(fn) {
			const servers = getArray<ServerNode>(node, "servers");
			servers.forEach((server, index) => {
				fn(server, {
					uri: ref.uri,
					pointer: `#/servers/${index}`,
					node: server,
					index,
				});
			});
		},

		eachTag(fn) {
			const tags = getArray<{ name: string; description?: string }>(node, "tags");
			tags.forEach((tag, index) => {
				const tagRef = enrichTagRef(
					ref.uri,
					`#/tags/${index}`,
					tag,
					index,
				);
				fn(tag, tagRef);
			});
		},

		eachSecurityScheme(fn) {
			const schemes = getObject(getObject(node, "components"), "securitySchemes");
			if (!schemes) return;
			Object.entries(schemes).forEach(([name, scheme]) => {
				const schemeRef = enrichSecuritySchemeRef(
					ref.uri,
					`#/components/securitySchemes/${name}`,
					scheme,
					name,
				);
				fn(name, scheme, schemeRef);
			});
		},

		eachPath(fn) {
			// If we have path items from the index, use those (includes resolved refs)
			if (pathItemsByPath) {
				for (const [path, refs] of pathItemsByPath) {
					for (const pathRef of refs) {
						if (pathRef.uri === ref.uri) {
							fn(path, pathRef.node, pathRef);
						}
					}
				}
				return;
			}
			// Otherwise, iterate the raw paths object
			const paths = getObject(node, "paths");
			if (!paths) return;
			Object.entries(paths).forEach(([path, pathItem]) => {
				const pathRef: PathItemRef = {
					uri: ref.uri,
					pointer: `#/paths/${encodeURIComponent(path).replace(/~/g, "~0").replace(/\//g, "~1")}`,
					definitionUri: ref.uri,
					definitionPointer: `#/paths/${encodeURIComponent(path).replace(/~/g, "~0").replace(/\//g, "~1")}`,
					node: pathItem,
					// Add stub methods - will be enriched properly elsewhere
					path: () => path,
					paths: () => [path],
					hasOperation: () => false,
					getOperation: () => undefined,
					operations: () => [],
					summary: () => undefined,
					description: () => undefined,
					parameters: () => [],
				};
				fn(path, pathItem, pathRef);
			});
		},

		// Convenience checks (cached)
		hasServers: () => $(
			"hasServers",
			() => getArray<ServerNode>(node, "servers").length > 0,
		),
		hasComponents: () => $(
			"hasComponents",
			() => !!getObject(node, "components"),
		),
		hasSecuritySchemes: () => $(
			"hasSecuritySchemes",
			() => {
				const components = getObject(node, "components");
				if (!components) return false;
				const schemes = getObject(components, "securitySchemes");
				return !!schemes && Object.keys(schemes).length > 0;
			},
		),
		hasPaths: () => $(
			"hasPaths",
			() => {
				const paths = getObject(node, "paths");
				return !!paths && Object.keys(paths).length > 0;
			},
		),
	};
}

// ============================================================================
// PathItemRef Enrichment
// ============================================================================

/**
 * Enrich a PathItemRef with typed accessor methods.
 *
 * Provides cached, typed access to path item properties including
 * operations, path-level parameters, and OpenAPI 3.2+ features.
 *
 * @param ref - The raw path item reference
 * @param pathStrings - Optional array of path strings for aliases
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * PathItem(path) {
 *   const pathStr = path.path();           // "/users/{id}"
 *   const ops = path.operations();         // [{ method: "get", ... }]
 *
 *   if (path.hasOperation("get")) {
 *     const getOp = path.getOperation("get");
 *   }
 *
 *   // OpenAPI 3.2+
 *   if (path.hasQuery()) {
 *     const query = path.query();
 *   }
 * }
 * ```
 *
 * @see {@link PathItemRef} - Type definition
 * @see {@link enrichOperationRef} - Related enrichment for operations
 */
export function enrichPathItemRef(
	ref: PathItemRef,
	pathStrings?: string[],
): PathItemRef {
	const node = ref.node;
	const $ = createCache();

	// Extract path from pointer: #/paths/~1users~1{id} -> /users/{id}
	function extractPathFromPointer(pointer: string): string | undefined {
		const match = pointer.match(/^#\/paths\/(.+)$/);
		if (!match) return undefined;
		// Decode JSON pointer encoding
		return decodeURIComponent(match[1].replace(/~1/g, "/").replace(/~0/g, "~"));
	}

	return {
		...ref,

		// Path string accessors
		path: () => $(
			"path",
			() => pathStrings?.[0] ?? extractPathFromPointer(ref.pointer),
		),
		paths: () => $(
			"paths",
			() => pathStrings ?? [extractPathFromPointer(ref.pointer)].filter(Boolean) as string[],
		),

		// Operation helpers
		hasOperation: (method: string) => $(
			`hasOp_${method}`,
			() => hasField(node, method.toLowerCase()),
		),
		getOperation: (method: string) => $(
			`getOp_${method}`,
			() => getAny(node, method.toLowerCase()),
		),
		operations: () => $(
			"operations",
			() => {
				const ops: Array<{ method: string; operation: unknown }> = [];
				for (const method of HTTP_METHODS) {
					const op = getAny(node, method);
					if (op) {
						ops.push({ method, operation: op });
					}
				}
				return ops;
			},
		),

		// Field accessors
		summary: () => $(
			"summary",
			() => getString(node, "summary"),
		),
		description: () => $(
			"description",
			() => getString(node, "description"),
		),
		parameters: () => $(
			"parameters",
			() => getArray<unknown>(node, "parameters"),
		),

		// OpenAPI 3.2+ accessors
		query: () => $(
			"query",
			() => getAny(node, "query"),
		),
		hasQuery: () => $(
			"hasQuery",
			() => hasField(node, "query"),
		),
		additionalOperations: () => $(
			"additionalOperations",
			() => getObject(node, "additionalOperations"),
		),
		hasAdditionalOperations: () => $(
			"hasAdditionalOperations",
			() => hasField(node, "additionalOperations"),
		),
	};
}

// ============================================================================
// OperationRef Enrichment
// ============================================================================

/**
 * Enrich an OperationRef with typed accessor methods.
 *
 * Provides cached, typed access to operation properties including
 * summary, description, tags, parameters, responses, and more.
 * This is one of the most commonly used enrichment functions.
 *
 * @param ref - The raw operation reference
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * Operation(op) {
 *   // Basic field access
 *   const summary = op.summary();
 *   const opId = op.operationId();
 *   const tags = op.tags();  // string[]
 *
 *   // Check deprecated status
 *   if (op.deprecated()) {
 *     const desc = op.description();
 *   }
 *
 *   // Response checks
 *   if (!op.hasSuccessResponse()) {
 *     ctx.reportHere(op, { message: "Missing success response" });
 *   }
 *
 *   // Iteration with typed refs
 *   op.eachParameter((param, paramRef) => {
 *     if (paramRef.isPath() && !paramRef.required()) {
 *       // Path params should be required
 *     }
 *   });
 *
 *   op.eachResponse((code, resp, respRef) => {
 *     if (respRef.isSuccess() && !respRef.hasContent()) {
 *       // Success should have content
 *     }
 *   });
 * }
 * ```
 *
 * @see {@link OperationRef} - Type definition
 * @see {@link enrichParameterRef} - Related enrichment for parameters
 * @see {@link enrichResponseRef} - Related enrichment for responses
 */
export function enrichOperationRef(ref: OperationRef): OperationRef {
	const node = ref.node;
	const $ = createCache();

	return {
		...ref,

		// Field accessors (cached)
		summary: () => $(
			"summary",
			() => getString(node, "summary"),
		),
		description: () => $(
			"description",
			() => getString(node, "description"),
		),
		operationId: () => $(
			"operationId",
			() => getString(node, "operationId"),
		),
		deprecated: () => $(
			"deprecated",
			() => getBoolean(node, "deprecated"),
		),
		tags: () => $(
			"tags",
			() => getArray<string>(node, "tags"),
		),
		externalDocs: () => $(
			"externalDocs",
			() => getObject(node, "externalDocs") as ExternalDocsNode | undefined,
		),

		// Array iteration (not cached - iterate fresh each time)
		eachTag(fn) {
			const tags = getArray<string>(node, "tags");
			tags.forEach((tag, index) => {
				fn(tag, {
					uri: ref.uri,
					pointer: `${ref.pointer}/tags/${index}`,
					node: tag,
					index,
				});
			});
		},

		eachParameter(fn) {
			const params = getArray<unknown>(node, "parameters");
			params.forEach((param, index) => {
				const paramRef = enrichParameterRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/parameters/${index}`,
					node: param,
					name: getString(param, "name"),
					in: getString(param, "in"),
					// Stub methods - will be filled by enrichParameterRef
					getName: () => undefined,
					getIn: () => undefined,
					description: () => undefined,
					required: () => false,
					deprecated: () => false,
					schema: () => undefined,
					example: () => undefined,
					examples: () => undefined,
					hasSchema: () => false,
					schemaType: () => undefined,
					hasExample: () => false,
					isRef: () => false,
					isQuery: () => false,
					isPath: () => false,
					isHeader: () => false,
					isCookie: () => false,
					style: () => undefined,
					explode: () => false,
					allowReserved: () => false,
					allowEmptyValue: () => false,
					content: () => undefined,
				});
				fn(param, paramRef);
			});
		},

		eachResponse(fn) {
			const responses = getObject(node, "responses");
			if (!responses) return;
			Object.entries(responses).forEach(([code, resp]) => {
				const respRef = enrichResponseRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/responses/${code}`,
					node: resp,
					statusCode: code,
					description: () => undefined,
					isRef: () => false,
					isSuccess: () => false,
					isError: () => false,
				});
				fn(code, resp, respRef);
			});
		},

		eachServer(fn) {
			const servers = getArray<ServerNode>(node, "servers");
			servers.forEach((server, index) => {
				fn(server, {
					uri: ref.uri,
					pointer: `${ref.pointer}/servers/${index}`,
					node: server,
					index,
				});
			});
		},

		eachSecurityRequirement(fn) {
			const security = getArray<Record<string, string[]>>(node, "security");
			security.forEach((req, index) => {
				fn(req, {
					uri: ref.uri,
					pointer: `${ref.pointer}/security/${index}`,
					node: req,
					index,
				});
			});
		},

		eachCallback(fn) {
			const callbacks = getObject(node, "callbacks");
			if (!callbacks) return;
			Object.entries(callbacks).forEach(([name, callbackNode]) => {
				const callbackRef = enrichCallbackRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/callbacks/${encodePointerSegment(name)}`,
					node: callbackNode,
					name,
					// Stub methods - will be filled by enrichCallbackRef
					isRef: () => false,
					expressions: () => [],
					eachPathItem: () => {},
				});
				fn(name, callbackNode, callbackRef);
			});
		},

		// Response helpers (cached)
		responses: () => $(
			"responses",
			() => getObject(node, "responses"),
		),
		hasResponses: () => $(
			"hasResponses",
			() => {
				const responses = getObject(node, "responses");
				return !!responses && Object.keys(responses).length > 0;
			},
		),
		hasResponse: (code: string) => {
			// Can't use $ for dynamic keys easily, but responses is cached
			const responses = getObject(node, "responses");
			return !!responses && code in responses;
		},
		hasSuccessResponse: () => $(
			"hasSuccessResponse",
			() => {
				const responses = getObject(node, "responses");
				if (!responses) return false;
				return Object.keys(responses).some(code => code.startsWith("2"));
			},
		),
		hasErrorResponse: () => $(
			"hasErrorResponse",
			() => {
				const responses = getObject(node, "responses");
				if (!responses) return false;
				return Object.keys(responses).some(code => code.startsWith("4") || code.startsWith("5"));
			},
		),

		// Request body helpers (cached)
		requestBody: () => $(
			"requestBody",
			() => getAny(node, "requestBody"),
		),
		hasRequestBody: () => $(
			"hasRequestBody",
			() => hasField(node, "requestBody"),
		),

		// Parameter helpers (cached)
		parameters: () => $(
			"parameters",
			() => getArray<unknown>(node, "parameters"),
		),
		hasParameters: () => $(
			"hasParameters",
			() => getArray<unknown>(node, "parameters").length > 0,
		),

		// Security helpers (cached)
		security: () => $(
			"security",
			() => getArray<Record<string, string[]>>(node, "security"),
		),
		hasSecurity: () => $(
			"hasSecurity",
			() => {
				const security = getArray<unknown>(node, "security");
				return security.length > 0;
			},
		),

		// Server helpers (cached)
		servers: () => $(
			"servers",
			() => getArray<ServerNode>(node, "servers"),
		),
		hasServers: () => $(
			"hasServers",
			() => {
				const servers = getArray<unknown>(node, "servers");
				return servers.length > 0;
			},
		),

		// Callback helpers (cached)
		callbacks: () => $(
			"callbacks",
			() => getObject(node, "callbacks"),
		),
		hasCallbacks: () => $(
			"hasCallbacks",
			() => {
				const callbacks = getObject(node, "callbacks");
				return !!callbacks && Object.keys(callbacks).length > 0;
			},
		),
	};
}

// ============================================================================
// SchemaRef Enrichment
// ============================================================================

/**
 * Create stub methods for SchemaRef.
 *
 * Used when constructing temporary refs during iteration (eachProperty, eachAllOf, etc.)
 * that will be re-enriched. The stubs ensure the ref satisfies the interface
 * before enrichment replaces them with real implementations.
 *
 * @returns Object containing stub accessor methods
 * @internal
 */
function createSchemaRefStubs(): Pick<SchemaRef, 
	| "type" | "format" | "description" | "title" | "deprecated" | "required"
	| "enum" | "default" | "example" | "isRef" | "isComposition" | "hasType"
	| "hasAllOf" | "hasOneOf" | "hasAnyOf" | "isArray" | "isObject" | "isString"
	| "isNumber" | "isBoolean" | "hasExample" | "hasDefault" | "items" | "hasItems"
	| "properties" | "hasProperties" | "eachProperty" | "eachAllOf" | "eachOneOf"
	| "eachAnyOf" | "eachEnum" | "eachRequired" | "nullable" | "typeArray"
	| "additionalProperties" | "hasAdditionalProperties" | "patternProperties"
	| "hasPatternProperties" | "minLength" | "maxLength" | "pattern"
	| "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf"
	| "minItems" | "maxItems" | "uniqueItems" | "minProperties" | "maxProperties"
	| "readOnly" | "writeOnly" | "discriminator" | "hasDiscriminator"
	| "constValue" | "hasConst" | "not" | "hasNot" | "xml" | "$id" | "externalDocs"
> {
	return {
		type: () => undefined,
		format: () => undefined,
		description: () => undefined,
		title: () => undefined,
		deprecated: () => false,
		required: () => [],
		enum: () => undefined,
		default: () => undefined,
		example: () => undefined,
		isRef: () => false,
		isComposition: () => false,
		hasType: () => false,
		hasAllOf: () => false,
		hasOneOf: () => false,
		hasAnyOf: () => false,
		isArray: () => false,
		isObject: () => false,
		isString: () => false,
		isNumber: () => false,
		isBoolean: () => false,
		hasExample: () => false,
		hasDefault: () => false,
		items: () => undefined,
		hasItems: () => false,
		properties: () => undefined,
		hasProperties: () => false,
		eachProperty: () => {},
		eachAllOf: () => {},
		eachOneOf: () => {},
		eachAnyOf: () => {},
		eachEnum: () => {},
		eachRequired: () => {},
		// Version-specific stubs
		nullable: () => undefined,
		typeArray: () => undefined,
		additionalProperties: () => undefined,
		hasAdditionalProperties: () => false,
		patternProperties: () => undefined,
		hasPatternProperties: () => false,

		// String validation constraints
		minLength: () => undefined,
		maxLength: () => undefined,
		pattern: () => undefined,

		// Numeric validation constraints
		minimum: () => undefined,
		maximum: () => undefined,
		exclusiveMinimum: () => undefined,
		exclusiveMaximum: () => undefined,
		multipleOf: () => undefined,

		// Array validation constraints
		minItems: () => undefined,
		maxItems: () => undefined,
		uniqueItems: () => false,

		// Object validation constraints
		minProperties: () => undefined,
		maxProperties: () => undefined,

		// Metadata accessors
		readOnly: () => false,
		writeOnly: () => false,
		discriminator: () => undefined,
		hasDiscriminator: () => false,
		constValue: () => undefined,
		hasConst: () => false,
		not: () => undefined,
		hasNot: () => false,
		xml: () => undefined,
		$id: () => undefined,
		externalDocs: () => undefined,
	};
}

/**
 * Enrich a SchemaRef with typed accessor methods.
 *
 * Provides cached, typed access to schema properties including type,
 * format, validation keywords, composition (allOf/oneOf/anyOf), and more.
 * SchemaRef is one of the most complex refs with many accessor methods
 * for the wide variety of JSON Schema keywords.
 *
 * @param ref - The raw schema reference
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * Schema(schema) {
 *   // Skip $ref schemas (handled separately)
 *   if (schema.isRef()) return;
 *
 *   // Type checking
 *   const type = schema.type();      // "string" | "object" | etc.
 *   if (schema.isArray()) {
 *     const items = schema.items();
 *     if (!schema.hasItems()) {
 *       ctx.reportHere(schema, { message: "Array needs items" });
 *     }
 *   }
 *
 *   // Composition handling
 *   if (schema.isComposition()) {
 *     schema.eachAllOf((subSchema, subRef) => {
 *       // Process allOf members
 *     });
 *   }
 *
 *   // Property iteration for objects
 *   if (schema.isObject()) {
 *     schema.eachProperty((name, propSchema, propRef) => {
 *       if (propRef.isRequired && !propRef.description()) {
 *         ctx.reportAt(propRef, "description", { ... });
 *       }
 *     });
 *   }
 *
 *   // Version-specific (3.0 vs 3.1+)
 *   const nullable = schema.nullable();     // 3.0 only
 *   const typeArray = schema.typeArray();   // 3.1+ (["string", "null"])
 * }
 * ```
 *
 * @see {@link SchemaRef} - Type definition
 * @see {@link SchemaLocation} - Where schema lives in the document
 */
export function enrichSchemaRef(ref: SchemaRef): SchemaRef {
	const node = ref.node;
	const $ = createCache();

	const enriched: SchemaRef = {
		...ref,

		// Field accessors (cached)
		type: () => $(
			"type",
			() => {
				const val = getString(node, "type");
				if (val === "string" || val === "number" || val === "integer" || 
				    val === "boolean" || val === "array" || val === "object" || val === "null") {
					return val as import("./types.js").SchemaType;
				}
				return undefined;
			},
		),
		format: () => $(
			"format",
			() => getString(node, "format"),
		),
		description: () => $(
			"description",
			() => getString(node, "description"),
		),
		title: () => $(
			"title",
			() => getString(node, "title"),
		),
		deprecated: () => $(
			"deprecated",
			() => getBoolean(node, "deprecated"),
		),
		required: () => $(
			"required",
			() => getArray<string>(node, "required"),
		),
		enum: () => $(
			"enum",
			() => {
				const val = getAny(node, "enum");
				return Array.isArray(val) ? val : undefined;
			},
		),
		default: () => $(
			"default",
			() => getAny(node, "default"),
		),
		example: () => $(
			"example",
			() => getAny(node, "example"),
		),

		// Composition and reference checks (cached)
		isRef: () => $(
			"isRef",
			() => hasRef(node),
		),
		isComposition: () => $(
			"isComposition",
			() => {
				if (!node || typeof node !== "object") return false;
				const obj = node as Record<string, unknown>;
				return "allOf" in obj || "oneOf" in obj || "anyOf" in obj;
			},
		),
		hasType: () => $(
			"hasType",
			() => hasField(node, "type"),
		),
		hasAllOf: () => $(
			"hasAllOf",
			() => hasField(node, "allOf"),
		),
		hasOneOf: () => $(
			"hasOneOf",
			() => hasField(node, "oneOf"),
		),
		hasAnyOf: () => $(
			"hasAnyOf",
			() => hasField(node, "anyOf"),
		),

		// Type checks (cached)
		isArray: () => $(
			"isArray",
			() => getString(node, "type") === "array",
		),
		isObject: () => $(
			"isObject",
			() => getString(node, "type") === "object",
		),
		isString: () => $(
			"isString",
			() => getString(node, "type") === "string",
		),
		isNumber: () => $(
			"isNumber",
			() => {
				const type = getString(node, "type");
				return type === "number" || type === "integer";
			},
		),
		isBoolean: () => $(
			"isBoolean",
			() => getString(node, "type") === "boolean",
		),

		// Example/default helpers (cached)
		hasExample: () => $(
			"hasExample",
			() => hasField(node, "example"),
		),
		hasDefault: () => $(
			"hasDefault",
			() => hasField(node, "default"),
		),

		// Items helper (cached)
		items: () => $(
			"items",
			() => getAny(node, "items"),
		),
		hasItems: () => $(
			"hasItems",
			() => hasField(node, "items"),
		),

		// Properties helpers (cached)
		properties: () => $(
			"properties",
			() => getObject(node, "properties"),
		),
		hasProperties: () => $(
			"hasProperties",
			() => {
				const props = getObject(node, "properties");
				return !!props && Object.keys(props).length > 0;
			},
		),

		// Version-specific accessors (cached)
		nullable: () => $(
			"nullable",
			() => {
				const val = getAny(node, "nullable");
				return typeof val === "boolean" ? val : undefined;
			},
		),
		typeArray: () => $(
			"typeArray",
			() => {
				const type = getAny(node, "type");
				return Array.isArray(type) ? type as string[] : undefined;
			},
		),
		additionalProperties: () => $(
			"additionalProperties",
			() => {
				const val = getAny(node, "additionalProperties");
				if (val === undefined) return undefined;
				if (typeof val === "boolean") return val;
				if (typeof val === "object" && val !== null) return val as Record<string, unknown>;
				return undefined;
			},
		),
		hasAdditionalProperties: () => $(
			"hasAdditionalProperties",
			() => hasField(node, "additionalProperties"),
		),
		patternProperties: () => $(
			"patternProperties",
			() => getObject(node, "patternProperties"),
		),
		hasPatternProperties: () => $(
			"hasPatternProperties",
			() => hasField(node, "patternProperties"),
		),

		// ═══════════════════════════════════════════════════════════════════════════
		// String validation constraints (cached)
		// ═══════════════════════════════════════════════════════════════════════════

		minLength: () => $(
			"minLength",
			() => getNumber(node, "minLength"),
		),
		maxLength: () => $(
			"maxLength",
			() => getNumber(node, "maxLength"),
		),
		pattern: () => $(
			"pattern",
			() => getString(node, "pattern"),
		),

		// ═══════════════════════════════════════════════════════════════════════════
		// Numeric validation constraints (cached)
		// ═══════════════════════════════════════════════════════════════════════════

		minimum: () => $(
			"minimum",
			() => getNumber(node, "minimum"),
		),
		maximum: () => $(
			"maximum",
			() => getNumber(node, "maximum"),
		),
		exclusiveMinimum: () => $(
			"exclusiveMinimum",
			() => {
				const val = getAny(node, "exclusiveMinimum");
				// OpenAPI 3.0: boolean, OpenAPI 3.1+: number
				if (typeof val === "boolean" || typeof val === "number") return val;
				return undefined;
			},
		),
		exclusiveMaximum: () => $(
			"exclusiveMaximum",
			() => {
				const val = getAny(node, "exclusiveMaximum");
				// OpenAPI 3.0: boolean, OpenAPI 3.1+: number
				if (typeof val === "boolean" || typeof val === "number") return val;
				return undefined;
			},
		),
		multipleOf: () => $(
			"multipleOf",
			() => getNumber(node, "multipleOf"),
		),

		// ═══════════════════════════════════════════════════════════════════════════
		// Array validation constraints (cached)
		// ═══════════════════════════════════════════════════════════════════════════

		minItems: () => $(
			"minItems",
			() => getNumber(node, "minItems"),
		),
		maxItems: () => $(
			"maxItems",
			() => getNumber(node, "maxItems"),
		),
		uniqueItems: () => $(
			"uniqueItems",
			() => getBoolean(node, "uniqueItems"),
		),

		// ═══════════════════════════════════════════════════════════════════════════
		// Object validation constraints (cached)
		// ═══════════════════════════════════════════════════════════════════════════

		minProperties: () => $(
			"minProperties",
			() => getNumber(node, "minProperties"),
		),
		maxProperties: () => $(
			"maxProperties",
			() => getNumber(node, "maxProperties"),
		),

		// ═══════════════════════════════════════════════════════════════════════════
		// Metadata accessors (cached)
		// ═══════════════════════════════════════════════════════════════════════════

		readOnly: () => $(
			"readOnly",
			() => getBoolean(node, "readOnly"),
		),
		writeOnly: () => $(
			"writeOnly",
			() => getBoolean(node, "writeOnly"),
		),
		discriminator: () => $(
			"discriminator",
			() => getObject(node, "discriminator"),
		),
		hasDiscriminator: () => $(
			"hasDiscriminator",
			() => hasField(node, "discriminator"),
		),
		constValue: () => $(
			"constValue",
			() => getAny(node, "const"),
		),
		hasConst: () => $(
			"hasConst",
			() => hasField(node, "const"),
		),
		not: () => $(
			"not",
			() => getAny(node, "not"),
		),
		hasNot: () => $(
			"hasNot",
			() => hasField(node, "not"),
		),
		xml: () => $(
			"xml",
			() => getObject(node, "xml"),
		),
		$id: () => $(
			"$id",
			() => getString(node, "$id"),
		),
		externalDocs: () => $(
			"externalDocs",
			() => getObject(node, "externalDocs") as import("./types.js").ExternalDocsNode | undefined,
		),

		// Array iteration (not cached - iterate fresh each time)
		eachProperty(fn) {
			const properties = getObject(node, "properties");
			if (!properties) return;
			const requiredList = getArray<string>(node, "required");
			Object.entries(properties).forEach(([name, propSchema]) => {
				const propRef: SchemaRef = enrichSchemaRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/properties/${name}`,
					node: propSchema,
					propertyName: name,
					isRequired: requiredList.includes(name),
					depth: (ref.depth ?? 0) + 1,
					location: "properties",
					parent: ref,
					// Stub methods - will be filled by recursive enrichSchemaRef
					...createSchemaRefStubs(),
				});
				fn(name, propSchema, propRef);
			});
		},

		eachAllOf(fn) {
			const allOf = getArray<unknown>(node, "allOf");
			allOf.forEach((schema, index) => {
				const schemaRef: SchemaRef = enrichSchemaRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/allOf/${index}`,
					node: schema,
					depth: (ref.depth ?? 0) + 1,
					location: "allOf",
					locationIndex: index,
					parent: ref,
					...createSchemaRefStubs(),
				});
				fn(schema, schemaRef);
			});
		},

		eachOneOf(fn) {
			const oneOf = getArray<unknown>(node, "oneOf");
			oneOf.forEach((schema, index) => {
				const schemaRef: SchemaRef = enrichSchemaRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/oneOf/${index}`,
					node: schema,
					depth: (ref.depth ?? 0) + 1,
					location: "oneOf",
					locationIndex: index,
					parent: ref,
					...createSchemaRefStubs(),
				});
				fn(schema, schemaRef);
			});
		},

		eachAnyOf(fn) {
			const anyOf = getArray<unknown>(node, "anyOf");
			anyOf.forEach((schema, index) => {
				const schemaRef: SchemaRef = enrichSchemaRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/anyOf/${index}`,
					node: schema,
					depth: (ref.depth ?? 0) + 1,
					location: "anyOf",
					locationIndex: index,
					parent: ref,
					...createSchemaRefStubs(),
				});
				fn(schema, schemaRef);
			});
		},

		eachEnum(fn) {
			const enumValues = getAny(node, "enum");
			if (!Array.isArray(enumValues)) return;
			enumValues.forEach((value, index) => {
				fn(value, {
					uri: ref.uri,
					pointer: `${ref.pointer}/enum/${index}`,
					node: value,
					index,
				});
			});
		},

		eachRequired(fn) {
			const required = getArray<string>(node, "required");
			required.forEach((name, index) => {
				fn(name, {
					uri: ref.uri,
					pointer: `${ref.pointer}/required/${index}`,
					node: name,
					index,
				});
			});
		},

		eachPatternProperty(fn) {
			const patternProperties = getObject(node, "patternProperties");
			if (!patternProperties) return;
			Object.entries(patternProperties).forEach(([pattern, patternSchema]) => {
				const patternRef: SchemaRef = enrichSchemaRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/patternProperties/${encodePointerSegment(pattern)}`,
					node: patternSchema,
					propertyName: pattern,
					depth: (ref.depth ?? 0) + 1,
					location: "patternProperties",
					parent: ref,
					...createSchemaRefStubs(),
				});
				fn(pattern, patternSchema, patternRef);
			});
		},
	};

	return enriched;
}

// ============================================================================
// ParameterRef Enrichment
// ============================================================================

/**
 * Enrich a ParameterRef with typed accessor methods.
 *
 * Provides cached, typed access to parameter properties including
 * name, location (in), required status, schema, and examples.
 *
 * @param ref - The raw parameter reference
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * Parameter(param) {
 *   // Skip $ref parameters
 *   if (param.isRef()) return;
 *
 *   // Location-based filtering
 *   if (param.isPath() && !param.required()) {
 *     ctx.reportAt(param, "required", {
 *       message: "Path parameters must be required"
 *     });
 *   }
 *
 *   if (param.isQuery()) {
 *     const name = param.getName();
 *     if (!param.hasExample()) {
 *       ctx.reportAt(param, "example", { ... });
 *     }
 *   }
 *
 *   // Schema access
 *   if (param.hasSchema()) {
 *     const schemaType = param.schemaType();  // "string", "integer", etc.
 *   }
 * }
 * ```
 *
 * @see {@link ParameterRef} - Type definition
 * @see {@link ParameterLocation} - Parameter location types
 */
export function enrichParameterRef(ref: ParameterRef): ParameterRef {
	const node = ref.node;
	const $ = createCache();

	return {
		...ref,

		// Field accessors (cached)
		getName: () => $(
			"name",
			() => getString(node, "name"),
		),
		getIn: () => $(
			"in",
			() => getString(node, "in") as ParameterLocation | undefined,
		),
		description: () => $(
			"description",
			() => getString(node, "description"),
		),
		required: () => $(
			"required",
			() => getBoolean(node, "required"),
		),
		deprecated: () => $(
			"deprecated",
			() => getBoolean(node, "deprecated"),
		),
		schema: () => $(
			"schema",
			() => getAny(node, "schema"),
		),
		example: () => $(
			"example",
			() => getAny(node, "example"),
		),
		examples: () => $(
			"examples",
			() => getObject(node, "examples"),
		),

		// Schema helpers (cached)
		hasSchema: () => $(
			"hasSchema",
			() => hasField(node, "schema"),
		),
		schemaType: () => $(
			"schemaType",
			() => {
				const schema = getAny(node, "schema");
				return getString(schema, "type");
			},
		),

		// Example helpers (cached)
		hasExample: () => $(
			"hasExample",
			() => {
				// Check example field
				if (hasField(node, "example")) return true;
				// Check examples field
				const examples = getObject(node, "examples");
				if (examples && Object.keys(examples).length > 0) return true;
				// Check schema.example
				const schema = getAny(node, "schema");
				if (schema && hasField(schema, "example")) return true;
				return false;
			},
		),

		// Quick checks (cached)
		isRef: () => $(
			"isRef",
			() => hasRef(node),
		),
		isQuery: () => $(
			"isQuery",
			() => getString(node, "in") === "query",
		),
		isPath: () => $(
			"isPath",
			() => getString(node, "in") === "path",
		),
		isHeader: () => $(
			"isHeader",
			() => getString(node, "in") === "header",
		),
		isCookie: () => $(
			"isCookie",
			() => getString(node, "in") === "cookie",
		),

		// Serialization style accessors (cached)
		style: () => $(
			"style",
			() => getString(node, "style"),
		),
		explode: () => $(
			"explode",
			() => getBoolean(node, "explode"),
		),
		allowReserved: () => $(
			"allowReserved",
			() => getBoolean(node, "allowReserved"),
		),
		allowEmptyValue: () => $(
			"allowEmptyValue",
			() => getBoolean(node, "allowEmptyValue"),
		),
		content: () => $(
			"content",
			() => getObject(node, "content"),
		),
	};
}

// ============================================================================
// MediaTypeRef Enrichment
// ============================================================================

/**
 * Enrich a MediaTypeRef with typed accessor methods.
 *
 * Provides cached, typed access to media type properties including
 * schema, examples, encoding, and OpenAPI 3.2+ streaming fields.
 *
 * @param ref - The raw media type reference
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * MediaType(mt) {
 *   // Schema access
 *   if (mt.hasSchema()) {
 *     const schema = mt.schema();
 *   }
 *
 *   // Examples
 *   const example = mt.example();
 *   const examples = mt.examples();  // Record<string, unknown>
 *
 *   // Encoding for multipart
 *   const encoding = mt.encoding();
 *
 *   // OpenAPI 3.2+ streaming
 *   if (mt.hasItemSchema()) {
 *     const itemSchema = mt.itemSchema();
 *   }
 * }
 * ```
 *
 * @see {@link MediaTypeRef} - Type definition
 */
export function enrichMediaTypeRef(ref: MediaTypeRef): MediaTypeRef {
	const node = ref.node;
	const $ = createCache();

	return {
		...ref,

		// Common accessors
		schema: () => $(
			"schema",
			() => getAny(node, "schema"),
		),
		hasSchema: () => $(
			"hasSchema",
			() => hasField(node, "schema"),
		),
		example: () => $(
			"example",
			() => getAny(node, "example"),
		),
		examples: () => $(
			"examples",
			() => getObject(node, "examples"),
		),
		encoding: () => $(
			"encoding",
			() => getObject(node, "encoding"),
		),

		// Example helpers (cached)
		hasExample: () => $(
			"hasExample",
			() => hasField(node, "example"),
		),
		hasExamples: () => $(
			"hasExamples",
			() => {
				const examples = getObject(node, "examples");
				return !!examples && Object.keys(examples).length > 0;
			},
		),

		// Iteration helpers
		eachExample(fn) {
			const examples = getObject(node, "examples");
			if (!examples) return;
			Object.entries(examples).forEach(([name, exampleNode]) => {
				const exampleRef = enrichExampleRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/examples/${encodePointerSegment(name)}`,
					node: exampleNode,
					name,
					// Stub methods - will be filled by enrichExampleRef
					summary: () => undefined,
					description: () => undefined,
					value: () => undefined,
					externalValue: () => undefined,
					isRef: () => false,
					isExternal: () => false,
				});
				fn(name, exampleNode, exampleRef);
			});
		},

		// OpenAPI 3.2+ accessors (streaming support)
		itemSchema: () => $(
			"itemSchema",
			() => getAny(node, "itemSchema"),
		),
		hasItemSchema: () => $(
			"hasItemSchema",
			() => hasField(node, "itemSchema"),
		),
		itemEncoding: () => $(
			"itemEncoding",
			() => getAny(node, "itemEncoding"),
		),
		hasItemEncoding: () => $(
			"hasItemEncoding",
			() => hasField(node, "itemEncoding"),
		),
	};
}

// ============================================================================
// TagRef Enrichment
// ============================================================================

/**
 * Enrich a TagRef with typed accessor methods.
 */
export function enrichTagRef(
	uri: string,
	pointer: string,
	node: unknown,
	index: number,
): TagRef {
	const $ = createCache();

	return {
		uri,
		pointer,
		node,
		index,

		// Common accessors (all versions)
		name: () => $(
			"name",
			() => getString(node, "name") ?? "",
		),
		description: () => $(
			"description",
			() => getString(node, "description"),
		),
		externalDocs: () => $(
			"externalDocs",
			() => getAny(node, "externalDocs") as ExternalDocsNode | undefined,
		),

		// OpenAPI 3.2+ accessors
		summary: () => $(
			"summary",
			() => getString(node, "summary"),
		),
		parent: () => $(
			"parent",
			() => getString(node, "parent"),
		),
		kind: () => $(
			"kind",
			() => {
				const val = getString(node, "kind");
				if (val === "nav" || val === "badge" || val === "audience") {
					return val;
				}
				return undefined;
			},
		),
	};
}

// ============================================================================
// OAuthFlowRef Enrichment
// ============================================================================

/**
 * Enrich an OAuthFlowRef with typed accessor methods.
 *
 * Provides cached, typed access to OAuth2 flow properties like
 * authorization URL, token URL, refresh URL, and scopes.
 *
 * @param uri - Document URI
 * @param pointer - JSON pointer to this flow
 * @param node - The flow object node
 * @param flowType - The OAuth2 flow type
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * schemeRef.eachFlow((flowType, flowNode, flowRef) => {
 *   if (flowRef.requiresAuthorizationUrl() && !flowRef.authorizationUrl()) {
 *     ctx.reportAt(flowRef, "authorizationUrl", {
 *       message: `OAuth2 ${flowType} flow must have authorizationUrl`,
 *       severity: "error",
 *     });
 *   }
 * });
 * ```
 *
 * @see {@link OAuthFlowRef} - Type definition
 * @see {@link enrichSecuritySchemeRef} - Related enrichment for security schemes
 */
export function enrichOAuthFlowRef(
	uri: string,
	pointer: string,
	node: unknown,
	flowType: OAuthFlowType,
): OAuthFlowRef {
	const $ = createCache();

	return {
		uri,
		pointer,
		node: node as OAuthFlowNode,
		flowType,

		// URL accessors (cached)
		authorizationUrl: () => $(
			"authorizationUrl",
			() => getString(node, "authorizationUrl"),
		),
		tokenUrl: () => $(
			"tokenUrl",
			() => getString(node, "tokenUrl"),
		),
		refreshUrl: () => $(
			"refreshUrl",
			() => getString(node, "refreshUrl"),
		),
		scopes: () => $(
			"scopes",
			() => (getObject(node, "scopes") as Record<string, string>) ?? {},
		),

		// Helper methods (cached)
		requiresAuthorizationUrl: () => $(
			"requiresAuthorizationUrl",
			() => flowType === "implicit" || flowType === "authorizationCode",
		),
		requiresTokenUrl: () => $(
			"requiresTokenUrl",
			() => flowType === "password" || flowType === "clientCredentials" || flowType === "authorizationCode",
		),
	};
}

// ============================================================================
// SecuritySchemeRef Enrichment
// ============================================================================

/**
 * Enrich a SecuritySchemeRef with typed accessor methods.
 */
export function enrichSecuritySchemeRef(
	uri: string,
	pointer: string,
	node: unknown,
	name: string,
): SecuritySchemeRef {
	const $ = createCache();

	return {
		uri,
		pointer,
		node,
		name,

		// Common accessors
		type: () => $(
			"type",
			() => {
				const val = getString(node, "type");
				if (val === "apiKey" || val === "http" || val === "oauth2" || val === "openIdConnect" || val === "mutualTLS") {
					return val as import("./types.js").SecuritySchemeType;
				}
				return undefined;
			},
		),
		description: () => $(
			"description",
			() => getString(node, "description"),
		),

		// API Key specific
		apiKeyName: () => $(
			"apiKeyName",
			() => getString(node, "name"),
		),
		apiKeyIn: () => $(
			"apiKeyIn",
			() => {
				const val = getString(node, "in");
				if (val === "query" || val === "header" || val === "cookie") {
					return val as import("./types.js").ApiKeyLocation;
				}
				return undefined;
			},
		),

		// HTTP specific
		scheme: () => $(
			"scheme",
			() => getString(node, "scheme"),
		),
		bearerFormat: () => $(
			"bearerFormat",
			() => getString(node, "bearerFormat"),
		),

		// OpenID Connect specific
		openIdConnectUrl: () => $(
			"openIdConnectUrl",
			() => getString(node, "openIdConnectUrl"),
		),

		// OAuth2 flow accessors
		flows: () => $(
			"flows",
			() => getAny(node, "flows") as OAuthFlowsNode | undefined,
		),
		implicitFlow: () => $(
			"implicitFlow",
			() => {
				const flows = getAny(node, "flows") as OAuthFlowsNode | undefined;
				return flows?.implicit;
			},
		),
		passwordFlow: () => $(
			"passwordFlow",
			() => {
				const flows = getAny(node, "flows") as OAuthFlowsNode | undefined;
				return flows?.password;
			},
		),
		clientCredentialsFlow: () => $(
			"clientCredentialsFlow",
			() => {
				const flows = getAny(node, "flows") as OAuthFlowsNode | undefined;
				return flows?.clientCredentials;
			},
		),
		authorizationCodeFlow: () => $(
			"authorizationCodeFlow",
			() => {
				const flows = getAny(node, "flows") as OAuthFlowsNode | undefined;
				return flows?.authorizationCode;
			},
		),

		// OpenAPI 3.2+ accessors
		deviceFlow: () => $(
			"deviceFlow",
			() => {
				const flows = getAny(node, "flows") as OAuthFlowsNode | undefined;
				return flows?.device;
			},
		),
		hasDeviceFlow: () => $(
			"hasDeviceFlow",
			() => {
				const flows = getAny(node, "flows") as OAuthFlowsNode | undefined;
				return !!flows?.device;
			},
		),

		// Iteration helper for OAuth2 flows
		eachFlow: (fn) => {
			const flows = getAny(node, "flows") as OAuthFlowsNode | undefined;
			if (!flows) return;

			const flowTypes: OAuthFlowType[] = [
				"implicit",
				"password",
				"clientCredentials",
				"authorizationCode",
				"device",
			];

			for (const flowType of flowTypes) {
				const flowNode = flows[flowType];
				if (flowNode) {
					const flowRef = enrichOAuthFlowRef(
						uri,
						`${pointer}/flows/${flowType}`,
						flowNode,
						flowType,
					);
					fn(flowType, flowNode, flowRef);
				}
			}
		},
	};
}

// ============================================================================
// ResponseRef Enrichment
// ============================================================================

/**
 * Enrich a ResponseRef with typed accessor methods.
 *
 * Provides cached, typed access to response properties without
 * manual type casting.
 *
 * @param ref - The raw response reference
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * Response(response) {
 *   if (response.isSuccess()) {
 *     const desc = response.description();
 *     response.eachHeader((name, header, headerRef) => {
 *       // ...
 *     });
 *   }
 * }
 * ```
 *
 * @see {@link ResponseRef} - Type definition
 * @see {@link enrichOperationRef} - Related enrichment for operations
 */
export function enrichResponseRef(ref: ResponseRef): ResponseRef {
	const node = ref.node;
	const code = ref.statusCode ?? "";
	const $ = createCache();

	return {
		...ref,

		// Field accessors (cached)
		description: () => $(
			"description",
			() => getString(node, "description"),
		),
		content: () => $(
			"content",
			() => getObject(node, "content"),
		),
		headers: () => $(
			"headers",
			() => getObject(node, "headers"),
		),
		links: () => $(
			"links",
			() => getObject(node, "links"),
		),

		// Quick checks (cached)
		isRef: () => $(
			"isRef",
			() => hasRef(node),
		),
		isSuccess: () => $(
			"isSuccess",
			() => code.startsWith("2"),
		),
		isError: () => $(
			"isError",
			() => code.startsWith("4") || code.startsWith("5"),
		),
		hasContent: () => $(
			"hasContent",
			() => {
				const content = getObject(node, "content");
				return !!content && Object.keys(content).length > 0;
			},
		),
		hasHeaders: () => $(
			"hasHeaders",
			() => {
				const headers = getObject(node, "headers");
				return !!headers && Object.keys(headers).length > 0;
			},
		),
		hasLinks: () => $(
			"hasLinks",
			() => {
				const links = getObject(node, "links");
				return !!links && Object.keys(links).length > 0;
			},
		),

		// Iteration helpers
		eachHeader(fn) {
			const headers = getObject(node, "headers");
			if (!headers) return;
			Object.entries(headers).forEach(([name, headerNode]) => {
				const headerRef = enrichHeaderRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/headers/${encodePointerSegment(name)}`,
					node: headerNode,
					name,
					// Stub methods - will be filled by enrichHeaderRef
					getName: () => undefined,
					description: () => undefined,
					required: () => false,
					deprecated: () => false,
					schema: () => undefined,
					example: () => undefined,
					examples: () => undefined,
					isRef: () => false,
					hasSchema: () => false,
					hasExample: () => false,
					eachExample: () => {},
				});
				fn(name, headerNode, headerRef);
			});
		},

		eachMediaType(fn) {
			const content = getObject(node, "content");
			if (!content) return;
			Object.entries(content).forEach(([mediaType, mediaTypeNode]) => {
				const mediaTypeRef = enrichMediaTypeRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/content/${encodePointerSegment(mediaType)}`,
					node: mediaTypeNode,
					mediaType,
					// Stub methods - will be filled by enrichMediaTypeRef
					schema: () => undefined,
					hasSchema: () => false,
					example: () => undefined,
					examples: () => undefined,
					encoding: () => undefined,
					itemSchema: () => undefined,
					hasItemSchema: () => false,
					itemEncoding: () => undefined,
					hasItemEncoding: () => false,
					hasExample: () => false,
					hasExamples: () => false,
					eachExample: () => {},
				});
				fn(mediaType, mediaTypeNode, mediaTypeRef);
			});
		},

		eachLink(fn) {
			const links = getObject(node, "links");
			if (!links) return;
			Object.entries(links).forEach(([name, linkNode]) => {
				const linkRef = enrichLinkRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/links/${encodePointerSegment(name)}`,
					node: linkNode,
					name,
					// Stub methods - will be filled by enrichLinkRef
					operationRef: () => undefined,
					operationId: () => undefined,
					parameters: () => undefined,
					requestBody: () => undefined,
					description: () => undefined,
					server: () => undefined,
					isRef: () => false,
					hasOperationRef: () => false,
					hasOperationId: () => false,
				});
				fn(name, linkNode, linkRef);
			});
		},
	};
}

// ============================================================================
// RequestBodyRef Enrichment
// ============================================================================

/**
 * Enrich a RequestBodyRef with typed accessor methods.
 *
 * Provides cached, typed access to request body properties including
 * description, required flag, and content iteration.
 *
 * @param ref - The raw request body reference
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * RequestBody(body) {
 *   if (body.required()) {
 *     body.eachMediaType((type, mediaTypeNode, mediaTypeRef) => {
 *       const schema = mediaTypeRef.schema();
 *     });
 *   }
 * }
 * ```
 *
 * @see {@link RequestBodyRef} - Type definition
 * @see {@link enrichMediaTypeRef} - Related enrichment for media types
 */
export function enrichRequestBodyRef(ref: RequestBodyRef): RequestBodyRef {
	const node = ref.node;
	const $ = createCache();

	return {
		...ref,

		// Field accessors (cached)
		description: () => $(
			"description",
			() => getString(node, "description"),
		),
		required: () => $(
			"required",
			() => getBoolean(node, "required"),
		),
		content: () => $(
			"content",
			() => getObject(node, "content"),
		),

		// Quick checks (cached)
		isRef: () => $(
			"isRef",
			() => hasRef(node),
		),
		hasContent: () => $(
			"hasContent",
			() => {
				const content = getObject(node, "content");
				return !!content && Object.keys(content).length > 0;
			},
		),

		// Iteration helpers
		eachMediaType(fn) {
			const content = getObject(node, "content");
			if (!content) return;
			Object.entries(content).forEach(([mediaType, mediaTypeNode]) => {
				const mediaTypeRef = enrichMediaTypeRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/content/${encodePointerSegment(mediaType)}`,
					node: mediaTypeNode,
					mediaType,
					// Stub methods - will be filled by enrichMediaTypeRef
					schema: () => undefined,
					hasSchema: () => false,
					example: () => undefined,
					examples: () => undefined,
					encoding: () => undefined,
					itemSchema: () => undefined,
					hasItemSchema: () => false,
					itemEncoding: () => undefined,
					hasItemEncoding: () => false,
					hasExample: () => false,
					hasExamples: () => false,
					eachExample: () => {},
				});
				fn(mediaType, mediaTypeNode, mediaTypeRef);
			});
		},
	};
}

// ============================================================================
// HeaderRef Enrichment
// ============================================================================

/**
 * Enrich a HeaderRef with typed accessor methods.
 *
 * Provides cached, typed access to header properties including
 * description, required flag, schema, and examples.
 *
 * @param ref - The raw header reference
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * Header(header) {
 *   const name = header.getName();
 *   if (header.required()) {
 *     const schema = header.schema();
 *   }
 * }
 * ```
 *
 * @see {@link HeaderRef} - Type definition
 */
export function enrichHeaderRef(ref: HeaderRef): HeaderRef {
	const node = ref.node;
	const $ = createCache();

	return {
		...ref,

		// Field accessors (cached)
		getName: () => $(
			"name",
			() => ref.name,
		),
		description: () => $(
			"description",
			() => getString(node, "description"),
		),
		required: () => $(
			"required",
			() => getBoolean(node, "required"),
		),
		deprecated: () => $(
			"deprecated",
			() => getBoolean(node, "deprecated"),
		),
		schema: () => $(
			"schema",
			() => getAny(node, "schema"),
		),
		example: () => $(
			"example",
			() => getAny(node, "example"),
		),
		examples: () => $(
			"examples",
			() => getObject(node, "examples"),
		),

		// Quick checks (cached)
		isRef: () => $(
			"isRef",
			() => hasRef(node),
		),
		hasSchema: () => $(
			"hasSchema",
			() => hasField(node, "schema"),
		),
		hasExample: () => $(
			"hasExample",
			() => {
				if (hasField(node, "example")) return true;
				const examples = getObject(node, "examples");
				if (examples && Object.keys(examples).length > 0) return true;
				const schema = getAny(node, "schema");
				if (schema && hasField(schema, "example")) return true;
				return false;
			},
		),

		// Iteration helpers
		eachExample(fn) {
			const examples = getObject(node, "examples");
			if (!examples) return;
			Object.entries(examples).forEach(([name, exampleNode]) => {
				const exampleRef = enrichExampleRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/examples/${encodePointerSegment(name)}`,
					node: exampleNode,
					name,
					// Stub methods - will be filled by enrichExampleRef
					summary: () => undefined,
					description: () => undefined,
					value: () => undefined,
					externalValue: () => undefined,
					isRef: () => false,
					isExternal: () => false,
				});
				fn(name, exampleNode, exampleRef);
			});
		},
	};
}

// ============================================================================
// ExampleRef Enrichment
// ============================================================================

/**
 * Enrich an ExampleRef with typed accessor methods.
 *
 * Provides cached, typed access to example properties including
 * summary, description, value, and external value.
 *
 * @param ref - The raw example reference
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * Example(example) {
 *   if (example.isExternal()) {
 *     const url = example.externalValue();
 *   } else {
 *     const val = example.value();
 *   }
 * }
 * ```
 *
 * @see {@link ExampleRef} - Type definition
 */
export function enrichExampleRef(ref: ExampleRef): ExampleRef {
	const node = ref.node;
	const $ = createCache();

	return {
		...ref,

		// Field accessors (cached)
		summary: () => $(
			"summary",
			() => getString(node, "summary"),
		),
		description: () => $(
			"description",
			() => getString(node, "description"),
		),
		value: () => $(
			"value",
			() => getAny(node, "value"),
		),
		externalValue: () => $(
			"externalValue",
			() => getString(node, "externalValue"),
		),

		// Quick checks (cached)
		isRef: () => $(
			"isRef",
			() => hasRef(node),
		),
		isExternal: () => $(
			"isExternal",
			() => hasField(node, "externalValue"),
		),
	};
}

// ============================================================================
// LinkRef Enrichment
// ============================================================================

/**
 * Enrich a LinkRef with typed accessor methods.
 *
 * Provides cached, typed access to link properties including
 * operationRef, operationId, parameters, and request body.
 *
 * @param ref - The raw link reference
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * Link(link) {
 *   const opId = link.operationId();
 *   const params = link.parameters();
 * }
 * ```
 *
 * @see {@link LinkRef} - Type definition
 */
export function enrichLinkRef(ref: LinkRef): LinkRef {
	const node = ref.node;
	const $ = createCache();

	return {
		...ref,

		// Field accessors (cached)
		operationRef: () => $(
			"operationRef",
			() => getString(node, "operationRef"),
		),
		operationId: () => $(
			"operationId",
			() => getString(node, "operationId"),
		),
		parameters: () => $(
			"parameters",
			() => getObject(node, "parameters"),
		),
		requestBody: () => $(
			"requestBody",
			() => getAny(node, "requestBody"),
		),
		description: () => $(
			"description",
			() => getString(node, "description"),
		),
		server: () => $(
			"server",
			() => getObject(node, "server") as ServerNode | undefined,
		),

		// Quick checks (cached)
		isRef: () => $(
			"isRef",
			() => hasRef(node),
		),
		hasOperationRef: () => $(
			"hasOperationRef",
			() => hasField(node, "operationRef"),
		),
		hasOperationId: () => $(
			"hasOperationId",
			() => hasField(node, "operationId"),
		),
	};
}

// ============================================================================
// CallbackRef Enrichment
// ============================================================================

/**
 * Enrich a CallbackRef with typed accessor methods.
 *
 * Provides cached, typed access to callback properties including
 * iteration over callback path items.
 *
 * @param ref - The raw callback reference
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * Callback(callback) {
 *   callback.eachPathItem((expression, pathItem, pathItemRef) => {
 *     // Process each callback path
 *   });
 * }
 * ```
 *
 * @see {@link CallbackRef} - Type definition
 */
export function enrichCallbackRef(ref: CallbackRef): CallbackRef {
	const node = ref.node;
	const $ = createCache();

	return {
		...ref,

		// Quick checks (cached)
		isRef: () => $(
			"isRef",
			() => hasRef(node),
		),

		// Get all expression keys
		expressions: () => $(
			"expressions",
			() => {
				if (!node || typeof node !== "object" || hasRef(node)) return [];
				return Object.keys(node as Record<string, unknown>).filter(k => !k.startsWith("x-"));
			},
		),

		// Iteration helpers
		eachPathItem(fn) {
			if (!node || typeof node !== "object" || hasRef(node)) return;
			const obj = node as Record<string, unknown>;
			Object.entries(obj).forEach(([expression, pathItem]) => {
				if (expression.startsWith("x-")) return; // Skip extensions
				const pathItemRef: PathItemRef = enrichPathItemRef({
					uri: ref.uri,
					pointer: `${ref.pointer}/${encodePointerSegment(expression)}`,
					definitionUri: ref.uri,
					definitionPointer: `${ref.pointer}/${encodePointerSegment(expression)}`,
					node: pathItem,
					// Stub methods - will be filled by enrichPathItemRef
					path: () => expression,
					paths: () => [expression],
					hasOperation: () => false,
					getOperation: () => undefined,
					operations: () => [],
					summary: () => undefined,
					description: () => undefined,
					parameters: () => [],
					query: () => undefined,
					hasQuery: () => false,
					additionalOperations: () => undefined,
					hasAdditionalOperations: () => false,
				});
				fn(expression, pathItem, pathItemRef);
			});
		},
	};
}

// ============================================================================
// ComponentRef Enrichment
// ============================================================================

/**
 * Component type derived from the pointer path.
 */
export type ComponentType =
	| "schemas"
	| "responses"
	| "parameters"
	| "examples"
	| "requestBodies"
	| "headers"
	| "securitySchemes"
	| "links"
	| "callbacks"
	| "pathItems"
	| "unknown";

/**
 * Enrich a ComponentRef with typed accessor methods.
 *
 * Provides cached, typed access to component properties including
 * the component type and name.
 *
 * @param ref - The raw component reference
 * @returns Enriched reference with accessor methods
 *
 * @example
 * ```typescript
 * Component(component) {
 *   const type = component.componentType(); // "schemas", "parameters", etc.
 *   const name = component.componentName();
 * }
 * ```
 *
 * @see {@link ComponentRef} - Type definition
 */
export function enrichComponentRef(ref: ComponentRef): ComponentRef {
	const node = ref.node;
	const $ = createCache();

	// Extract component type and name from pointer: #/components/schemas/User
	const extractComponentInfo = (): { type: ComponentType; name: string } => {
		const match = ref.pointer.match(/^#\/components\/([^/]+)\/([^/]+)$/);
		if (!match) return { type: "unknown", name: "" };
		const [, typeStr, name] = match;
		const validTypes: ComponentType[] = [
			"schemas", "responses", "parameters", "examples",
			"requestBodies", "headers", "securitySchemes", "links",
			"callbacks", "pathItems"
		];
		const type = validTypes.includes(typeStr as ComponentType)
			? (typeStr as ComponentType)
			: "unknown";
		return { type, name: decodePointerSegment(name) };
	};

	return {
		...ref,

		// Component type accessor (cached)
		componentType: () => $(
			"componentType",
			() => extractComponentInfo().type,
		),

		// Component name accessor (cached)
		componentName: () => $(
			"componentName",
			() => extractComponentInfo().name,
		),

		// Quick checks (cached)
		isRef: () => $(
			"isRef",
			() => hasRef(node),
		),

		// Type-specific checks
		isSchema: () => $(
			"isSchema",
			() => extractComponentInfo().type === "schemas",
		),
		isParameter: () => $(
			"isParameter",
			() => extractComponentInfo().type === "parameters",
		),
		isResponse: () => $(
			"isResponse",
			() => extractComponentInfo().type === "responses",
		),
		isRequestBody: () => $(
			"isRequestBody",
			() => extractComponentInfo().type === "requestBodies",
		),
		isHeader: () => $(
			"isHeader",
			() => extractComponentInfo().type === "headers",
		),
		isSecurityScheme: () => $(
			"isSecurityScheme",
			() => extractComponentInfo().type === "securitySchemes",
		),
		isExample: () => $(
			"isExample",
			() => extractComponentInfo().type === "examples",
		),
		isLink: () => $(
			"isLink",
			() => extractComponentInfo().type === "links",
		),
		isCallback: () => $(
			"isCallback",
			() => extractComponentInfo().type === "callbacks",
		),
	};
}

/**
 * Encode a JSON pointer segment per RFC 6901.
 * Escapes ~ as ~0 and / as ~1.
 *
 * @param segment - The segment to encode
 * @returns Encoded segment
 * @internal
 */
function encodePointerSegment(segment: string): string {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Decode a JSON pointer segment per RFC 6901.
 * Unescapes ~1 as / and ~0 as ~.
 *
 * @param segment - The segment to decode
 * @returns Decoded segment
 * @internal
 */
function decodePointerSegment(segment: string): string {
	return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}
