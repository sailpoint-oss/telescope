/**
 * E2E Tests: VS Code provider integration (document links + format)
 *
 * Definition, references, and navigation roundtrips live in `definition-flow.e2e.ts`
 * to avoid duplicating slow suiteSetup work.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	executeWithRetry,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
	waitForLanguageId,
	ensureWorkspaceTextDocumentMatches,
	waitForProviders,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

suite("Providers", () => {
	let api: ReturnType<typeof getTestApi>;
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
		await waitForProjectInfo(api, (i) => i.knownOpenAPIFiles > 0, {
			timeoutMs: 60000,
			uri: folder.uri,
		});

		const warmupUri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(warmupUri);
		await waitForDiagnostics(warmupUri, (d) => d.length > 0, {
			timeoutMs: 90000,
		});
		await waitForProviders(warmupUri);
	});

	test("Document links include $ref links", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const links = await executeWithRetry<vscode.DocumentLink[]>(
			"vscode.executeLinkProvider",
			[uri],
			(r) => r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(links && links.length > 0, "Expected at least one document link");
	});

	test("Format command is well-behaved for openapi-json documents", async () => {
		if (isMultiRootWorkspace()) return;
		// Generic JSON formatting is editor-owned after child-LSP removal. This
		// E2E test only verifies that invoking the format command on an
		// openapi-json document is well-behaved from the editor host's point of
		// view; concrete formatting semantics stay covered by server unit tests.
		const uri = vscode.Uri.joinPath(folder.uri, "format-e2e.json");
		const raw = await vscode.workspace.fs.readFile(uri);
		const content = Buffer.from(raw).toString("utf-8");
		assert.ok(
			!content.includes("\n"),
			"Fixture should be single-line minified JSON so format produces edits",
		);

		await openAndShow(uri);
		let doc = await waitForLanguageId(uri, "openapi-json", {
			timeoutMs: 30000,
		});
		doc = await ensureWorkspaceTextDocumentMatches(uri, content);
		await vscode.window.showTextDocument(doc);
		await waitForDiagnostics(uri, () => true, { timeoutMs: 15000 });

		assert.strictEqual(
			doc.languageId,
			"openapi-json",
			`Expected openapi-json, got ${doc.languageId}`,
		);
		assert.ok(
			!doc.getText().includes("\n"),
			"Buffer must stay minified single-line JSON (see workspace .vscode/settings.json)",
		);

		const edits = (await vscode.commands.executeCommand(
			"vscode.executeFormatDocumentProvider",
			uri,
			{ tabSize: 2, insertSpaces: true },
		)) as vscode.TextEdit[] | null | undefined;
		assert.ok(
			edits === undefined || edits === null || Array.isArray(edits),
			"Format command should return undefined/null or a TextEdit array",
		);
		if (Array.isArray(edits) && edits.length > 0) {
			const formatted = edits.map((edit) => edit.newText).join("");
			assert.notStrictEqual(formatted, content, "Format should update the document");
			assert.ok(formatted.includes("\n"), "JSON format should pretty-print with newlines");
			assert.ok(formatted.endsWith("\n"), "Format should normalize trailing newline");
		}

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});
});
