/// <reference path="./telescope.d.ts" />

// Every response should include a description explaining what the status
// code means and what the consumer can expect in the response body.

exports.meta = {
    id: "response-description",
    description: "Responses must have descriptions",
    severity: "warn",
    category: "documentation",
};

exports.check = (ctx: RuleContext) => {
    ctx.responses((code: string, response: Response) => {
        if (!response.description || !response.description.text || response.description.text.trim() === "") {
            ctx.report(response.loc, `Response "${code}" is missing a description`);
        }
    });
};
