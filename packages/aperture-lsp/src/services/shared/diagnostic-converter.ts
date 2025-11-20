import type { Diagnostic } from "@volar/language-server";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import type { Diagnostic as LensDiagnostic } from "lens/rules/types.js";

/**
 * Convert a lens Diagnostic to a Volar/LSP Diagnostic.
 *
 * @param diag - The lens diagnostic to convert
 * @returns A Volar/LSP Diagnostic
 */
export function toLspDiagnostic(diag: LensDiagnostic): Diagnostic {
  return {
    range: diag.range,
    message: diag.message,
    severity: diag.severity ?? DiagnosticSeverity.Error,
    source: diag.source ?? "telescope-lens",
    code: diag.code,
    codeDescription: diag.codeDescription,
    data: diag.data,
    tags: diag.tags,
    relatedInformation: diag.relatedInformation,
  };
}

