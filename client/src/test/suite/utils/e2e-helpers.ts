import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import * as vscode from "vscode";

export interface TelescopeTestApi {
	waitForSessionsRunning: (timeoutMs?: number) => Promise<void>;
	getSessionStates: () => Array<{ folder: string; state: string }>;
	getProjectInfo: (uri?: vscode.Uri) => {
		knownOpenAPIFiles: number;
		workspacePath: string | null;
	} | null;
	getClientOpenApiFileCount: (uri?: vscode.Uri) => number;
	/** E2E: raw LSP textDocument/formatting (bypasses VS Code format provider resolution). */
	requestDocumentFormatting?: (
		uri: vscode.Uri,
	) => Promise<vscode.TextEdit[] | null>;
}

export function getTestApi(): TelescopeTestApi {
	const extension = vscode.extensions.getExtension("sailpoint.telescope");
	assert.ok(extension, "Extension should be available");
	const exports = extension.exports as { __telescopeTest?: TelescopeTestApi };
	assert.ok(exports.__telescopeTest, "Test API should be exposed");
	return exports.__telescopeTest;
}

export async function activateExtension(): Promise<void> {
	const extension = vscode.extensions.getExtension("sailpoint.telescope");
	assert.ok(extension, "Extension should be available");
	if (!extension.isActive) {
		await extension.activate();
	}
}

/**
 * Poll getProjectInfo until the predicate is satisfied.
 * Unlike the old version, getProjectInfo is now synchronous (client-side data).
 */
export async function waitForProjectInfo(
	api: TelescopeTestApi,
	predicate: (info: NonNullable<ReturnType<TelescopeTestApi["getProjectInfo"]>>) => boolean,
	options?: { timeoutMs?: number; intervalMs?: number; uri?: vscode.Uri },
): Promise<NonNullable<ReturnType<TelescopeTestApi["getProjectInfo"]>>> {
	const timeoutMs = options?.timeoutMs ?? 60000;
	const intervalMs = options?.intervalMs ?? 200;
	const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;
	const uri = options?.uri ?? defaultUri;
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const info = api.getProjectInfo(uri);
		if (info && predicate(info)) return info;
		await delay(intervalMs);
	}
	throw new Error(`Timeout waiting for project info after ${timeoutMs}ms`);
}

export async function waitForDiagnostics(
	uri: vscode.Uri,
	predicate: (diags: vscode.Diagnostic[]) => boolean,
	options?: { timeoutMs?: number },
): Promise<vscode.Diagnostic[]> {
	const timeoutMs = options?.timeoutMs ?? 30000;

	const current = vscode.languages.getDiagnostics(uri);
	if (predicate(current)) return current;

	return await new Promise<vscode.Diagnostic[]>((resolve, reject) => {
		let resolved = false;
		const done = (diags: vscode.Diagnostic[]) => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			clearInterval(poll);
			sub.dispose();
			resolve(diags);
		};

		const timer = setTimeout(() => {
			if (resolved) return;
			resolved = true;
			clearInterval(poll);
			sub.dispose();
			const finalDiags = vscode.languages.getDiagnostics(uri);
			const openDoc = vscode.workspace.textDocuments.find(
				(d) => d.uri.toString() === uri.toString(),
			);
			reject(
				new Error(
					`Timeout waiting for diagnostics after ${timeoutMs}ms ` +
						`(uri=${uri.toString()}, currentCount=${finalDiags.length}, ` +
						`languageId=${openDoc?.languageId ?? "not-open"})`,
				),
			);
		}, timeoutMs);

		const sub = vscode.languages.onDidChangeDiagnostics((e) => {
			if (!e.uris.some((u) => u.toString() === uri.toString())) return;
			const next = vscode.languages.getDiagnostics(uri);
			if (predicate(next)) done(next);
		});

		// Re-check after subscribing to close the race window, then poll
		// periodically as a safety net for missed events.
		const poll = setInterval(() => {
			const next = vscode.languages.getDiagnostics(uri);
			if (predicate(next)) done(next);
		}, 500);

		const recheck = vscode.languages.getDiagnostics(uri);
		if (predicate(recheck)) done(recheck);
	});
}

