import { defineRule, type Rule } from "lens";

const unresolvedRef: Rule = defineRule({
	meta: {
		id: "unresolved-ref",
		number: 402,
		type: "problem",
		docs: {
			description: "Report $ref entries that cannot be resolved",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Reference(referenceRef) {
				// This visitor runs on ALL $ref nodes throughout the document
				try {
					const resolved = ctx.project.resolver.deref<unknown>(
						{ uri: referenceRef.uri, pointer: referenceRef.pointer },
						referenceRef.ref,
					);
					if (resolved === undefined || resolved === null) {
						const range =
							ctx.locate(referenceRef.uri, referenceRef.refPointer) ??
							ctx.locate(referenceRef.uri, referenceRef.pointer);
						if (!range) return;
						ctx.report({
							severity: "error",
							uri: referenceRef.uri,
							range,
							message: `Unresolved $ref: ${referenceRef.ref}`,
						});
					}
				} catch (_e) {
					const range =
						ctx.locate(referenceRef.uri, referenceRef.refPointer) ??
						ctx.locate(referenceRef.uri, referenceRef.pointer);
					if (!range) return;
					ctx.report({
						severity: "error",
						uri: referenceRef.uri,
						range,
						message: `Unresolved $ref: ${referenceRef.ref}`,
					});
				}
			},
		};
	},
});

export default unresolvedRef;
