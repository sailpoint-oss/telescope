import type { Diagnostic as EngineDiagnostic } from "engine";
import type {
	DiagnosticRelatedInformation,
	Diagnostic as LspDiagnostic,
	Range,
} from "vscode-languageserver-protocol";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";

/**
 * Convert engine Diagnostic to LSP Diagnostic format.
 * Shared utility used by both legacy and Volar servers.
 */
export function toLspDiagnostic(diag: EngineDiagnostic): LspDiagnostic {
	const severity =
		diag.severity === "error"
			? DiagnosticSeverity.Error
			: diag.severity === "warning"
				? DiagnosticSeverity.Warning
				: DiagnosticSeverity.Information;

	// Format code as telescope-openapi(rule-{number}-{id})
	const code = diag.ruleId.startsWith("rule-")
		? `telescope-openapi(${diag.ruleId})`
		: diag.ruleId;

	const related: DiagnosticRelatedInformation[] | undefined = diag.related
		?.map((info: { uri: string; range: Range; message?: string }) => ({
			location: { uri: info.uri, range: info.range },
			message: info.message ?? "",
		}))
		.filter(Boolean);

	return {
		message: diag.message,
		range: diag.range,
		severity,
		source: "telescope-openapi",
		code,
		codeDescription: diag.link
			? {
					href: diag.link,
				}
			: undefined,
		relatedInformation: related,
	};
}
