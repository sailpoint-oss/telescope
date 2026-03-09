import type {
	SerializedDoc,
	SerializedProjectIndex,
	RunRulesRequest,
	SerializedDiagnostic,
} from "./types";
import type {
	Range,
	Position,
	ReportOptions,
	FixOptions,
	RuleContext,
	GenericRuleContext,
	AnyRef,
} from "telescope-server";

const SEVERITY_MAP: Record<string, number> = {
	error: 1,
	warning: 2,
	info: 3,
	hint: 4,
};

function rangeFromPointer(
	pointers: Record<string, [number, number, number, number]>,
	pointer: string,
): Range | undefined {
	const coords = pointers[pointer];
	if (!coords) return undefined;
	return {
		start: { line: coords[0], character: coords[1] },
		end: { line: coords[2], character: coords[3] },
	};
}

function fallbackRange(): Range {
	return {
		start: { line: 0, character: 0 },
		end: { line: 0, character: 0 },
	};
}

function offsetToRangeFromText(
	rawText: string,
	start: number,
	end: number,
): Range | undefined {
	if (start < 0 || end < start || start >= rawText.length) return undefined;
	let line = 0;
	let col = 0;
	let startPos: Position | undefined;
	let endPos: Position | undefined;

	for (let i = 0; i <= Math.min(end, rawText.length); i++) {
		if (i === start) startPos = { line, character: col };
		if (i === end) {
			endPos = { line, character: col };
			break;
		}
		if (rawText[i] === "\n") {
			line++;
			col = 0;
		} else {
			col++;
		}
	}
	if (!startPos) return undefined;
	if (!endPos) endPos = { line, character: col };
	return { start: startPos, end: endPos };
}

export interface ContextInternal {
	_diagnostics: SerializedDiagnostic[];
	_defaultCode?: string;
}

export function buildRuleContext(req: RunRulesRequest): RuleContext & ContextInternal {
	const diagnostics: SerializedDiagnostic[] = [];

	const docsMap = new Map<string, { ast: Record<string, unknown>; rawText: string }>();
	docsMap.set(req.document.uri, {
		ast: req.document.ast,
		rawText: req.document.rawText,
	});

	const ctx: RuleContext & ContextInternal = {
		_diagnostics: diagnostics,

		project: {
			docs: {
				get(uri: string) {
					return docsMap.get(uri);
				},
			},
			index: {
				operationIds: req.project.operationIds ?? {},
				componentRefs: req.project.componentRefs ?? {},
				tags: req.project.tags ?? {},
			},
		},

		locate(uri: string, pointer: string): Range | undefined {
			return rangeFromPointer(req.document.pointers, pointer);
		},

		report(opts: ReportOptions): void {
			diagnostics.push({
				startLine: opts.range.start.line,
				startChar: opts.range.start.character,
				endLine: opts.range.end.line,
				endChar: opts.range.end.character,
				severity: SEVERITY_MAP[opts.severity ?? "warning"] ?? 2,
				code: opts.code ?? ctx._defaultCode ?? "",
				message: opts.message,
				source: "telescope-custom",
			});
		},

		reportAt(
			ref: AnyRef,
			field: string,
			opts: Omit<ReportOptions, "uri" | "range">,
		): void {
			const pointer = field ? `${ref.pointer}/${field}` : ref.pointer;
			const range =
				ctx.locate(ref.uri, pointer) ??
				ctx.locate(ref.uri, ref.pointer) ??
				fallbackRange();
			ctx.report({ ...opts, uri: ref.uri, range });
		},

		fix(_opts: FixOptions): void {
			// Fix collection — not yet wired to code actions
		},

		offsetToRange(start: number, end: number): Range | undefined {
			return offsetToRangeFromText(req.document.rawText, start, end);
		},
	};

	return ctx;
}

export function buildGenericContext(
	req: RunRulesRequest,
): GenericRuleContext & ContextInternal {
	const diagnostics: SerializedDiagnostic[] = [];

	const ctx: GenericRuleContext & ContextInternal = {
		_diagnostics: diagnostics,

		file: {
			uri: req.document.uri,
			rawText: req.document.rawText,
			ast: req.document.ast,
		},

		report(opts: ReportOptions): void {
			diagnostics.push({
				startLine: opts.range.start.line,
				startChar: opts.range.start.character,
				endLine: opts.range.end.line,
				endChar: opts.range.end.character,
				severity: SEVERITY_MAP[opts.severity ?? "warning"] ?? 2,
				code: opts.code ?? ctx._defaultCode ?? "",
				message: opts.message,
				source: "telescope-custom",
			});
		},

		offsetToRange(start: number, end: number): Range | undefined {
			return offsetToRangeFromText(req.document.rawText, start, end);
		},
	};

	return ctx;
}
