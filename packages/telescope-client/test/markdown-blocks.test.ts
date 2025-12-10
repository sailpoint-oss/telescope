/**
 * Tests for Markdown block scalar highlighting in OpenAPI YAML
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
	tokenizeLine,
	tokenizeLines,
} from "./setup";

describe("Markdown Block Scalars", () => {
	let grammar: IGrammar;

	beforeAll(async () => {
		grammar = await getOpenAPIGrammar();
	});

	describe("Block Scalar Indicators", () => {
		it("recognizes literal block scalar (|)", () => {
			const lines = ["description: |", "  Content here"];
			const allTokens = tokenizeLines(grammar, lines);
			const pipeToken = findToken(allTokens[0], "|");
			expect(pipeToken).toBeDefined();
			if (!pipeToken) {
				throw new Error("Pipe token not found");
			}
			expect(
				hasScope(pipeToken, "keyword.control.flow.block-scalar.yaml"),
			).toBe(true);
		});

		it("recognizes folded block scalar (>)", () => {
			const lines = ["description: >", "  Content here"];
			const allTokens = tokenizeLines(grammar, lines);
			const arrowToken = findToken(allTokens[0], ">");
			expect(arrowToken).toBeDefined();
			expect(
				hasScope(arrowToken!, "keyword.control.flow.block-scalar.yaml"),
			).toBe(true);
		});

		it("recognizes block scalar with keep indicator (|+)", () => {
			const lines = ["description: |+", "  Content here"];
			const allTokens = tokenizeLines(grammar, lines);
			// The | should be captured as part of the indicator
			const tokens = allTokens[0];
			const blockIndicators = findTokensWithScope(tokens, "block-scalar");
			expect(blockIndicators.length).toBeGreaterThan(0);
		});

		it("recognizes block scalar with strip indicator (|-)", () => {
			const lines = ["description: |-", "  Content here"];
			const allTokens = tokenizeLines(grammar, lines);
			const tokens = allTokens[0];
			const blockIndicators = findTokensWithScope(tokens, "block-scalar");
			expect(blockIndicators.length).toBeGreaterThan(0);
		});
	});

	describe("Markdown Headings", () => {
		it("highlights h1 heading", () => {
			const lines = ["description: |", "  # Heading 1"];
			const allTokens = tokenizeLines(grammar, lines);
			const headingTokens = findTokensWithScope(allTokens[1], "heading.1");
			expect(headingTokens.length).toBeGreaterThan(0);
		});

		it("highlights h2 heading", () => {
			const lines = ["description: |", "  ## Heading 2"];
			const allTokens = tokenizeLines(grammar, lines);
			const headingTokens = findTokensWithScope(allTokens[1], "heading.2");
			expect(headingTokens.length).toBeGreaterThan(0);
		});

		it("highlights h3 heading", () => {
			const lines = ["description: |", "  ### Heading 3"];
			const allTokens = tokenizeLines(grammar, lines);
			const headingTokens = findTokensWithScope(allTokens[1], "heading.3");
			expect(headingTokens.length).toBeGreaterThan(0);
		});

		it("highlights h4 heading", () => {
			const lines = ["description: |", "  #### Heading 4"];
			const allTokens = tokenizeLines(grammar, lines);
			const headingTokens = findTokensWithScope(allTokens[1], "heading.4");
			expect(headingTokens.length).toBeGreaterThan(0);
		});

		it("highlights h5 heading", () => {
			const lines = ["description: |", "  ##### Heading 5"];
			const allTokens = tokenizeLines(grammar, lines);
			const headingTokens = findTokensWithScope(allTokens[1], "heading.5");
			expect(headingTokens.length).toBeGreaterThan(0);
		});

		it("highlights h6 heading", () => {
			const lines = ["description: |", "  ###### Heading 6"];
			const allTokens = tokenizeLines(grammar, lines);
			const headingTokens = findTokensWithScope(allTokens[1], "heading.6");
			expect(headingTokens.length).toBeGreaterThan(0);
		});

		it("highlights heading punctuation", () => {
			const lines = ["description: |", "  # Heading"];
			const allTokens = tokenizeLines(grammar, lines);
			const punctTokens = findTokensWithScope(
				allTokens[1],
				"punctuation.definition.heading",
			);
			expect(punctTokens.length).toBeGreaterThan(0);
		});

		it("highlights heading text as entity.name.section", () => {
			const lines = ["description: |", "  # My Section Title"];
			const allTokens = tokenizeLines(grammar, lines);
			const sectionTokens = findTokensWithScope(
				allTokens[1],
				"entity.name.section",
			);
			expect(sectionTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Markdown Lists", () => {
		it("highlights unordered list with dash", () => {
			const lines = ["description: |", "  - List item"];
			const allTokens = tokenizeLines(grammar, lines);
			const listTokens = findTokensWithScope(allTokens[1], "markup.list");
			expect(listTokens.length).toBeGreaterThan(0);
		});

		it("highlights unordered list with asterisk", () => {
			const lines = ["description: |", "  * List item"];
			const allTokens = tokenizeLines(grammar, lines);
			const listTokens = findTokensWithScope(allTokens[1], "markup.list");
			expect(listTokens.length).toBeGreaterThan(0);
		});

		it("highlights unordered list with plus", () => {
			const lines = ["description: |", "  + List item"];
			const allTokens = tokenizeLines(grammar, lines);
			const listTokens = findTokensWithScope(allTokens[1], "markup.list");
			expect(listTokens.length).toBeGreaterThan(0);
		});

		it("highlights ordered list with period", () => {
			const lines = ["description: |", "  1. First item"];
			const allTokens = tokenizeLines(grammar, lines);
			const listTokens = findTokensWithScope(
				allTokens[1],
				"markup.list.numbered",
			);
			expect(listTokens.length).toBeGreaterThan(0);
		});

		it("highlights ordered list with parenthesis", () => {
			const lines = ["description: |", "  1) First item"];
			const allTokens = tokenizeLines(grammar, lines);
			const listTokens = findTokensWithScope(
				allTokens[1],
				"markup.list.numbered",
			);
			expect(listTokens.length).toBeGreaterThan(0);
		});

		it("highlights list punctuation", () => {
			const lines = ["description: |", "  - Item"];
			const allTokens = tokenizeLines(grammar, lines);
			const punctTokens = findTokensWithScope(
				allTokens[1],
				"punctuation.definition.list",
			);
			expect(punctTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Markdown Blockquotes", () => {
		it("highlights blockquote", () => {
			const lines = ["description: |", "  > This is a quote"];
			const allTokens = tokenizeLines(grammar, lines);
			const quoteTokens = findTokensWithScope(allTokens[1], "markup.quote");
			expect(quoteTokens.length).toBeGreaterThan(0);
		});

		it("highlights blockquote punctuation", () => {
			const lines = ["description: |", "  > Quote text"];
			const allTokens = tokenizeLines(grammar, lines);
			const punctTokens = findTokensWithScope(
				allTokens[1],
				"punctuation.definition.quote",
			);
			expect(punctTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Markdown Tables", () => {
		it("highlights table separator row", () => {
			const lines = [
				"description: |",
				"  | Col 1 | Col 2 |",
				"  |-------|-------|",
				"  | A | B |",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const tableTokens = findTokensWithScope(allTokens[2], "markup.table");
			expect(tableTokens.length).toBeGreaterThan(0);
		});

		it("highlights table pipe separators", () => {
			const lines = ["description: |", "  | Col 1 | Col 2 |"];
			const allTokens = tokenizeLines(grammar, lines);
			const pipeTokens = findTokensWithScope(
				allTokens[1],
				"punctuation.separator.table",
			);
			expect(pipeTokens.length).toBeGreaterThan(0);
		});

		it("highlights table with alignment markers", () => {
			const lines = [
				"description: |",
				"  | Left | Center | Right |",
				"  |:-----|:------:|------:|",
			];
			const allTokens = tokenizeLines(grammar, lines);
			const tableTokens = findTokensWithScope(allTokens[2], "markup.table");
			expect(tableTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Horizontal Rules", () => {
		it("highlights horizontal rule with dashes", () => {
			const lines = ["description: |", "  ---"];
			const allTokens = tokenizeLines(grammar, lines);
			const hrTokens = findTokensWithScope(allTokens[1], "meta.separator");
			expect(hrTokens.length).toBeGreaterThan(0);
		});

		it("highlights horizontal rule with asterisks", () => {
			const lines = ["description: |", "  ***"];
			const allTokens = tokenizeLines(grammar, lines);
			const hrTokens = findTokensWithScope(allTokens[1], "meta.separator");
			expect(hrTokens.length).toBeGreaterThan(0);
		});

		it("highlights horizontal rule with underscores", () => {
			const lines = ["description: |", "  ___"];
			const allTokens = tokenizeLines(grammar, lines);
			const hrTokens = findTokensWithScope(allTokens[1], "meta.separator");
			expect(hrTokens.length).toBeGreaterThan(0);
		});

		it("highlights long horizontal rule", () => {
			const lines = ["description: |", "  ----------"];
			const allTokens = tokenizeLines(grammar, lines);
			const hrTokens = findTokensWithScope(allTokens[1], "meta.separator");
			expect(hrTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Block Scalar Content Scope", () => {
		it("wraps content in meta.embedded.block.markdown", () => {
			const lines = ["description: |", "  Some content"];
			const allTokens = tokenizeLines(grammar, lines);
			const embeddedTokens = findTokensWithScope(
				allTokens[1],
				"meta.embedded.block.markdown",
			);
			expect(embeddedTokens.length).toBeGreaterThan(0);
		});

		it("handles multi-line block scalar content", () => {
			const lines = [
				"description: |",
				"  First line",
				"  Second line",
				"  Third line",
			];
			const allTokens = tokenizeLines(grammar, lines);

			// All content lines should be in embedded markdown scope
			for (let i = 1; i < 4; i++) {
				const embeddedTokens = findTokensWithScope(
					allTokens[i],
					"meta.embedded.block.markdown",
				);
				expect(embeddedTokens.length).toBeGreaterThan(0);
			}
		});
	});

	describe("Quoted Scalars with Markdown", () => {
		it("handles double-quoted description", () => {
			const lines = ['description: "Some **bold** text"'];
			const allTokens = tokenizeLines(grammar, lines);
			const embeddedTokens = findTokensWithScope(
				allTokens[0],
				"meta.embedded.block.markdown",
			);
			expect(embeddedTokens.length).toBeGreaterThan(0);
		});

		it("handles single-quoted description", () => {
			const lines = ["description: 'Some **bold** text'"];
			const allTokens = tokenizeLines(grammar, lines);
			const embeddedTokens = findTokensWithScope(
				allTokens[0],
				"meta.embedded.block.markdown",
			);
			expect(embeddedTokens.length).toBeGreaterThan(0);
		});

		it("handles escape sequences in double-quoted strings", () => {
			const lines = ['description: "Line 1\\nLine 2"'];
			const allTokens = tokenizeLines(grammar, lines);
			const escapeTokens = findTokensWithScope(
				allTokens[0],
				"constant.character.escape",
			);
			expect(escapeTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Inline Scalar with Markdown", () => {
		it("handles inline description value", () => {
			const { tokens } = tokenizeLine(grammar, "description: Some inline text");
			const embeddedTokens = findTokensWithScope(
				tokens,
				"meta.embedded.inline.markdown",
			);
			expect(embeddedTokens.length).toBeGreaterThan(0);
		});

		it("handles inline summary value", () => {
			const { tokens } = tokenizeLine(grammar, "summary: Get all users");
			const embeddedTokens = findTokensWithScope(
				tokens,
				"meta.embedded.inline.markdown",
			);
			expect(embeddedTokens.length).toBeGreaterThan(0);
		});

		it("handles inline title value", () => {
			const { tokens } = tokenizeLine(grammar, "title: My API Title");
			const embeddedTokens = findTokensWithScope(
				tokens,
				"meta.embedded.inline.markdown",
			);
			expect(embeddedTokens.length).toBeGreaterThan(0);
		});
	});

	describe("Complex Markdown Content", () => {
		it("handles mixed markdown features", () => {
			const lines = [
				"description: |",
				"  # Main Heading",
				"  ",
				"  Some **bold** and *italic* text.",
				"  ",
				"  ## Features",
				"  ",
				"  - First feature",
				"  - Second feature",
				"  ",
				"  > Note: Important info",
			];
			const allTokens = tokenizeLines(grammar, lines);

			// Check heading
			expect(
				findTokensWithScope(allTokens[1], "heading.1").length,
			).toBeGreaterThan(0);

			// Check bold
			expect(
				findTokensWithScope(allTokens[3], "markup.bold").length,
			).toBeGreaterThan(0);

			// Check italic
			expect(
				findTokensWithScope(allTokens[3], "markup.italic").length,
			).toBeGreaterThan(0);

			// Check h2
			expect(
				findTokensWithScope(allTokens[5], "heading.2").length,
			).toBeGreaterThan(0);

			// Check lists
			expect(
				findTokensWithScope(allTokens[7], "markup.list").length,
			).toBeGreaterThan(0);

			// Check blockquote
			expect(
				findTokensWithScope(allTokens[10], "markup.quote").length,
			).toBeGreaterThan(0);
		});
	});
});
