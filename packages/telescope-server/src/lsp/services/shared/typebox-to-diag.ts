/**
 * TypeBox to Diagnostics Converter (Legacy)
 *
 * This file now re-exports from zod-to-diag.ts for backward compatibility.
 * The original TypeBox validation has been replaced with Zod.
 *
 * @module lsp/services/shared/typebox-to-diag
 * @deprecated Use zod-to-diag.ts directly instead
 */

// Re-export everything from zod-to-diag for backward compatibility
export {
	zodErrorsToDiagnostics,
	typeboxErrorsToDiagnostics,
	type DocumentContext,
} from "./zod-to-diag.js";
