/**
 * Index Type Definitions
 *
 * This module defines types for the project index, which extracts and organizes
 * OpenAPI elements (paths, operations, schemas, etc.) for efficient traversal
 * and lookup during rule execution.
 *
 * @module indexes/types
 *
 * @see {@link buildIndex} - Function that creates ProjectIndex instances
 * @see {@link project-index.ts} - Implementation file
 */

/**
 * A JSON Pointer string (RFC 6901).
 *
 * JSON Pointers identify specific values within a JSON document.
 * They start with "#" for fragment identifiers and use "/" as a separator.
 *
 * @example
 * ```typescript
 * const pointer: JsonPointer = "#/paths/~1users/get/responses/200";
 * ```
 */
export type JsonPointer = string;

/**
 * Reference to a PathItem in the OpenAPI document.
 *
 * PathItems represent URL paths (e.g., /users, /users/{id}) and contain
 * HTTP operations. When a PathItem uses $ref, we track both the reference
 * location and the definition location.
 *
 * @see {@link Visitors.PathItem} - Visitor callback that receives PathItemRef
 *
 * @example
 * ```typescript
 * const pathRef: PathItemRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/paths/~1users",
 *   definitionUri: "file:///api.yaml",
 *   definitionPointer: "#/paths/~1users",
 *   node: { get: { ... }, post: { ... } }
 * };
 * ```
 */
export interface PathItemRef {
	/** URI where this PathItem is referenced from (or defined if not referenced) */
	uri: string;
	/** Pointer where this PathItem is referenced from (or defined if not referenced) */
	pointer: JsonPointer;
	/** URI where this PathItem is actually defined */
	definitionUri: string;
	/** Pointer where this PathItem is actually defined */
	definitionPointer: JsonPointer;
	/** URI where this PathItem is referenced from (undefined if not referenced, same as definitionUri) */
	referenceUri?: string;
	/** Pointer where this PathItem is referenced from (undefined if not referenced) */
	referencePointer?: JsonPointer;
	/** The PathItem object node */
	node: unknown;

	// ═══════════════════════════════════════════════════════════════════════════
	// Path string accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Get the primary path string (e.g., "/users/{id}").
	 * Extracts the path from the pointer.
	 */
	path(): string | undefined;

	/**
	 * Get all path strings (for aliases).
	 * Usually a single path, but can be multiple if same PathItem is used for multiple paths.
	 */
	paths(): string[];

	// ═══════════════════════════════════════════════════════════════════════════
	// Operation helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this path item has a specific HTTP method operation */
	hasOperation(method: string): boolean;
	/** Get a specific HTTP method operation node */
	getOperation(method: string): unknown;
	/** Get all defined operations on this path */
	operations(): Array<{ method: string; operation: unknown }>;

	// ═══════════════════════════════════════════════════════════════════════════
	// Field accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the summary */
	summary(): string | undefined;
	/** Get the description */
	description(): string | undefined;
	/** Get path-level parameters (empty array if not defined) */
	parameters(): unknown[];

	// ═══════════════════════════════════════════════════════════════════════════
	// OpenAPI 3.2+ accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Get the query operation (OpenAPI 3.2+).
	 * The QUERY HTTP method for idempotent queries with request bodies.
	 */
	query(): unknown | undefined;

	/**
	 * Check if this path item has a query operation (OpenAPI 3.2+).
	 */
	hasQuery(): boolean;

	/**
	 * Get additional custom operations (OpenAPI 3.2+).
	 * Maps custom HTTP method names to operation objects.
	 */
	additionalOperations(): Record<string, unknown> | undefined;

	/**
	 * Check if this path item has additional operations (OpenAPI 3.2+).
	 */
	hasAdditionalOperations(): boolean;
}

/**
 * Reference to an item within an array (e.g., a tag, a server, etc.)
 * Used by eachTag, eachServer, etc. methods.
 */
export interface ItemRef<T = unknown> {
	/** URI of the document */
	uri: string;
	/** JSON pointer to this item */
	pointer: JsonPointer;
	/** The item value */
	node: T;
	/** Index in the parent array */
	index: number;
}

/**
 * Reference to a Tag in the OpenAPI document.
 * Tags provide metadata for operations and can be defined at the root level.
 *
 * @see {@link RootRef.eachTag} - Iteration over tags
 *
 * @example
 * ```typescript
 * doc.eachTag((tag, ref) => {
 *   const name = ref.name();
 *   const parent = ref.parent(); // 3.2+ only
 * });
 * ```
 */
export interface TagRef {
	/** URI of the document containing this tag */
	uri: string;
	/** JSON pointer to the tag */
	pointer: JsonPointer;
	/** The tag object node */
	node: unknown;
	/** Index in the tags array */
	index: number;

	// ═══════════════════════════════════════════════════════════════════════════
	// Common accessors (all versions)
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the tag name (required) */
	name(): string;
	/** Get the tag description */
	description(): string | undefined;
	/** Get external documentation */
	externalDocs(): ExternalDocsNode | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// OpenAPI 3.2+ accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Get the tag summary (OpenAPI 3.2+).
	 * A brief description of the tag.
	 */
	summary(): string | undefined;

	/**
	 * Get the parent tag name (OpenAPI 3.2+).
	 * Enables hierarchical tag organization.
	 */
	parent(): string | undefined;

	/**
	 * Get the tag kind (OpenAPI 3.2+).
	 * Classification type: "nav", "badge", or "audience".
	 */
	kind(): "nav" | "badge" | "audience" | undefined;
}

/**
 * Reference to a SecurityScheme in the OpenAPI document.
 * Security schemes define authentication methods (apiKey, http, oauth2, openIdConnect).
 *
 * @see {@link RootRef.eachSecurityScheme} - Iteration over security schemes
 *
 * @example
 * ```typescript
 * doc.eachSecurityScheme((name, scheme, ref) => {
 *   if (ref.type() === "oauth2") {
 *     const device = ref.deviceFlow(); // 3.2+ only
 *   }
 * });
 * ```
 */
export interface SecuritySchemeRef {
	/** URI of the document containing this security scheme */
	uri: string;
	/** JSON pointer to the security scheme */
	pointer: JsonPointer;
	/** The security scheme object node */
	node: unknown;
	/** Security scheme name (from component key) */
	name: string;

	// ═══════════════════════════════════════════════════════════════════════════
	// Common accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the security scheme type */
	type(): SecuritySchemeType | undefined;
	/** Get the description */
	description(): string | undefined;

	// API Key specific
	/** Get the API key name (for apiKey type) */
	apiKeyName(): string | undefined;
	/** Get the API key location (for apiKey type) */
	apiKeyIn(): ApiKeyLocation | undefined;

	// HTTP specific
	/** Get the HTTP scheme (for http type): "bearer", "basic", etc. */
	scheme(): string | undefined;
	/** Get the bearer format (for http bearer type) */
	bearerFormat(): string | undefined;

	// OpenID Connect specific
	/** Get the OpenID Connect URL (for openIdConnect type) */
	openIdConnectUrl(): string | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// OAuth2 flow accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the OAuth2 flows object (for oauth2 type) */
	flows(): OAuthFlowsNode | undefined;

