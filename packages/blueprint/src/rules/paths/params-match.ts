import {
	defineRule,
	type FilePatch,
	getValueAtPointer,
	joinPointer,
	type Rule,
	type RuleContext,
	splitPointer,
} from "lens";
import type { OperationRef } from "lens";

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
	// Use definition URI/pointer to get parameters from where operation is actually defined
	const docUri = op.definitionUri ?? op.uri;
	const doc = ctx.project.docs.get(docUri);
	if (!doc) return params;

	// Use definition pointer for path item
	const opDefinitionPointer = op.definitionPointer ?? op.pointer;
	const pathItemPointer = joinPointer(
		splitPointer(opDefinitionPointer).slice(0, -1),
	);

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
				}>({ uri: docUri, pointer }, value["$ref"] as string);
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
		...splitPointer(opDefinitionPointer),
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
	// Use definition URI/pointer for patches (where operation is actually defined)
	const docUri = op.definitionUri ?? op.uri;
	const opDefinitionPointer = op.definitionPointer ?? op.pointer;
	const doc = ctx.project.docs.get(docUri);
	const parametersPointer = joinPointer([
		...splitPointer(opDefinitionPointer),
		"parameters",
	]);
	const hasParametersArray = Array.isArray(
		getValueAtPointer(doc?.ast, parametersPointer),
	);
	const ops: FilePatch["ops"] = [];
	if (!hasParametersArray) {
		ops.push({
			op: "add",
			path: `${opDefinitionPointer}/parameters`,
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
	return { uri: docUri, ops };
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

				// Group missing parameters by parameter name
				const missingByParam = new Map<
					string,
					Array<{ op: OperationRef; method: string }>
				>();

				for (const op of operations) {
					const declared = collectDeclaredPathParams(op, ctx);
					for (const name of needed) {
						const has = declared.some(
							(param) => param.in === "path" && param.name === name,
						);
						if (has) continue;

						const missing = missingByParam.get(name) ?? [];
						missing.push({ op, method: op.method });
						missingByParam.set(name, missing);
					}
				}

				// Report diagnostics on path string in root document with related links
				for (const [paramName, missingOps] of missingByParam) {
					if (missingOps.length === 0) continue;

					// Find the path string location in the root document
					// The pathItem.uri/pointer is where the PathItem is referenced/defined
					// We need to find the path string key location
					const pathString = ownerPaths[0];
					if (!pathString) continue;

					// Get the path string location (the key in paths object)
					const pathsPointer = joinPointer(["paths", pathString]);
					const pathStringRange = ctx.locate(pathItem.uri, pathsPointer) ??
						ctx.locate(pathItem.uri, pathItem.pointer) ?? {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 0 },
						};

					// Build related diagnostics for each operation missing this parameter
					// Use definition URI/pointer to link to where operations are actually defined
					const related = missingOps.map(({ op, method }) => {
						const opDefinitionUri = op.definitionUri ?? op.uri;
						const opDefinitionPointer = op.definitionPointer ?? op.pointer;
						const opRange = ctx.locate(
							opDefinitionUri,
							opDefinitionPointer,
						) ?? {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 0 },
						};
						return {
							uri: opDefinitionUri,
							range: opRange,
							message: `Missing in ${method.toUpperCase()} operation`,
						};
					});

					// Report primary diagnostic on path string
					ctx.report({
						message: `Path parameter "{${paramName}}" is not declared in operations: ${missingOps.map(({ method }) => method.toUpperCase()).join(", ")}`,
						severity: "error",
						uri: pathItem.uri,
						range: pathStringRange,
						related,
						suggest: missingOps.map(({ op }) => ({
							title: `Add "{${paramName}}" parameter to ${op.method.toUpperCase()} operation`,
							fix: addMissingParamPatch(ctx, op, paramName),
						})),
					});
				}
			},
		};
	},
});

export default pathParamsMatch;
