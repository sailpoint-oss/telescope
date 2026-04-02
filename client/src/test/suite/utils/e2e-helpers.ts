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
	requestDocumentSymbols?: (
		uri: vscode.Uri,
	) => Promise<vscode.DocumentSymbol[] | null>;
	requestDefinition?: (
		uri: vscode.Uri,
		pos: vscode.Position,
	) => Promise<(vscode.Location | vscode.LocationLink)[] | null>;
	requestSidecarInfo?: (
		uri?: vscode.Uri,
	) => Promise<{ configured: boolean; available: boolean } | null>;
}

let singleRootReadyPromise:
	| Promise<{
			api: TelescopeTestApi;
			folder: vscode.WorkspaceFolder;
			warmupUri: vscode.Uri;
	  }>
	| undefined;

let sidecarReadyPromise:
	| Promise<{
			api: TelescopeTestApi;
			folder: vscode.WorkspaceFolder;
			warmupUri: vscode.Uri;
			sidecarAvailable: boolean;
	  }>
	| undefined;

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

export async function waitForServerDocumentSymbols(
	uri: vscode.Uri,
	options?: { timeoutMs?: number; pollMs?: number },
): Promise<vscode.DocumentSymbol[]> {
	const api = getTestApi();
	if (!api.requestDocumentSymbols) {
		return [];
	}
	const timeoutMs = options?.timeoutMs ?? 90000;
	const pollMs = options?.pollMs ?? 1000;
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const symbols = await api.requestDocumentSymbols(uri);
		if (Array.isArray(symbols) && symbols.length > 0) {
			return symbols;
		}
		await delay(pollMs);
	}
	throw new Error(
		`Timeout waiting for server document symbols after ${timeoutMs}ms ` +
			`(uri=${uri.toString()})`,
	);
}

