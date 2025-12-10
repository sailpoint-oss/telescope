import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Security Global or Operation Rule
 *
 * Validates that security is defined either at the global level or
 * at the operation level. If there are security schemes defined but
 * no security requirements, this is likely a configuration oversight.
 */
const securityGlobalOrOperation: Rule = defineRule({
	meta: {
		id: "security-global-or-operation",
		number: 604,
		type: "suggestion",
		description:
			"Security must be defined at global or operation level when security schemes exist",
		defaultSeverity: "info",
	},
	state: () => ({
		hasGlobalSecurity: false,
		operationsWithoutSecurity: [] as Array<{
			uri: string;
			pointer: string;
			method: string;
		}>,
		hasSecuritySchemes: false,
		rootUri: "",
	}),
	check(ctx, state) {
		return {
			Root({ uri, node }) {
				const $ = accessor(node);

				// Check if there are security schemes defined
				const components = $.getObject("components");
				if (components) {
					const securitySchemes = (
						components as Record<string, unknown>
					).securitySchemes;
					if (
						securitySchemes &&
						typeof securitySchemes === "object" &&
						Object.keys(securitySchemes as Record<string, unknown>).length > 0
					) {
						state.hasSecuritySchemes = true;
					}
				}

				// Check for global security
				const security = $.getArray("security");
				if (security && security.length > 0) {
					state.hasGlobalSecurity = true;
				}

				state.rootUri = uri;
			},

			Operation(op) {
				const $ = accessor(op.node);

				// Check if operation has its own security requirement
				const security = $.getArray("security");

				// If security is explicitly set to empty array [], it means "no auth required"
				// If security is undefined, it inherits from global
				if (security === undefined && !state.hasGlobalSecurity) {
					state.operationsWithoutSecurity.push({
						uri: op.uri,
						pointer: op.pointer,
						method: op.method,
					});
				}
			},

			Project() {
				// Only report if there are security schemes but operations without security
				if (
					state.hasSecuritySchemes &&
					!state.hasGlobalSecurity &&
					state.operationsWithoutSecurity.length > 0
				) {
					// Report on first few operations without security
					const limit = Math.min(5, state.operationsWithoutSecurity.length);
					for (let i = 0; i < limit; i++) {
						const opInfo = state.operationsWithoutSecurity[i];
						if (!opInfo) continue;
						ctx.reportAt({ uri: opInfo.uri, pointer: opInfo.pointer }, "security", {
							message: `Operation ${opInfo.method.toUpperCase()} has no security requirements. Define security at global or operation level.`,
							severity: "warning",
						});
					}

					// If there are more, report a summary
					if (state.operationsWithoutSecurity.length > limit) {
						const remaining = state.operationsWithoutSecurity.length - limit;
						ctx.report({
							message: `${remaining} more operation(s) without security requirements. Consider adding global security.`,
							uri: state.rootUri,
							range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
							severity: "info",
						});
					}
				}
			},
		};
	},
});

export default securityGlobalOrOperation;
