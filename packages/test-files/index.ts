import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const TEST_FILES_DIR = new URL("./", import.meta.url);

export interface TestFile {
	name: string;
	relativePath: string;
	absolutePath: string;
}

/**
 * List all root-level test files (excluding version directories)
 */
export async function listTestFiles(): Promise<TestFile[]> {
	const dirPath = TEST_FILES_DIR;
	const rootPath = dirPath.pathname;
	const entries = await readdir(rootPath, { withFileTypes: true });

	const files: TestFile[] = [];
	for (const entry of entries) {
		if (entry.isDirectory()) continue;
		const relativePath = entry.name;
		files.push({
			name: entry.name,
			relativePath,
			absolutePath: join(rootPath, relativePath),
		});
	}
	return files.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read a test file from the root directory
 */
export async function readTestFile(name: string): Promise<string> {
	const filePath = join(TEST_FILES_DIR.pathname, name);
	return readFile(filePath, "utf8");
}

/**
 * Read a file from a version directory (e.g., v1/paths/pets.yaml)
 */
export async function readVersionFile(versionPath: string): Promise<string> {
	const filePath = join(TEST_FILES_DIR.pathname, versionPath);
	return readFile(filePath, "utf8");
}

// Legacy exports for backward compatibility
export interface ExampleFile extends TestFile {}
export async function listExamples(): Promise<ExampleFile[]> {
	return listTestFiles();
}
export async function readExample(name: string): Promise<string> {
	return readTestFile(name);
}
