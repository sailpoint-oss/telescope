import { defineRule, type Rule } from "../../api.js";

/**
 * Tag Hierarchy Rule
 *
 * Validates proper usage of tag hierarchy features in OpenAPI 3.2+:
 * - parent: References to parent tags should exist
 * - kind: Must be one of "nav", "badge", or "audience"
 *
 * This rule demonstrates version-aware validation using:
 * - `ctx.isVersion()` for version-specific logic
 * - `TagRef.parent()`, `TagRef.kind()`, `TagRef.summary()` typed accessors
 * - `RootRef.eachTag()` for iterating over tags with typed refs
 */
const tagHierarchy: Rule = defineRule({
	meta: {
		id: "tag-hierarchy",
		number: 601,
		type: "problem",
		description:
			"Validates proper usage of tag hierarchy features (OpenAPI 3.2+)",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Root(doc) {
				// Collect all tag names for parent validation
				const tagNames = new Set<string>();
				const tagsWithParents: Array<{
					name: string;
					parent: string;
					pointer: string;
					uri: string;
				}> = [];

				// First pass: collect tag names and parent references
				doc.eachTag((tag, ref) => {
					const name = ref.name();
					tagNames.add(name);

					const parent = ref.parent();
					const kind = ref.kind();

					// Only validate 3.2+ features if we're on 3.2
					if (ctx.isVersion("3.2")) {
						// Validate kind if present
						if (kind !== undefined) {
							const validKinds = ["nav", "badge", "audience"];
							if (!validKinds.includes(kind)) {
								ctx.reportAt(ref, "kind", {
									message: `Invalid tag kind "${kind}". Must be one of: ${validKinds.join(", ")}`,
									severity: "error",
								});
							}
						}

						// Collect parent references for validation after all tags are collected
						if (parent) {
							tagsWithParents.push({
								name,
								parent,
								pointer: ref.pointer,
								uri: ref.uri,
							});
						}
					} else if (parent !== undefined || kind !== undefined) {
						// Warn about 3.2 features used in earlier versions
						if (parent !== undefined) {
							ctx.reportAt(ref, "parent", {
								message:
									"Tag parent property is only supported in OpenAPI 3.2+",
								severity: "warning",
							});
						}
						if (kind !== undefined) {
							ctx.reportAt(ref, "kind", {
								message: "Tag kind property is only supported in OpenAPI 3.2+",
								severity: "warning",
							});
						}
					}
				});

				// Second pass: validate parent references exist
				if (ctx.isVersion("3.2")) {
					for (const { name, parent, pointer, uri } of tagsWithParents) {
						if (!tagNames.has(parent)) {
							ctx.report({
								message: `Tag "${name}" references non-existent parent tag "${parent}"`,
								uri,
								range: ctx.locate(uri, `${pointer}/parent`) ?? {
									start: { line: 0, character: 0 },
									end: { line: 0, character: 0 },
								},
								severity: "error",
							});
						}

						// Check for circular parent references
						if (parent === name) {
							ctx.report({
								message: `Tag "${name}" cannot be its own parent`,
								uri,
								range: ctx.locate(uri, `${pointer}/parent`) ?? {
									start: { line: 0, character: 0 },
									end: { line: 0, character: 0 },
								},
								severity: "error",
							});
						}
					}
				}
			},
		};
	},
});

export default tagHierarchy;

