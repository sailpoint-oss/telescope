/**
 * Tests for fenced code blocks in OpenAPI YAML Markdown
 */
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import type { IGrammar } from "vscode-textmate";
import {
	findToken,
	findTokensWithScope,
	getOpenAPIGrammar,
	hasScope,
	tokenizeLines,
} from "./setup";

describe("Fenced Code Blocks", () => {
	let grammar: IGrammar;

	beforeAll(async () => {
		grammar = await getOpenAPIGrammar();
	});

	describe("Code Block Delimiters", () => {
		it("highlights opening fence", () => {
			const lines = ["description: |", "  ```", "  code", "  ```"];
			const allTokens = tokenizeLines(grammar, lines);
			const fenceToken = findToken(allTokens[1], "```");
			expect(fenceToken).toBeDefined();
			if (!fenceToken) {
				throw new Error("Fence token not found");
			}
			expect(hasScope(fenceToken, "punctuation.definition.markdown")).toBe(
				true,
			);
		});

		it("highlights closing fence", () => {
			const lines = ["description: |", "  ```", "  code", "  ```"];
			const allTokens = tokenizeLines(grammar, lines);
			const fenceToken = findToken(allTokens[3], "```");
			expect(fenceToken).toBeDefined();
			if (!fenceToken) {
				throw new Error("Fence token not found");
			}
			expect(hasScope(fenceToken, "punctuation.definition.markdown")).toBe(
				true,
			);
		});

		it("wraps code block in fenced_code scope", () => {
			const lines = ["description: |", "  ```", "  code", "  ```"];
			const allTokens = tokenizeLines(grammar, lines);
			const fencedTokens = findTokensWithScope(
				allTokens[1],
				"markup.fenced_code",
			);
			expect(fencedTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Language Identifier", () => {
		it("highlights language identifier", () => {
			const lines = [
				"description: |",
				"  ```typescript",
				"  const x = 1;",
				"  ```",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const langToken = findToken(allTokens[1], "typescript");
			expect(langToken).toBeDefined();
			if (!langToken) {
				throw new Error("Language token not found");
			}
			expect(hasScope(langToken, "fenced_code.block.language")).toBe(true);
		});

		it("highlights js language identifier", () => {
			const lines = ["description: |", "  ```js", "  const x = 1;", "  ```"];
			const allTokens = tokenizeLines(grammar, lines);
			const langToken = findToken(allTokens[1], "js");
			expect(langToken).toBeDefined();
			if (!langToken) {
				throw new Error("Language token not found");
			}
			expect(hasScope(langToken, "fenced_code.block.language")).toBe(true);
		});

		it("highlights python language identifier", () => {
			const lines = ["description: |", "  ```python", "  x = 1", "  ```"];
			const allTokens = tokenizeLines(grammar, lines);
			const langToken = findToken(allTokens[1], "python");
			expect(langToken).toBeDefined();
			if (!langToken) {
				throw new Error("Language token not found");
			}
			expect(hasScope(langToken, "fenced_code.block.language")).toBe(true);
		});

		it("highlights json language identifier", () => {
			const lines = [
				"description: |",
				"  ```json",
				'  {"key": "value"}',
				"  ```",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const langToken = findToken(allTokens[1], "json");
			expect(langToken).toBeDefined();
			if (!langToken) {
				throw new Error("Language token not found");
			}
			expect(hasScope(langToken, "fenced_code.block.language")).toBe(true);
		});

		it("highlights bash language identifier", () => {
			const lines = ["description: |", "  ```bash", '  echo "hello"', "  ```"];
			const allTokens = tokenizeLines(grammar, lines);
			const langToken = findToken(allTokens[1], "bash");
			expect(langToken).toBeDefined();
			if (!langToken) {
				throw new Error("Language token not found");
			}
			expect(hasScope(langToken, "fenced_code.block.language")).toBe(true);
		});

		it("highlights shell language identifier", () => {
			const lines = ["description: |", "  ```shell", "  ls -la", "  ```"];
			const allTokens = tokenizeLines(grammar, lines);
			const langToken = findToken(allTokens[1], "shell");
			expect(langToken).toBeDefined();
			if (!langToken) {
				throw new Error("Language token not found");
			}
			expect(hasScope(langToken, "fenced_code.block.language")).toBe(true);
		});
	});

	describe("Various Languages", () => {
		const languages = [
			"typescript",
			"javascript",
			"ts",
			"js",
			"python",
			"py",
			"json",
			"yaml",
			"bash",
			"shell",
			"sh",
			"go",
			"java",
			"csharp",
			"cs",
			"ruby",
			"rb",
			"php",
			"rust",
			"swift",
			"kotlin",
			"sql",
			"html",
			"css",
			"xml",
		];

		languages.forEach((lang) => {
			it(`recognizes ${lang} code block`, () => {
				const lines = ["description: |", `  \`\`\`${lang}`, "  code", "  ```"];
				const allTokens = tokenizeLines(grammar, lines);
				const langToken = findToken(allTokens[1], lang);
				expect(langToken).toBeDefined();
				if (!langToken) {
					throw new Error("Language token not found");
				}
				expect(hasScope(langToken, "fenced_code.block.language")).toBe(true);
			});
		});
	});

	describe("Code Block Content", () => {
		it("marks content as raw block", () => {
			const lines = ["description: |", "  ```", "  raw content", "  ```"];
			const allTokens = tokenizeLines(grammar, lines);
			const rawTokens = findTokensWithScope(
				allTokens[2],
				"markup.raw.block.fenced",
			);
			expect(rawTokens.length).toBeGreaterThan(0);
		});

		it("handles multi-line code content", () => {
			const lines = [
				"description: |",
				"  ```typescript",
				"  const a = 1;",
				"  const b = 2;",
				"  const c = a + b;",
				"  ```",
			];
			const allTokens = tokenizeLines(grammar, lines);

			// All code lines should have raw block scope
			for (let i = 2; i < 5; i++) {
				const rawTokens = findTokensWithScope(allTokens[i], "markup.raw");
				expect(rawTokens.length).toBeGreaterThan(0);
			}
		});

		it("handles empty code block", () => {
			const lines = ["description: |", "  ```typescript", "  ```"];
			const allTokens = tokenizeLines(grammar, lines);
			expect(allTokens.length).toBe(3);
		});
	});

	describe("Code Block Without Language", () => {
		it("handles code block without language", () => {
			const lines = ["description: |", "  ```", "  plain code", "  ```"];
			const allTokens = tokenizeLines(grammar, lines);
			const fencedTokens = findTokensWithScope(
				allTokens[1],
				"markup.fenced_code",
			);
			expect(fencedTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Indented Code Blocks", () => {
		it("handles indented code block in description", () => {
			const lines = [
				"description: |",
				"  Example:",
				"  ",
				"  ```typescript",
				'  const response = await fetch("/api");',
				"  ```",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const fencedTokens = findTokensWithScope(
				allTokens[3],
				"markup.fenced_code",
			);
			expect(fencedTokens.length).toBeGreaterThan(0);
		});

		it("handles deeply nested indentation", () => {
			const lines = [
				"paths:",
				"  /users:",
				"    get:",
				"      description: |",
				"        Get all users.",
				"        ",
				"        ```json",
				'        {"users": []}',
				"        ```",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const langToken = findToken(allTokens[6], "json");
			expect(langToken).toBeDefined();
		});
	});

	describe("Multiple Code Blocks", () => {
		it("handles multiple code blocks in same description", () => {
			const lines = [
				"description: |",
				"  First example:",
				"  ```typescript",
				"  const a = 1;",
				"  ```",
				"  ",
				"  Second example:",
				"  ```python",
				"  a = 1",
				"  ```",
			];
			const allTokens = tokenizeLines(grammar, lines);

			// Check first code block
			const tsToken = findToken(allTokens[2], "typescript");
			expect(tsToken).toBeDefined();

			// Check second code block
			const pyToken = findToken(allTokens[7], "python");
			expect(pyToken).toBeDefined();
		});
	});

	describe("Code Block Edge Cases", () => {
		it("handles code block with special characters in language", () => {
			const lines = ["description: |", "  ```c++", "  int main() {}", "  ```"];
			const allTokens = tokenizeLines(grammar, lines);
			// c++ should be captured (or at least c)
			const fencedTokens = findTokensWithScope(
				allTokens[1],
				"markup.fenced_code",
			);
			expect(fencedTokens.length).toBeGreaterThan(0);
		});

		it("handles code block with dashes in language", () => {
			const lines = [
				"description: |",
				"  ```objective-c",
				"  // code",
				"  ```",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const fencedTokens = findTokensWithScope(
				allTokens[1],
				"markup.fenced_code",
			);
			expect(fencedTokens.length).toBeGreaterThan(0);
		});

		it("handles code block content with backticks inside", () => {
			const lines = [
				"description: |",
				"  ```typescript",
				// biome-ignore lint/suspicious/noTemplateCurlyInString: false positive
				"  const template = `Hello ${name}`;",
				"  ```",
			];
			const allTokens = tokenizeLines(grammar, lines);
			// Should still be inside the code block
			const rawTokens = findTokensWithScope(allTokens[2], "markup.raw");
			expect(rawTokens.length).toBeGreaterThan(0);
		});

		it("handles code block with triple backticks inside as string", () => {
			const lines = [
				"description: |",
				"  ```javascript",
				'  const md = "```js\\ncode\\n```";',
				"  ```",
			];
			const allTokens = tokenizeLines(grammar, lines);
			// Should handle this without breaking
			expect(allTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Real-World Examples", () => {
		it("handles typical API request example", () => {
			const lines = [
				"description: |",
				"  ## Example Request",
				"  ",
				"  ```bash",
				'  curl -X GET "https://api.example.com/users" \\',
				'    -H "Authorization: Bearer token"',
				"  ```",
			];
			const allTokens = tokenizeLines(grammar, lines);

			// Check heading
			expect(
				findTokensWithScope(allTokens[1], "heading.2").length,
			).toBeGreaterThan(0);

			// Check code block
			const bashToken = findToken(allTokens[3], "bash");
			expect(bashToken).toBeDefined();
		});

		it("handles JSON response example", () => {
			const lines = [
				"description: |",
				"  ## Response",
				"  ",
				"  ```json",
				"  {",
				'    "id": 1,',
				'    "name": "John Doe"',
				"  }",
				"  ```",
			];
			const allTokens = tokenizeLines(grammar, lines);

			const jsonToken = findToken(allTokens[3], "json");
			expect(jsonToken).toBeDefined();
		});

		it("handles TypeScript SDK example", () => {
			const lines = [
				"description: |",
				"  ## TypeScript SDK",
				"  ",
				"  ```typescript",
				'  import { Client } from "@example/sdk";',
				"  ",
				"  const client = new Client({",
				"    apiKey: process.env.API_KEY,",
				"  });",
				"  ",
				"  const users = await client.users.list();",
				"  ```",
			];
			const allTokens = tokenizeLines(grammar, lines);

			const tsToken = findToken(allTokens[3], "typescript");
			expect(tsToken).toBeDefined();
		});
	});
});
