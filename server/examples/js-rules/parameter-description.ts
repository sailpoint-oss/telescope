/// <reference path="./telescope.d.ts" />

// All parameters should have descriptions so consumers know what values
// are expected. This rule checks every parameter across all operations.

exports.meta = {
    id: "parameter-description",
    description: "Parameters should have descriptions",
    severity: "warn",
    category: "documentation",
};

exports.check = (ctx: RuleContext) => {
    ctx.parameters((param: Parameter) => {
        if (!param.description || !param.description.text || param.description.text.trim() === "") {
            ctx.report(param.loc, `Parameter "${param.name}" (in ${param.in}) is missing a description`);
        }
    });
};
