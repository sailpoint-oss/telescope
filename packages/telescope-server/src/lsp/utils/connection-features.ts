import type { Connection } from "vscode-languageserver";

/**
 * Runtime feature detection for optional LSP APIs.
 *
 * Cursor (or older VS Code builds) can run an older LSP stack where newer
 * connection surfaces (e.g. `connection.languages.linkedEditingRange`) do not
 * exist. These helpers keep the server from crashing and ensure we only
 * advertise capabilities that we can actually serve.
 */

export function supportsLinkedEditing(connection: Connection): boolean {
	const c = connection as unknown as {
		languages?: { linkedEditingRange?: { on?: unknown } };
	};
	return typeof c.languages?.linkedEditingRange?.on === "function";
}