	/** Get the implicit flow (for oauth2 type) */
	implicitFlow(): OAuthFlowNode | undefined;
	/** Get the password flow (for oauth2 type) */
	passwordFlow(): OAuthFlowNode | undefined;
	/** Get the client credentials flow (for oauth2 type) */
	clientCredentialsFlow(): OAuthFlowNode | undefined;
	/** Get the authorization code flow (for oauth2 type) */
	authorizationCodeFlow(): OAuthFlowNode | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// OpenAPI 3.2+ accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Get the device authorization flow (OpenAPI 3.2+).
	 * OAuth 2.0 Device Authorization Grant for devices with limited input capabilities.
	 */
	deviceFlow(): OAuthFlowNode | undefined;

	/** Check if this security scheme has a device flow (OpenAPI 3.2+) */
	hasDeviceFlow(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Iteration helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Iterate over OAuth2 flows with typed refs.
	 * Only applicable when type() === "oauth2".
	 * @param fn - Callback receiving flow type, flow node, and typed ref
	 *
	 * @example
	 * ```typescript
	 * if (schemeRef.type() === "oauth2") {
	 *   schemeRef.eachFlow((flowType, flowNode, flowRef) => {
	 *     if (flowRef.requiresAuthorizationUrl() && !flowRef.authorizationUrl()) {
	 *       ctx.reportAt(flowRef, "authorizationUrl", { ... });
	 *     }
	 *   });
	 * }
	 * ```
	 */
	eachFlow(fn: (flowType: OAuthFlowType, flow: OAuthFlowNode, ref: OAuthFlowRef) => void): void;
}

/**
 * OAuth2 Flows object containing all supported flow configurations.
 */
export interface OAuthFlowsNode {
	implicit?: OAuthFlowNode;
	password?: OAuthFlowNode;
	clientCredentials?: OAuthFlowNode;
	authorizationCode?: OAuthFlowNode;
	/** Device authorization flow (OpenAPI 3.2+) */
	device?: OAuthFlowNode;
}

/**
 * OAuth2 Flow configuration.
 */
export interface OAuthFlowNode {
	authorizationUrl?: string;
	tokenUrl?: string;
	refreshUrl?: string;
	scopes: Record<string, string>;
}

/**
 * OAuth2 flow type literals.
 * Represents the different OAuth2 flow types supported by OpenAPI.
 */
export type OAuthFlowType = "implicit" | "password" | "clientCredentials" | "authorizationCode" | "device";

/**
 * Reference to an OAuth2 flow configuration.
 *
 * Provides typed access to OAuth2 flow properties like authorization URL,
 * token URL, and scopes. Includes helper methods for determining which
 * URLs are required based on flow type.
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
 */
export interface OAuthFlowRef {
	/** URI of the document containing this flow */
	uri: string;
	/** JSON pointer to this flow */
	pointer: JsonPointer;
	/** The flow object node */
	node: OAuthFlowNode;
	/** Flow type: implicit, password, clientCredentials, authorizationCode, or device */
	flowType: OAuthFlowType;

	/** Get the authorization URL (required for implicit, authorizationCode flows) */
	authorizationUrl(): string | undefined;
	/** Get the token URL (required for password, clientCredentials, authorizationCode flows) */
	tokenUrl(): string | undefined;
	/** Get the refresh URL (optional for all flows) */
	refreshUrl(): string | undefined;
	/** Get the scopes object */
	scopes(): Record<string, string>;

	/** Check if this flow type requires an authorization URL */
	requiresAuthorizationUrl(): boolean;
	/** Check if this flow type requires a token URL */
	requiresTokenUrl(): boolean;
}

/**
 * OpenAPI ExternalDocs object type.
 */
export interface ExternalDocsNode {
	url: string;
	description?: string;
}

/**
 * OpenAPI Server object type.
 */
export interface ServerNode {
	url: string;
	description?: string;
	variables?: Record<string, unknown>;
}

/**
 * OpenAPI Info object type.
 */
export interface InfoNode {
	title: string;
	version: string;
	description?: string;
	termsOfService?: string;
	contact?: Record<string, unknown>;
	license?: Record<string, unknown>;
}

/**
 * Reference to the Info section of an OpenAPI document.
 * The Info object provides metadata about the API.
 *
 * @see {@link Visitors.Info} - Visitor callback that receives InfoRef
 *
 * @example
 * ```typescript
 * Info(info) {
 *   const title = info.title();
 *   const version = info.version();
 *   if (!info.description()) {
 *     ctx.reportAt(info, "description", { message: "Missing description", severity: "warning" });
 *   }
 * }
 * ```
 */
export interface InfoRef {
	/** URI of the document containing this info section */
	uri: string;
	/** JSON pointer to the info section (always "#/info") */
	pointer: JsonPointer;
	/** The info object node */
	node: unknown;

	// ═══════════════════════════════════════════════════════════════════════════
	// Required field accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the API title (required) */
	title(): string;
	/** Get the API version (required) */
	version(): string;

	// ═══════════════════════════════════════════════════════════════════════════
	// Optional field accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the API description */
	description(): string | undefined;
	/** Get the terms of service URL */
	termsOfService(): string | undefined;
	/** Get the contact information object */
	contact(): ContactNode | undefined;
	/** Get the license information object */
	license(): LicenseNode | undefined;
	/** Get the summary (OpenAPI 3.1+) */
	summary(): string | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Convenience checks
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if contact information is provided */
	hasContact(): boolean;
	/** Check if license information is provided */
	hasLicense(): boolean;
	/** Check if a description is provided */
	hasDescription(): boolean;
}

/**
 * OpenAPI Contact object type.
 */
export interface ContactNode {
	name?: string;
	url?: string;
	email?: string;
}

/**
 * OpenAPI License object type.
 */
export interface LicenseNode {
	name: string;
	url?: string;
	/** License identifier (OpenAPI 3.1+, SPDX expression) */
	identifier?: string;
}

/**
 * OpenAPI Components object type.
 */
export interface ComponentsNode {
	schemas?: Record<string, unknown>;
	responses?: Record<string, unknown>;
	parameters?: Record<string, unknown>;
	examples?: Record<string, unknown>;
	requestBodies?: Record<string, unknown>;
	headers?: Record<string, unknown>;
	securitySchemes?: Record<string, unknown>;
	links?: Record<string, unknown>;
	callbacks?: Record<string, unknown>;
}

/**
 * Reference to an OpenAPI Document root.
 *
 * RootRef provides typed access to root-level elements like info,
 * servers, paths, and components. Only available for root-level
 * OpenAPI documents (those containing openapi/swagger keys).
 *
 * @see {@link Visitors.Root} - Visitor callback that receives RootRef
 *
 * @example
 * ```typescript
 * Root(doc) {
 *   const servers = doc.servers();  // ServerNode[]
 *   doc.eachServer((server, ref) => { ... });
 *   const schemas = doc.schemas();  // Record<string, unknown> | undefined
 * }
 * ```
 */
export interface RootRef {
	/** URI of this document */
	uri: string;
	/** Pointer (always "#") */
	pointer: JsonPointer;
	/** The root document node */
	node: unknown;

