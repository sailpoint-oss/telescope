// Example JS rule: check that API responses include rate limit headers.
// Place this file in .telescope/rules/ and the LSP will automatically pick it up.

exports.meta = {
    id: "require-rate-limit",
    description: "Responses should include rate limit headers",
    severity: "warn",
    category: "security",
};

exports.check = function(ctx) {
    ctx.operations(function(path, method, op) {
        var responses = op.responses;
        if (!responses) return;

        var codes = Object.keys(responses);
        for (var i = 0; i < codes.length; i++) {
            var code = codes[i];
            if (code.charAt(0) !== "2") continue;

            var resp = responses[code];
            var headers = resp.headers;
            if (!headers) {
                ctx.report(resp.loc, method + " " + path + " " + code + " should include X-Rate-Limit header");
                continue;
            }

            var headerKeys = Object.keys(headers);
            var hasRateLimit = false;
            for (var j = 0; j < headerKeys.length; j++) {
                if (headerKeys[j].toLowerCase().indexOf("rate-limit") !== -1) {
                    hasRateLimit = true;
                    break;
                }
            }

            if (!hasRateLimit) {
                ctx.report(resp.loc, method + " " + path + " " + code + " should include X-Rate-Limit header");
            }
        }
    });
};
