/**
 * Simplified rule runner for generic JSON/YAML files.
 * Much simpler than OpenAPI runner - no IR, no graph, no indexer.
 */

import { DiagnosticSeverity, type Range } from "vscode-languageserver-protocol";
import type { Diagnostic } from "../index.js";
import type {
	GenericDiagnosticInput,
	GenericFilePatch,
	GenericRule,
	GenericRuleContext,
	GenericVisitors,
} from "../rules/generic-types.js";
import { buildLineOffsets, getLineCol } from "../utils/line-offset-utils.js";

function severityToEnum(
	severity: "error" | "warning" | "info" | "hint",
): DiagnosticSeverity {
	switch (severity) {
		case "error":
			return DiagnosticSeverity.Error;
		case "warning":
			return DiagnosticSeverity.Warning;
		case "info":
			return DiagnosticSeverity.Information;
		case "hint":
			return DiagnosticSeverity.Hint;
	}
}

export interface GenericRunOptions {
	rules: GenericRule[];
}

export interface GenericRunResult {
	diagnostics: Diagnostic[];
	fixes: GenericFilePatch[];
}

/**
 * Convert byte offset to line/character position.
 */
function offsetToRange(
	text: string,
	lineOffsets: number[],
	startOffset: number,
	endOffset?: number,
): Range | null {
	const startPos = getLineCol(startOffset, lineOffsets);
	const endPos =
		endOffset !== undefined ? getLineCol(endOffset, lineOffsets) : startPos;

	return {
		start: { line: startPos.line - 1, character: startPos.col - 1 },
		end: { line: endPos.line - 1, character: endPos.col - 1 },
	};
}

/**
 * Traverse AST and call Document visitor for each node.
 */
function traverseAST(
	node: unknown,
	pointer: string,
	visitor: GenericVisitors["Document"],
	uri: string,
): void {
	if (visitor) {
		visitor({ uri, pointer, node });
	}

	if (node === null || node === undefined) {
		return;
	}

	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			traverseAST(node[i], `${pointer}/${i}`, visitor, uri);
		}
	} else if (typeof node === "object") {
		for (const [key, value] of Object.entries(node)) {
			traverseAST(
				value,
				`${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
				visitor,
				uri,
			);
		}
	}
}

/**
 * Run generic rules against a parsed document.
 */
export function runGenericRules(
	uri: string,
	ast: unknown,
	rawText: string,
	options: GenericRunOptions,
): GenericRunResult {
	const diagnostics: Diagnostic[] = [];
	const fixes: GenericFilePatch[] = [];

	if (!options.rules || options.rules.length === 0) {
		return { diagnostics, fixes };
	}

	const lineOffsets = buildLineOffsets(rawText);

	// Create rule contexts and visitors
	const visitors: GenericVisitors[] = options.rules.map((rule) => {
		const ctx: GenericRuleContext = {
			file: {
				uri,
				ast,
				rawText,
			},
			report(diagnostic: GenericDiagnosticInput) {
				const code = diagnostic.code ?? rule.meta.id;
				const range = diagnostic.range ??
					offsetToRange(rawText, lineOffsets, 0, rawText.length) ?? {
						start: { line: 0, character: 0 },
						end: { line: 0, character: 0 },
					};
				const codeDescription =
					diagnostic.codeDescription ?? (rule.meta.docs.url ? { href: rule.meta.docs.url } : undefined);

				diagnostics.push({
					code,
					source: diagnostic.source ?? "telescope",
					message: diagnostic.message,
					uri,
					range,
					severity: severityToEnum(diagnostic.severity),
					codeDescription,
				});
			},
			fix(patch: GenericFilePatch | GenericFilePatch[]) {
				if (Array.isArray(patch)) {
					fixes.push(...patch);
				} else {
					fixes.push(patch);
				}
			},
			offsetToRange(startOffset: number, endOffset?: number) {
				return offsetToRange(rawText, lineOffsets, startOffset, endOffset);
			},
		};

		try {
			return rule.create(ctx);
		} catch (error) {
			// Error logged silently - in LSP context, use DiagnosticsLogger
			// For standalone usage, errors are silently swallowed
			return {} as GenericVisitors;
		}
	});

	// Traverse AST and dispatch to Document visitors
	for (const visitor of visitors) {
		if (visitor.Document) {
			traverseAST(ast, "#", visitor.Document, uri);
		}
	}

	return { diagnostics, fixes };
}
