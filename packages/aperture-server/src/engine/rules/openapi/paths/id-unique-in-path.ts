import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Operation ID Unique In Path Rule
 *
 * Validates that all operations within a single path have unique operationIds.
 */
const operationIdUniqueInPath: Rule = defineRule({
	meta: {
		id: "operation-id-unique-in-path",
		number: 404,
		type: "suggestion",
		description: "All operations within a path must have unique operationIds",
		defaultSeverity: "warning",
	},
	check(ctx) {
		return {
			PathItem(pathItem) {
				const ownerKey = `${pathItem.uri}#${pathItem.pointer}`;
				const ops = ctx.project.index.operationsByOwner.get(ownerKey) ?? [];
				const operationIdMap = new Map<
					string,
					Array<{ method: string; pointer: string }>
				>();

				for (const op of ops) {
					const $ = accessor(op.node);
					const operationId = $.getString("operationId");

					if (operationId?.trim()) {
						const bucket = operationIdMap.get(operationId) ?? [];
						bucket.push({
							method: op.method.toUpperCase(),
							pointer: `${op.pointer}/operationId`,
						});
						operationIdMap.set(operationId, bucket);
					}
				}

				for (const [operationId, occurrences] of operationIdMap.entries()) {
					if (occurrences.length <= 1) continue;

					const methods = occurrences.map((o) => o.method).join(", ");
					for (const occurrence of occurrences) {
						const range =
							ctx.locate(pathItem.uri, occurrence.pointer) ??
							ctx.locate(pathItem.uri, pathItem.pointer);
						if (!range) continue;

						ctx.report({
							message: `Duplicate operationId "${operationId}" found. OperationIds must be unique within a path. Used by: ${methods}`,
							severity: "error",
							uri: pathItem.uri,
							range,
						});
					}
				}
			},
		};
	},
});

export default operationIdUniqueInPath;
