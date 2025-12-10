import { defineRule, type Rule, type RootRef } from "../../api.js";

/**
 * OAuth Flow URLs Rule
 *
 * Validates that OAuth2 security schemes have valid, non-empty URLs
 * for their authorization flows (authorizationUrl, tokenUrl, refreshUrl).
 */
const oauthFlowUrls: Rule = defineRule({
	meta: {
		id: "oauth-flow-urls",
		number: 602,
		type: "problem",
		description: "OAuth2 flows must have valid, non-empty URLs",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Root(doc: RootRef) {
				doc.eachSecurityScheme((name, schemeNode, schemeRef) => {
					// Only check oauth2 security schemes
					if (schemeRef.type() !== "oauth2") return;

					schemeRef.eachFlow((flowType, flowNode, flowRef) => {
						// Check authorizationUrl for flows that require it
						if (flowRef.requiresAuthorizationUrl()) {
							const authUrl = flowRef.authorizationUrl();
							if (!authUrl || !authUrl.trim()) {
								ctx.reportAt(flowRef, "authorizationUrl", {
									message: `OAuth2 ${flowType} flow must have a valid authorizationUrl`,
									severity: "error",
								});
							} else if (!isValidUrl(authUrl)) {
								ctx.reportAt(flowRef, "authorizationUrl", {
									message: `OAuth2 ${flowType} flow authorizationUrl must be a valid URL`,
									severity: "error",
								});
							}
						}

						// Check tokenUrl for flows that require it
						if (flowRef.requiresTokenUrl()) {
							const tokenUrl = flowRef.tokenUrl();
							if (!tokenUrl || !tokenUrl.trim()) {
								ctx.reportAt(flowRef, "tokenUrl", {
									message: `OAuth2 ${flowType} flow must have a valid tokenUrl`,
									severity: "error",
								});
							} else if (!isValidUrl(tokenUrl)) {
								ctx.reportAt(flowRef, "tokenUrl", {
									message: `OAuth2 ${flowType} flow tokenUrl must be a valid URL`,
									severity: "error",
								});
							}
						}

						// Check refreshUrl if present (optional but should be valid if specified)
						const refreshUrl = flowRef.refreshUrl();
						if (refreshUrl !== undefined && refreshUrl !== "") {
							if (!isValidUrl(refreshUrl)) {
								ctx.reportAt(flowRef, "refreshUrl", {
									message: `OAuth2 ${flowType} flow refreshUrl must be a valid URL`,
									severity: "error",
								});
							}
						}
					});
				});
			},
		};
	},
});

/**
 * Check if a string is a valid URL (http, https, or relative paths).
 */
function isValidUrl(url: string): boolean {
	try {
		// Allow relative URLs
		if (url.startsWith("/")) return true;
		// Check for valid absolute URL
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

export default oauthFlowUrls;
