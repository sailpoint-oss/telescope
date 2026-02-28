// Example JS rule: check that all tags have descriptions.

exports.meta = {
    id: "tag-description-required",
    description: "Tags should have descriptions for documentation",
    severity: "warn",
    category: "documentation",
};

exports.check = function(ctx) {
    ctx.tags(function(tag) {
        if (!tag.description || !tag.description.text || tag.description.text.trim() === "") {
            ctx.report(tag.loc, "Tag '" + tag.name + "' is missing a description");
        }
    });
};
