import * as assert from "assert";
import * as vscode from "vscode";

export interface TelescopeTestApi {
	waitForSessionsRunning: (timeoutMs?: number) => Promise<void>;
	getSessionStates: () => Array<{ folder: string; state: string }>;
	getProjectInfo: (uri?: vscode.Uri) => {
		knownOpenAPIFiles: number;
		workspacePath: string | null;
	} | null;
	getClientOpenApiFileCount: (uri?: vscode.Uri) => number;
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

export async function openAndShow(uri: vscode.Uri): Promise<vscode.TextDocument> {
	const doc = await vscode.workspace.openTextDocument(uri);
	await vscode.window.showTextDocument(doc);
	return doc;
}

export async function writeWorkspaceFile(
	relativePath: string,
	contents: string,
): Promise<vscode.Uri> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	assert.ok(folder, "Should have a workspace folder");
	const uri = vscode.Uri.joinPath(folder.uri, relativePath);
	await vscode.workspace.fs.createDirectory(
		vscode.Uri.joinPath(folder.uri, pathDir(relativePath)),
	);
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
	const delayMs = options?.delayMs ?? 1000;
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
		"openapi/custom-openapi-invalid.yaml",
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

function pathDir(p: string): string {
	const idx = p.lastIndexOf("/");
	if (idx === -1) return ".";
	const dir = p.slice(0, idx);
	return dir.length ? dir : ".";
}
