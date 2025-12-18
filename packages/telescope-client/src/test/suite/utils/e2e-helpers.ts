import * as assert from "assert";
import * as vscode from "vscode";

export interface TelescopeTestApi {
	waitForSessionsRunning: (timeoutMs?: number) => Promise<void>;
	getSessionStates: () => Array<{ folder: string; state: string }>;
	getProjectInfo: (uri?: vscode.Uri) => Promise<{
		knownOpenAPIFiles: number;
		rootDocuments: number;
		hasClientFileList: boolean;
		workspacePath: string | null;
		cachedDocuments: number;
	} | null>;
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

export async function waitForProjectInfo(
	api: TelescopeTestApi,
	predicate: (info: NonNullable<Awaited<ReturnType<TelescopeTestApi["getProjectInfo"]>>>) => boolean,
	options?: { timeoutMs?: number; intervalMs?: number; uri?: vscode.Uri },
): Promise<NonNullable<Awaited<ReturnType<TelescopeTestApi["getProjectInfo"]>>>> {
	const timeoutMs = options?.timeoutMs ?? 60000;
	const intervalMs = options?.intervalMs ?? 200;
	const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;
	const uri = options?.uri ?? defaultUri;
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const info = await withTimeout(api.getProjectInfo(uri), 5000).catch(() => null);
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
		const timer = setTimeout(() => {
			sub.dispose();
			reject(new Error(`Timeout waiting for diagnostics after ${timeoutMs}ms`));
		}, timeoutMs);

		const sub = vscode.languages.onDidChangeDiagnostics((e) => {
			if (!e.uris.some((u) => u.toString() === uri.toString())) return;
			const next = vscode.languages.getDiagnostics(uri);
			if (predicate(next)) {
				clearTimeout(timer);
				sub.dispose();
				resolve(next);
			}
		});
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

export function isMultiRootWorkspace(): boolean {
	// Prefer explicit runner mode (reliable in @vscode/test-electron), then fall back to folder count.
	if (process.env.TELESCOPE_E2E_MODE === "multi") return true;
	return (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
}

export async function delay(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			p,
			new Promise<T>((_, reject) => {
				timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function pathDir(p: string): string {
	const idx = p.lastIndexOf("/");
	if (idx === -1) return ".";
	const dir = p.slice(0, idx);
	return dir.length ? dir : ".";
}


