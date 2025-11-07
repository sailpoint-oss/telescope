# Host — Virtual filesystem adapters

Host abstracts file I/O for the rest of Telescope so the pipeline can operate on URIs instead of tightly coupling to Node or VS Code APIs.

## Interface

```ts
export interface VfsHost {
  read(uri: string): Promise<{ text: string; mtimeMs: number; hash: string }>;
  exists(uri: string): Promise<boolean>;
  glob(patterns: string[]): Promise<string[]>;
  watch(uris: string[], onChange: (uri: string) => void): () => void;
  resolve(fromUri: string, ref: string): string;
}
```

The `hash` returned by `read` is used to short-circuit reprocessing unchanged documents.

## Implementations

- `NodeHost`
  - Uses Bun/Node file system APIs and `fast-glob`
  - Powers the CLI by resolving entrypoints, walking the file system, and watching files when needed
- `LspHost`
  - Wraps VS Code `TextDocuments` and `chokidar`
  - Supports in-memory edits and workspace file changes for the language server

## Tips

- Use `resolve(fromUri, ref)` to normalize relative `$ref` values to absolute URIs before passing them to the loader.
- The watch callback returns an unsubscribe function; remember to dispose it when shutting down to avoid leaks.
- Additional hosts (e.g. git-backed or HTTP-based) can be added by fulfilling the `VfsHost` contract.


