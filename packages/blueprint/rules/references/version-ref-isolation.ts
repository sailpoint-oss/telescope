import { defineRule, type Rule } from "engine";

const documentVersionRefIsolation: Rule = defineRule({
	meta: {
		id: "document-version-ref-isolation",
		number: 405,
		type: "problem",
		docs: {
			description: "External $ref must include current version segment",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Reference(referenceRef) {
				// This visitor runs on ALL $ref nodes throughout the document
				const versionSegment = `/${ctx.project.version}/`;

				// Skip internal refs (same-document references)
				if (referenceRef.ref.startsWith("#/")) return;

				const normalized = referenceRef.ref.replace(/\\/g, "/");
				if (normalized.includes(versionSegment)) return;

				const range =
					ctx.locate(referenceRef.uri, referenceRef.refPointer) ??
					ctx.locate(referenceRef.uri, referenceRef.pointer);
				if (!range) return;

				ctx.report({
					message: `Reference '${referenceRef.ref}' must stay within version ${ctx.project.version}`,
					severity: "error",
					uri: referenceRef.uri,
					range,
				});
			},
		};
	},
});

export default documentVersionRefIsolation;