	// ═══════════════════════════════════════════════════════════════════════════
	// Root-level field accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the OpenAPI version string (e.g., "3.0.0", "3.1.0") */
	openapi(): string | undefined;
	/** Get the info object */
	info(): InfoNode | undefined;
	/** Get the servers array (empty if not defined) */
	servers(): ServerNode[];
	/** Get the paths object */
	paths(): Record<string, unknown> | undefined;
	/** Get the components object */
	components(): ComponentsNode | undefined;
	/** Get the security array (root-level security requirements) */
	security(): Array<Record<string, string[]>>;
	/** Get the tags array */
	tags(): Array<{ name: string; description?: string }>;
	/** Get external docs */
	externalDocs(): ExternalDocsNode | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Component shortcuts
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get #/components/schemas */
	schemas(): Record<string, unknown> | undefined;
	/** Get #/components/securitySchemes */
	securitySchemes(): Record<string, unknown> | undefined;
	/** Get #/components/parameters */
	componentParameters(): Record<string, unknown> | undefined;
	/** Get #/components/responses */
	componentResponses(): Record<string, unknown> | undefined;
	/** Get #/components/requestBodies */
	componentRequestBodies(): Record<string, unknown> | undefined;
	/** Get #/components/headers */
	componentHeaders(): Record<string, unknown> | undefined;
	/** Get #/components/examples */
	componentExamples(): Record<string, unknown> | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Iteration helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** Iterate over servers */
	eachServer(fn: (server: ServerNode, ref: ItemRef<ServerNode>) => void): void;

	/** Iterate over root-level tags with typed TagRef */
	eachTag(fn: (tag: { name: string; description?: string }, ref: TagRef) => void): void;

	/** Iterate over security schemes with typed SecuritySchemeRef */
	eachSecurityScheme(fn: (name: string, scheme: unknown, ref: SecuritySchemeRef) => void): void;

	/** Iterate over paths */
	eachPath(fn: (path: string, pathItem: unknown, ref: PathItemRef) => void): void;

	// ═══════════════════════════════════════════════════════════════════════════
	// Convenience checks
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if the document has servers defined */
	hasServers(): boolean;
	/** Check if the document has components defined */
	hasComponents(): boolean;
	/** Check if the document has security schemes defined */
	hasSecuritySchemes(): boolean;
	/** Check if the document has paths defined */
	hasPaths(): boolean;
}

/**
 * Reference to an Operation in the OpenAPI document.
 *
 * Operations represent HTTP methods (GET, POST, PUT, etc.) on a path.
 * When the containing PathItem uses $ref, we track both the reference
 * location and the definition location.
 *
 * @see {@link Visitors.Operation} - Visitor callback that receives OperationRef
 *
 * @example
 * ```typescript
 * const opRef: OperationRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/paths/~1users/get",
 *   definitionUri: "file:///api.yaml",
 *   definitionPointer: "#/paths/~1users/get",
 *   method: "get",
 *   node: { operationId: "getUsers", summary: "List users", ... }
 * };
 * ```
 *
 * @example Using typed accessors
 * ```typescript
 * Operation(op) {
 *   const summary = op.summary();        // string | undefined
 *   const tags = op.tags();              // string[]
 *   op.eachTag((tag, ref) => { ... });   // Iterate with auto-constructed refs
 * }
 * ```
 */
export interface OperationRef {
	/** URI where this operation is referenced from (or defined if not referenced) */
	uri: string;
	/** Pointer where this operation is referenced from (or defined if not referenced) */
	pointer: JsonPointer;
	/** URI where this operation is actually defined */
	definitionUri: string;
	/** Pointer where this operation is actually defined */
	definitionPointer: JsonPointer;
	/** URI where this operation is referenced from (undefined if not referenced, same as definitionUri) */
	referenceUri?: string;
	/** Pointer where this operation is referenced from (undefined if not referenced) */
	referencePointer?: JsonPointer;
	/** HTTP method (get, post, put, delete, patch, options, head, trace) */
	method: string;
	/** The Operation object node */
	node: unknown;

	// ═══════════════════════════════════════════════════════════════════════════
	// Typed field accessors - return typed values directly from the operation
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the operation summary */
	summary(): string | undefined;
	/** Get the operation description */
	description(): string | undefined;
	/** Get the operationId */
	operationId(): string | undefined;
	/** Check if the operation is deprecated */
	deprecated(): boolean;
	/** Get tags array (empty array if not defined) */
	tags(): string[];
	/** Get externalDocs object */
	externalDocs(): ExternalDocsNode | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Array iteration with auto-constructed refs
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Iterate over tags with auto-constructed refs.
	 * @param fn - Callback receiving tag value and ref with pointer
	 */
	eachTag(fn: (tag: string, ref: ItemRef<string>) => void): void;

	/**
	 * Iterate over parameters with auto-constructed refs.
	 * @param fn - Callback receiving parameter node and ref
	 */
	eachParameter(fn: (param: unknown, ref: ParameterRef) => void): void;

	/**
	 * Iterate over responses with auto-constructed refs.
	 * @param fn - Callback receiving status code, response node, and ref
	 */
	eachResponse(
		fn: (code: string, response: unknown, ref: ResponseRef) => void,
	): void;

	/**
	 * Iterate over servers with auto-constructed refs.
	 * @param fn - Callback receiving server node and ref
	 */
	eachServer(fn: (server: ServerNode, ref: ItemRef<ServerNode>) => void): void;

	/**
	 * Iterate over security requirements with auto-constructed refs.
	 * @param fn - Callback receiving security requirement and ref
	 */
	eachSecurityRequirement(
		fn: (req: Record<string, string[]>, ref: ItemRef<Record<string, string[]>>) => void,
	): void;

	/**
	 * Iterate over callbacks with auto-constructed refs.
	 * @param fn - Callback receiving callback name, node, and ref
	 */
	eachCallback(fn: (name: string, callback: unknown, ref: CallbackRef) => void): void;

