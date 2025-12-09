/**
 * Operation ID Unique Rule
 *
 * Ensures that operationId values are unique across the entire workspace.
 * Duplicate operationIds can cause issues with code generators and API
 * documentation tools.
 *
 * This rule uses state to collect all operationIds during traversal,
 * then reports duplicates in the Project visitor after all files are processed.
 */

import { defineRule } from "../../api.js";

/**
 * Location of an operation in the workspace.
 */
interface OperationLocation {
	uri: string;
	pointer: string;
}

/**
 * Rule state for tracking operationId occurrences.
 */
interface OperationIdUniqueState {
	occurrences: Map<string, OperationLocation[]>;
}

const operationIdUnique = defineRule<OperationIdUniqueState>({
	meta: {
		id: "operationid-unique",
		number: 403,
		type: "suggestion",
		description: "operationId must be unique across the workspace",
		defaultSeverity: "warning",
		scope: "cross-file", // Uses Project visitor to check across all files
	},
	state: () => ({
		occurrences: new Map<string, OperationLocation[]>(),
	}),
	check(ctx, state) {
		return {
			Operation(op) {
				// Use enriched accessor method
				const operationId = op.operationId();

				if (!operationId?.trim()) return;

				const pointer = `${op.pointer}/operationId`;
				const bucket = state.occurrences.get(operationId) ?? [];
				bucket.push({ uri: op.uri, pointer });
				state.occurrences.set(operationId, bucket);
			},
			Project() {
				// Report all duplicates after all operations have been collected
				for (const [operationId, locations] of state.occurrences) {
					if (locations.length <= 1) continue;

					for (const location of locations) {
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
