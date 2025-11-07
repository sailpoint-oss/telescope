import { defineRule, type Rule } from "engine";

// biome-ignore lint: This regex intentionally matches non-ASCII characters
const ASCII_ONLY_REGEX = /[^\x00-\x7F]/g;

const documentAscii: Rule = defineRule({
	meta: {
		id: "document-ascii",
		number: 401,
		type: "problem",
		docs: {
			description:
				"Only ASCII characters are allowed in OpenAPI specification files",
			recommended: true,
			url: "https://sailpoint-oss.github.io/sailpoint-api-guidelines/#401",
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		const ruleUrl = documentAscii.meta.docs.url;
		return {
			Document({ uri }) {
				const doc = ctx.project.docs.get(uri);
				if (!doc || !doc.rawText) return;

				const rawContent = doc.rawText;
				ASCII_ONLY_REGEX.lastIndex = 0;
				let match = ASCII_ONLY_REGEX.exec(rawContent);
				while (match !== null) {
					const badIndex = match.index;
					const badChar = match[0];
					if (!badChar) {
						match = ASCII_ONLY_REGEX.exec(rawContent);
						continue;
					}

					// Use framework helper to convert byte offset to range
					const range = ctx.offsetToRange(uri, badIndex, badIndex + 1);
					if (!range) {
						match = ASCII_ONLY_REGEX.exec(rawContent);
						continue;
					}

					ctx.report({
						message:
							"Only ASCII characters are allowed in OpenAPI specification files",
						severity: "error",
						uri,
						range,
						link: ruleUrl,
					});

					match = ASCII_ONLY_REGEX.exec(rawContent);
				}
			},
		};
	},
});

export default documentAscii;
