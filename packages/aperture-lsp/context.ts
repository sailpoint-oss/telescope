import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import type { LanguageServer } from "@volar/language-server";
import type { VfsHost } from "host";
import type { LintConfig, ResolvedRule } from "lens";
import { DocumentTypeCache, materializeRules, resolveConfig } from "lens";
import type { URI } from "vscode-uri";
import { URI as Uri } from "vscode-uri";
import { OpenApiDocumentStore } from "./documents.js";
import { createSnapshotHost } from "./host.js";
import { VolarFileSystemHost } from "./volar-fs-host.js";

export interface DiagnosticsLogger {
	log(message: string): void;
	error(message: string): void;
	warn?(message: string): void;
}

export class ApertureVolarContext {
	readonly documentCache = new DocumentTypeCache();
	readonly documents = new OpenApiDocumentStore(this.documentCache);
	readonly host: VfsHost;

	private logger: DiagnosticsLogger;
	private config: LintConfig;
	private resolvedRules: ResolvedRule[];
	private workspaceFolderUris: string[] = [];
	private workspaceFolderPaths: string[] = [];
	private entrypointUris: string[] = [];

	constructor(logger: DiagnosticsLogger = console, server?: LanguageServer) {
		this.logger = logger;
		this.config = resolveConfig();
		this.resolvedRules = materializeRules(this.config);

		// Create host chain: SnapshotHost wraps VolarFileSystemHost if server provided
		if (server) {
			const volarFsHost = new VolarFileSystemHost(server, server.fileSystem);
			this.host = createSnapshotHost(this.documents, volarFsHost);
		} else {
			this.host = createSnapshotHost(this.documents);
		}

		this.entrypointUris = this.computeEntrypoints();
	}

	setLogger(logger: DiagnosticsLogger): void {
		this.logger = logger;
	}

	getLogger(): DiagnosticsLogger {
		return this.logger;
	}

	getHost(): VfsHost {
		return this.host;
	}

	setWorkspaceFolders(folders: URI[]): void {
		this.workspaceFolderUris = folders.map((folder) => folder.toString());
		this.workspaceFolderPaths = folders
			.map((folder) => {
				try {
					return folder.fsPath;
				} catch {
					return Uri.parse(folder.toString()).fsPath;
				}
			})
			.filter(Boolean);
		this.entrypointUris = this.computeEntrypoints();
	}

	getWorkspaceFolders(): string[] {
		return this.workspaceFolderUris;
	}

	getEntrypointUris(): string[] {
		return this.entrypointUris;
	}

	getResolvedRules(): ResolvedRule[] {
		return this.resolvedRules;
	}

	getRuleImplementations(): ResolvedRule["rule"][] {
		return this.resolvedRules.map((resolved) => resolved.rule);
	}

	reloadConfiguration(): void {
		this.config = resolveConfig();
		this.resolvedRules = materializeRules(this.config);
		this.entrypointUris = this.computeEntrypoints();
	}

	private computeEntrypoints(): string[] {
		const entries = this.config.entrypoints ?? [];
		const resolved: string[] = [];
		for (const entry of entries) {
			const uri = this.resolveEntrypointUri(entry);
			if (uri) {
				resolved.push(uri);
			}
		}
		return resolved;
	}

	private resolveEntrypointUri(entry: string): string | null {
		if (!entry) return null;
		if (entry.startsWith("file://")) {
			return entry;
		}
		for (const base of this.workspaceFolderPaths.length
			? this.workspaceFolderPaths
			: [process.cwd()]) {
			const candidate = resolvePath(base, entry);
			if (existsSync(candidate)) {
				return pathToFileURL(candidate).toString();
			}
		}
		if (existsSync(entry)) {
			return pathToFileURL(entry).toString();
		}
		return null;
	}
}
