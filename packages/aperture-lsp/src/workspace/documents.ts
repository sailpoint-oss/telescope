import type { IScriptSnapshot } from "@volar/language-core";
import type { DocumentTypeCache } from "lens";
import { computeDocumentHash } from "shared/hash-utils";

export interface ReadResult {
  text: string;
  hash: string;
  mtimeMs: number;
}

export interface OpenApiDocumentRecord extends ReadResult {
  readonly uri: string;
  readonly languageId: string;
  readonly version: number;
  readonly snapshot: IScriptSnapshot;
}

export class OpenAPIDocumentStore {
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
    snapshot: IScriptSnapshot
  ): OpenApiDocumentRecord {
    const text = snapshot.getText(0, snapshot.getLength());
    const hash = computeDocumentHash(text);
    const previous = this.documents.get(uri);
    const hasContentChanged = !previous || previous.hash !== hash;
    const previousVersion =
      typeof previous?.version === "number" ? previous.version : -1;
    const version = hasContentChanged
      ? previousVersion + 1
      : Math.max(previousVersion, 0);
    const record: OpenApiDocumentRecord = {
      uri,
      languageId: previous?.languageId ?? "",
      version,
      snapshot,
      text,
      hash,
      mtimeMs: Date.now(),
    };
    this.persist(uri, record, previous);
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
    previous: OpenApiDocumentRecord | undefined
  ): void {
    this.documents.set(uri, record);
    if (!previous || previous.hash !== record.hash) {
      this.cache.invalidate(uri);
    }
  }
}
