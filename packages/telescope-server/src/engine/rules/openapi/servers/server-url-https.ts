import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Server URL HTTPS Rule
 *
 * Validates that production server URLs use HTTPS.
 * Development/localhost URLs are exempt from this check.
 */
const serverUrlHttps: Rule = defineRule({
	meta: {
		id: "server-url-https",
		number: 103,
		type: "suggestion",
		description: "Production server URLs should use HTTPS",
		defaultSeverity: "warning",
	},
	check(ctx) {
		return {
			Root({ uri, node, pointer }) {
				const $ = accessor(node);

				const servers = $.getArray("servers");
				if (!servers || servers.length === 0) return;

				for (let i = 0; i < servers.length; i++) {
					const server = servers[i];
					if (!server || typeof server !== "object") continue;

					const s = server as Record<string, unknown>;
					const url = s.url;
					if (typeof url !== "string") continue;

					// Skip relative URLs
					if (url.startsWith("/")) continue;

					// Skip localhost and development URLs
					if (isLocalOrDevUrl(url)) continue;

					// Skip URLs with variables (they might resolve to HTTPS)
					if (url.includes("{")) continue;

					// Check for HTTP (non-secure)
					if (url.startsWith("http://")) {
						const serverPointer = `${pointer}/servers/${i}`;
						ctx.reportAt({ uri, pointer: serverPointer }, "url", {
							message: `Server URL '${truncateUrl(url)}' should use HTTPS for production environments`,
							severity: "warning",
						});
					}
				}
			},
		};
	},
});

/**
 * Check if URL is a local or development URL.
 */
function isLocalOrDevUrl(url: string): boolean {
	const lower = url.toLowerCase();
	return (
		lower.includes("localhost") ||
		lower.includes("127.0.0.1") ||
		lower.includes("0.0.0.0") ||
		lower.includes("::1") ||
		lower.includes(".local/") ||
		lower.includes(".local:") ||
		lower.endsWith(".local") ||
		lower.includes(".dev/") ||
		lower.includes(".dev:") ||
		lower.endsWith(".dev") ||
		lower.includes(".test/") ||
		lower.includes(".test:") ||
		lower.endsWith(".test") ||
		lower.includes("://staging.") ||
		lower.includes("://sandbox.") ||
		lower.includes("://dev.")
	);
}

/**
 * Truncate URL for display in error messages.
 */
function truncateUrl(url: string): string {
	if (url.length <= 50) return url;
	return `${url.substring(0, 47)}...`;
}

export default serverUrlHttps;

