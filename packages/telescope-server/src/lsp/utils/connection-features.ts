import type { Connection } from "vscode-languageserver";

/**
 * Runtime feature detection for optional LSP APIs.
 *
 * Even on modern VS Code baselines, some hosts (Cursor builds, extension host
 * shims, etc.) may not expose every optional `connection.languages.*` surface.
 * We must not crash at startup when an optional API is missing.
 */
export function supportsLinkedEditing(connection: Connection): boolean {
	const c = connection as unknown as {
		languages?: { linkedEditingRange?: { on?: unknown } };
	};
	return typeof c.languages?.linkedEditingRange?.on === "function";
}


