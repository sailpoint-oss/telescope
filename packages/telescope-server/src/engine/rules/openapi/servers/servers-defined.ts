import { defineRule, type Rule } from "../../api.js";

/**
 * Servers Defined Rule
 *
 * Validates that the API defines at least one server in the servers array.
 * Server URLs are important for API consumers to know where to send requests.
 */
const serversDefined: Rule = defineRule({
	meta: {
		id: "servers-defined",
		number: 102,
		type: "suggestion",
		description: "API should define at least one server",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Root(doc) {
				// Use typed method to check if servers exist
				if (!doc.hasServers()) {
					ctx.reportAt(doc, "servers", {
						message:
							"API should define at least one server URL in the servers array",
						severity: "warning",
					});
					return;
				}

				// Check that at least one server has a valid URL - use typed method
				const servers = doc.servers();
				const hasValidServer = servers.some(
					(server) =>
						typeof server.url === "string" && server.url.trim().length > 0,
				);

				if (!hasValidServer) {
					ctx.reportAt(doc, "servers", {
						message: "At least one server must have a valid URL",
						severity: "warning",
					});
				}
			},
		};
	},
});

export default serversDefined;
