import { defineRule, type Rule } from "engine";
import { joinPointer, splitPointer, getValueAtPointer } from "loader";

interface OperationLocation {
	uri: string;
	pointer: string;
}

const operationIdUnique: Rule = defineRule({
	meta: {
		id: "operationid-unique",
		number: 403,
		type: "problem",
		docs: {
			description: "operationId must be unique across the workspace",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
		contextRequirements: {
			requiresRoot: true,
			requiresPaths: true,
		},
	},
	create(ctx) {
		const occurrences = new Map<string, OperationLocation[]>();

		for (const ops of ctx.project.index.operationsByOwner.values()) {
			for (const op of ops) {
				const doc = ctx.project.docs.get(op.uri);
				if (!doc) continue;
				const pointer = joinPointer([
					...splitPointer(op.pointer),
					"operationId",
				]);
				const operationId = getValueAtPointer(doc.ast, pointer);
				if (typeof operationId !== "string" || !operationId.trim()) continue;
				const bucket = occurrences.get(operationId) ?? [];
				bucket.push({ uri: op.uri, pointer });
				occurrences.set(operationId, bucket);
			}
		}

		return {
			Document({ uri }) {
				for (const [operationId, locations] of occurrences) {
					if (locations.length <= 1) continue;
					for (const location of locations.filter((loc) => loc.uri === uri)) {
						const range = ctx.locate(location.uri, location.pointer);
						if (!range) continue;
						const related = locations
							.filter((loc) => loc !== location)
							.map((loc) => ({
								uri: loc.uri,
								range: ctx.locate(loc.uri, loc.pointer) ?? range,
								message: "Duplicate operationId",
							}));
						ctx.report({
							message: `Duplicate operationId "${operationId}"`,
							severity: "error",
							uri: location.uri,
							range,
							related,
						});
					}
				}
			},
		};
	},
});

export default operationIdUnique;