/**
 * Wait until LSP providers are fully registered by polling for code lenses.
 * Code lenses require the full OpenAPI analysis pipeline to complete (reference
 * counting, component indexing), making them the strongest readiness signal.
 */
export async function waitForProviders(
	uri: vscode.Uri,
	options?: { timeoutMs?: number },
): Promise<void> {
	// Windows CI hosts are often slower; code lenses are the last pipeline stage.
	const timeoutMs =
		options?.timeoutMs ?? (process.platform === "win32" ? 120000 : 90000);
	const pollMs = process.platform === "win32" ? 1500 : 2000;
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const result = (await vscode.commands.executeCommand(
			"vscode.executeCodeLensProvider",
			uri,
		)) as vscode.CodeLens[] | undefined;
		if (Array.isArray(result) && result.length > 0) return;
		await delay(pollMs);
	}
	const openDoc = vscode.workspace.textDocuments.find(
		(d) => d.uri.toString() === uri.toString(),
	);
	throw new Error(
		`Timeout waiting for providers after ${timeoutMs}ms ` +
			`(uri=${uri.toString()}, languageId=${openDoc?.languageId ?? "not-open"})`,
	);
}

/**
 * Force the in-memory document to match `expected` (e.g. exact bytes from readFile).
 * VS Code can normalize YAML on load in some cases; a full-document replace issues
 * didChange so the language server sees trailing spaces before format runs.
 */
export async function ensureWorkspaceTextDocumentMatches(
	uri: vscode.Uri,
	expected: string,
): Promise<vscode.TextDocument> {
	let doc = await vscode.workspace.openTextDocument(uri);
	if (doc.getText() === expected) {
		return doc;
	}
	const edit = new vscode.WorkspaceEdit();
	const current = doc.getText();
	const fullRange = new vscode.Range(
		doc.positionAt(0),
		doc.positionAt(current.length),
	);
	edit.replace(uri, fullRange, expected);
	await vscode.workspace.applyEdit(edit);
	doc = await vscode.workspace.openTextDocument(uri);
	assert.strictEqual(
		doc.getText(),
		expected,
		"Workspace buffer should match expected text after applyEdit",
	);
	return doc;
}

export async function openAndShow(uri: vscode.Uri): Promise<vscode.TextDocument> {
	const doc = await vscode.workspace.openTextDocument(uri);
	await vscode.window.showTextDocument(doc);
	return doc;
}

export async function waitForLanguageId(
	uri: vscode.Uri,
	expectedLanguageId: string,
	options?: { timeoutMs?: number; delayMs?: number },
): Promise<vscode.TextDocument> {
	const timeoutMs = options?.timeoutMs ?? 15000;
	const delayMs = options?.delayMs ?? 250;
	const start = Date.now();
	let doc = await vscode.workspace.openTextDocument(uri);
	while (
		doc.languageId !== expectedLanguageId &&
		Date.now() - start < timeoutMs
	) {
		await delay(delayMs);
		doc = await vscode.workspace.openTextDocument(uri);
	}
	return doc;
}

export async function writeWorkspaceFile(
	relativePath: string,
	contents: string,
): Promise<vscode.Uri> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	assert.ok(folder, "Should have a workspace folder");
	const uri = vscode.Uri.joinPath(folder.uri, relativePath);
	const dir = pathDir(relativePath);
	if (dir !== "." && dir !== "") {
		await vscode.workspace.fs.createDirectory(
			vscode.Uri.joinPath(folder.uri, dir),
		);
	}
	await vscode.workspace.fs.writeFile(uri, Buffer.from(contents, "utf-8"));
	return uri;
}

export async function deleteWorkspaceFile(relativePath: string): Promise<void> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	assert.ok(folder, "Should have a workspace folder");
	const uri = vscode.Uri.joinPath(folder.uri, relativePath);
	try {
		await vscode.workspace.fs.delete(uri);
	} catch {
		// ignore
	}
}

