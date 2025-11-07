/**
 * Central export point for all OpenAPI 3.x schema definitions.
 * These schemas are built using Zod and follow the OpenAPI 3.0, 3.1, and 3.2 specifications.
 * Zod's direct recursive type support enables proper handling of circular references.
 */

// Info schemas
export * from "./schemas/info";

// Server schemas
export * from "./schemas/server";

// Path schemas
export * from "./schemas/paths";
export * from "./schemas/pathItem";

// Operation schemas
export * from "./schemas/operation";
export * from "./schemas/parameter";
export * from "./schemas/requestBody";
export * from "./schemas/response";
export * from "./schemas/responses";
export * from "./schemas/mediaType";

// Component schemas
export * from "./schemas/components";
export * from "./schemas/schema";
export * from "./schemas/example";
export * from "./schemas/header";
export * from "./schemas/encoding";
export * from "./schemas/securityScheme";
export * from "./schemas/securityRequirement";
export * from "./schemas/link";
export * from "./schemas/callback";

// OAuth schemas
export * from "./schemas/oauthFlows";
export * from "./schemas/oauthFlow";

// Documentation schemas
export * from "./schemas/tag";
export * from "./schemas/externalDocumentation";

// Schema-related schemas
export * from "./schemas/xml";
export * from "./schemas/discriminator";

// Extensions
export * from "./schemas/extensions";

// Reference
export * from "./schemas/reference";

// OpenAPI schema
export * from "./schemas/openapi";

// Rules and presets
export {
	pathParamsMatch,
	operationIdUnique,
	rules,
	recommended31,
} from "./rules/presets";
