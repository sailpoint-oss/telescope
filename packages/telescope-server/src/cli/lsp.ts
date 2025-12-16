export async function runLspCommand(_argv: string[]): Promise<void> {
	// The LSP server runs over stdio and starts immediately on import.
	// In dev (bun running TS), import the TS entry. In packaged form (node running dist),
	// import the bundled JS entry.
	try {
		await import("../server.ts");
		return;
	} catch {
		// ignore and try JS
	}

	const serverJs = new URL("../server.js", import.meta.url).toString();
	await import(serverJs);
}


