import { defineRule, type Rule } from "engine";
import { joinPointer, splitPointer, getValueAtPointer } from "loader";

const ALLOWED_SECURITY_KEYS = ["userAuth", "applicationAuth"] as const;
type SecurityKey = (typeof ALLOWED_SECURITY_KEYS)[number];
const SCOPE_PATTERN = /^[a-z][a-z0-9-]*:[a-z0-9-]+:[a-z0-9-]+$/;

const operationSecurityRequirements: Rule = defineRule({
	meta: {
		id: "operation-security-requirements",
		number: 104,
		type: "problem",
		docs: {
			description:
				"Operations must declare security requirements using userAuth, applicationAuth, or {} for public access",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
		contextRequirements: {
			requiresRoot: true,
			requiresPaths: true,
		},
	},
	create(ctx) {
		return {
			Operation(op) {
				const doc = ctx.project.docs.get(op.uri);
				if (!doc) return;

				const securityPointer = joinPointer([
					...splitPointer(op.pointer),
					"security",
				]);
				const security = getValueAtPointer(doc.ast, securityPointer);

				if (!Array.isArray(security) || security.length === 0) {
					const range =
						ctx.locate(op.uri, securityPointer) ??
						ctx.locate(op.uri, op.pointer);
					if (!range) return;
					ctx.report({
						message:
							"Operations must declare security requirements using userAuth, applicationAuth, or {} for public access",
						severity: "error",
						uri: op.uri,
						range,
					});
					return;
				}

				security.forEach((scheme, index) => {
					const schemePointer = joinPointer([
						...splitPointer(securityPointer),
						String(index),
					]);
					const range = ctx.locate(op.uri, schemePointer);
					if (!range) return;

					// Allow explicit public entry
					if (
						scheme &&
						typeof scheme === "object" &&
						Object.keys(scheme as Record<string, unknown>).length === 0
					) {
						return;
					}

					if (!scheme || typeof scheme !== "object") {
						ctx.report({
							message:
								"Security entries must be objects with userAuth and/or applicationAuth arrays",
							severity: "error",
							uri: op.uri,
							range,
						});
						return;
					}

					const securityEntry = scheme as Record<string, unknown>;

					const invalidKeys = Object.keys(securityEntry).filter(
						(key) => !ALLOWED_SECURITY_KEYS.includes(key as SecurityKey),
					);
					if (invalidKeys.length > 0) {
						ctx.report({
							message: `Security entries may only use ${ALLOWED_SECURITY_KEYS.join(", ")}. Found: ${invalidKeys.join(", ")}`,
							severity: "error",
							uri: op.uri,
							range,
						});
					}

					for (const key of ALLOWED_SECURITY_KEYS) {
						if (!(key in securityEntry)) continue;
						const keyPointer = joinPointer([
							...splitPointer(schemePointer),
							key,
						]);
						const scopes = securityEntry[key];
						if (!Array.isArray(scopes) || scopes.length === 0) {
							const keyRange = ctx.locate(op.uri, keyPointer) ?? range;
							ctx.report({
								message: `${key} must provide at least one scope`,
								severity: "error",
								uri: op.uri,
								range: keyRange,
							});
							continue;
						}

						for (let scopeIndex = 0; scopeIndex < scopes.length; scopeIndex++) {
							const scope = scopes[scopeIndex];
							if (typeof scope !== "string" || !SCOPE_PATTERN.test(scope)) {
								const scopePointer = joinPointer([
									...splitPointer(keyPointer),
									String(scopeIndex),
								]);
								const scopeRange =
									ctx.locate(op.uri, scopePointer) ??
									ctx.locate(op.uri, keyPointer);
								if (!scopeRange) continue;
								ctx.report({
									message:
										"Scopes must follow the service:resource:action pattern using lowercase letters and hyphens",
									severity: "error",
									uri: op.uri,
									range: scopeRange,
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