	// ═══════════════════════════════════════════════════════════════════════════
	// Response helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the responses object */
	responses(): Record<string, unknown> | undefined;
	/** Check if this operation has any responses defined */
	hasResponses(): boolean;
	/** Check if this operation has a specific response code (e.g., "200", "404", "default") */
	hasResponse(code: string): boolean;
	/** Check if this operation has any success response (2xx) */
	hasSuccessResponse(): boolean;
	/** Check if this operation has any error response (4xx or 5xx) */
	hasErrorResponse(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Request body helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the requestBody object */
	requestBody(): unknown;
	/** Check if this operation has a request body */
	hasRequestBody(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Parameter helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the parameters array (empty if not defined) */
	parameters(): unknown[];
	/** Check if this operation has any parameters */
	hasParameters(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Security helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the operation-level security requirements */
	security(): Array<Record<string, string[]>>;
	/** Check if this operation has security requirements defined */
	hasSecurity(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Server helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the operation-level servers (empty if not defined) */
	servers(): ServerNode[];
	/** Check if this operation has servers defined */
	hasServers(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Callback helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the callbacks object */
	callbacks(): Record<string, unknown> | undefined;
	/** Check if this operation has callbacks defined */
	hasCallbacks(): boolean;
}

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
 * Reference to a Component definition in the OpenAPI document.
 *
 * Components are reusable definitions under #/components (schemas,
 * parameters, responses, etc.).
 *
 * @see {@link Visitors.Component} - Visitor callback that receives ComponentRef
 *
 * @example
 * ```typescript
 * const compRef: ComponentRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/components/schemas/User",
 *   node: { type: "object", properties: { ... } }
 * };
 * ```
 *
 * @example Using typed accessors
 * ```typescript
 * Component(component) {
 *   const type = component.componentType(); // "schemas", "parameters", etc.
 *   const name = component.componentName();
 *   if (component.isSchema()) {
 *     // Handle schema-specific logic
 *   }
 * }
 * ```
 */
export interface ComponentRef {
	/** URI of the document containing this component */
	uri: string;
	/** JSON pointer to the component */
	pointer: JsonPointer;
	/** The component object node */
	node: unknown;

	// ═══════════════════════════════════════════════════════════════════════════
	// Typed accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the component type (schemas, parameters, responses, etc.) */
	componentType(): ComponentType;
	/** Get the component name (extracted from pointer) */
	componentName(): string;

	// ═══════════════════════════════════════════════════════════════════════════
	// Quick checks
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this component is a $ref */
	isRef(): boolean;
	/** Check if this is a schema component */
	isSchema(): boolean;
	/** Check if this is a parameter component */
	isParameter(): boolean;
	/** Check if this is a response component */
	isResponse(): boolean;
	/** Check if this is a request body component */
	isRequestBody(): boolean;
	/** Check if this is a header component */
	isHeader(): boolean;
	/** Check if this is a security scheme component */
	isSecurityScheme(): boolean;
	/** Check if this is an example component */
	isExample(): boolean;
	/** Check if this is a link component */
	isLink(): boolean;
	/** Check if this is a callback component */
	isCallback(): boolean;
}

/**
 * JSON Schema type values supported by OpenAPI.
 *
 * In OpenAPI 3.0, type is always a single string.
 * In OpenAPI 3.1+, type can also be an array (e.g., ["string", "null"]).
 *
 * @see {@link SchemaRef.type} - Returns this type
 * @see {@link SchemaRef.typeArray} - Returns array form for 3.1+
 */
export type SchemaType =
	| "string"
	| "number"
	| "integer"
	| "boolean"
	| "array"
	| "object"
	| "null";

/**
 * HTTP methods supported by OpenAPI path items.
 *
 * Includes standard HTTP methods plus "query" added in OpenAPI 3.2.
 */
export type HttpMethod =
	| "get"
	| "put"
	| "post"
	| "delete"
	| "options"
	| "head"
	| "patch"
	| "trace"
	| "query"; // OpenAPI 3.2+

/**
 * Security scheme types supported by OpenAPI.
 *
 * @see {@link SecuritySchemeRef.type} - Returns this type
 */
export type SecuritySchemeType =
	| "apiKey"
	| "http"
	| "oauth2"
	| "openIdConnect"
	| "mutualTLS"; // OpenAPI 3.1+

/**
 * API key location for apiKey security schemes.
 *
 * @see {@link SecuritySchemeRef.apiKeyIn} - Returns this type
 */
export type ApiKeyLocation = "query" | "header" | "cookie";

/**
 * Location of a schema within the OpenAPI document structure.
 *
 * This helps rules understand the context of a schema - whether it's
 * a top-level component, nested property, array items, etc.
 */
export type SchemaLocation =
	| "component" // #/components/schemas/Foo
	| "inline" // Inline in requestBody, response, etc.
	| "properties" // #/.../properties/foo
	| "items" // #/.../items
	| "allOf" // #/.../allOf/0
	| "oneOf" // #/.../oneOf/0
	| "anyOf" // #/.../anyOf/0
	| "additionalProperties" // #/.../additionalProperties
	| "patternProperties"; // #/.../patternProperties/pattern

/**
 * Reference to a Schema in the OpenAPI document.
 *
 * Schemas can appear in components, inline in request/response bodies,
 * or nested within other schemas. The SchemaRef includes navigation
 * context to help rules understand the schema's position.
 *
 * @see {@link Visitors.Schema} - Visitor callback that receives SchemaRef
 * @see {@link RuleContext.getChildSchemas} - Navigate to child schemas
 *
 * @example
 * ```typescript
 * const schemaRef: SchemaRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/components/schemas/User/properties/name",
 *   node: { type: "string", minLength: 1 },
 *   propertyName: "name",
 *   isRequired: true,
 *   depth: 1,
 *   location: "properties"
 * };
 * ```
 *
 * @example Using typed accessors
 * ```typescript
 * Schema(schema) {
 *   if (schema.isRef()) return;  // Skip $ref schemas
 *   const type = schema.type();  // "string" | "object" | etc.
 *   schema.eachProperty((name, propSchema, ref) => { ... });
 * }
 * ```
 */
export interface SchemaRef {
	/** URI of the document containing this schema */
	uri: string;
	/** JSON pointer to the schema */
	pointer: JsonPointer;
	/** The schema object node */
	node: unknown;

	// Position context for navigation (optional for backward compatibility)
	/** Parent schema reference (for walking UP the tree) */
	parent?: SchemaRef;
	/** Property key name if this schema is under properties */
	propertyName?: string;
	/** Whether this property is required (only set for properties) */
	isRequired?: boolean;
	/** Nesting depth: 0 = top-level schema, 1+ = nested. Defaults to 0 if not set. */
	depth?: number;
	/** Where this schema lives in the structure. Defaults to "inline" if not set. */
	location?: SchemaLocation;
	/** Index in composition arrays (allOf[0], oneOf[1], etc.) */
	locationIndex?: number;

	// ═══════════════════════════════════════════════════════════════════════════
	// Typed field accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the schema type (string, number, integer, boolean, array, object, null) */
	type(): SchemaType | undefined;
	/** Get the schema format */
	format(): string | undefined;
	/** Get the schema description */
	description(): string | undefined;
	/** Get the schema title */
	title(): string | undefined;
	/** Check if the schema is deprecated */
	deprecated(): boolean;
	/** Get the required properties array (empty if not defined) */
	required(): string[];
	/** Get enum values */
	enum(): unknown[] | undefined;
	/** Get default value */
	default(): unknown;
	/** Get example value */
	example(): unknown;

	// ═══════════════════════════════════════════════════════════════════════════
	// Composition and reference checks
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this schema is a $ref */
	isRef(): boolean;
	/** Check if this schema uses composition (allOf, oneOf, or anyOf) */
	isComposition(): boolean;
	/** Check if this schema has an explicit type field */
	hasType(): boolean;
	/** Check if this schema has allOf */
	hasAllOf(): boolean;
	/** Check if this schema has oneOf */
	hasOneOf(): boolean;
	/** Check if this schema has anyOf */
	hasAnyOf(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Type checks - convenient helpers for checking specific types
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this schema is type: "array" */
	isArray(): boolean;
	/** Check if this schema is type: "object" */
	isObject(): boolean;
	/** Check if this schema is type: "string" */
	isString(): boolean;
	/** Check if this schema is type: "number" or "integer" */
	isNumber(): boolean;
	/** Check if this schema is type: "boolean" */
	isBoolean(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Example/default helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this schema has an example */
	hasExample(): boolean;
	/** Check if this schema has a default value */
	hasDefault(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Items helper (for arrays)
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the items schema (for array types) */
	items(): unknown;
	/** Check if this schema has items defined */
	hasItems(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Properties helpers (for objects)
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the properties object */
	properties(): Record<string, unknown> | undefined;
	/** Check if this schema has properties defined */
	hasProperties(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Version-specific accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Get nullable value (OpenAPI 3.0 only, deprecated in 3.1+).
	 * Returns undefined if not set or on versions where not applicable.
	 */
	nullable(): boolean | undefined;

	/**
	 * Get type as array (OpenAPI 3.1+ style: ["string", "null"]).
	 * Returns undefined if type is not an array.
	 */
	typeArray(): string[] | undefined;

	/**
	 * Get additionalProperties value.
	 * Can be boolean (true/false) or a schema object.
	 */
	additionalProperties(): boolean | Record<string, unknown> | undefined;

	/** Check if additionalProperties is explicitly set */
	hasAdditionalProperties(): boolean;

	/**
	 * Get patternProperties object.
	 * Maps regex patterns to schema objects.
	 */
	patternProperties(): Record<string, unknown> | undefined;

	/** Check if patternProperties is defined */
	hasPatternProperties(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Array iteration with auto-constructed refs
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Iterate over properties with auto-constructed refs.
	 * @param fn - Callback receiving property name, schema node, and ref
	 */
	eachProperty(
		fn: (name: string, schema: unknown, ref: SchemaRef) => void,
	): void;

	/**
	 * Iterate over allOf schemas with auto-constructed refs.
	 * @param fn - Callback receiving schema node and ref
	 */
	eachAllOf(fn: (schema: unknown, ref: SchemaRef) => void): void;

	/**
	 * Iterate over oneOf schemas with auto-constructed refs.
	 * @param fn - Callback receiving schema node and ref
	 */
	eachOneOf(fn: (schema: unknown, ref: SchemaRef) => void): void;

	/**
	 * Iterate over anyOf schemas with auto-constructed refs.
	 * @param fn - Callback receiving schema node and ref
	 */
	eachAnyOf(fn: (schema: unknown, ref: SchemaRef) => void): void;

	/**
	 * Iterate over enum values with auto-constructed refs.
	 * @param fn - Callback receiving enum value and ref
	 */
	eachEnum(fn: (value: unknown, ref: ItemRef<unknown>) => void): void;

	/**
	 * Iterate over required property names with auto-constructed refs.
	 * @param fn - Callback receiving property name and ref
	 */
	eachRequired(fn: (name: string, ref: ItemRef<string>) => void): void;

	/**
	 * Iterate over pattern properties with auto-constructed refs.
	 * @param fn - Callback receiving pattern string, schema node, and ref
	 */
	eachPatternProperty(fn: (pattern: string, schema: unknown, ref: SchemaRef) => void): void;

	// ═══════════════════════════════════════════════════════════════════════════
	// String validation constraints
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get minimum string length constraint */
	minLength(): number | undefined;
	/** Get maximum string length constraint */
	maxLength(): number | undefined;
	/** Get regex pattern constraint for strings */
	pattern(): string | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Numeric validation constraints
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get minimum numeric value constraint */
	minimum(): number | undefined;
	/** Get maximum numeric value constraint */
	maximum(): number | undefined;
	/**
	 * Get exclusive minimum constraint.
	 * In OpenAPI 3.0: boolean (if true, minimum is exclusive)
	 * In OpenAPI 3.1+: number (the exclusive minimum value)
	 */
	exclusiveMinimum(): number | boolean | undefined;
	/**
	 * Get exclusive maximum constraint.
	 * In OpenAPI 3.0: boolean (if true, maximum is exclusive)
	 * In OpenAPI 3.1+: number (the exclusive maximum value)
	 */
	exclusiveMaximum(): number | boolean | undefined;
	/** Get multipleOf constraint for numeric values */
	multipleOf(): number | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Array validation constraints
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get minimum array items constraint */
	minItems(): number | undefined;
	/** Get maximum array items constraint */
	maxItems(): number | undefined;
	/** Check if array items must be unique */
	uniqueItems(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Object validation constraints
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get minimum properties constraint for objects */
	minProperties(): number | undefined;
	/** Get maximum properties constraint for objects */
	maxProperties(): number | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Metadata accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this property is read-only */
	readOnly(): boolean;
	/** Check if this property is write-only */
	writeOnly(): boolean;
	/** Get the discriminator object */
	discriminator(): Record<string, unknown> | undefined;
	/** Check if this schema has a discriminator */
	hasDiscriminator(): boolean;
	/** Get the const value (renamed from const to avoid reserved word) */
	constValue(): unknown;
	/** Check if this schema has a const value */
	hasConst(): boolean;
	/** Get the not schema */
	not(): unknown;
	/** Check if this schema has a not schema */
	hasNot(): boolean;
	/** Get the XML serialization configuration */
	xml(): Record<string, unknown> | undefined;
	/** Get the JSON Schema $id (OpenAPI 3.1+) */
	$id(): string | undefined;
	/** Get external documentation */
	externalDocs(): ExternalDocsNode | undefined;
}

/**
 * Parameter location type.
 */
export type ParameterLocation = "query" | "path" | "header" | "cookie";

/**
 * Reference to a Parameter in the OpenAPI document.
 *
 * Parameters can be defined in components, at path level, or at operation level.
 *
 * @see {@link Visitors.Parameter} - Visitor callback that receives ParameterRef
 *
 * @example
 * ```typescript
 * const paramRef: ParameterRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/paths/~1users~1{id}/get/parameters/0",
 *   node: { name: "id", in: "path", required: true, schema: { type: "string" } },
 *   name: "id",
 *   in: "path"
 * };
 * ```
 *
 * @example Using typed accessors
 * ```typescript
 * Parameter(param) {
 *   if (param.isRef()) return;       // Skip $ref parameters
 *   if (!param.isQuery()) return;    // Only check query params
 *   const name = param.name();       // "filters" etc.
 * }
 * ```
 */
export interface ParameterRef {
	/** URI of the document containing this parameter */
	uri: string;
	/** JSON pointer to the parameter */
	pointer: JsonPointer;
	/** The parameter object node */
	node: unknown;
	/** Parameter name (from pre-parsed value) */
	name?: string;
	/** Parameter location (from pre-parsed value) */
	in?: string;

	// ═══════════════════════════════════════════════════════════════════════════
	// Typed field accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the parameter name */
	getName(): string | undefined;
	/** Get the parameter location */
	getIn(): ParameterLocation | undefined;
	/** Get the parameter description */
	description(): string | undefined;
	/** Check if the parameter is required */
	required(): boolean;
	/** Check if the parameter is deprecated */
	deprecated(): boolean;
	/** Get the parameter schema */
	schema(): unknown;
	/** Get the parameter example */
	example(): unknown;
	/** Get the parameter examples object */
	examples(): Record<string, unknown> | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Schema helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this parameter has a schema defined */
	hasSchema(): boolean;
	/** Get the schema type (if schema exists) */
	schemaType(): string | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Example helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Check if this parameter has an example defined anywhere.
	 * Checks: example, examples, and schema.example
	 */
	hasExample(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Quick location checks
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this parameter is a $ref */
	isRef(): boolean;
	/** Check if this is a query parameter */
	isQuery(): boolean;
	/** Check if this is a path parameter */
	isPath(): boolean;
	/** Check if this is a header parameter */
	isHeader(): boolean;
	/** Check if this is a cookie parameter */
	isCookie(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Serialization style accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the serialization style (form, simple, label, matrix, etc.) */
	style(): string | undefined;
	/** Check if arrays/objects should be exploded */
	explode(): boolean;
	/** Allow reserved characters in query params */
	allowReserved(): boolean;
	/** Allow empty values for query params */
	allowEmptyValue(): boolean;
	/** Get content object for complex parameters */
	content(): Record<string, unknown> | undefined;
}

/**
 * Reference to a Response in the OpenAPI document.
 *
 * Responses can be defined in components or inline in operations.
 *
 * @see {@link Visitors.Response} - Visitor callback that receives ResponseRef
 *
 * @example
 * ```typescript
 * const respRef: ResponseRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/paths/~1users/get/responses/200",
 *   node: { description: "Success", content: { ... } },
 *   statusCode: "200"
 * };
 * ```
 *
 * @example Using typed accessors
 * ```typescript
 * Response(response) {
 *   if (response.isSuccess()) {
 *     response.eachHeader((name, header, ref) => { ... });
 *     response.eachMediaType((type, mediaType, ref) => { ... });
 *   }
 * }
 * ```
 */
export interface ResponseRef {
	/** URI of the document containing this response */
	uri: string;
	/** JSON pointer to the response */
	pointer: JsonPointer;
	/** The response object node */
	node: unknown;
	/** HTTP status code (or "default") */
	statusCode?: string;

	// ═══════════════════════════════════════════════════════════════════════════
	// Typed field accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the response description */
	description(): string | undefined;
	/** Get the content object */
	content(): Record<string, unknown> | undefined;
	/** Get the headers object */
	headers(): Record<string, unknown> | undefined;
	/** Get the links object */
	links(): Record<string, unknown> | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Quick checks
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this response is a $ref */
	isRef(): boolean;
	/** Check if this is a success response (2xx) */
	isSuccess(): boolean;
	/** Check if this is an error response (4xx or 5xx) */
	isError(): boolean;
	/** Check if this response has content defined */
	hasContent(): boolean;
	/** Check if this response has headers defined */
	hasHeaders(): boolean;
	/** Check if this response has links defined */
	hasLinks(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Iteration helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Iterate over headers with auto-constructed refs.
	 * @param fn - Callback receiving header name, node, and ref
	 */
	eachHeader(fn: (name: string, header: unknown, ref: HeaderRef) => void): void;

	/**
	 * Iterate over media types with auto-constructed refs.
	 * @param fn - Callback receiving media type string, node, and ref
	 */
	eachMediaType(fn: (mediaType: string, node: unknown, ref: MediaTypeRef) => void): void;

	/**
	 * Iterate over links with auto-constructed refs.
	 * @param fn - Callback receiving link name, node, and ref
	 */
	eachLink(fn: (name: string, link: unknown, ref: LinkRef) => void): void;
}

/**
 * Reference to a RequestBody in the OpenAPI document.
 *
 * Request bodies can be defined in components or inline in operations.
 *
 * @see {@link Visitors.RequestBody} - Visitor callback that receives RequestBodyRef
 *
 * @example
 * ```typescript
 * const rbRef: RequestBodyRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/paths/~1users/post/requestBody",
 *   node: { required: true, content: { "application/json": { ... } } }
 * };
 * ```
 *
 * @example Using typed accessors
 * ```typescript
 * RequestBody(body) {
 *   if (body.required()) {
 *     body.eachMediaType((type, node, ref) => {
 *       const schema = ref.schema();
 *     });
 *   }
 * }
 * ```
 */
export interface RequestBodyRef {
	/** URI of the document containing this request body */
	uri: string;
	/** JSON pointer to the request body */
	pointer: JsonPointer;
	/** The request body object node */
	node: unknown;

	// ═══════════════════════════════════════════════════════════════════════════
	// Typed field accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the request body description */
	description(): string | undefined;
	/** Check if the request body is required */
	required(): boolean;
	/** Get the content object */
	content(): Record<string, unknown> | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Quick checks
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this request body is a $ref */
	isRef(): boolean;
	/** Check if this request body has content defined */
	hasContent(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Iteration helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Iterate over media types with auto-constructed refs.
	 * @param fn - Callback receiving media type string, node, and ref
	 */
	eachMediaType(fn: (mediaType: string, node: unknown, ref: MediaTypeRef) => void): void;
}

/**
 * Reference to a Header in the OpenAPI document.
 *
 * Headers can be defined in components or in response objects.
 *
 * @see {@link Visitors.Header} - Visitor callback that receives HeaderRef
 *
 * @example
 * ```typescript
 * const headerRef: HeaderRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/components/headers/X-Rate-Limit",
 *   node: { description: "Rate limit", schema: { type: "integer" } },
 *   name: "X-Rate-Limit"
 * };
 * ```
 *
 * @example Using typed accessors
 * ```typescript
 * Header(header) {
 *   const name = header.getName();
 *   if (header.required()) {
 *     const schema = header.schema();
 *   }
 * }
 * ```
 */
export interface HeaderRef {
	/** URI of the document containing this header */
	uri: string;
	/** JSON pointer to the header */
	pointer: JsonPointer;
	/** The header object node */
	node: unknown;
	/** Header name */
	name?: string;

	// ═══════════════════════════════════════════════════════════════════════════
	// Typed field accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the header name */
	getName(): string | undefined;
	/** Get the header description */
	description(): string | undefined;
	/** Check if the header is required */
	required(): boolean;
	/** Check if the header is deprecated */
	deprecated(): boolean;
	/** Get the header schema */
	schema(): unknown;
	/** Get the header example */
	example(): unknown;
	/** Get the header examples object */
	examples(): Record<string, unknown> | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Quick checks
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this header is a $ref */
	isRef(): boolean;
	/** Check if this header has a schema defined */
	hasSchema(): boolean;
	/**
	 * Check if this header has an example defined anywhere.
	 * Checks: example, examples, and schema.example
	 */
	hasExample(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Iteration helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Iterate over examples with auto-constructed refs.
	 * @param fn - Callback receiving example name, node, and ref
	 */
	eachExample(fn: (name: string, example: unknown, ref: ExampleRef) => void): void;
}

/**
 * Reference to a MediaType in the OpenAPI document.
 *
 * MediaTypes appear under content in requestBody and response objects.
 *
 * @see {@link Visitors.MediaType} - Visitor callback that receives MediaTypeRef
 *
 * @example
 * ```typescript
 * const mtRef: MediaTypeRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/paths/~1users/get/responses/200/content/application~1json",
 *   node: { schema: { ... }, examples: { ... } },
 *   mediaType: "application/json"
 * };
 * ```
 */
export interface MediaTypeRef {
	/** URI of the document containing this media type */
	uri: string;
	/** JSON pointer to the media type */
	pointer: JsonPointer;
	/** The media type object node */
	node: unknown;
	/** Media type string (e.g., "application/json") */
	mediaType?: string;

	// ═══════════════════════════════════════════════════════════════════════════
	// Common accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the schema object */
	schema(): unknown | undefined;
	/** Check if this media type has a schema */
	hasSchema(): boolean;
	/** Get the example value */
	example(): unknown;
	/** Get the examples object */
	examples(): Record<string, unknown> | undefined;
	/** Get the encoding object */
	encoding(): Record<string, unknown> | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// OpenAPI 3.2+ accessors (streaming support)
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Get the itemSchema (OpenAPI 3.2+).
	 * Schema for individual items in streaming responses (SSE, JSON Lines, etc.).
	 */
	itemSchema(): unknown | undefined;

	/** Check if this media type has an itemSchema */
	hasItemSchema(): boolean;

	/**
	 * Get the itemEncoding (OpenAPI 3.2+).
	 * Encoding information for streamed items.
	 */
	itemEncoding(): unknown | undefined;

	/** Check if this media type has itemEncoding */
	hasItemEncoding(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Example helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this media type has an example value */
	hasExample(): boolean;
	/** Check if this media type has an examples object */
	hasExamples(): boolean;
	/**
	 * Iterate over examples with auto-constructed refs.
	 * @param fn - Callback receiving example name, node, and ref
	 */
	eachExample(fn: (name: string, example: unknown, ref: ExampleRef) => void): void;
}

/**
 * Reference to a SecurityRequirement in the OpenAPI document.
 *
 * Security requirements can appear at root level (default for all operations)
 * or at operation level (overrides root).
 *
 * @see {@link Visitors.SecurityRequirement} - Visitor callback that receives SecurityRequirementRef
 *
 * @example
 * ```typescript
 * const secRef: SecurityRequirementRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/paths/~1users/get/security/0",
 *   node: { bearerAuth: [] },
 *   level: "operation"
 * };
 * ```
 */
export interface SecurityRequirementRef {
	/** URI of the document containing this security requirement */
	uri: string;
	/** JSON pointer to the security requirement */
	pointer: JsonPointer;
	/** The security requirement object node */
	node: unknown;
	/** Whether this is a root-level or operation-level requirement */
	level: "root" | "operation";
}

/**
 * Reference to an Example in the OpenAPI document.
 *
 * Examples can be defined in components or inline under media types,
 * parameters, and headers.
 *
 * @see {@link Visitors.Example} - Visitor callback that receives ExampleRef
 *
 * @example
 * ```typescript
 * const exRef: ExampleRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/components/examples/UserExample",
 *   node: { summary: "A user", value: { id: "1", name: "John" } },
 *   name: "UserExample"
 * };
 * ```
 *
 * @example Using typed accessors
 * ```typescript
 * Example(example) {
 *   if (example.isExternal()) {
 *     const url = example.externalValue();
 *   } else {
 *     const val = example.value();
 *   }
 * }
 * ```
 */
export interface ExampleRef {
	/** URI of the document containing this example */
	uri: string;
	/** JSON pointer to the example */
	pointer: JsonPointer;
	/** The example object node */
	node: unknown;
	/** Example name (from component key or examples object key) */
	name?: string;

	// ═══════════════════════════════════════════════════════════════════════════
	// Typed field accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the example summary */
	summary(): string | undefined;
	/** Get the example description */
	description(): string | undefined;
	/** Get the example value */
	value(): unknown;
	/** Get the external value URL */
	externalValue(): string | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Quick checks
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this example is a $ref */
	isRef(): boolean;
	/** Check if this example uses an external value (URL) */
	isExternal(): boolean;
}

/**
 * Reference to a Link in the OpenAPI document.
 *
 * Links define relationships between operations and can be defined
 * in components or in response objects.
 *
 * @see {@link Visitors.Link} - Visitor callback that receives LinkRef
 *
 * @example
 * ```typescript
 * const linkRef: LinkRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/components/links/GetUserById",
 *   node: { operationId: "getUser", parameters: { id: "$response.body#/id" } },
 *   name: "GetUserById"
 * };
 * ```
 *
 * @example Using typed accessors
 * ```typescript
 * Link(link) {
 *   const opId = link.operationId();
 *   const params = link.parameters();
 * }
 * ```
 */
export interface LinkRef {
	/** URI of the document containing this link */
	uri: string;
	/** JSON pointer to the link */
	pointer: JsonPointer;
	/** The link object node */
	node: unknown;
	/** Link name (from component key or links object key) */
	name?: string;

	// ═══════════════════════════════════════════════════════════════════════════
	// Typed field accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get the operation reference (relative or absolute URI) */
	operationRef(): string | undefined;
	/** Get the operationId to link to */
	operationId(): string | undefined;
	/** Get the parameters object */
	parameters(): Record<string, unknown> | undefined;
	/** Get the request body value or expression */
	requestBody(): unknown;
	/** Get the link description */
	description(): string | undefined;
	/** Get the server object for this link */
	server(): ServerNode | undefined;

	// ═══════════════════════════════════════════════════════════════════════════
	// Quick checks
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this link is a $ref */
	isRef(): boolean;
	/** Check if this link has an operationRef */
	hasOperationRef(): boolean;
	/** Check if this link has an operationId */
	hasOperationId(): boolean;
}

/**
 * Reference to a Callback in the OpenAPI document.
 *
 * Callbacks define webhook-style operations and can be defined
 * in components or in operation objects.
 *
 * @see {@link Visitors.Callback} - Visitor callback that receives CallbackRef
 *
 * @example
 * ```typescript
 * const cbRef: CallbackRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/paths/~1subscribe/post/callbacks/onEvent",
 *   node: { "{$request.body#/callbackUrl}": { post: { ... } } },
 *   name: "onEvent"
 * };
 * ```
 *
 * @example Using typed accessors
 * ```typescript
 * Callback(callback) {
 *   callback.eachPathItem((expression, pathItem, pathItemRef) => {
 *     // Process each callback path
 *   });
 * }
 * ```
 */
export interface CallbackRef {
	/** URI of the document containing this callback */
	uri: string;
	/** JSON pointer to the callback */
	pointer: JsonPointer;
	/** The callback object node */
	node: unknown;
	/** Callback name (from component key or callbacks object key) */
	name?: string;

	// ═══════════════════════════════════════════════════════════════════════════
	// Quick checks
	// ═══════════════════════════════════════════════════════════════════════════

	/** Check if this callback is a $ref */
	isRef(): boolean;

	// ═══════════════════════════════════════════════════════════════════════════
	// Typed accessors
	// ═══════════════════════════════════════════════════════════════════════════

	/** Get all expression keys (excluding x- extensions) */
	expressions(): string[];

	// ═══════════════════════════════════════════════════════════════════════════
	// Iteration helpers
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Iterate over callback path items with auto-constructed refs.
	 * @param fn - Callback receiving expression, path item node, and ref
	 */
	eachPathItem(fn: (expression: string, pathItem: unknown, ref: PathItemRef) => void): void;
}

/**
 * Reference to a Webhook in the OpenAPI document (OpenAPI 3.1+).
 *
 * Webhooks define callback-style operations at the root level under
 * the `webhooks` key. They have the same structure as PathItems.
 *
 * @see {@link Visitors.Webhook} - Visitor callback that receives WebhookRef
 *
 * @example
 * ```typescript
 * const whRef: WebhookRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/webhooks/newPet",
 *   node: { post: { requestBody: { ... }, responses: { ... } } },
 *   name: "newPet"
 * };
 * ```
 */
export interface WebhookRef {
	/** URI of the document containing this webhook */
	uri: string;
	/** JSON pointer to the webhook */
	pointer: JsonPointer;
	/** The webhook PathItem object node */
	node: unknown;
	/** Webhook name (key in webhooks object) */
	name: string;
	/** URI where this webhook is actually defined (in case of $ref) */
	definitionUri: string;
	/** Pointer where this webhook is actually defined (in case of $ref) */
	definitionPointer: JsonPointer;
	/** URI where this webhook is referenced from (undefined if not referenced) */
	referenceUri?: string;
	/** Pointer where this webhook is referenced from (undefined if not referenced) */
	referencePointer?: JsonPointer;
}

/**
 * Reference to a $ref node in the OpenAPI document.
 *
 * This represents any node that contains a $ref property, allowing
 * rules to validate $ref usage and resolution.
 *
 * @see {@link Visitors.Reference} - Visitor callback that receives ReferenceRef
 *
 * @example
 * ```typescript
 * const refRef: ReferenceRef = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/paths/~1users/get/responses/200/content/application~1json/schema",
 *   refPointer: "#/paths/~1users/get/responses/200/content/application~1json/schema/$ref",
 *   ref: "#/components/schemas/User",
 *   node: { "$ref": "#/components/schemas/User" }
 * };
 * ```
 */
export interface ReferenceRef {
	/** URI of the document containing this $ref */
	uri: string;
	/** Pointer to the node containing the $ref */
	pointer: JsonPointer;
	/** Pointer to the $ref property itself */
	refPointer: JsonPointer;
	/** The $ref value string */
	ref: string;
	/** The node containing the $ref */
	node: unknown;
}

/**
 * The project index containing extracted and organized OpenAPI elements.
 *
 * ProjectIndex provides efficient lookup of all OpenAPI elements across
 * all documents in a project. It's built by buildIndex and used during
 * rule execution to dispatch visitors.
 *
 * @see {@link buildIndex} - Function that creates ProjectIndex
 * @see {@link runEngine} - Uses ProjectIndex to dispatch visitors
 *
 * @example
 * ```typescript
 * const index: ProjectIndex = buildIndex({ docs, graph, resolver });
 *
 * // Iterate all operations
 * for (const [ownerKey, operations] of index.operationsByOwner) {
 *   for (const op of operations) {
 *     console.log(`${op.method.toUpperCase()} at ${op.pointer}`);
 *   }
 * }
 *
 * // Look up a schema by key
 * const schemaKey = `${uri}#${pointer}`;
 * const schema = index.schemas.get(schemaKey);
 * ```
 */
export interface ProjectIndex {
	/** Detected OpenAPI version (e.g., "3.0", "3.1", "3.2") */
	version: string;
	/** PathItems grouped by path string (e.g., "/users") */
	pathsByString: Map<string, PathItemRef[]>;
	/** Reverse lookup: PathItem key to path strings */
	pathItemsToPaths: Map<string, string[]>;
	/** Operations grouped by owning PathItem key */
	operationsByOwner: Map<string, OperationRef[]>;
	/** Components by section (schemas, parameters, responses, etc.) */
	components: Record<string, Map<string, ComponentRef>>;
	/** All schemas (components, fragments, inline) - key is "uri#pointer" */
	schemas: Map<string, SchemaRef>;
	/** All parameters (components, path-level, operation-level, fragments) */
	parameters: Map<string, ParameterRef>;
	/** All responses (components, operation-level, fragments) */
	responses: Map<string, ResponseRef>;
	/** All request bodies (components, operation-level, fragments) */
	requestBodies: Map<string, RequestBodyRef>;
	/** All headers (components, response-level, fragments) */
	headers: Map<string, HeaderRef>;
	/** All media types (requestBody.content, response.content) */
	mediaTypes: Map<string, MediaTypeRef>;
	/** All security requirements (root, operation-level) */
	securityRequirements: Map<string, SecurityRequirementRef>;
	/** All examples (components, inline under media types, parameters, headers) */
	examples: Map<string, ExampleRef>;
	/** All links (components, response-level) */
	links: Map<string, LinkRef>;
	/** All callbacks (components, operation-level) */
	callbacks: Map<string, CallbackRef>;
	/** All webhooks (OpenAPI 3.1+) - key is "uri#pointer" */
	webhooks: Map<string, WebhookRef>;
	/** All $ref nodes throughout the document */
	references: Map<string, ReferenceRef>;
	/** Document ASTs by URI */
	documents: Map<string, Record<string, unknown>>;
	/** Optional scope provider for determining context */
	scopeProvider?: (uri: string, pointer: JsonPointer) => ScopeContext | null;
}

/**
 * Context information about a specific location in an OpenAPI document.
 *
 * ScopeContext provides hierarchical information about where a node
 * is located - what path, operation, component, etc. it belongs to.
 * This helps rules make context-aware decisions.
 *
 * @see {@link RuleContext.getScopeContext} - Method to get scope for a location
 * @see {@link createScopeProvider} - Function that creates scope providers
 *
 * @example
 * ```typescript
 * const scope = ctx.getScopeContext(uri, pointer);
 * if (scope?.operation) {
 *   console.log(`In operation: ${scope.operation.method}`);
 * }
 * if (scope?.path) {
 *   console.log(`On path: ${scope.path.name}`);
 * }
 * ```
 */
export interface ScopeContext {
	/** URI of the document */
	documentUri: string;
	/** JSON pointer to the location */
	pointer: JsonPointer;
	/** Chain of ancestors from root to this location */
	ancestors: Array<{ kind: string; pointer: JsonPointer }>;
	/** Path context if within a path item */
	path?: { name: string; pointer: JsonPointer };
	/** Operation context if within an operation */
	operation?: { method: string; pointer: JsonPointer };
	/** Parameter context if within a parameter */
	parameter?: { name?: string; in?: string; pointer: JsonPointer };
	/** Security context if within a security requirement */
	security?: {
		level: "root" | "operation";
		pointer: JsonPointer;
		scheme?: string;
	};
	/** Component context if within a component */
	component?: { type: string; name: string; pointer: JsonPointer };
}

/**
 * Resolves root documents for nodes in the reference graph.
 *
 * RootResolver traverses backwards through $ref relationships to find
 * the root OpenAPI documents that reference a given node. This is useful
 * for determining which root documents are affected by changes to
 * fragment files.
 *
 * @see {@link buildRefGraph} - Function that creates RootResolver
 * @see {@link RootResolverImpl} - Implementation class in ref-graph.ts
 *
 * @example
 * ```typescript
 * const { rootResolver } = buildRefGraph({ docs });
 *
 * // Find roots for a schema fragment
 * const roots = rootResolver.findRootsForNode(
 *   "file:///schemas/User.yaml",
 *   "#"
 * );
 * console.log(`Referenced by roots: ${roots.join(", ")}`);
 *
 * // Check if a document is a root
 * if (rootResolver.isRootDocument(uri)) {
 *   console.log("This is a root OpenAPI document");
 * }
 * ```
 */
export interface RootResolver {
	/**
	 * Find all root documents that reference this node (via any chain of $refs).
	 * Returns empty array if node is itself a root, or if no roots reference it.
	 *
	 * @param uri - The URI of the document containing the node
	 * @param pointer - The JSON pointer to the node
	 * @returns Array of root document URIs
	 */
	findRootsForNode(uri: string, pointer: string): string[];

	/**
	 * Get the primary root document for a node (first root found, or node itself if root).
	 * Returns null if node is not connected to any root.
	 *
	 * @param uri - The URI of the document containing the node
	 * @param pointer - The JSON pointer to the node
	 * @returns Primary root document URI, or null if not found
	 */
	getPrimaryRoot(uri: string, pointer: string): string | null;

	/**
	 * Check if a document is a root document.
	 *
	 * @param uri - The URI of the document to check
	 * @returns True if the document is a root document
	 */
	isRootDocument(uri: string): boolean;

	/**
	 * Get the OpenAPI version for a partial document by tracing back to its root.
	 *
	 * For partial documents (schemas, operations, etc.) that don't have an explicit
	 * `openapi` field, this method traces backward through $ref relationships to find
	 * the root document and returns its OpenAPI version.
	 *
	 * @param uri - The URI of the partial document
	 * @returns The OpenAPI version from the root document (e.g., "3.0", "3.1", "3.2"),
	 *          or undefined if no root document is found or the root has no version.
	 *
	 * @example
	 * ```typescript
	 * const { rootResolver } = buildRefGraph({ docs });
	 *
	 * // Get version for a schema fragment
	 * const version = rootResolver.getVersionForPartial("file:///schemas/User.yaml");
	 * // Returns "3.1" if referenced by a root with openapi: "3.1.0"
	 * ```
	 */
	getVersionForPartial(uri: string): string | undefined;
}
