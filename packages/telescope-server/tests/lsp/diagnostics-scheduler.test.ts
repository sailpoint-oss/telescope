import { expect, test } from "bun:test";
import { pathToFileURL } from "node:url";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import { resolveLintingContext } from "../../src/engine/context/context-resolver.js";
import { MemoryFileSystem } from "../../src/engine/utils/file-system-utils.js";
import { DiagnosticsScheduler } from "../../src/lsp/services/diagnostics-scheduler.js";

test("DiagnosticsScheduler caches document diagnostics using resultId/contentHash", async () => {
	const scheduler = new DiagnosticsScheduler();
	const fs = new MemoryFileSystem();

	const uri = pathToFileURL("/workspace/api.yaml").toString();
	fs.addFile(
		uri,
		"openapi: 3.1.0\ninfo:\n  title: X\n  version: 1.0.0\npaths: {}\n",
	);

	const first = await scheduler.getOrComputeDocumentDiagnostics({
		uri,
		previousResultId: undefined,
		fileSystem: fs,
		compute: async () => [
			{
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 1 },
				},
				message: "hello",
				severity: DiagnosticSeverity.Warning,
			},
		],
	});

	expect(first.kind).toBe("full");
	if (first.kind === "full") {
		expect(first.resultId).toBeTruthy();
		expect(first.items.length).toBe(1);
	}

	const second = await scheduler.getOrComputeDocumentDiagnostics({
		uri,
		previousResultId: first.kind === "full" ? first.resultId : undefined,
		fileSystem: fs,
		compute: async () => {
			throw new Error("should not recompute");
		},
	});

	expect(second.kind).toBe("unchanged");
});

test("DiagnosticsScheduler invalidates root snapshots when a referenced document changes", async () => {
	const scheduler = new DiagnosticsScheduler();
	const fs = new MemoryFileSystem();

	const rootUri = pathToFileURL("/workspace/api.yaml").toString();

	fs.addFile(
		rootUri,
		"openapi: 3.1.0\ninfo:\n  title: X\n  version: 1.0.0\npaths: {}\n",
	);

	const resolveContext = async () =>
		await resolveLintingContext(rootUri, fs, [
			pathToFileURL("/workspace").toString(),
		]);

	const snap1 = await scheduler.getOrComputeRootDiagnostics({
		rootUri,
		rulesSignature: "none",
		fileSystem: fs,
		resolveContext,
		rules: [],
		toLspDiagnostic: (d) => ({
			message: d.message,
			range: d.range,
			severity: d.severity,
			source: d.source ?? "telescope",
			code: d.code,
		}),
		compareDiagnostics: (a, b) =>
			a.range.start.line - b.range.start.line ||
			a.range.start.character - b.range.start.character,
	});

	// Modify root content and invalidate
	fs.addFile(
		rootUri,
		"openapi: 3.1.0\ninfo:\n  title: Y\n  version: 1.0.0\npaths: {}\n",
	);
	scheduler.invalidateForDocument(rootUri);

	const snap2 = await scheduler.getOrComputeRootDiagnostics({
		rootUri,
		rulesSignature: "none",
		fileSystem: fs,
		resolveContext,
		rules: [],
		toLspDiagnostic: (d) => ({
			message: d.message,
			range: d.range,
			severity: d.severity,
			source: d.source ?? "telescope",
			code: d.code,
		}),
		compareDiagnostics: (a, b) =>
			a.range.start.line - b.range.start.line ||
			a.range.start.character - b.range.start.character,
	});

	expect(snap2.projectHash).not.toEqual(snap1.projectHash);
});
