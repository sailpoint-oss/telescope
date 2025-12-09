/**
 * Central export point for all OpenAPI 3.x schema definitions.
 *
 * These schemas are built using TypeBox in a single consolidated module
 * to ensure proper $defs generation and $ref usage (instead of inlining).
 *
 * Supports OpenAPI 3.0, 3.1, and 3.2 specifications.
 */

// Re-export everything from the consolidated OpenAPI module
export {
	// The module itself (for direct access to all schemas)
	OpenAPIModule,
	// Base schemas
	ContactSchema,
	LicenseSchema,
	InfoSchema,
	ServerVariableSchema,
	ServerSchema,
	ExternalDocumentationSchema,
	TagSchema,
	// Reference schemas
	InternalRefSchema,
	UrlRefSchema,
	FileRefSchema,
	ReferenceSchema,
	// Simple schemas
	SecurityRequirementSchema,
	XMLSchema,
	DiscriminatorSchema,
	OAuthFlowSchema,
	OAuthFlowsSchema,
	// Schema object types
	StringSchema,
	NumberSchema,
	IntegerSchema,
	BooleanSchema,
	NullSchema,
	ArraySchema,
	ObjectSchema,
	SchemaObjectSchema,
	// Complex schemas
	ExampleSchema,
	LinkSchema,
	SecuritySchemeSchema,
	HeaderSchema,
	EncodingSchema,
	MediaTypeSchema,
	ParameterSchema,
	RequestBodySchema,
	ResponseSchema,
	ResponsesSchema,
	CallbackSchema,
	OperationSchema,
	PathItemSchema,
	PathsSchema,
	ComponentsSchema,
	OpenAPISchema,
	// TypeScript types
	type Contact,
	type License,
	type Info,
	type ServerVariable,
	type Server,
	type ExternalDocumentation,
	type Tag,
	type InternalRef,
	type UrlRef,
	type FileRef,
	type Reference,
	type SecurityRequirement,
	type XML,
	type Discriminator,
	type OAuthFlow,
	type OAuthFlows,
	type SchemaObject,
	type Example,
	type Link,
	type SecurityScheme,
	type Header,
	type Encoding,
	type MediaType,
	type Parameter,
	type RequestBody,
	type Response,
	type Responses,
	type Callback,
	type Operation,
	type PathItem,
	type Paths,
	type Components,
	type OpenAPI,
} from "./openapi-module";

// Telescope extension configuration schema (separate from OpenAPI schemas)
export {
	type AdditionalValidationGroup,
	AdditionalValidationGroupSchema,
	type OpenAPIRuleConfig,
	OpenAPIRuleConfigSchema,
	type Severity,
	SeveritySchema,
	type TelescopeConfig,
	TelescopeConfigSchema,
} from "./config-schema";

// Extensions schema
export { type Extensions, ExtensionsSchema } from "./extensions";
