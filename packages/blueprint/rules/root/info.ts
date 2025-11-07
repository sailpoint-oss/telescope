import { defineRule, type Rule } from "engine";
import { getValueAtPointer } from "loader";

const rootInfo: Rule = defineRule({
	meta: {
		id: "root-info",
		number: 101,
		type: "problem",
		docs: {
			description:
				"OpenAPI documents must include an info section at root level",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
		contextRequirements: {
			requiresRoot: true,
		},
	},
	create(ctx) {
		return {
			Document({ uri }) {
				const doc = ctx.project.docs.get(uri);
				if (!doc) return;

				const infoPointer = "#/info";
				const info = getValueAtPointer(doc.ast, infoPointer);

				if (!info || typeof info !== "object") {
					const range = ctx.locate(uri, infoPointer) ??
						ctx.locate(uri, "#") ?? {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 0 },
						};
					ctx.report({
						message:
							"OpenAPI documents must include an info section at root level",
						severity: "error",
						uri,
						range,
					});
				}
			},
		};
	},
});

export default rootInfo;
