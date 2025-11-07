import {
	defineRule,
	type Rule,
	type FilePatch,
	type RuleContext,
} from "engine";
import type { OperationRef } from "indexer";
import { joinPointer, splitPointer, getValueAtPointer } from "loader";

const TEMPLATE_PARAM_REGEX = /\{([^}]+)\}/g;

function extractTemplateParams(paths: string[]): Set<string> {
	const names = new Set<string>();
	for (const path of paths) {
		let match: RegExpExecArray | null;
		while ((match = TEMPLATE_PARAM_REGEX.exec(path))) {
			if (match[1]) {
				names.add(match[1]);
			}
		}
	}
	return names;
}

function collectDeclaredPathParams(op: OperationRef, ctx: RuleContext) {
	const params: Array<{ name?: string; in?: string }> = [];
	const doc = ctx.project.docs.get(op.uri);
	if (!doc) return params;

	const pathItemPointer = joinPointer(splitPointer(op.pointer).slice(0, -1));

	const considerPointer = (pointer: string) => {
		const value = getValueAtPointer(doc.ast, pointer) as
			| Record<string, unknown>
			| undefined;
		if (!value) return;
		if (typeof value === "object" && typeof value["$ref"] === "string") {
			try {
				const resolved = ctx.project.resolver.deref<{
					name?: string;
					in?: string;
				}>({ uri: op.uri, pointer }, value["$ref"] as string);
				params.push({ name: resolved?.name, in: resolved?.in });
			} catch {
				// Resolution errors are reported elsewhere
			}
		} else {
			params.push({
				name: value?.name as string | undefined,
				in: value?.in as string | undefined,
			});
		}
	};

	const pathParamsPointer = joinPointer([
		...splitPointer(pathItemPointer),
		"parameters",
	]);
	const pathParams = getValueAtPointer(doc.ast, pathParamsPointer);
	if (Array.isArray(pathParams)) {
		pathParams.forEach((_, index) => {
			considerPointer(
				joinPointer([...splitPointer(pathParamsPointer), String(index)]),
			);
		});
	}

	const opParamsPointer = joinPointer([
		...splitPointer(op.pointer),
		"parameters",
	]);
	const opParams = getValueAtPointer(doc.ast, opParamsPointer);
	if (Array.isArray(opParams)) {
		opParams.forEach((_, index) => {
			considerPointer(
				joinPointer([...splitPointer(opParamsPointer), String(index)]),
			);
		});
	}

	return params;
}

function addMissingParamPatch(
	ctx: RuleContext,
	op: OperationRef,
	name: string,
): FilePatch {
	const doc = ctx.project.docs.get(op.uri);
	const parametersPointer = joinPointer([
		...splitPointer(op.pointer),
		"parameters",
	]);
	const hasParametersArray = Array.isArray(
		getValueAtPointer(doc?.ast, parametersPointer),
	);
	const ops: FilePatch["ops"] = [];
	if (!hasParametersArray) {
		ops.push({
			op: "add",
			path: `${op.pointer}/parameters`,
			value: [],
		});
	}
	ops.push({
		op: "add",
		path: `${parametersPointer}/-`,
		value: {
			name,
			in: "path",
			required: true,
			schema: { type: "string" },
		},
	});
	return { uri: op.uri, ops };
}

const pathParamsMatch: Rule = defineRule({
	meta: {
		id: "path-params-match",
		number: 406,
		type: "problem",
		fixable: true,
		docs: {
			description:
				"Ensure path template params are declared as in:'path' parameters",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
		contextRequirements: {
			requiresRoot: true,
			requiresPaths: true,
		},
	},
	create(ctx) {
		return {
			PathItem(pathItem) {
				const ownerKey = `${pathItem.uri}#${pathItem.pointer}`;
				const ownerPaths =
					ctx.project.index.pathItemsToPaths.get(ownerKey) ?? [];
				if (!ownerPaths.length) return;

				const needed = extractTemplateParams(ownerPaths);
				if (!needed.size) return;

				const operations =
					ctx.project.index.operationsByOwner.get(ownerKey) ?? [];
				for (const op of operations) {
					const declared = collectDeclaredPathParams(op, ctx);
					for (const name of needed) {
						const has = declared.some(
							(param) => param.in === "path" && param.name === name,
						);
						if (has) continue;

						const range = ctx.locate(op.uri, op.pointer) ?? {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 0 },
						};
						ctx.report({
							message: `Path parameter "{${name}}" is not declared for ${op.method.toUpperCase()} operation.`,
							severity: "error",
							uri: op.uri,
							range,
							suggest: [
								{
									title: `Add "{${name}}" parameter`,
									fix: addMissingParamPatch(ctx, op, name),
								},
							],
						});
					}
				}
			},
		};
	},
});

export default pathParamsMatch;