export async function waitForSidecarAvailable(
	uri?: vscode.Uri,
	options?: { timeoutMs?: number; pollMs?: number },
): Promise<{ configured: boolean; available: boolean }> {
	const api = getTestApi();
	if (!api.requestSidecarInfo) {
		throw new Error("Test API does not expose requestSidecarInfo");
	}
	const timeoutMs = options?.timeoutMs ?? 120000;
	const pollMs = options?.pollMs ?? 1000;
	const start = Date.now();
	let lastInfo: { configured: boolean; available: boolean } | null = null;
	while (Date.now() - start < timeoutMs) {
		lastInfo = await api.requestSidecarInfo(uri);
		if (lastInfo?.configured && lastInfo.available) {
			return lastInfo;
		}
		await delay(pollMs);
	}
	throw new Error(
		`Timeout waiting for sidecar availability after ${timeoutMs}ms ` +
			`(uri=${uri?.toString() ?? "workspace"}, lastInfo=${JSON.stringify(lastInfo)})`,
	);
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
			const diagSummary = finalDiags
				.slice(0, 5)
				.map((d) => `${diagCode(d)}(${d.severity}): ${d.message.slice(0, 60)}`)
				.join(" | ");
			reject(
				new Error(
					`Timeout waiting for diagnostics after ${timeoutMs}ms ` +
						`(uri=${uri.toString()}, currentCount=${finalDiags.length}, ` +
						`languageId=${openDoc?.languageId ?? "not-open"}, ` +
						`diags=[${diagSummary}])`,
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
	// Windows and macOS CI hosts are often slower than Linux; code lenses are the
	// last pipeline stage and gate hover / document-highlight readiness.
	const defaultTimeout =
		process.platform === "win32" || process.platform === "darwin"
			? 120000
			: 90000;
	const timeoutMs = options?.timeoutMs ?? defaultTimeout;
	const pollMs =
		process.platform === "win32" || process.platform === "darwin"
			? 1500
			: 2000;
	const start = Date.now();
	const api = getTestApi();
	while (Date.now() - start < timeoutMs) {
		if (api.requestDocumentSymbols) {
			const symbols = await api.requestDocumentSymbols(uri);
			if (Array.isArray(symbols) && symbols.length > 0) return;
		}
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
	} catch (err) {
		console.warn(`deleteWorkspaceFile(${relativePath}): ${err}`);
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

/**
 * Rename providers sometimes transiently throw "No result." before the host has
 * fully settled on freshly created temp documents. Treat that specific shape as
 * retryable, but surface real rename errors immediately.
 */
export async function executeRenameWithRetry(
	uri: vscode.Uri,
	pos: vscode.Position,
	newName: string,
	options?: { maxAttempts?: number; delayMs?: number },
): Promise<vscode.WorkspaceEdit | undefined> {
	const maxAttempts = options?.maxAttempts ?? 20;
	const delayMs = options?.delayMs ?? 1000;
	let lastResult: vscode.WorkspaceEdit | undefined;
	let lastRetryableError: unknown;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			lastResult = (await vscode.commands.executeCommand(
				"vscode.executeDocumentRenameProvider",
				uri,
				pos,
				newName,
			)) as vscode.WorkspaceEdit | undefined;
			if (lastResult !== undefined && lastResult !== null) {
				return lastResult;
			}
		} catch (error) {
			const msg = String(error);
			if (!msg.includes("No result.")) {
				throw error;
			}
			lastRetryableError = error;
		}
		await delay(delayMs);
	}

	if (lastRetryableError) {
		throw lastRetryableError;
	}
	return lastResult;
}

export async function waitForDiagnosticCodeState(
	uri: vscode.Uri,
	code: string,
	present: boolean,
	options?: { timeoutMs?: number },
): Promise<vscode.Diagnostic[]> {
	return await waitForDiagnostics(
		uri,
		(diags) => diags.some((diag) => diagCode(diag) === code) === present,
		options,
	);
}

/**
 * Poll until definition provider returns at least one result for `pos`.
 * Prefers the raw server `textDocument/definition` request exposed through the
 * test API, then falls back to VS Code's definition provider command. This is a
 * stronger readiness witness than code lenses alone: it proves the full index
 * (refs, components) is queryable for the specific position.
 */
export async function waitForDefinitionAvailable(
	uri: vscode.Uri,
	pos: vscode.Position,
	options?: { timeoutMs?: number; pollMs?: number },
): Promise<(vscode.Location | vscode.LocationLink)[]> {
	const timeoutMs = options?.timeoutMs ?? 90000;
	const pollMs = options?.pollMs ?? 500;
	const start = Date.now();
	const api = getTestApi();
	while (Date.now() - start < timeoutMs) {
		const result = api.requestDefinition
			? await api.requestDefinition(uri, pos)
			: ((await vscode.commands.executeCommand(
					"vscode.executeDefinitionProvider",
					uri,
					pos,
				)) as (vscode.Location | vscode.LocationLink)[] | undefined);
		if (Array.isArray(result) && result.length > 0) return result;
		await delay(pollMs);
	}
	throw new Error(
		`Timeout waiting for definition provider after ${timeoutMs}ms ` +
			`(uri=${uri.toString()}, pos=L${pos.line}:${pos.character}, ` +
			`platform=${process.platform})`,
	);
}

/**
 * Probe hover provider at `pos`. Returns the result array (may be empty).
 * Does NOT poll — call after a readiness gate like {@link waitForDefinitionAvailable}.
 */
export async function probeHover(
	uri: vscode.Uri,
	pos: vscode.Position,
): Promise<vscode.Hover[]> {
	const result = (await vscode.commands.executeCommand(
		"vscode.executeHoverProvider",
		uri,
		pos,
	)) as vscode.Hover[] | undefined;
	return Array.isArray(result) ? result : [];
}

/**
 * Poll until document highlights satisfy `predicate`, or throw with diagnostics.
 * Unlike the previous version this throws on timeout instead of silently returning
 * partial results, so callers get an honest failure signal.
 */
export async function waitForDocumentHighlights(
	uri: vscode.Uri,
	pos: vscode.Position,
	predicate: (h: vscode.DocumentHighlight[]) => boolean,
	options?: { timeoutMs?: number; pollMs?: number },
): Promise<vscode.DocumentHighlight[]> {
	const timeoutMs = options?.timeoutMs ?? 90000;
	const pollMs = options?.pollMs ?? 400;
	const start = Date.now();
	let last: vscode.DocumentHighlight[] | undefined;
	while (Date.now() - start < timeoutMs) {
		last = (await vscode.commands.executeCommand(
			"vscode.executeDocumentHighlights",
			uri,
			pos,
		)) as vscode.DocumentHighlight[] | undefined;
		if (Array.isArray(last) && predicate(last)) return last;
		await delay(pollMs);
	}
	const count = Array.isArray(last) ? last.length : 0;
	const kinds = Array.isArray(last)
		? last.map((h) => h.kind ?? "?").join(",")
		: "n/a";
	throw new Error(
		`Timeout waiting for document highlights after ${timeoutMs}ms ` +
			`(uri=${uri.toString()}, pos=L${pos.line}:${pos.character}, ` +
			`lastCount=${count}, lastKinds=[${kinds}], platform=${process.platform})`,
	);
}

export function isMultiRootWorkspace(): boolean {
	if (process.env.TELESCOPE_E2E_MODE === "multi") return true;
	return (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
}

export function isSidecarWorkspace(): boolean {
	return process.env.TELESCOPE_E2E_MODE === "sidecar";
}

export async function ensureSingleRootWorkspaceReady(options?: {
	warmupRelativePath?: string;
	timeoutMs?: number;
}): Promise<{
	api: TelescopeTestApi;
	folder: vscode.WorkspaceFolder;
	warmupUri: vscode.Uri;
}> {
	if (isMultiRootWorkspace()) {
		throw new Error("ensureSingleRootWorkspaceReady cannot be used in multi-root mode");
	}
	if (!singleRootReadyPromise) {
		singleRootReadyPromise = (async () => {
			await activateExtension();
			const api = getTestApi();
			await api.waitForSessionsRunning(options?.timeoutMs ?? 120000);
			const folder = vscode.workspace.workspaceFolders?.[0];
			assert.ok(folder, "Should have a workspace folder");
			const warmupUri = vscode.Uri.joinPath(
				folder.uri,
				options?.warmupRelativePath ?? "rich-api.yaml",
			);
			await waitForProjectInfo(
				api,
				(info) => info.knownOpenAPIFiles > 0,
				{ timeoutMs: options?.timeoutMs ?? 120000, uri: warmupUri },
			);
			await openAndShow(warmupUri);
			await waitForDocumentAnalyzed(warmupUri, {
				timeoutMs: options?.timeoutMs,
			});
			return { api, folder, warmupUri };
		})().catch((error) => {
			singleRootReadyPromise = undefined;
			throw error;
		});
	}
	return singleRootReadyPromise;
}

export async function ensureSidecarWorkspaceReady(options?: {
	warmupRelativePath?: string;
	timeoutMs?: number;
	skipSuiteIfUnavailable?: { skip(): never };
}): Promise<{
	api: TelescopeTestApi;
	folder: vscode.WorkspaceFolder;
	warmupUri: vscode.Uri;
	sidecarAvailable: boolean;
}> {
	if (!isSidecarWorkspace()) {
		throw new Error("ensureSidecarWorkspaceReady requires sidecar mode");
	}
	if (!sidecarReadyPromise) {
		sidecarReadyPromise = (async () => {
			await activateExtension();
			const api = getTestApi();
			await api.waitForSessionsRunning(options?.timeoutMs ?? 120000);
			const folder = vscode.workspace.workspaceFolders?.[0];
			assert.ok(folder, "Should have a workspace folder");
			const warmupUri = vscode.Uri.joinPath(
				folder.uri,
				options?.warmupRelativePath ?? "openapi/test-missing-summary.yaml",
			);
			await openAndShow(warmupUri);
			await waitForDocumentAnalyzed(warmupUri, {
				timeoutMs: options?.timeoutMs,
			});
			const sidecarAvailable = await waitForSidecarReady(folder, options);
			if (!sidecarAvailable && options?.skipSuiteIfUnavailable) {
				console.warn(
					`[e2e sidecar] Skipping suite because the Bun sidecar did not become ready on ${process.platform}`,
				);
				options.skipSuiteIfUnavailable.skip();
			}
			return { api, folder, warmupUri, sidecarAvailable };
		})().catch((error) => {
			sidecarReadyPromise = undefined;
			throw error;
		});
	}
	return sidecarReadyPromise;
}

/**
 * Wait for the Bun sidecar to be ready by probing for custom rule diagnostics.
 * Returns true if the sidecar is ready, false if it timed out. Suites that want
 * explicit pending results instead of silent no-op tests should pass their
 * Mocha `this` context through `ensureSidecarWorkspaceReady({ skipSuiteIfUnavailable: this })`.
 */
export async function waitForSidecarReady(
	folder: vscode.WorkspaceFolder,
	options?: { timeoutMs?: number },
): Promise<boolean> {
	const probeUri = vscode.Uri.joinPath(
		folder.uri,
		"openapi/test-missing-summary.yaml",
	);
	await openAndShow(probeUri);
	try {
		await waitForDiagnostics(
			probeUri,
			(diags) =>
				diags.some(
					(d) => diagCode(d) === "custom-operation-summary",
				),
			{ timeoutMs: options?.timeoutMs ?? 120000 },
		);
		return true;
	} catch {
		// Bun sidecar didn't produce custom rule diagnostics within timeout.
		// This is expected on Windows where the sidecar may not start.
		return false;
	}
}


/**
 * Wait until a document has been fully analyzed by the LSP pipeline.
 * Waits for diagnostics to appear (real predicate, not `() => true`) then
 * waits for code lenses as the final pipeline signal.
 */
export async function waitForDocumentAnalyzed(
	uri: vscode.Uri,
	options?: {
		timeoutMs?: number;
		/** When true, skip waiting for diagnostics (useful for valid files with 0 diagnostics). */
		skipDiagnostics?: boolean;
	},
): Promise<void> {
	const totalTimeout =
		options?.timeoutMs ??
		(process.platform === "win32" || process.platform === "darwin"
			? 150000
			: 120000);
	const start = Date.now();

	if (!options?.skipDiagnostics) {
		const diagBudget = Math.min(totalTimeout * 0.5, 90000);
		try {
			await waitForDiagnostics(uri, (d) => d.length > 0, {
				timeoutMs: diagBudget,
			});
		} catch {
			// File may be valid with 0 diagnostics; continue to code-lens gate.
		}
	}

	const remaining = totalTimeout - (Date.now() - start);
	if (remaining > 0) {
		await waitForProviders(uri, { timeoutMs: remaining });
	}
}

/**
 * Open two cross-file documents and wait for both to have diagnostics processed.
 * Replaces the fragile pattern: open A, delay(2000), open B, delay(3000).
 */
export async function waitForCrossFileReady(
	uriA: vscode.Uri,
	uriB: vscode.Uri,
	options?: { timeoutMs?: number },
): Promise<void> {
	const timeoutMs = options?.timeoutMs ?? 60000;

	await openAndShow(uriA);
	await waitForDocumentAnalyzed(uriA, {
		timeoutMs: Math.max(timeoutMs / 2, 5000),
	});

	await openAndShow(uriB);
	await waitForDocumentAnalyzed(uriB, {
		timeoutMs: Math.max(timeoutMs / 2, 5000),
	});
}

/**
 * Create a temporary file, run the test function, and guarantee cleanup.
 * Handles editor revert, close, and file deletion in all code paths.
 */
export async function withTempFile(
	relativePath: string,
	content: string,
	fn: (uri: vscode.Uri, doc: vscode.TextDocument) => Promise<void>,
): Promise<void> {
	const uri = await writeWorkspaceFile(relativePath, content);
	try {
		const doc = await openAndShow(uri);
		await fn(uri, doc);
	} finally {
		try {
			await vscode.commands.executeCommand("workbench.action.files.revert");
		} catch { /* may not have unsaved changes */ }
		try {
			await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
		} catch { /* editor may already be closed */ }
		await deleteWorkspaceFile(relativePath);
	}
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

/**
 * Decoded semantic token from the delta-encoded Uint32Array.
 */
export interface DecodedToken {
	line: number;
	char: number;
	length: number;
	type: number;
	modifiers: number;
}

/**
 * Decode the delta-encoded semantic tokens data into readable tuples.
 * Each token is encoded as 5 integers: [deltaLine, deltaChar, length, tokenType, modifiers].
 *
 * Token type reference (from server/lsp/semantic_tokens.go):
 *   0=namespace(path), 1=type(schema), 3=enum(status), 6=typeParameter(pathParam),
 *   8=variable($ref), 10=function(operationId), 11=method(HTTP), 12=macro(securityScheme),
 *   13=keyword(schemaType), 14=modifier(deprecated)
 */
export function decodeSemanticTokens(data: readonly number[]): DecodedToken[] {
	const tokens: DecodedToken[] = [];
	let line = 0;
	let char = 0;
	for (let i = 0; i + 4 < data.length; i += 5) {
		const deltaLine = data[i]!;
		const deltaChar = data[i + 1]!;
		line += deltaLine;
		char = deltaLine > 0 ? deltaChar : char + deltaChar;
		tokens.push({
			line,
			char,
			length: data[i + 2]!,
			type: data[i + 3]!,
			modifiers: data[i + 4]!,
		});
	}
	return tokens;
}

function pathDir(p: string): string {
	const n = p.replace(/\\/g, "/");
	const idx = n.lastIndexOf("/");
	if (idx === -1) return ".";
	const dir = n.slice(0, idx);
	return dir.length ? dir : ".";
}
