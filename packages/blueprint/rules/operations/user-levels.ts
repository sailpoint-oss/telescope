import { defineRule, type Rule } from "engine";
import { joinPointer, splitPointer, getValueAtPointer } from "loader";

const USER_LEVEL_PATTERN = /^[A-Z]+(_[A-Z]+)*$/;

const operationUserLevels: Rule = defineRule({
	meta: {
		id: "operation-user-levels",
		number: 321,
		type: "problem",
		docs: {
			description:
				"Operations must document minimum SailPoint user levels using x-sailpoint-userLevels extension",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Operation(op) {
				const doc = ctx.project.docs.get(op.uri);
				if (!doc) return;

				const userLevelsPointer = joinPointer([
					...splitPointer(op.pointer),
					"x-sailpoint-userLevels",
				]);
				const rawUserLevels = getValueAtPointer(doc.ast, userLevelsPointer);
				const userLevels = Array.isArray(rawUserLevels)
					? rawUserLevels
					: undefined;

				if (!userLevels || userLevels.length === 0) {
					const range =
						ctx.locate(op.uri, userLevelsPointer) ??
						ctx.locate(op.uri, op.pointer);
					if (!range) return;
					ctx.report({
						message:
							"Operations must declare x-sailpoint-userLevels with at least one entry",
						severity: "error",
						uri: op.uri,
						range,
					});
					return;
				}

				userLevels.forEach((level, index) => {
					const levelPointer = joinPointer([
						...splitPointer(userLevelsPointer),
						String(index),
					]);
					const range = ctx.locate(op.uri, levelPointer);
					if (!range) return;

					if (typeof level !== "string" || level.trim().length === 0) {
						ctx.report({
							message: "User levels must be non-empty strings",
							severity: "error",
							uri: op.uri,
							range,
						});
						return;
					}

					const normalized = level.trim();
					if (!USER_LEVEL_PATTERN.test(normalized)) {
						ctx.report({
							message:
								"User levels must be uppercase with underscores (e.g. ORG_ADMIN)",
							severity: "error",
							uri: op.uri,
							range,
						});
					}
				});
			},
		};
	},
});

export default operationUserLevels;
