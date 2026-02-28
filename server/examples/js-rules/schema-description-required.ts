/// <reference path="./telescope.d.ts" />

// Every component schema should include a description for API documentation
// generators and consumer understanding.

exports.meta = {
    id: "schema-description-required",
    description: "Component schemas should have descriptions",
    severity: "warn",
    category: "documentation",
};

exports.check = (ctx: RuleContext) => {
    ctx.schemas((name: string, schema: Schema, _pointer: string) => {
        if (!schema.description || !schema.description.text || schema.description.text.trim() === "") {
            ctx.report(schema.loc, `Schema "${name}" is missing a description`);
        }
    });
};
