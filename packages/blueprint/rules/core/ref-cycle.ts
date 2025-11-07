import { defineRule, type Rule } from "engine";

const refCycle: Rule = defineRule({
	meta: {
		id: "ref-cycle",
		number: 401,
		type: "problem",
		docs: {
			description: "Report $ref cycles detected in the reference graph",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		const { graph } = ctx.project;
		const cycleKeys = new Set<string>();

		// Pre-compute all cycles in the graph
		for (const edge of graph.edges) {
			if (graph.hasCycle(edge.from))
				cycleKeys.add(`${edge.from.uri}#${edge.from.pointer}`);
			if (graph.hasCycle(edge.to))
				cycleKeys.add(`${edge.to.uri}#${edge.to.pointer}`);
		}

		return {
			Reference(referenceRef) {
				// This visitor runs on ALL $ref nodes throughout the document
				// Check if this reference is part of a cycle
				const key = `${referenceRef.uri}#${referenceRef.pointer}`;
				if (!cycleKeys.has(key)) return;

				const range =
					ctx.locate(referenceRef.uri, referenceRef.refPointer) ??
					ctx.locate(referenceRef.uri, referenceRef.pointer);
				if (!range) return;

				ctx.report({
					severity: "error",
					uri: referenceRef.uri,
					range,
					message: "Reference cycle detected",
				});
			},
		};
	},
});

export default refCycle;
