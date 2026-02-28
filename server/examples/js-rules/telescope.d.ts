// Type definitions for Telescope rule authoring.
// Reference this file in your .ts rules for full IntelliSense support.
//
// Usage: add a triple-slash directive at the top of your rule file:
//   /// <reference path="./telescope.d.ts" />

/** Source location range in the OpenAPI document. */
interface Loc {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
}

/** A description field with its text content and source location. */
interface Description {
    text: string;
    loc: Loc;
}

/** Top-level document info. */
interface DocumentInfo {
    title: string;
    description: Description;
    version: string;
    termsOfService: string;
    loc: Loc;
    contact?: {
        name: string;
        url: string;
        email: string;
    };
    license?: {
        name: string;
        url: string;
    };
}

/** Top-level OpenAPI document. */
interface Document {
    version: string;
    docType: number;
    info: DocumentInfo;
    security: SecurityRequirement[];
    loc: Loc;
}

/** A security requirement entry. */
interface SecurityRequirementEntry {
    name: string;
    scopes: string[];
}

/** A security requirement (array of entries). */
interface SecurityRequirement {
    entries: SecurityRequirementEntry[];
}

/** An OpenAPI operation. */
interface Operation {
    operationId: string;
    summary: string;
    description: Description;
    deprecated: boolean;
    loc: Loc;
    tags: string[];
    security: SecurityRequirement[];
    parameters: Parameter[];
    responses: Record<string, Response>;
    requestBody?: RequestBody;
    extensions: Record<string, any>;
}

/** An OpenAPI schema. */
interface Schema {
    type: string;
    format: string;
    title: string;
    description: Description;
    pattern: string;
    nullable: boolean;
    readOnly: boolean;
    writeOnly: boolean;
    deprecated: boolean;
    ref: string;
    loc: Loc;
    enum: string[];
    required: string[];
    properties: Record<string, Schema>;
    extensions: Record<string, any>;
}

/** A path item. */
interface PathItem {
    summary: string;
    description: Description;
    ref: string;
    loc: Loc;
    extensions: Record<string, any>;
}

/** A parameter. */
interface Parameter {
    name: string;
    in: string;
    description: Description;
    required: boolean;
    deprecated: boolean;
    ref: string;
    loc: Loc;
    schema?: Schema;
}

/** A response. */
interface Response {
    description: Description;
    ref: string;
    loc: Loc;
    headers: Record<string, Header>;
    content: Record<string, MediaType>;
}

/** A response header. */
interface Header {
    description: Description;
    required: boolean;
    loc: Loc;
}

/** A media type entry (e.g. application/json). */
interface MediaType {
    schema?: Schema;
    loc: Loc;
}

/** A request body. */
interface RequestBody {
    description: Description;
    required: boolean;
    ref: string;
    loc: Loc;
    content: Record<string, MediaType>;
}

/** A tag. */
interface Tag {
    name: string;
    description: Description;
    loc: Loc;
}

/** A server. */
interface Server {
    url: string;
    description: Description;
    loc: Loc;
}

/** A security scheme. */
interface SecurityScheme {
    type: string;
    description: Description;
    name: string;
    in: string;
    scheme: string;
    bearerFormat: string;
    openIdConnectUrl: string;
    ref: string;
    loc: Loc;
}

/** The context object passed to exports.check(ctx). */
interface RuleContext {
    /** The top-level OpenAPI document. */
    document: Document;

    /** Visit every operation across all paths. */
    operations(fn: (path: string, method: string, op: Operation) => void): void;

    /** Visit every named schema in components/schemas. */
    schemas(fn: (name: string, schema: Schema, pointer: string) => void): void;

    /** Recursively visit schemas and all nested properties, items, allOf/anyOf/oneOf. */
    recursiveSchemas(fn: (name: string, schema: Schema, pointer: string) => void): void;

    /** Visit every path item. */
    paths(fn: (path: string, item: PathItem) => void): void;

    /** Visit every parameter across all paths and operations. */
    parameters(fn: (param: Parameter) => void): void;

    /** Visit every tag. */
    tags(fn: (tag: Tag) => void): void;

    /** Visit every server. */
    servers(fn: (server: Server) => void): void;

    /** Visit every response across all operations. */
    responses(fn: (code: string, response: Response) => void): void;

    /** Visit every request body across all operations. */
    requestBodies(fn: (path: string, method: string, body: RequestBody) => void): void;

    /** Visit every security scheme. */
    securitySchemes(fn: (name: string, scheme: SecurityScheme) => void): void;

    /** Report a diagnostic at the given source location. */
    report(loc: Loc, message: string): void;
}

/** Rule metadata. */
interface RuleMeta {
    id: string;
    description: string;
    severity: "error" | "warn" | "info" | "hint";
    category: string;
}

/** The exports object available in rule scripts. */
declare const exports: {
    meta: RuleMeta;
    check: (ctx: RuleContext) => void;
};