/**
 * Execute a VS Code command with retries until the result satisfies a predicate.
 * Consolidates the retry-loop pattern used across provider E2E tests.
 */
export async function executeWithRetry<T>(
	command: string,
	args: unknown[],
	predicate: (result: T) => boolean,
	options?: { maxAttempts?: number; delayMs?: number },
): Promise<T> {
	const maxAttempts = options?.maxAttempts ?? 20;
	const delayMs = options?.delayMs ?? 2000;
	let last: T | undefined;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		last = (await vscode.commands.executeCommand(command, ...args)) as T;
		if (last !== undefined && last !== null && predicate(last)) return last;
		await delay(delayMs);
	}
	return last as T;
}

export function isMultiRootWorkspace(): boolean {
	if (process.env.TELESCOPE_E2E_MODE === "multi") return true;
	return (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
}

export function isSidecarWorkspace(): boolean {
	return process.env.TELESCOPE_E2E_MODE === "sidecar";
}

export async function waitForSidecarReady(
	folder: vscode.WorkspaceFolder,
	options?: { timeoutMs?: number },
): Promise<void> {
	const probeUri = vscode.Uri.joinPath(
		folder.uri,
		"openapi/test-missing-summary.yaml",
	);
	await openAndShow(probeUri);
	await waitForDiagnostics(
		probeUri,
		(diags) =>
			diags.some(
				(d) =>
					diagCode(d) === "custom-operation-summary" ||
					d.source?.toLowerCase().includes("telescope"),
			),
		{ timeoutMs: options?.timeoutMs ?? 120000 },
	);
}


export function diagCode(d: vscode.Diagnostic): string {
	if (typeof d.code === "object" && d.code !== null) {
		return String(d.code.value);
	}
	return String(d.code ?? "");
}

export async function delay(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractTargetUri(
	def: vscode.Location | vscode.LocationLink,
): vscode.Uri {
	return "uri" in def
		? (def as vscode.Location).uri
		: (def as vscode.LocationLink).targetUri;
}

export function extractTargetRange(
	def: vscode.Location | vscode.LocationLink,
): vscode.Range {
	return "uri" in def
		? (def as vscode.Location).range
		: (def as vscode.LocationLink).targetRange;
}

/**
 * Compare absolute filesystem paths from {@link vscode.Uri.fsPath} across OSes.
 * On Windows, drive letter and separator normalization can make strict string
 * equality fail between the editor URI and LSP target URIs.
 */
export function fsPathsEqual(a: string, b: string): boolean {
	const na = nodePath.normalize(a);
	const nb = nodePath.normalize(b);
	if (process.platform === "win32") {
		return na.toLowerCase() === nb.toLowerCase();
	}
	return na === nb;
}

export function assertUriFsPathEqual(
	a: vscode.Uri,
	b: vscode.Uri,
	message?: string,
): void {
	assert.ok(
		fsPathsEqual(a.fsPath, b.fsPath),
		message ?? `Expected same file path: ${a.fsPath} vs ${b.fsPath}`,
	);
}

/**
 * Resolve two URIs to canonical paths (handles Windows 8.3 short names in TEMP).
 */
export async function assertUriResolvesToSameFile(
	a: vscode.Uri,
	b: vscode.Uri,
	message?: string,
): Promise<void> {
	try {
		const [ra, rb] = await Promise.all([
			fs.realpath(a.fsPath),
			fs.realpath(b.fsPath),
		]);
		assert.ok(
			fsPathsEqual(ra, rb),
			message ?? `Expected same file: ${ra} vs ${rb}`,
		);
	} catch {
		assertUriFsPathEqual(a, b, message);
	}
}

function pathDir(p: string): string {
	const n = p.replace(/\\/g, "/");
	const idx = n.lastIndexOf("/");
	if (idx === -1) return ".";
	const dir = n.slice(0, idx);
	return dir.length ? dir : ".";
}
