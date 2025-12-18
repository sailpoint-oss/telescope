/**
 * OpenAPI Path Template utilities (OAS 4.8.2 Path Templating)
 *
 * We validate path keys (the `paths` object keys) using a conservative RFC3986
 * interpretation:
 * - Literal portions MUST be ASCII `pchar` (unreserved / pct-encoded / sub-delims / ":" / "@")
 * - Non-ASCII literals are rejected (should be percent-encoded)
 * - Template expressions are delimited by `{` and `}` and may contain any chars except `{` / `}`
 * - Template expression names must be non-empty and unique within a path template
 */

export type PathTemplateValidationOk = {
	ok: true;
	templateParams: string[];
};

export type PathTemplateValidationErr = {
	ok: false;
	error: string;
	/** Character index within the provided `path` string, when we can be precise */
	errorIndex?: number;
	/**
	 * Length (in chars) of the offending span, when it’s better than a single char.
	 * If omitted, callers can highlight a single character at `errorIndex`.
	 */
	errorLength?: number;
	templateParams: string[];
};

export type PathTemplateValidationResult =
	| PathTemplateValidationOk
	| PathTemplateValidationErr;

const HEX = /^[0-9A-Fa-f]$/;

function isUnreserved(ch: string): boolean {
	return (
		(ch >= "A" && ch <= "Z") ||
		(ch >= "a" && ch <= "z") ||
		(ch >= "0" && ch <= "9") ||
		ch === "-" ||
		ch === "." ||
		ch === "_" ||
		ch === "~"
	);
}

function isSubDelim(ch: string): boolean {
	// sub-delims = "!" / "$" / "&" / "'" / "(" / ")" / "*" / "+" / "," / ";" / "="
	return (
		ch === "!" ||
		ch === "$" ||
		ch === "&" ||
		ch === "'" ||
		ch === "(" ||
		ch === ")" ||
		ch === "*" ||
		ch === "+" ||
		ch === "," ||
		ch === ";" ||
		ch === "="
	);
}

function isPCharStart(ch: string): boolean {
	// pchar = unreserved / pct-encoded / sub-delims / ":" / "@"
	return isUnreserved(ch) || isSubDelim(ch) || ch === ":" || ch === "@" || ch === "%";
}

function isAscii(ch: string): boolean {
	// JS strings are UTF-16. For our purposes: treat any code unit > 0x7F as non-ASCII.
	return ch.length === 1 && ch.charCodeAt(0) <= 0x7f;
}

function isPctEncodedAt(path: string, i: number): boolean {
	// pct-encoded = "%" HEXDIG HEXDIG
	if (path[i] !== "%") return false;
	const a = path[i + 1];
	const b = path[i + 2];
	return !!a && !!b && HEX.test(a) && HEX.test(b);
}

