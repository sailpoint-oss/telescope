/// <reference path="./telescope.d.ts" />

// Server URLs should use HTTPS to ensure transport-level security.
// HTTP URLs may be acceptable for local development but not production.

exports.meta = {
    id: "server-url-https",
    description: "Server URLs should use HTTPS",
    severity: "warn",
    category: "security",
};

exports.check = (ctx: RuleContext) => {
    ctx.servers((server: Server) => {
        if (server.url.startsWith("http://")) {
            ctx.report(server.loc, `Server URL "${server.url}" uses HTTP; consider HTTPS`);
        }
    });
};
