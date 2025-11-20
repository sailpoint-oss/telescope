/**
 * Zod schema for Telescope configuration files.
 * Config file location: .telescope/config.yaml
 */

import { z } from "zod";

const SeveritySchema = z.enum(["off", "warn", "error"]);

const RuleSettingSchema = z
	.object({
		severity: SeveritySchema,
		options: z.unknown().optional(),
	})
	.describe(
		"Rule setting with severity and optional options.\n\nFields:\n- severity: Severity level (off, warn, or error)\n- options: Optional rule-specific configuration object",
	);

const RuleConfigEntrySchema = z
	.union([SeveritySchema, RuleSettingSchema])
	.describe(
		"Rule configuration entry.\n\nCan be:\n- A severity string: 'off', 'warn', or 'error'\n- A rule setting object with severity and optional options\n\nExample:\n  operation-id-unique: error\n  # or\n  path-params-match:\n    severity: warn\n    options: {}",
	);

// Schema for OpenAPI rule configuration
const OpenApiRuleConfigSchema = z
	.object({
		rule: z
			.string()
			.describe(
				"Path to custom OpenAPI rule file. Resolved from .telescope/rules/ or workspace root.",
			),
		patterns: z
			.array(z.string())
			.optional()
			.describe(
				"Glob patterns to match files. If omitted, uses OpenAPI.patterns. Use ! prefix to exclude.",
			),
	})
	.strict()
	.describe(
		"Custom OpenAPI rule. Requires rule (file path). Optional pattern (array of glob patterns). Invalid properties cause errors.",
	);

// Schema for AdditionalValidation labeled group
const AdditionalValidationGroupSchema = z
	.object({
		patterns: z
			.array(z.string())
			.optional()
			.describe(
				"Glob patterns for files. Use ! prefix to exclude. Default: all YAML/JSON files.",
			),
		schemas: z
			.array(
				z
					.object({
						schema: z
							.string()
							.describe(
								"Path to schema file. Supports JSON Schema (.json) and Zod Schema (.ts). Resolved from .telescope/schemas/ or workspace root.",
							),
						pattern: z
							.array(z.string())
							.optional()
							.describe(
								"Glob patterns for files. If omitted, uses group patterns. Valid properties: schema (required), pattern (optional).",
							),
					})
					.strict(),
			)
			.optional()
			.describe(
				"JSON schema validations. Each requires schema (file path) and optionally pattern (array of glob patterns).",
			),
		rules: z
			.array(
				z
					.object({
						rule: z
							.string()
							.describe(
								"Path to custom generic rule file. Resolved from .telescope/rules/ or workspace root.",
							),
						pattern: z
							.array(z.string())
							.optional()
							.describe(
								"Glob patterns for files. If omitted, uses group patterns. Valid properties: rule (required), pattern (optional).",
							),
					})
					.strict(),
			)
			.optional()
			.describe(
				"Custom generic rules. Each requires rule (file path) and optionally pattern (array of glob patterns).",
			),
	})
	.strict()
	.describe(
		"Additional validation group. Fields: patterns (glob array), schemas (schema array), rules (rule array). All optional.",
	);

// Telescope configuration schema
export const TelescopeConfigSchema = z
	.object({
		OpenAPI: z
			.object({
				base: z
					.array(z.string())
					.optional()
					.describe(
						"Preset IDs to extend. Example: @telescope-openapi/default",
					),
				patterns: z
					.array(z.string())
					.optional()
					.describe(
						"Glob patterns for files. Use ! prefix to exclude. Example: **/*.yaml or !**/node_modules/**",
					),
				rules: z
					.array(OpenApiRuleConfigSchema)
					.optional()
					.describe(
						"Custom OpenAPI rules. Each rule requires rule (path to file) and optionally pattern.",
					),
				rulesOverrides: z
					.record(z.string(), RuleConfigEntrySchema)
					.optional()
					.describe(
						"Rule overrides. Map rule IDs to severity (error, warn, off) or settings object.",
					),
				overrides: z
					.array(
						z
							.object({
								files: z
									.array(z.string())
									.describe(
										"File paths or patterns to apply overrides to. Example: api/v1/** or legacy.yaml",
									),
								rules: z
									.record(z.string(), RuleConfigEntrySchema)
									.describe(
										"Rule overrides for the specified files. Map rule IDs to severity or settings.",
									),
							})
							.strict(),
					)
					.optional()
					.describe(
						"File-specific rule overrides. Requires files (array) and rules (object).",
					),
				versionOverride: z
					.string()
					.regex(/^3\.(0|1|2)$/, {
						message: "versionOverride must be one of: '3.0', '3.1', or '3.2'",
					})
					.optional()
					.describe(
						"Override OpenAPI version. Valid values: 3.0, 3.1, 3.2. Default: auto-detect.",
					),
			})
			.strict()
			.optional()
			.describe(
				"OpenAPI configuration. All fields are optional.\n\nFields: base, patterns, rules, rulesOverrides, overrides, versionOverride",
			),
		AdditionalValidation: z
			.record(z.string(), AdditionalValidationGroupSchema)
			.optional()
			.describe(
				"Additional validation groups (labeled). Each group can have patterns, schemas, and rules.",
			),
	})
	.strict()
	.describe(
		"Telescope configuration file. Location: .telescope/config.yaml. Top-level keys: OpenAPI, AdditionalValidation. All optional.",
	);
