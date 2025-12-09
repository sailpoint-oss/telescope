import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Standard JSON Schema and OpenAPI formats.
 */
const STANDARD_FORMATS = new Set([
	// String formats (JSON Schema)
	"date-time",
	"date",
	"time",
	"duration",
	"email",
	"idn-email",
	"hostname",
	"idn-hostname",
	"ipv4",
	"ipv6",
	"uri",
	"uri-reference",
	"iri",
	"iri-reference",
	"uuid",
	"uri-template",
	"json-pointer",
	"relative-json-pointer",
	"regex",
	// OpenAPI-specific formats
	"int32",
	"int64",
	"float",
	"double",
	"byte",
	"binary",
	"password",
	// Common extensions
	"decimal",
	"currency",
	"url",
	"phone",
]);

/**
 * No Unknown Formats Rule
 *
 * Warns when schemas use non-standard format values.
 * Non-standard formats may not be understood by all tools.
 */
const noUnknownFormats: Rule = defineRule({
	meta: {
		id: "no-unknown-formats",
		number: 309,
		type: "suggestion",
		description: "Only use standard JSON Schema formats",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Schema(schemaRef) {
				const $ = accessor(schemaRef.node);

				// Skip $ref schemas
				if ($.has("$ref")) return;

				const format = $.getString("format");
				if (!format) return;

				if (!STANDARD_FORMATS.has(format)) {
					ctx.reportAt(schemaRef, "format", {
						message: `Non-standard format '${format}'. Consider using a standard format or documenting custom formats.`,
						severity: "info",
					});
				}
			},
		};
	},
});

export default noUnknownFormats;

