import { defineRule, type Rule } from "engine";
import { getValueAtPointer } from "loader";

const parameterExampleKeys: Rule = defineRule({
	meta: {
		id: "parameter-example-keys",
		number: 507,
		type: "problem",
		docs: {
			description:
				"Example keys in parameter examples must be meaningful names between 6 and 20 characters",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		const checkExamples = (
			uri: string,
			examplesPointer: string,
			examples: unknown,
		): void => {
			if (!examples || typeof examples !== "object" || Array.isArray(examples))
				return;

			const examplesObj = examples as Record<string, unknown>;
			for (const [key] of Object.entries(examplesObj)) {
				const examplePointer = `${examplesPointer}/${key}`;
				const range = ctx.locate(uri, examplePointer);
				if (!range) continue;

				if (key.length < 6) {
					ctx.report({
						message: `Example key "${key}" must be at least 6 characters long. Use descriptive names like "default-value" or "custom-input".`,
						severity: "error",
						uri,
						range,
					});
				} else if (key.length > 20) {
					ctx.report({
						message: `Example key "${key}" must be no more than 20 characters long. Use concise but descriptive names.`,
						severity: "error",
						uri,
						range,
					});
				}
			}
		};

		return {
			Parameter(parameterRef) {
				// This visitor runs on ALL parameters (components, path-level, operation-level, fragments)
				const doc = ctx.project.docs.get(parameterRef.uri);
				if (!doc) return;

				const examplesPointer = `${parameterRef.pointer}/examples`;
				const examples = getValueAtPointer(doc.ast, examplesPointer);
				checkExamples(parameterRef.uri, examplesPointer, examples);
			},
		};
	},
});

export default parameterExampleKeys;