export function validatePathTemplate(path: string): PathTemplateValidationResult {
	const templateParams: string[] = [];

	if (!path.startsWith("/")) {
		return {
			ok: false,
			error: "Path template must start with '/'.",
			errorIndex: 0,
			templateParams,
		};
	}

	// Root-only path "/" is valid per ABNF.
	if (path === "/") {
		return { ok: true, templateParams };
	}

	let inTemplate = false;
	let currentParam = "";
	const seenParams = new Set<string>();

	// Track segment emptiness to reject `//` (empty path-segment)
	let segmentHasContent = false;

	// Start scanning after the first "/"
	for (let i = 1; i < path.length; i++) {
		const ch = path[i]!;

		if (inTemplate) {
			if (ch === "{") {
				return {
					ok: false,
					error: "Template expression name must not contain '{'.",
					errorIndex: i,
					templateParams,
				};
			}
			if (ch === "}") {
				if (currentParam.length === 0) {
					return {
						ok: false,
						error: "Template expression name must be non-empty.",
						errorIndex: i - 1,
						errorLength: 2, // "{}" (best effort)
						templateParams,
					};
				}
				if (seenParams.has(currentParam)) {
					return {
						ok: false,
						error: `Template expression "{${currentParam}}" must not appear more than once in a path template.`,
						errorIndex: i - (currentParam.length + 1),
						errorLength: currentParam.length + 2,
						templateParams,
					};
				}
				seenParams.add(currentParam);
				templateParams.push(currentParam);
				currentParam = "";
				inTemplate = false;
				segmentHasContent = true;
				continue;
			}

			// ABNF allows any unicode except "{" and "}".
			currentParam += ch;
			segmentHasContent = true;
			continue;
		}

		// Not in template
		if (ch === "{") {
			inTemplate = true;
			currentParam = "";
			segmentHasContent = true;
			continue;
		}

		if (ch === "}") {
			return {
				ok: false,
				error: "Unmatched '}' in path template.",
				errorIndex: i,
				templateParams,
			};
		}

		if (ch === "?" || ch === "#") {
			return {
				ok: false,
				error: `Path template must not contain '${ch}' (query/fragment) characters.`,
				errorIndex: i,
				templateParams,
			};
		}

		if (ch === "/") {
			// Reject empty segments like `//` (but allow trailing slash)
			if (!segmentHasContent) {
				return {
					ok: false,
					error: "Path template must not contain empty segments ('//').",
					errorIndex: i - 1,
					errorLength: 2,
					templateParams,
				};
			}
			segmentHasContent = false;
			continue;
		}

		// Enforce RFC3986 pchar for literals (ASCII only)
		if (!isAscii(ch)) {
			return {
				ok: false,
				error:
					"Path literal contains non-ASCII characters; percent-encode them (RFC3986 pchar is ASCII-only).",
				errorIndex: i,
				templateParams,
			};
		}

		if (!isPCharStart(ch)) {
			return {
				ok: false,
				error: `Invalid path literal character '${ch}'.`,
				errorIndex: i,
				templateParams,
			};
		}

		if (ch === "%") {
			if (!isPctEncodedAt(path, i)) {
				return {
					ok: false,
					error: "Invalid percent-encoding; expected '%HH'.",
					errorIndex: i,
					errorLength: Math.min(3, path.length - i),
					templateParams,
				};
			}
			// Skip the two hex digits
			i += 2;
			segmentHasContent = true;
			continue;
		}

		segmentHasContent = true;
	}

	if (inTemplate) {
		return {
			ok: false,
			error: "Unclosed '{' template expression in path template.",
			errorIndex: path.lastIndexOf("{"),
			templateParams,
		};
	}

	// Trailing slash is allowed by ABNF, so segmentHasContent may be false here.
	return { ok: true, templateParams };
}

/**
 * Extract template parameter names from a path template.
 *
 * For invalid templates, returns [] to avoid cascaded follow-on diagnostics.
 */
export function extractTemplateParams(path: string): string[] {
	const res = validatePathTemplate(path);
	return res.ok ? res.templateParams : [];
}

/**
 * Remove template expressions from a path segment.
 *
 * Used by suggestion rules to avoid false positives when templates are embedded
 * inside a segment (e.g. `users-{id}`).
 */
export function stripTemplateExpressions(segment: string): string {
	let out = "";
	let inTemplate = false;

	for (let i = 0; i < segment.length; i++) {
		const ch = segment[i]!;
		if (inTemplate) {
			if (ch === "}") {
				inTemplate = false;
			} else if (ch === "{") {
				// Nested '{' isn't valid, but for stripping just keep consuming.
			}
			continue;
		}
		if (ch === "{") {
			inTemplate = true;
			continue;
		}
		out += ch;
	}

	return out;
}

export function segmentContainsTemplateExpression(segment: string): boolean {
	// Fast heuristic: we only care about avoiding false positives, not full validation.
	const open = segment.indexOf("{");
	if (open === -1) return false;
	const close = segment.indexOf("}", open + 1);
	return close !== -1;
}


