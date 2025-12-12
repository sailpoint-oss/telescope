import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TelescopeContext } from "../../src/lsp/context.js";
import { DocumentCache } from "../../src/lsp/document-cache.js";
import { __testProvideSemanticTokens } from "../../src/lsp/handlers/semantic-tokens.js";

type DecodedToken = {
	line: number;
	char: number;
	length: number;
	tokenType: number;
	tokenModifiers: number;
};

function makeCtx(): TelescopeContext {
	const fakeConnection = {
		console: {
			log: () => {},
			error: () => {},
			warn: () => {},
		},
	} as unknown as Parameters<typeof TelescopeContext>[0];
	return new TelescopeContext(fakeConnection);
}

function decodeSemanticTokens(data: number[]): DecodedToken[] {
	const tokens: DecodedToken[] = [];
	let line = 0;
	let char = 0;

	for (let i = 0; i < data.length; i += 5) {
		const deltaLine = data[i] ?? 0;
		const deltaChar = data[i + 1] ?? 0;
		const length = data[i + 2] ?? 0;
		const tokenType = data[i + 3] ?? 0;
		const tokenModifiers = data[i + 4] ?? 0;

		line += deltaLine;
		char = deltaLine === 0 ? char + deltaChar : deltaChar;

		tokens.push({ line, char, length, tokenType, tokenModifiers });
	}

	return tokens;
}

function tokenText(lines: string[], token: DecodedToken): string {
	const line = lines[token.line] ?? "";
	return line.slice(token.char, token.char + token.length);
}

test("semantic tokens target OpenAPI YAML keys/values precisely (no split highlighting)", () => {
	const yamlText = [
		"openapi: 3.1.0",
		"info:",
		"  title: Test API",
		"  version: 1.0.0",
		"paths:",
		"  /users:",
		"    get:",
		"      operationId: getUsers",
		'      responses: { "200": { description: ok } }',
		"  /users/{id}:",
		"    get:",
		"      operationId: getUserById",
		'      responses: { "200": { description: ok } }',
		"components:",
		"  schemas:",
		"    UserList:",
		"      type: array",
		"      items:",
		"        type: string",
		"",
	].join("\n");

	const doc = TextDocument.create("file:///test.yaml", "yaml", 1, yamlText);

	const ctx = makeCtx();
	const cache = new DocumentCache(ctx);
	const cached = cache.get(doc);

	const semanticTokens = __testProvideSemanticTokens(cached, cache, ctx);
	const decoded = decodeSemanticTokens(semanticTokens.data);
	const lines = yamlText.split("\n");

	// tokenType 11: HTTP method key ("get")
	const getToken = decoded.find((t) => t.tokenType === 11);
	expect(getToken).toBeDefined();
	if (!getToken) return;
	expect(tokenText(lines, getToken)).toBe("get");

	// tokenType 1: schema name key ("UserList")
	const userListToken = decoded.find(
		(t) => t.tokenType === 1 && tokenText(lines, t) === "UserList",
	);
	expect(userListToken).toBeDefined();

	// tokenType 13: schema type *value* ("array")
	const arrayToken = decoded.find(
		(t) => t.tokenType === 13 && tokenText(lines, t) === "array",
	);
	expect(arrayToken).toBeDefined();

	// tokenType 6: path parameter inside the path key ("{id}")
	const pathParamToken = decoded.find(
		(t) => t.tokenType === 6 && tokenText(lines, t) === "{id}",
	);
	expect(pathParamToken).toBeDefined();
});
