/// <reference path="./telescope.d.ts" />

// Security schemes must declare a valid type. API key schemes transported
// via query parameters are discouraged because credentials appear in URLs
// and server logs.

const validTypes = ["apiKey", "http", "oauth2", "openIdConnect"];

exports.meta = {
    id: "security-scheme-type",
    description: "Security schemes must use a valid type; apiKey in query is discouraged",
    severity: "warn",
    category: "security",
};

exports.check = (ctx: RuleContext) => {
    ctx.securitySchemes((name: string, scheme: SecurityScheme) => {
        if (validTypes.indexOf(scheme.type) === -1) {
            ctx.report(scheme.loc, `Security scheme "${name}" has invalid type "${scheme.type}"`);
            return;
        }
        if (scheme.type === "apiKey" && scheme.in === "query") {
            ctx.report(
                scheme.loc,
                `Security scheme "${name}" uses apiKey in query; prefer header or cookie`,
            );
        }
    });
};
