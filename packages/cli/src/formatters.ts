import type { Diagnostic } from "engine";

export function formatStylish(diagnostics: Diagnostic[]): string {
	return diagnostics
		.map((diag) => {
			const pos = `${diag.range.start.line + 1}:${diag.range.start.character + 1}`;
			return `${diag.severity.toUpperCase()} ${diag.uri}:${pos} ${diag.message} (${diag.ruleId})`;
		})
		.join("\n");
}

export function formatJson(diagnostics: Diagnostic[]): string {
	return JSON.stringify(diagnostics, null, 2);
}

export const formatters = {
	stylish: formatStylish,
	json: formatJson,
};

