import {
	defineRule,
	getValueAtPointer,
	joinPointer,
	type Rule,
	splitPointer,
} from "lens";

const operationIdUniqueInPath: Rule = defineRule({
	meta: {
		id: "operation-id-unique-in-path",
		number: 404,
		type: "problem",
		docs: {
			description: "All operations within a path must have unique operationIds",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			PathItem(pathItem) {
				const ownerKey = `${pathItem.uri}#${pathItem.pointer}`;
				const ops = ctx.project.index.operationsByOwner.get(ownerKey) ?? [];
				const operationIdMap = new Map<
					string,
					Array<{ method: string; pointer: string }>
				>();

				for (const op of ops) {
					const doc = ctx.project.docs.get(op.uri);
					if (!doc) continue;
					const operationIdPointer = joinPointer([
						...splitPointer(op.pointer),
						"operationId",
					]);
					const operationId = getValueAtPointer(doc.ast, operationIdPointer);
					if (
						typeof operationId === "string" &&
						operationId.trim().length > 0
					) {
						const bucket = operationIdMap.get(operationId) ?? [];
						bucket.push({
							method: op.method.toUpperCase(),
							pointer: op.pointer,
						});
						operationIdMap.set(operationId, bucket);
					}
				}

				for (const [operationId, occurrences] of operationIdMap.entries()) {
					if (occurrences.length <= 1) continue;

					const methods = occurrences.map((o) => o.method).join(", ");
					for (const occurrence of occurrences) {
						const op = ops.find((o) => o.pointer === occurrence.pointer);
						if (!op) continue;
						const operationIdPointer = joinPointer([
							...splitPointer(op.pointer),
							"operationId",
						]);
						const range =
							ctx.locate(op.uri, operationIdPointer) ??
							ctx.locate(op.uri, op.pointer);
						if (!range) continue;
						ctx.report({
							message: `Duplicate operationId "${operationId}" found. OperationIds must be unique within a path. Used by: ${methods}`,
							severity: "error",
							uri: op.uri,
							range,
						});
					}
				}
			},
		};
	},
});

export default operationIdUniqueInPath;
