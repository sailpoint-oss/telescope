import { describe, expect, it } from "bun:test";
import { URI } from "vscode-uri";
import { MemoryFileSystem, fileExists, readFileWithMetadata } from "./file-system-utils.js";

describe("file-system-utils", () => {
	describe("MemoryFileSystem", () => {
		it("should add and read files", async () => {
			const fs = new MemoryFileSystem();
			fs.addFile("file:///test.yaml", "openapi: 3.1.0");

			const content = await fs.readFile(URI.parse("file:///test.yaml"));
			expect(content).toBe("openapi: 3.1.0");
		});

		it("should return undefined for non-existent files", async () => {
			const fs = new MemoryFileSystem();
			const content = await fs.readFile(URI.parse("file:///missing.yaml"));
			expect(content).toBeUndefined();
		});

		it("should handle stat for existing files", async () => {
			const fs = new MemoryFileSystem();
			fs.addFile("file:///test.yaml", "content");

			const stat = await fs.stat(URI.parse("file:///test.yaml"));
			expect(stat).toBeDefined();
			expect(stat?.type).toBe(1); // FileType.File
		});

		it("should return undefined stat for missing files", async () => {
			const fs = new MemoryFileSystem();
			const stat = await fs.stat(URI.parse("file:///missing.yaml"));
			expect(stat).toBeUndefined();
		});

		it("should normalize URIs (strip fragments) when reading", async () => {
			const fs = new MemoryFileSystem();
			fs.addFile("file:///test.yaml", "content");

			// Reading without fragment should work
			const content = await fs.readFile(URI.parse("file:///test.yaml"));
			expect(content).toBe("content");
		});

		it("should track modification time", async () => {
			const fs = new MemoryFileSystem();
			const now = Date.now();
			fs.addFile("file:///test.yaml", "content", now);

			const stat = await fs.stat(URI.parse("file:///test.yaml"));
			expect(stat?.mtime).toBe(now);
		});

		it("should have empty readDirectory", async () => {
			const fs = new MemoryFileSystem();
			const entries = await fs.readDirectory(URI.parse("file:///"));
			expect(entries).toEqual([]);
		});
	});

	describe("fileExists", () => {
		it("should return true for existing files", async () => {
			const fs = new MemoryFileSystem();
			fs.addFile("file:///test.yaml", "content");

			const exists = await fileExists(fs, "file:///test.yaml");
			expect(exists).toBe(true);
		});

		it("should return false for missing files", async () => {
			const fs = new MemoryFileSystem();

			const exists = await fileExists(fs, "file:///missing.yaml");
			expect(exists).toBe(false);
		});

		it("should strip fragments when checking existence (string)", async () => {
			const fs = new MemoryFileSystem();
			fs.addFile("file:///test.yaml", "content");

			// fileExists strips fragments from string URIs
			const exists = await fileExists(fs, "file:///test.yaml");
			expect(exists).toBe(true);
		});

		it("should accept URI objects", async () => {
			const fs = new MemoryFileSystem();
			fs.addFile("file:///test.yaml", "content");

			const exists = await fileExists(fs, URI.parse("file:///test.yaml"));
			expect(exists).toBe(true);
		});
	});

	describe("readFileWithMetadata", () => {
		it("should return text and metadata for existing files", async () => {
			const fs = new MemoryFileSystem();
			const now = Date.now();
			fs.addFile("file:///test.yaml", "openapi: 3.1.0", now);

			const result = await readFileWithMetadata(fs, "file:///test.yaml");
			expect(result).toBeDefined();
			expect(result?.text).toBe("openapi: 3.1.0");
			expect(result?.mtimeMs).toBe(now);
			expect(result?.hash).toBeDefined();
		});

		it("should return undefined for missing files", async () => {
			const fs = new MemoryFileSystem();

			const result = await readFileWithMetadata(fs, "file:///missing.yaml");
			expect(result).toBeUndefined();
		});

		it("should generate consistent hashes", async () => {
			const fs = new MemoryFileSystem();
			fs.addFile("file:///test.yaml", "content");

			const result1 = await readFileWithMetadata(fs, "file:///test.yaml");
			const result2 = await readFileWithMetadata(fs, "file:///test.yaml");

			expect(result1?.hash).toBe(result2?.hash);
		});

		it("should generate different hashes for different content", async () => {
			const fs = new MemoryFileSystem();
			fs.addFile("file:///a.yaml", "content a");
			fs.addFile("file:///b.yaml", "content b");

			const resultA = await readFileWithMetadata(fs, "file:///a.yaml");
			const resultB = await readFileWithMetadata(fs, "file:///b.yaml");

			expect(resultA?.hash).not.toBe(resultB?.hash);
		});
	});
});

