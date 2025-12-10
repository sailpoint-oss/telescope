/**
 * Test setup for vscode-textmate grammar testing
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as oniguruma from "vscode-oniguruma";
import * as vsctm from "vscode-textmate";

// Load oniguruma WASM
const wasmBin = fs.readFileSync(
	path.join(__dirname, "../node_modules/vscode-oniguruma/release/onig.wasm"),
);

let registryPromise: Promise<vsctm.Registry> | null = null;

/**
 * Creates a vscode-textmate Registry configured with oniguruma
 * and the OpenAPI YAML grammar
 */
export async function createRegistry(): Promise<vsctm.Registry> {
	if (registryPromise) {
		return registryPromise;
	}

	registryPromise = (async () => {
		await oniguruma.loadWASM(wasmBin.buffer);

		const registry = new vsctm.Registry({
			onigLib: Promise.resolve({
				createOnigScanner: (patterns: string[]) =>
					new oniguruma.OnigScanner(patterns),
				createOnigString: (s: string) => new oniguruma.OnigString(s),
			}),
			loadGrammar: async (scopeName: string) => {
				const grammarPaths: Record<string, string> = {
					"source.openapi.yaml": "src/syntaxes/openapi-yaml.tmLanguage.json",
					"source.openapi.json": "src/syntaxes/openapi-json.tmLanguage.json",
					"openapi.path-variables":
						"src/syntaxes/path-variables.tmLanguage.json",
					"source.yaml": "src/syntaxes/yaml.tmLanguage.json",
					"source.json": "src/syntaxes/json.tmLanguage.json",
					"markdown.openapi.codeblock.typescript":
						"src/syntaxes/codeblock-typescript.tmLanguage.json",
					"markdown.openapi.codeblock.javascript":
						"src/syntaxes/codeblock-javascript.tmLanguage.json",
					"markdown.openapi.codeblock.python":
						"src/syntaxes/codeblock-python.tmLanguage.json",
					"markdown.openapi.codeblock.json":
						"src/syntaxes/codeblock-json.tmLanguage.json",
					"markdown.openapi.codeblock.shell":
						"src/syntaxes/codeblock-shell.tmLanguage.json",
					"markdown.openapi.codeblock.go":
						"src/syntaxes/codeblock-go.tmLanguage.json",
					"markdown.openapi.codeblock.java":
						"src/syntaxes/codeblock-java.tmLanguage.json",
					"markdown.openapi.codeblock.csharp":
						"src/syntaxes/codeblock-csharp.tmLanguage.json",
					"markdown.openapi.codeblock.ruby":
						"src/syntaxes/codeblock-ruby.tmLanguage.json",
					"markdown.openapi.codeblock.php":
						"src/syntaxes/codeblock-php.tmLanguage.json",
				};

				const grammarPath = grammarPaths[scopeName];
				if (!grammarPath) {
					// Return null for external grammars we don't have (source.yaml, etc.)
					return null;
				}

				const fullPath = path.join(__dirname, "..", grammarPath);
				if (!fs.existsSync(fullPath)) {
					return null;
				}

				const content = fs.readFileSync(fullPath, "utf-8");
				return vsctm.parseRawGrammar(content, fullPath);
			},
		});

		return registry;
	})();

	return registryPromise;
}

/**
 * Token information from tokenization
 */
export interface Token {
	text: string;
	scopes: string[];
	startIndex: number;
	endIndex: number;
}

/**
 * Tokenizes a single line of text using the given grammar
 */
export function tokenizeLine(
	grammar: vsctm.IGrammar,
	line: string,
	prevState: vsctm.StateStack | null = null,
): { tokens: Token[]; ruleStack: vsctm.StateStack } {
	const result = grammar.tokenizeLine(line, prevState);

	const tokens: Token[] = result.tokens.map((token) => ({
		text: line.substring(token.startIndex, token.endIndex),
		scopes: token.scopes,
		startIndex: token.startIndex,
		endIndex: token.endIndex,
	}));

	return { tokens, ruleStack: result.ruleStack };
}

/**
 * Tokenizes multiple lines, maintaining state between lines
 */
export function tokenizeLines(
	grammar: vsctm.IGrammar,
	lines: string[],
): Token[][] {
	let ruleStack: vsctm.StateStack | null = vsctm.INITIAL;
	const allTokens: Token[][] = [];

	for (const line of lines) {
		const result = tokenizeLine(grammar, line, ruleStack);
		allTokens.push(result.tokens);
		ruleStack = result.ruleStack;
	}

	return allTokens;
}

/**
 * Tokenizes a multi-line string
 */
export function tokenizeText(grammar: vsctm.IGrammar, text: string): Token[][] {
	return tokenizeLines(grammar, text.split("\n"));
}

/**
 * Finds a token containing the specified text in a line's tokens
 */
export function findToken(tokens: Token[], text: string): Token | undefined {
	return tokens.find((t) => t.text === text);
}

/**
 * Finds all tokens containing a specific scope
 */
export function findTokensWithScope(tokens: Token[], scope: string): Token[] {
	return tokens.filter((t) => t.scopes.some((s) => s.includes(scope)));
}

/**
 * Checks if a token has a specific scope (partial match)
 */
export function hasScope(token: Token, scope: string): boolean {
	return token.scopes.some((s) => s.includes(scope));
}

/**
 * Checks if a token has an exact scope
 */
export function hasExactScope(token: Token, scope: string): boolean {
	return token.scopes.includes(scope);
}

/**
 * Asserts that a token exists with the given text and scope
 */
export function assertTokenScope(
	tokens: Token[],
	text: string,
	expectedScope: string,
): void {
	const token = findToken(tokens, text);
	if (!token) {
		throw new Error(
			`Token with text "${text}" not found. Available tokens: ${tokens
				.map((t) => `"${t.text}"`)
				.join(", ")}`,
		);
	}
	if (!hasScope(token, expectedScope)) {
		throw new Error(
			`Token "${text}" does not have scope "${expectedScope}". Actual scopes: ${token.scopes.join(", ")}`,
		);
	}
}

/**
 * Gets the OpenAPI YAML grammar
 */
export async function getOpenAPIGrammar(): Promise<vsctm.IGrammar> {
	const registry = await createRegistry();
	const grammar = await registry.loadGrammar("source.openapi.yaml");
	if (!grammar) {
		throw new Error("Failed to load OpenAPI YAML grammar");
	}
	return grammar;
}

/**
 * Gets the OpenAPI JSON grammar
 */
export async function getOpenAPIJSONGrammar(): Promise<vsctm.IGrammar> {
	const registry = await createRegistry();
	const grammar = await registry.loadGrammar("source.openapi.json");
	if (!grammar) {
		throw new Error("Failed to load OpenAPI JSON grammar");
	}
	return grammar;
}

/**
 * Helper to load a fixture file
 */
export function loadFixture(name: string): string {
	const fixturePath = path.join(__dirname, "fixtures", name);
	return fs.readFileSync(fixturePath, "utf-8");
}

/**
 * Debug helper: prints all tokens with their scopes
 */
export function debugTokens(tokens: Token[]): void {
	for (const token of tokens) {
		console.log(`"${token.text}" -> [${token.scopes.join(", ")}]`);
	}
}

/**
 * Debug helper: prints tokens for multiple lines
 */
export function debugLines(allTokens: Token[][]): void {
	allTokens.forEach((lineTokens, i) => {
		console.log(`Line ${i}:`);
		debugTokens(lineTokens);
		console.log("");
	});
}
