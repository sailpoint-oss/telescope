import { defineRule, type Rule } from "engine";
import { joinPointer, splitPointer, getValueAtPointer } from "loader";

const operationBasicFields: Rule = defineRule({
	meta: {
		id: "operation-basic-fields",
		number: 400,
		type: "problem",
		docs: {
			description: "Operations must include meaningful descriptions",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Operation(op) {
				const doc = ctx.project.docs.get(op.uri);
				if (!doc) return;

				const descriptionPointer = joinPointer([
					...splitPointer(op.pointer),
					"description",
				]);
				const description = getValueAtPointer(doc.ast, descriptionPointer);

				if (
					!description ||
					typeof description !== "string" ||
					description.trim().length === 0
				) {
					const range =
						ctx.locate(op.uri, descriptionPointer) ??
						ctx.locate(op.uri, op.pointer);
					if (!range) return;
          ctx.report({
            message: "Operations must include a descriptive explanation",
            severity: "error",
            uri: op.uri,
            range,
          });
					return;
				}

				const normalized = description.trim();
				if (normalized.length < 25) {
					const range = ctx.locate(op.uri, descriptionPointer);
					if (!range) return;
          ctx.report({
            message:
              "Operation descriptions should be detailed and exceed 25 characters",
            severity: "warning",
            uri: op.uri,
            range,
          });
				}
			},
		};
	},
});

export default operationBasicFields;
