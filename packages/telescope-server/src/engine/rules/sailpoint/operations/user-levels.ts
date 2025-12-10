import { accessor, defineRule, type Rule } from "../../api.js";

const USER_LEVEL_PATTERN = /^[A-Z]+(_[A-Z]+)*$/;

/**
 * SailPoint User Levels Rule
 *
 * Validates that operations document minimum SailPoint user levels
 * using the x-sailpoint-userLevels extension.
 */
const operationUserLevels: Rule = defineRule({
	meta: {
		id: "operation-user-levels",
		number: 321,
		type: "problem",
		description:
			"Operations must document minimum SailPoint user levels using x-sailpoint-userLevels extension",
	},
	check(ctx) {
		return {
			Operation(op) {
				const $ = accessor(op.node);
				const userLevels = $.getArray<unknown>("x-sailpoint-userLevels");

				if (!userLevels || userLevels.length === 0) {
					ctx.reportAt(op, "x-sailpoint-userLevels", {
						message:
							"Operations must declare x-sailpoint-userLevels with at least one entry",
						severity: "error",
					});
					return;
				}

				userLevels.forEach((level, index) => {
					const levelRef = {
						uri: op.uri,
						pointer: `${op.pointer}/x-sailpoint-userLevels/${index}`,
						node: level,
					};

					if (typeof level !== "string" || level.trim().length === 0) {
						ctx.reportHere(levelRef, {
							message: "User levels must be non-empty strings",
							severity: "error",
						});
						return;
					}

					const normalized = level.trim();
					if (!USER_LEVEL_PATTERN.test(normalized)) {
						ctx.reportHere(levelRef, {
							message:
								"User levels must be uppercase with underscores (e.g. ORG_ADMIN)",
							severity: "error",
						});
					}
				});
			},
		};
	},
});

export default operationUserLevels;
