// Example TypeScript rule: every operation must have at least one tag.
// Place this file in .telescope/rules/ and the LSP will automatically pick it up.
// TypeScript files are transparently transpiled to JS via esbuild before execution.

interface Loc {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
}

interface Operation {
    operationId: string;
    summary: string;
    tags: string[];
    loc: Loc;
}

interface RuleContext {
    operations(fn: (path: string, method: string, op: Operation) => void): void;
    report(loc: Loc, message: string): void;
}

exports.meta = {
    id: "require-operation-tags",
    description: "Every operation must have at least one tag",
    severity: "warn",
    category: "documentation",
};

exports.check = (ctx: RuleContext) => {
    ctx.operations((path: string, method: string, op: Operation) => {
        if (!op.tags || op.tags.length === 0) {
            ctx.report(op.loc, `${method.toUpperCase()} ${path} is missing tags`);
        }
    });
};
