import { accessor, defineRule, type Rule } from "../../api.js";

const ALLOWED_SECURITY_KEYS = ["userAuth", "applicationAuth"] as const;
type SecurityKey = (typeof ALLOWED_SECURITY_KEYS)[number];
const SCOPE_PATTERN = /^[a-z][a-z0-9-]*:[a-z0-9-]+:[a-z0-9-]+$/;

/**
 * SailPoint Security Requirements Rule
 *
 * Validates that operations declare security requirements using
 * userAuth, applicationAuth, or {} for public access.
 */
const operationSecurityRequirements: Rule = defineRule({
	meta: {
		id: "operation-security-requirements",
		number: 104,
		type: "problem",
		description:
			"Operations must declare security requirements using userAuth, applicationAuth, or {} for public access",
	},
	check(ctx) {
		return {
			Operation(op) {
				const $ = accessor(op.node);
				const security = $.getArray<unknown>("security");

				if (!security || security.length === 0) {
					ctx.reportAt(op, "security", {
						message:
							"Operations must declare security requirements using userAuth, applicationAuth, or {} for public access",
						severity: "error",
					});
					return;
				}

				security.forEach((scheme, index) => {
					const schemeRef = {
						uri: op.uri,
						pointer: `${op.pointer}/security/${index}`,
						node: scheme,
					};

					// Allow explicit public entry (empty object)
					if (
						scheme &&
						typeof scheme === "object" &&
						Object.keys(scheme as Record<string, unknown>).length === 0
					) {
						return;
					}

					if (!scheme || typeof scheme !== "object") {
						ctx.reportHere(schemeRef, {
							message:
								"Security entries must be objects with userAuth and/or applicationAuth arrays",
							severity: "error",
						});
						return;
					}

					const securityEntry = scheme as Record<string, unknown>;

					const invalidKeys = Object.keys(securityEntry).filter(
						(key) => !ALLOWED_SECURITY_KEYS.includes(key as SecurityKey),
					);
					if (invalidKeys.length > 0) {
						ctx.reportHere(schemeRef, {
							message: `Security entries may only use ${ALLOWED_SECURITY_KEYS.join(", ")}. Found: ${invalidKeys.join(", ")}`,
							severity: "error",
						});
					}

					for (const key of ALLOWED_SECURITY_KEYS) {
						if (!(key in securityEntry)) continue;

						const scopes = securityEntry[key];
						if (!Array.isArray(scopes) || scopes.length === 0) {
							ctx.reportAt(schemeRef, key, {
								message: `${key} must provide at least one scope`,
								severity: "error",
							});
							continue;
						}

						for (let scopeIndex = 0; scopeIndex < scopes.length; scopeIndex++) {
							const scope = scopes[scopeIndex];
							if (typeof scope !== "string" || !SCOPE_PATTERN.test(scope)) {
								ctx.reportAt(schemeRef, [key, String(scopeIndex)], {
									message:
										"Scopes must follow the service:resource:action pattern using lowercase letters and hyphens",
									severity: "error",
								});
							}
						}
					}
				});
			},
		};
	},
});

export default operationSecurityRequirements;
