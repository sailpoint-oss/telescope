import { findNodeByPointer } from "../../../ir/context.js";
import { accessor, defineRule, type Rule } from "../../api.js";
import { validatePathTemplate } from "./path-template.js";

/**
 * Escape a string for use in a JSON pointer.
 * ~ becomes ~0, / becomes ~1
 */
function escapeJsonPointer(str: string): string {
	return str.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Path Template Valid Rule
 *
 * Validates `paths` object keys against OpenAPI 4.8.2 Path Templating / ABNF.
 *
 * We treat this as a **rule error** (not schema validation) so the engine can
 * still index/operate on documents and emit precise diagnostics.
 */
const pathTemplateValid: Rule = defineRule({
	meta: {
		id: "path-template-valid",
		number: 407,
		type: "problem",
		description: "Paths Object keys must be valid OpenAPI path templates",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Root({ uri, node, pointer }) {
				const $ = accessor(node);
				const paths = $.get("paths");

				// Only run on root documents that have a paths object
				if (!paths || typeof paths !== "object") return;

				const pathsObj = paths as Record<string, unknown>;

				for (const path of Object.keys(pathsObj)) {
					// Skip extension keys
					if (path.startsWith("x-")) continue;
					// Only validate actual path templates
					if (!path.startsWith("/")) continue;

					const res = validatePathTemplate(path);
					if (res.ok) continue;

					const pathPointer = `${pointer}/paths/${escapeJsonPointer(path)}`;
					const doc = ctx.project.docs.get(uri);

					let range =
						ctx.locateKey(uri, pathPointer) ??
						ctx.locate(uri, pathPointer) ??
						ctx.locateFirstChild(uri, "#") ?? {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 0 },
						};

					// Prefer highlighting just the offending portion inside the key.
					if (
						doc?.ir &&
						doc.rawText &&
						typeof res.errorIndex === "number" &&
						res.errorIndex >= 0
					) {
						const irNode = findNodeByPointer(doc.ir, pathPointer);
						const keyStart = irNode?.loc?.keyStart;
						const keyEnd = irNode?.loc?.keyEnd;
						if (
							typeof keyStart === "number" &&
							typeof keyEnd === "number" &&
							keyEnd > keyStart
						) {
							const keyText = doc.rawText.slice(keyStart, keyEnd);
							const pathIndexInKey = keyText.indexOf(path);
							if (pathIndexInKey !== -1) {
								const startOffset =
									keyStart + pathIndexInKey + res.errorIndex;
								const len = Math.max(1, res.errorLength ?? 1);
								const endOffset = startOffset + len;
								range = ctx.offsetToRange(uri, startOffset, endOffset) ?? range;
							}
						}
					}

					ctx.report({
						message: `Invalid path template '${path}': ${res.error}`,
						severity: "error",
						uri,
						range,
					});
				}
			},
		};
	},
});

export default pathTemplateValid;


