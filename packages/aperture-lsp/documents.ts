import crypto from "node:crypto";
import { extname } from "node:path";
import type { IScriptSnapshot } from "@volar/language-core";
import type { ReadResult } from "host";
import type { DocumentTypeCache } from "lens";

export interface SnapshotLike {
	readonly uri: string;
	readonly languageId: string;
	readonly version: number;
	getSnapshot(): IScriptSnapshot;
}

export interface OpenApiDocumentRecord extends ReadResult {
	readonly uri: string;
	readonly languageId: string;
	readonly version: number;
	readonly snapshot: IScriptSnapshot;
}

function inferLanguageIdFromUri(uri: string): string {
	const extension = extname(uri).toLowerCase();
	if (extension === ".yaml" || extension === ".yml") return "yaml";
	if (extension === ".json") return "json";
	return "yaml";
}

export class OpenApiDocumentStore {
	private readonly documents = new Map<string, OpenApiDocumentRecord>();

	constructor(private readonly cache: DocumentTypeCache) {}

	get(uri: string): OpenApiDocumentRecord | undefined {
		return this.documents.get(uri);
	}

	entries(): IterableIterator<OpenApiDocumentRecord> {
		return this.documents.values();
	}

	delete(uri: string): void {
		if (this.documents.delete(uri)) {
			this.cache.invalidate(uri);
		}
	}

	clear(): void {
		this.documents.clear();
		this.cache.clear();
	}

	updateFromSnapshot(
		uri: string,
		languageId: string | undefined,
		snapshot: IScriptSnapshot,
	): OpenApiDocumentRecord {
		const text = snapshot.getText(0, snapshot.getLength());
		const hash = crypto.createHash("sha1").update(text).digest("hex");
		const previous = this.documents.get(uri);
		const version = previous?.version ?? Date.now();
		const record: OpenApiDocumentRecord = {
			uri,
			languageId:
				languageId ?? previous?.languageId ?? inferLanguageIdFromUri(uri),
			version,
			snapshot,
			text,
			hash,
			mtimeMs: Date.now(),
		};
		this.persist(uri, record, previous);
		return record;
	}

	updateFromDocument(document: SnapshotLike): OpenApiDocumentRecord {
		const snapshot = document.getSnapshot();
		const text = snapshot.getText(0, snapshot.getLength());
		const hash = crypto.createHash("sha1").update(text).digest("hex");
		const previous = this.documents.get(document.uri);
		const record: OpenApiDocumentRecord = {
			uri: document.uri,
			languageId: document.languageId,
			version: document.version,
			snapshot,
			text,
			hash,
			mtimeMs: Date.now(),
		};
		this.persist(document.uri, record, previous);
		return record;
	}

	asReadResult(uri: string): ReadResult | undefined {
		const record = this.documents.get(uri);
		if (!record) return undefined;
		const { text, hash, mtimeMs } = record;
		return { text, hash, mtimeMs };
	}

	private persist(
		uri: string,
		record: OpenApiDocumentRecord,
		previous: OpenApiDocumentRecord | undefined,
	): void {
		this.documents.set(uri, record);
		if (!previous || previous.hash !== record.hash) {
			this.cache.invalidate(uri);
		}
	}
}
