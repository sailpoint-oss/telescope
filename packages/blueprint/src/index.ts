/**
 * Central export point for all OpenAPI 3.x schema definitions.
 * These schemas are built using Zod and follow the OpenAPI 3.0, 3.1, and 3.2 specifications.
 * Zod's direct recursive type support enables proper handling of circular references.
 */

// Import registry from lens to register rules
import { ruleRegistry, type Preset, type RuleConfigEntry } from "lens";

// Rules and presets
export {
	operationIdUnique,
	pathParamsMatch,
	recommended31,
	defaultPreset,
	sailpointPreset,
	rules,
} from "./rules/presets";
export type { Preset, RuleConfigEntry } from "lens";

// Register all rules and presets at module initialization
import {
	defaultPreset,
	recommended31,
	rules,
	sailpointPreset,
} from "./rules/presets";

// Register all rules
for (const [id, rule] of Object.entries(rules)) {
	ruleRegistry.registerRule(id, rule);
}

// Register all presets
ruleRegistry.registerPreset(defaultPreset.id, defaultPreset);
ruleRegistry.registerPreset(sailpointPreset.id, sailpointPreset);
ruleRegistry.registerPreset(recommended31.id, recommended31);

// Callback schemas
export { CallbackSchema, type Callback } from "./schemas/callback";

// Component schemas
export { ComponentsSchema, type Components } from "./schemas/components";

// Discriminator schemas
export { DiscriminatorSchema, type Discriminator } from "./schemas/discriminator";

// Encoding schemas
export { EncodingSchema, type Encoding } from "./schemas/encoding";

// Example schemas
export { ExampleSchema, type Example } from "./schemas/example";

// Extensions schemas
export { ExtensionsSchema, type Extensions } from "./schemas/extensions";

// External Documentation schemas
export {
	ExternalDocumentationSchema,
	type ExternalDocumentation,
} from "./schemas/externalDocumentation";

// Header schemas
export { HeaderSchema, type Header } from "./schemas/header";

// Info schemas
export {
	InfoSchema,
	ContactSchema,
	LicenseSchema,
	type Info,
	type Contact,
	type License,
} from "./schemas/info";

// Link schemas
export { LinkSchema, type Link } from "./schemas/link";

// MediaType schemas
export { MediaTypeSchema, type MediaType } from "./schemas/mediaType";

// OAuth Flow schemas
export { OAuthFlowSchema, type OAuthFlow } from "./schemas/oauthFlow";

// OAuth Flows schemas
export { OAuthFlowsSchema, type OAuthFlows } from "./schemas/oauthFlows";

// OpenAPI schema
export { OpenAPISchema, type OpenAPI } from "./schemas/openapi";

// Operation schemas
export { OperationSchema, type Operation } from "./schemas/operation";

// Parameter schemas
export { ParameterSchema, type Parameter } from "./schemas/parameter";

// PathItem schemas
export { PathItemSchema, type PathItem } from "./schemas/pathItem";

// Paths schemas
export { PathsSchema, type Paths } from "./schemas/paths";

// Reference schemas
export { ReferenceSchema, type Reference } from "./schemas/reference";

// RequestBody schemas
export { RequestBodySchema, type RequestBody } from "./schemas/requestBody";

// Response schemas
export { ResponseSchema, type Response } from "./schemas/response";

// Responses schemas
export { ResponsesSchema, type Responses } from "./schemas/responses";

// Schema schemas
export { SchemaObjectSchema, type SchemaObject } from "./schemas/schema";

// Security Requirement schemas
export {
	SecurityRequirementSchema,
	type SecurityRequirement,
} from "./schemas/securityRequirement";

// Security Scheme schemas
export {
	SecuritySchemeSchema,
	type SecurityScheme,
} from "./schemas/securityScheme";

// Server schemas
export {
	ServerSchema,
	ServerVariableSchema,
	type Server,
	type ServerVariable,
} from "./schemas/server";

// Tag schemas
export { TagSchema, type Tag } from "./schemas/tag";

// XML schemas
export { XMLSchema, type XML } from "./schemas/xml";
