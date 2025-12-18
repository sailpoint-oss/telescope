import { accessor, defineRule, encodePointerSegment, type Rule } from "../../api.js";

function containsGenericSyntax(value: string): "/" | "?" | "#" | null {
	// Unescaped generic syntax characters per RFC3986 Section 3
	if (value.includes("/")) return "/";
	if (value.includes("?")) return "?";
	if (value.includes("#")) return "#";
	return null;
}

/**
 * Path Param Values No Generic Syntax Rule
 *
 * OpenAPI 4.8.2 requires path parameter values to not contain unescaped
 * RFC3986 "generic syntax" characters: '/', '?', '#'.
 *
 * We can only validate values that appear in the spec as examples/defaults.
 */
const pathParamValuesNoGenericSyntax: Rule = defineRule({
	meta: {
		id: "path-param-values-no-generic-syntax",
		number: 408,
		type: "problem",
		description:
			"Path parameter examples/defaults must not contain unescaped '/', '?', or '#'",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Parameter(param) {
				// Skip $ref parameters; the definition site will be validated separately.
				if (param.isRef()) return;
				if (!param.isPath()) return;

				const name = param.getName() ?? "path parameter";

				const reportValue = (pointer: string, fieldLabel: string, value: string) => {
					const bad = containsGenericSyntax(value);
					if (!bad) return;
					ctx.reportAt({ uri: param.uri, pointer }, fieldLabel, {
						message: `Example/default value for path parameter "${name}" must not contain unescaped '${bad}'. Percent-encode it (e.g. '${bad}' -> '${encodeURIComponent(bad)}').`,
						severity: "error",
					});
				};

				// parameter.example
				const directExample = param.example();
				if (typeof directExample === "string") {
					reportValue(param.pointer, "example", directExample);
				}

				// parameter.examples[*].value
				const examples = param.examples();
				if (examples && typeof examples === "object") {
					for (const [key, exNode] of Object.entries(examples)) {
						const ex$ = accessor(exNode);
						// Skip $ref examples
						if (ex$.has("$ref")) continue;
						const value = ex$.getString("value");
						if (typeof value === "string") {
							const exPtr = `${param.pointer}/examples/${encodePointerSegment(key)}`;
							reportValue(exPtr, "value", value);
						}
					}
				}

				// parameter.schema.example / parameter.schema.default
				const schema = param.schema();
				if (schema && typeof schema === "object" && !Array.isArray(schema)) {
					const schema$ = accessor(schema);
					// Skip $ref schema; definition site can be validated elsewhere if desired.
					if (!schema$.has("$ref")) {
						const schemaExample = schema$.get("example");
						if (typeof schemaExample === "string") {
							reportValue(`${param.pointer}/schema`, "example", schemaExample);
						}
						const schemaDefault = schema$.get("default");
						if (typeof schemaDefault === "string") {
							reportValue(`${param.pointer}/schema`, "default", schemaDefault);
						}
					}
				}

				// parameter.content[*].example (optional)
				const content = param.content();
				if (content && typeof content === "object") {
					for (const [mediaType, mediaNode] of Object.entries(content)) {
						if (!mediaNode || typeof mediaNode !== "object") continue;
						const media$ = accessor(mediaNode);
						const mediaExample = media$.get("example");
						if (typeof mediaExample === "string") {
							const mediaPtr = `${param.pointer}/content/${encodePointerSegment(mediaType)}`;
							reportValue(mediaPtr, "example", mediaExample);
						}
					}
				}
			},
		};
	},
});

export default pathParamValuesNoGenericSyntax;


