/**
 * TypeBox schema for Telescope configuration files.
 * Config file location: .telescope/config.yaml
 */

import { Type, type Static } from "typebox";

/**
 * Severity levels for rule diagnostics.
 * - off: Disable the rule entirely
 * - error: Critical issues that must be fixed
 * - warn: Best practice violations that should be addressed
 * - info: Informational suggestions for improvement
 * - hint: Minor style suggestions
 */
export const SeveritySchema = Type.Union([
	Type.Literal("off"),
	Type.Literal("error"),
	Type.Literal("warn"),
	Type.Literal("info"),
	Type.Literal("hint"),
]);

export type Severity = "off" | "error" | "warn" | "info" | "hint";

// Schema for OpenAPI rule configuration
export const OpenAPIRuleConfigSchema = Type.Object(
	{
		rule: Type.String({
			description:
				"Path to custom OpenAPI rule file. Resolved from .telescope/rules/ or workspace root.",
		}),
		patterns: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"Glob patterns to match files. If omitted, uses OpenAPI.patterns. Use ! prefix to exclude.",
			}),
		),
	},
	{
		additionalProperties: false,
		description:
			"Custom OpenAPI rule. Requires rule (file path). Optional pattern (array of glob patterns). Invalid properties cause errors.",
	},
);

export type OpenAPIRuleConfig = Static<typeof OpenAPIRuleConfigSchema>;

// Schema for AdditionalValidation labeled group
export const AdditionalValidationGroupSchema = Type.Object(
	{
		patterns: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"Glob patterns for files. Use ! prefix to exclude. Default: all YAML/JSON files.",
			}),
		),
		schemas: Type.Optional(
			Type.Array(
				Type.Object(
					{
						schema: Type.String({
							description:
								"Path to schema file. Supports JSON Schema (.json) and Zod Schema (.ts). Resolved from .telescope/schemas/ or workspace root.",
						}),
						patterns: Type.Optional(
							Type.Array(Type.String(), {
								description:
									"Glob patterns for files. If omitted, uses group patterns. Valid properties: schema (required), pattern (optional).",
							}),
						),
					},
					{ additionalProperties: false },
				),
				{
					description:
						"JSON schema validations. Each requires schema (file path) and optionally pattern (array of glob patterns).",
				},
			),
		),
		rules: Type.Optional(
			Type.Array(
				Type.Object(
					{
						rule: Type.String({
							description:
								"Path to custom generic rule file. Resolved from .telescope/rules/ or workspace root.",
						}),
						patterns: Type.Optional(
							Type.Array(Type.String(), {
								description:
									"Glob patterns for files. If omitted, uses group patterns. Valid properties: rule (required), pattern (optional).",
							}),
						),
					},
					{ additionalProperties: false },
				),
				{
					description:
						"Custom generic rules. Each requires rule (file path) and optionally pattern (array of glob patterns).",
				},
			),
		),
	},
	{
		additionalProperties: false,
		description:
			"Additional validation group. Fields: patterns (glob array), schemas (schema array), rules (rule array). All optional.",
	},
);

export type AdditionalValidationGroup = Static<
	typeof AdditionalValidationGroupSchema
>;

// Telescope configuration schema
export const TelescopeConfigSchema = Type.Object(
	{
		openapi: Type.Optional(
			Type.Object(
				{
					patterns: Type.Optional(
						Type.Array(Type.String(), {
							description:
								"Glob patterns for files. Use ! prefix to exclude. Example: **/*.yaml or !**/node_modules/**",
						}),
					),
					sailpoint: Type.Optional(
						Type.Boolean({
							description:
								"Enable SailPoint-specific rules. When true, adds rules for x-sailpoint-api, user levels, security requirements, etc.",
						}),
					),
					rules: Type.Optional(
						Type.Array(OpenAPIRuleConfigSchema, {
							description:
								"Custom OpenAPI rules. Each rule requires rule (path to file) and optionally pattern.",
						}),
					),
					rulesOverrides: Type.Optional(
						Type.Record(Type.String(), SeveritySchema, {
							description:
								"Rule overrides. Map rule IDs to severity (error, warn, info, hint, off).",
						}),
					),
					extensions: Type.Optional(
						Type.Object(
							{
								schemas: Type.Optional(
									Type.Array(Type.String(), {
										description:
											"Custom OpenAPI extension schema files. Paths are resolved from .telescope/extensions/ by default.",
									}),
								),
								required: Type.Optional(
									Type.Array(Type.String(), {
										description:
											"Extension names that are required. Can include both builtin and custom extensions. Example: ['x-company-auth', 'x-speakeasy-entity']",
									}),
								),
							},
							{
								additionalProperties: false,
								description:
									"OpenAPI extension configuration. schemas: custom extension files, required: extension names that must be present.",
							},
						),
					),
				},
				{
					additionalProperties: false,
					description:
						"OpenAPI configuration. All fields are optional.\n\nFields: patterns, sailpoint, rules, rulesOverrides, extensions",
				},
			),
		),
		additionalValidation: Type.Optional(
			Type.Record(Type.String(), AdditionalValidationGroupSchema, {
				description:
					"Additional validation groups (labeled). Each group can have patterns, schemas, and rules.",
			}),
		),
	},
	{
		additionalProperties: false,
		description:
			"Telescope configuration file. Location: .telescope/config.yaml. Top-level keys: OpenAPI, AdditionalValidation. All optional.",
	},
);

export type TelescopeConfig = Static<typeof TelescopeConfigSchema>;
