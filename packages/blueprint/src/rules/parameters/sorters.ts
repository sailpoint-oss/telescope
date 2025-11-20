import { defineRule, getValueAtPointer, type Rule } from "lens";

const SORTING_DOC_LINK = "standard-collection-parameters#sorting-results";

const parameterSorters: Rule = defineRule({
	meta: {
		id: "parameter-sorters",
		number: 325,
		type: "problem",
		docs: {
			description:
				"sorters query parameter must follow standard collection parameter format",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		const checkSorters = (
			uri: string,
			paramPointer: string,
			param: unknown,
		): void => {
			if (!param || typeof param !== "object" || "$ref" in param) return;

			const paramObj = param as Record<string, unknown>;
			if (paramObj.in !== "query" || paramObj.name !== "sorters") return;

			const descriptionPointer = `${paramPointer}/description`;
			const description = getValueAtPointer(
				ctx.project.docs.get(uri)?.ast,
				descriptionPointer,
			);

			if (
				!description ||
				typeof description !== "string" ||
				description.trim().length === 0
			) {
				const range =
					ctx.locate(uri, descriptionPointer) ?? ctx.locate(uri, paramPointer);
				if (!range) return;
				ctx.report({
					message:
						"`sorters` must describe the standard collection parameter syntax",
					severity: "error",
					uri,
					range,
				});
				return;
			}

			const normalized = description.toLowerCase();
			if (!normalized.includes(SORTING_DOC_LINK)) {
				const range = ctx.locate(uri, descriptionPointer);
				if (!range) return;
				ctx.report({
					message:
						"`sorters` description must reference the V3 API Standard Collection Parameters sorting documentation",
					severity: "error",
					uri,
					range,
				});
			}
		};

		return {
			Parameter(parameterRef) {
				// This visitor runs on ALL parameters (components, path-level, operation-level, fragments)
				const doc = ctx.project.docs.get(parameterRef.uri);
				if (!doc) return;

				const param = getValueAtPointer(doc.ast, parameterRef.pointer);
				checkSorters(parameterRef.uri, parameterRef.pointer, param);
			},
		};
	},
});

export default parameterSorters;
