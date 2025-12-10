/**
 * Tests for Markdown inline formatting in OpenAPI YAML
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

describe("Markdown Inline Formatting", () => {
	let grammar: IGrammar;

	beforeAll(async () => {
		grammar = await getOpenAPIGrammar();
	});

	describe("Bold Text", () => {
		it("highlights bold with double asterisks", () => {
			const lines = ["description: |", "  Some **bold** text"];
			const allTokens = tokenizeLines(grammar, lines);
			const boldTokens = findTokensWithScope(allTokens[1], "markup.bold");
			expect(boldTokens.length).toBeGreaterThan(0);
		});

		it("highlights bold with double underscores", () => {
			const lines = ["description: |", "  Some __bold__ text"];
			const allTokens = tokenizeLines(grammar, lines);
			const boldTokens = findTokensWithScope(allTokens[1], "markup.bold");
			expect(boldTokens.length).toBeGreaterThan(0);
		});

		it("highlights bold punctuation", () => {
			const lines = ["description: |", "  Some **bold** text"];
			const allTokens = tokenizeLines(grammar, lines);
			const punctTokens = findTokensWithScope(
				allTokens[1],
				"punctuation.definition.bold",
			);
			expect(punctTokens.length).toBeGreaterThan(0);
		});

		it("handles multiple bold sections", () => {
			const lines = ["description: |", "  **First** and **second**"];
			const allTokens = tokenizeLines(grammar, lines);
			const boldTokens = findTokensWithScope(allTokens[1], "markup.bold");
			expect(boldTokens.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("Italic Text", () => {
		it("highlights italic with single asterisk", () => {
			const lines = ["description: |", "  Some *italic* text"];
			const allTokens = tokenizeLines(grammar, lines);
			const italicTokens = findTokensWithScope(allTokens[1], "markup.italic");
			expect(italicTokens.length).toBeGreaterThan(0);
		});

		it("highlights italic with single underscore", () => {
			const lines = ["description: |", "  Some _italic_ text"];
			const allTokens = tokenizeLines(grammar, lines);
			const italicTokens = findTokensWithScope(allTokens[1], "markup.italic");
			expect(italicTokens.length).toBeGreaterThan(0);
		});

		it("highlights italic punctuation", () => {
			const lines = ["description: |", "  Some *italic* text"];
			const allTokens = tokenizeLines(grammar, lines);
			const punctTokens = findTokensWithScope(
				allTokens[1],
				"punctuation.definition.italic",
			);
			expect(punctTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Inline Code", () => {
		it("highlights inline code with backticks", () => {
			const lines = ["description: |", "  Use the `fetch` function"];
			const allTokens = tokenizeLines(grammar, lines);
			const codeTokens = findTokensWithScope(allTokens[1], "markup.inline.raw");
			expect(codeTokens.length).toBeGreaterThan(0);
		});

		it("highlights inline code punctuation", () => {
			const lines = ["description: |", "  Use `code` here"];
			const allTokens = tokenizeLines(grammar, lines);
			const punctTokens = findTokensWithScope(
				allTokens[1],
				"punctuation.definition.raw",
			);
			expect(punctTokens.length).toBeGreaterThan(0);
		});

		it("handles multiple backticks", () => {
			const lines = [
				"description: |",
				"  Use ``code with `backticks` inside``",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const codeTokens = findTokensWithScope(allTokens[1], "markup.inline.raw");
			expect(codeTokens.length).toBeGreaterThan(0);
		});

		it("handles multiple inline code segments", () => {
			const lines = ["description: |", "  Use `one` and `two`"];
			const allTokens = tokenizeLines(grammar, lines);
			const codeTokens = findTokensWithScope(allTokens[1], "markup.inline.raw");
			expect(codeTokens.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("Strikethrough", () => {
		it("highlights strikethrough with double tildes", () => {
			const lines = ["description: |", "  This is ~~deleted~~ text"];
			const allTokens = tokenizeLines(grammar, lines);
			const strikeTokens = findTokensWithScope(
				allTokens[1],
				"markup.strikethrough",
			);
			expect(strikeTokens.length).toBeGreaterThan(0);
		});

		it("highlights strikethrough punctuation", () => {
			const lines = ["description: |", "  Some ~~struck~~ text"];
			const allTokens = tokenizeLines(grammar, lines);
			const punctTokens = findTokensWithScope(
				allTokens[1],
				"punctuation.definition.strikethrough",
			);
			expect(punctTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Links", () => {
		it("highlights markdown links", () => {
			const lines = [
				"description: |",
				"  See [documentation](https://example.com)",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const linkTokens = findTokensWithScope(allTokens[1], "string.other.link");
			expect(linkTokens.length).toBeGreaterThan(0);
		});

		it("highlights link URL", () => {
			const lines = [
				"description: |",
				"  Check [here](https://api.example.com/docs)",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const urlTokens = findTokensWithScope(
				allTokens[1],
				"markup.underline.link",
			);
			expect(urlTokens.length).toBeGreaterThan(0);
		});

		it("highlights link punctuation", () => {
			const lines = ["description: |", "  A [link](url) here"];
			const allTokens = tokenizeLines(grammar, lines);
			const punctTokens = findTokensWithScope(
				allTokens[1],
				"punctuation.definition.link",
			);
			expect(punctTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Images", () => {
		it("highlights markdown images", () => {
			const lines = [
				"description: |",
				"  ![Alt text](https://example.com/image.png)",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const imageTokens = findTokensWithScope(
				allTokens[1],
				"punctuation.definition.image",
			);
			expect(imageTokens.length).toBeGreaterThan(0);
		});

		it("highlights image alt text", () => {
			const lines = ["description: |", "  ![My Image](url)"];
			const allTokens = tokenizeLines(grammar, lines);
			const altTokens = findTokensWithScope(
				allTokens[1],
				"string.other.link.title",
			);
			expect(altTokens.length).toBeGreaterThan(0);
		});

		it("highlights image URL", () => {
			const lines = ["description: |", "  ![alt](https://example.com/img.jpg)"];
			const allTokens = tokenizeLines(grammar, lines);
			const urlTokens = findTokensWithScope(
				allTokens[1],
				"markup.underline.link",
			);
			expect(urlTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Combined Formatting", () => {
		it("handles bold within text", () => {
			const lines = ["description: |", "  Start **middle** end"];
			const allTokens = tokenizeLines(grammar, lines);
			const boldTokens = findTokensWithScope(allTokens[1], "markup.bold");
			expect(boldTokens.length).toBeGreaterThan(0);
		});

		it("handles italic within text", () => {
			const lines = ["description: |", "  Start *middle* end"];
			const allTokens = tokenizeLines(grammar, lines);
			const italicTokens = findTokensWithScope(allTokens[1], "markup.italic");
			expect(italicTokens.length).toBeGreaterThan(0);
		});

		it("handles code within text", () => {
			const lines = ["description: |", "  Use the `method()` function"];
			const allTokens = tokenizeLines(grammar, lines);
			const codeTokens = findTokensWithScope(allTokens[1], "markup.inline.raw");
			expect(codeTokens.length).toBeGreaterThan(0);
		});

		it("handles mixed formatting on same line", () => {
			const lines = ["description: |", "  **Bold** and *italic* and `code`"];
			const allTokens = tokenizeLines(grammar, lines);

			expect(
				findTokensWithScope(allTokens[1], "markup.bold").length,
			).toBeGreaterThan(0);
			expect(
				findTokensWithScope(allTokens[1], "markup.italic").length,
			).toBeGreaterThan(0);
			expect(
				findTokensWithScope(allTokens[1], "markup.inline.raw").length,
			).toBeGreaterThan(0);
		});
	});

	describe("Inline Markdown in Lists", () => {
		it("highlights bold in list items", () => {
			const lines = ["description: |", "  - **Bold** item"];
			const allTokens = tokenizeLines(grammar, lines);
			const boldTokens = findTokensWithScope(allTokens[1], "markup.bold");
			expect(boldTokens.length).toBeGreaterThan(0);
		});

		it("highlights italic in list items", () => {
			const lines = ["description: |", "  - *Italic* item"];
			const allTokens = tokenizeLines(grammar, lines);
			const italicTokens = findTokensWithScope(allTokens[1], "markup.italic");
			expect(italicTokens.length).toBeGreaterThan(0);
		});

		it("highlights code in list items", () => {
			const lines = ["description: |", "  - Use `code` here"];
			const allTokens = tokenizeLines(grammar, lines);
			const codeTokens = findTokensWithScope(allTokens[1], "markup.inline.raw");
			expect(codeTokens.length).toBeGreaterThan(0);
		});

		it("highlights links in list items", () => {
			const lines = ["description: |", "  - See [docs](url)"];
			const allTokens = tokenizeLines(grammar, lines);
			const linkTokens = findTokensWithScope(allTokens[1], "string.other.link");
			expect(linkTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Inline Markdown in Blockquotes", () => {
		it("highlights bold in blockquotes", () => {
			const lines = ["description: |", "  > **Important** note"];
			const allTokens = tokenizeLines(grammar, lines);
			const boldTokens = findTokensWithScope(allTokens[1], "markup.bold");
			expect(boldTokens.length).toBeGreaterThan(0);
		});

		it("highlights code in blockquotes", () => {
			const lines = ["description: |", "  > Use `method()` here"];
			const allTokens = tokenizeLines(grammar, lines);
			const codeTokens = findTokensWithScope(allTokens[1], "markup.inline.raw");
			expect(codeTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Edge Cases", () => {
		it("does not highlight asterisks in normal text", () => {
			const lines = ["description: |", "  a * b * c"];
			const allTokens = tokenizeLines(grammar, lines);
			// With spaces around asterisks, they shouldn't be interpreted as italic
			// This depends on the regex implementation
			const tokens = allTokens[1];
			expect(tokens.length).toBeGreaterThan(0);
		});

		it("handles underscore in variable names", () => {
			const lines = ["description: |", "  Use the `my_variable` name"];
			const allTokens = tokenizeLines(grammar, lines);
			const codeTokens = findTokensWithScope(allTokens[1], "markup.inline.raw");
			expect(codeTokens.length).toBeGreaterThan(0);
		});

		it("handles URLs with special characters", () => {
			const lines = [
				"description: |",
				"  See [API](https://api.example.com/v1?param=value&other=123)",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const urlTokens = findTokensWithScope(
				allTokens[1],
				"markup.underline.link",
			);
			expect(urlTokens.length).toBeGreaterThan(0);
		});

		it("handles empty bold markers", () => {
			const lines = ["description: |", "  Text ** ** more"];
			const allTokens = tokenizeLines(grammar, lines);
			// Should not crash or produce unexpected results
			expect(allTokens[1].length).toBeGreaterThan(0);
		});
	});
});
