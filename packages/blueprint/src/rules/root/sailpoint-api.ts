import { defineRule, getValueAtPointer, type Rule } from "lens";

const rootSailpointApi: Rule = defineRule({
	meta: {
		id: "root-sailpoint-api",
		number: 219,
		type: "problem",
		docs: {
			description:
				"x-sailpoint-api extension is required at root level and must contain version and audience fields",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
		contextRequirements: {
			requiresRoot: true,
		},
	},
	create(ctx) {
		return {
			Document({ uri }) {
				const doc = ctx.project.docs.get(uri);
				if (!doc) return;

				const sailpointApiPointer = "#/x-sailpoint-api";
				const sailpointApi = getValueAtPointer(doc.ast, sailpointApiPointer);
				if (!sailpointApi || typeof sailpointApi !== "object") {
					const range = ctx.locate(uri, sailpointApiPointer) ??
						ctx.locate(uri, "#") ?? {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 0 },
						};
					ctx.report({
						message: "x-sailpoint-api extension is required at root level",
						severity: "error",
						uri,
						range,
					});
					return;
				}

				const versionPointer = "#/x-sailpoint-api/version";
				const version = getValueAtPointer(doc.ast, versionPointer);
				if (!version || typeof version !== "string" || version.trim() === "") {
					const range =
						ctx.locate(uri, versionPointer) ??
						ctx.locate(uri, sailpointApiPointer);
					if (!range) return;
					ctx.report({
						message: "x-sailpoint-api.version is required",
						severity: "error",
						uri,
						range,
					});
				}

				const audiencePointer = "#/x-sailpoint-api/audience";
				const audience = getValueAtPointer(doc.ast, audiencePointer);
				const validAudiences = ["external-public", "internal-private"];
				if (
					!audience ||
					typeof audience !== "string" ||
					audience.trim() === ""
				) {
					const range =
						ctx.locate(uri, audiencePointer) ??
						ctx.locate(uri, sailpointApiPointer);
					if (!range) return;
					ctx.report({
						message: "x-sailpoint-api.audience is required",
						severity: "error",
						uri,
						range,
					});
				} else if (!validAudiences.includes(audience.trim())) {
					const range =
						ctx.locate(uri, audiencePointer) ??
						ctx.locate(uri, sailpointApiPointer);
					if (!range) return;
					ctx.report({
						message:
							'x-sailpoint-api.audience must be either "external-public" or "internal-private"',
						severity: "error",
						uri,
						range,
					});
				}
			},
		};
	},
});

export default rootSailpointApi;
