/**
 * Path Parameters Match Rule
 *
 * Ensures that path template parameters (e.g., `{id}` in `/users/{id}`) are
 * properly declared as `in: path` parameters in all operations under that path.
 */

import type { Range } from "vscode-languageserver-protocol";
import type { OperationRefInput } from "../../../indexes/types.js";
import { findNodeByPointer } from "../../../ir/context.js";
import {
	defineRule,
	type FilePatch,
	getValueAtPointer,
	joinPointer,
	type Rule,
	type RuleContext,
	splitPointer,
} from "../../api.js";

/** Regex to extract template parameters from path strings */
const TEMPLATE_PARAM_REGEX = /\{([^}]+)\}/g;

/**
 * Find the precise range of a parameter placeholder (e.g., `{id}`) within a path string.
 * Returns null if not found or if range cannot be computed.
 */
function findParamRangeInPath(
	ctx: RuleContext,
	uri: string,
	pathsPointer: string,
	paramName: string,
): Range | null {
	const doc = ctx.project.docs.get(uri);
	if (!doc?.ir || !doc.rawText) return null;

	// Find the node for the path entry
	const node = findNodeByPointer(doc.ir, pathsPointer);
	if (!node?.loc) return null;
	const keyStart = node.loc.keyStart ?? node.loc.start;
	const keyEnd = node.loc.keyEnd ?? node.loc.end;
	if (keyEnd <= keyStart) return null;

	// Find where {paramName} appears within the actual source slice of the key.
	// This avoids offset drift when the key is quoted (JSON or quoted YAML),
	// because `pathString` does not include quotes but the source slice might.
	const paramPlaceholder = `{${paramName}}`;
	const keyText = doc.rawText.slice(keyStart, keyEnd);
	const paramIndex = keyText.indexOf(paramPlaceholder);
	if (paramIndex === -1) return null;

	// Calculate byte offsets within the key slice
	const paramStartOffset = keyStart + paramIndex;
	const paramEndOffset = paramStartOffset + paramPlaceholder.length;

	return ctx.offsetToRange(uri, paramStartOffset, paramEndOffset);
}

/**
 * Extract all template parameter names from an array of path strings.
 */
function extractTemplateParams(paths: string[]): Set<string> {
	const names = new Set<string>();
	for (const path of paths) {
		const matches = path.matchAll(TEMPLATE_PARAM_REGEX);
		for (const match of matches) {
			if (match[1]) {
				names.add(match[1]);
			}
		}
	}
	return names;
}

/**
 * Collect all declared path parameters for an operation.
 */
function collectDeclaredPathParams(op: OperationRefInput, ctx: RuleContext) {
	const params: Array<{ name?: string; in?: string }> = [];
	const docUri = op.definitionUri ?? op.uri;
	const doc = ctx.project.docs.get(docUri);
	if (!doc) return params;

	const opDefinitionPointer = op.definitionPointer ?? op.pointer;
	const pathItemPointer = joinPointer(
		splitPointer(opDefinitionPointer).slice(0, -1),
	);

	const considerPointer = (pointer: string) => {
		const value = getValueAtPointer(doc.ast, pointer) as
			| Record<string, unknown>
			| undefined;
		if (!value) return;
		if (typeof value === "object" && typeof value.$ref === "string") {
			try {
				const resolved = ctx.project.resolver.deref<{
					name?: string;
					in?: string;
				}>({ uri: docUri, pointer }, value.$ref as string);
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

/**
 * Generate a fix patch to add a missing path parameter.
 */
function addMissingParamPatch(
	ctx: RuleContext,
	op: OperationRefInput,
	name: string,
): FilePatch {
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
		description:
			"Ensure path template params are declared as in:'path' parameters",
		defaultSeverity: "error",
	},
	check(ctx) {
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

				const missingByParam = new Map<
					string,
					Array<{ op: OperationRefInput; method: string }>
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

				for (const [paramName, missingOps] of missingByParam) {
					if (missingOps.length === 0) continue;

					const pathString = ownerPaths[0];
					if (!pathString) continue;

					const pathsPointer = joinPointer(["paths", pathString]);

					// Try to get precise range for just the {paramName} placeholder
					const paramRange = findParamRangeInPath(
						ctx,
						pathItem.uri,
						pathsPointer,
						paramName,
					);

					// Fall back to the whole path string key if precise range not available
					const pathStringRange = paramRange ??
						ctx.locateKey(pathItem.uri, pathsPointer) ??
						ctx.locate(pathItem.uri, pathsPointer) ??
						ctx.locate(pathItem.uri, pathItem.pointer) ??
						ctx.locateFirstChild(pathItem.uri, "#") ?? {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 0 },
						};

					const relatedInformation = missingOps.map(({ op, method }) => {
						const opDefinitionUri = op.definitionUri ?? op.uri;
						const opDefinitionPointer = op.definitionPointer ?? op.pointer;
						const opRange = ctx.locate(opDefinitionUri, opDefinitionPointer) ??
							ctx.locateFirstChild(opDefinitionUri, "#") ?? {
								start: { line: 0, character: 0 },
								end: { line: 0, character: 0 },
							};
						return {
							location: { uri: opDefinitionUri, range: opRange },
							message: `Missing in ${method.toUpperCase()} operation`,
						};
					});

					ctx.report({
						message: `Path parameter "{${paramName}}" is not declared in operations: ${missingOps.map(({ method }) => method.toUpperCase()).join(", ")}`,
						severity: "error",
						uri: pathItem.uri,
						range: pathStringRange,
						relatedInformation,
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
