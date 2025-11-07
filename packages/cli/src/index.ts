import {
	resolve as resolvePath,
	isAbsolute as pathIsAbsolute,
} from "node:path";
import { pathToFileURL } from "node:url";
import { NodeHost, CachedVfsHost } from "host";
import { loadDocument } from "loader";
import type { Diagnostic } from "engine";
import {
	resolveConfig,
	materializeRules,
	resolveLintingContext,
	ProjectContextCache,
	DocumentTypeCache,
	lintDocument,
} from "lens";
import { identifyDocumentType, isRootDocument } from "loader";
import { formatters } from "./formatters";

interface LintOptions {
	cache?: boolean;
	watch?: boolean;
}

export async function lint(
	entrypoints: string[],
	options: LintOptions = {},
): Promise<{
	diagnostics: Diagnostic[];
	fixes: Diagnostic[];
}> {
	// Create host with optional caching
	const nodeHost = new NodeHost();
	const host = options.cache ? new CachedVfsHost(nodeHost) : nodeHost;

	const config = resolveConfig();
	const inputs = entrypoints.length ? entrypoints : config.entrypoints;

	// Create caches for project context reuse
	const documentCache = new DocumentTypeCache();
	const projectCache = options.cache ? new ProjectContextCache() : undefined;

	// Collect all entrypoint URIs
	const uriSet = new Set<string>();
	for (const input of inputs) {
		if (/[!*?\[\]]/.test(input)) {
			const matches = await host.glob([input]);
			matches.forEach((match) => uriSet.add(match));
			continue;
		}
		const uri = input.startsWith("file://")
			? input
			: pathToFileURL(
					pathIsAbsolute(input) ? input : resolvePath(process.cwd(), input),
				).toString();
		uriSet.add(uri);
	}

	// Group entrypoints by root document to reuse project contexts
	const rootToEntrypoints = new Map<string, string[]>();
	const entrypointToRoot = new Map<string, string>();

	// First pass: identify root documents
	for (const uri of uriSet) {
		try {
			const doc = await loadDocument({ host, uri });
			const docType = identifyDocumentType(doc.ast);
			if (docType === "unknown") {
				continue;
			}

			if (isRootDocument(doc.ast)) {
				// This is a root document
				if (!rootToEntrypoints.has(uri)) {
					rootToEntrypoints.set(uri, []);
				}
				rootToEntrypoints.get(uri)!.push(uri);
				entrypointToRoot.set(uri, uri);
			} else {
				// Partial document - resolve its root
				const context = await resolveLintingContext(
					uri,
					host,
					[],
					[],
					documentCache,
					projectCache,
				);
				if (context.mode === "project-aware" && context.rootUris?.[0]) {
					const rootUri = context.rootUris[0];
					if (!rootToEntrypoints.has(rootUri)) {
						rootToEntrypoints.set(rootUri, []);
					}
					rootToEntrypoints.get(rootUri)!.push(uri);
					entrypointToRoot.set(uri, rootUri);
				} else {
					// Fragment mode - lint individually
					rootToEntrypoints.set(uri, [uri]);
					entrypointToRoot.set(uri, uri);
				}
			}
		} catch (e) {
			// Will be handled in linting phase
		}
	}

	// Lint all entrypoints, reusing project contexts
	const allDiagnostics: Diagnostic[] = [];
	const allFixes: Diagnostic[] = [];
	const resolvedRules = materializeRules(config);

	for (const [rootUri, entrypointUris] of rootToEntrypoints) {
		// Resolve context for root (will use cache if available)
		const context = await resolveLintingContext(
			rootUri,
			host,
			[],
			[],
			documentCache,
			projectCache,
		);

		// Always use lintDocument() - it handles fragment mode internally
		for (const entrypointUri of entrypointUris) {
			const result = await lintDocument(
				context,
				host,
				resolvedRules.map((r) => r.rule),
			);
			// Filter diagnostics for this entrypoint
			const entrypointDiagnostics = result.diagnostics.filter(
				(d) => d.uri === entrypointUri,
			);
			allDiagnostics.push(...entrypointDiagnostics);
			allFixes.push(...result.fixes);
		}
	}

	if (options.watch) {
		// Set up file watching
		const watchedUris = Array.from(uriSet);
		const unwatch = host.watch(watchedUris, async (changedUri) => {
			console.log(`\nFile changed: ${changedUri}`);
			// Invalidate caches
			if (projectCache) {
				projectCache.invalidateForDocument(changedUri);
			}
			documentCache.invalidate(changedUri);

			// Re-lint
			const result = await lint(entrypoints, options);
			const formatter = formatters[options.format ?? "stylish"] ?? formatters.stylish;
			const output = formatter(result.diagnostics);
			process.stdout.write("\n" + output + "\n");
		});

		// Keep process alive
		process.on("SIGINT", () => {
			unwatch();
			process.exit(0);
		});

		console.log(`Watching ${watchedUris.length} file(s)...`);
		// Don't return - keep watching
		return new Promise(() => {
			// Never resolves - keeps process alive
		});
	}

	return {
		diagnostics: allDiagnostics,
		fixes: allFixes,
	};
}
