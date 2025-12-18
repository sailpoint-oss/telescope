import type { Diagnostic as EngineDiagnostic } from "../engine/index.js";
import { repoRelativePathFromDiagnostic } from "./gating.js";

export interface GitHubBlobContext {
	owner: string;
	repo: string;
	sha: string;
}

export interface PullRequestContext {
	owner: string;
	repo: string;
	pullNumber: number;
	baseSha: string;
	headSha: string;
}

export function readPullRequestContextFromEnv(payload: unknown): PullRequestContext | null {
	let owner = "";
	let repo = "";

	const repoSlug = process.env.GITHUB_REPOSITORY ?? "";
	if (repoSlug) {
		const parts = repoSlug.split("/");
		owner = parts[0] ?? "";
		repo = parts[1] ?? "";
	}

	// Fallback: pull from event payload (helps when env is missing/misconfigured).
	if (!owner || !repo) {
		const obj = payload as {
			repository?: { name?: string; owner?: { login?: string }; full_name?: string };
		};
		if (obj.repository?.full_name) {
			const parts = obj.repository.full_name.split("/");
			owner = owner || (parts[0] ?? "");
			repo = repo || (parts[1] ?? "");
		}
		owner = owner || (obj.repository?.owner?.login ?? "");
		repo = repo || (obj.repository?.name ?? "");
	}

	if (!owner || !repo) return null;

	const obj = payload as {
		number?: number;
		pull_request?: { number?: number; base?: { sha?: string }; head?: { sha?: string } };
	};
	const pullNumber = obj.pull_request?.number ?? obj.number;
	const baseSha = obj.pull_request?.base?.sha;
	const headSha = obj.pull_request?.head?.sha;
	if (!pullNumber || !baseSha || !headSha) return null;

	return { owner, repo, pullNumber, baseSha, headSha };
}

export class GitHubClient {
	private token: string;
	private owner: string;
	private repo: string;

	constructor(opts: { token: string; owner: string; repo: string }) {
		this.token = opts.token;
		this.owner = opts.owner;
		this.repo = opts.repo;
	}

	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
	): Promise<T> {
		const res = await fetch(`https://api.github.com${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${this.token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				"Content-Type": "application/json",
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`GitHub API ${method} ${path} failed: ${res.status} ${res.statusText} ${text}`);
		}
		return (await res.json()) as T;
	}

	async listIssueComments(pullNumber: number): Promise<
		Array<{ id: number; body: string }>
	> {
		const out: Array<{ id: number; body: string }> = [];
		let page = 1;
		for (;;) {
			const items = await this.request<
				Array<{ id: number; body: string }>
			>(
				"GET",
				`/repos/${this.owner}/${this.repo}/issues/${pullNumber}/comments?per_page=100&page=${page}`,
			);
			out.push(...items);
			if (items.length < 100) break;
			page++;
		}
		return out;
	}

	async createIssueComment(pullNumber: number, body: string): Promise<void> {
		await this.request("POST", `/repos/${this.owner}/${this.repo}/issues/${pullNumber}/comments`, {
			body,
		});
	}

	async updateIssueComment(commentId: number, body: string): Promise<void> {
		await this.request("PATCH", `/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`, {
			body,
		});
	}

	async createReview(opts: {
		pullNumber: number;
		commitId: string;
		body: string;
		comments?: Array<{ path: string; line: number; body: string }>;
	}): Promise<void> {
		const payload: Record<string, unknown> = {
			commit_id: opts.commitId,
			event: "COMMENT",
			body: opts.body,
		};
		if (opts.comments && opts.comments.length > 0) {
			payload.comments = opts.comments.map((c) => ({
				path: c.path,
				line: c.line,
				side: "RIGHT",
				body: c.body,
			}));
		}

		await this.request(
			"POST",
			`/repos/${this.owner}/${this.repo}/pulls/${opts.pullNumber}/reviews`,
			payload,
		);
	}
}

function githubBlobUrl(ctx: GitHubBlobContext, repoRelPath: string, anchor?: string): string {
	const cleanPath = repoRelPath.replace(/^\/+/, "");
	const cleanAnchor = anchor ? (anchor.startsWith("#") ? anchor : `#${anchor}`) : "";
	return `https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.sha}/${cleanPath}${cleanAnchor}`;
}

function diagRangeAnchor(d: EngineDiagnostic): { label: string; anchor: string } {
	const startLine = Math.max(1, (d.range?.start?.line ?? 0) + 1);
	const endLine = Math.max(startLine, (d.range?.end?.line ?? d.range?.start?.line ?? 0) + 1);
	if (endLine === startLine) return { label: `L${startLine}`, anchor: `#L${startLine}` };
	return { label: `L${startLine}-L${endLine}`, anchor: `#L${startLine}-L${endLine}` };
}

export function buildPrSummaryComment(opts: {
	marker: string;
	github: GitHubBlobContext;
	workspacePath: string;
	diagnostics: EngineDiagnostic[];
	changedFiles: Set<string>;
	maxPerFile: number;
}): string {
	const byFile = new Map<string, EngineDiagnostic[]>();
	for (const d of opts.diagnostics) {
		const rel = repoRelativePathFromDiagnostic(d, opts.workspacePath);
		if (!rel) continue;
		if (!opts.changedFiles.has(rel)) continue;
		const arr = byFile.get(rel) ?? [];
		arr.push(d);
		byFile.set(rel, arr);
	}

	const files = [...byFile.keys()].sort((a, b) => a.localeCompare(b));

	let totalE = 0;
	let totalW = 0;
	for (const diags of byFile.values()) {
		for (const d of diags) {
			if (d.severity === 1) totalE++;
			else if (d.severity === 2) totalW++;
		}
	}

	const lines: string[] = [];
	lines.push(opts.marker);
	lines.push("## Telescope CI — PR delta (changed files)");
	lines.push("");
	lines.push(
		"This report contains validation notes on all changed files in this PR.",
	);
	lines.push("");
	lines.push(
		`Changed files with diagnostics: **${byFile.size}** (errors: **${totalE}**, warnings: **${totalW}**)`,
	);
	lines.push("");

	if (files.length === 0) {
		lines.push("No issues found in changed files.");
		lines.push("");
		return `${lines.join("\n")}\n`;
	}

	lines.push("| File | Errors | Warnings | Total |");
	lines.push("| --- | ---: | ---: | ---: |");
	for (const f of files) {
		const diags = byFile.get(f) ?? [];
		let e = 0;
		let w = 0;
		for (const d of diags) {
			if (d.severity === 1) e++;
			else if (d.severity === 2) w++;
		}
		lines.push(
			`| [\`${f}\`](${githubBlobUrl(opts.github, f)}) | ${e} | ${w} | ${diags.length} |`,
		);
	}
	lines.push("");

	for (const f of files) {
		lines.push(`### [\`${f}\`](${githubBlobUrl(opts.github, f)})`);
		lines.push("");
		const diags = (byFile.get(f) ?? []).slice().sort((a, b) => {
			return (
				(a.range?.start?.line ?? 0) - (b.range?.start?.line ?? 0) ||
				(a.range?.start?.character ?? 0) - (b.range?.start?.character ?? 0)
			);
		});
		const limited = diags.slice(0, opts.maxPerFile);
		for (const d of limited) {
			const code = d.code?.toString() ?? "unknown";
			const sev = d.severity === 1 ? "error" : d.severity === 2 ? "warning" : "notice";
			const r = diagRangeAnchor(d);
			const url = githubBlobUrl(opts.github, f, r.anchor);
			lines.push(`- [${r.label}](${url}) **${sev}** \`${code}\`: ${d.message ?? ""}`);
		}
		if (diags.length > limited.length) {
			lines.push(`- …and ${diags.length - limited.length} more`);
		}
		lines.push("");
	}

	lines.push("_Full report is attached to the workflow run as an artifact._");
	lines.push("");
	return `${lines.join("\n")}\n`;
}

export function splitCommentIntoParts(opts: {
	body: string;
	maxChars: number;
	marker: string;
}): string[] {
	// Keep the marker stable at the top for idempotent updates across runs.
	// Add a visible part footer at the bottom for human readability.
	if (opts.body.length <= opts.maxChars) return [opts.body];

	const now = new Date().toISOString();
	const allLines = opts.body.split("\n");
	const markerLineIdx = allLines.findIndex((l) => l.includes(opts.marker));
	const markerLine = markerLineIdx >= 0 ? allLines[markerLineIdx] : opts.marker;
	const restLines = allLines.slice(markerLineIdx >= 0 ? markerLineIdx + 1 : 0);

	// Split safely on <details> blocks (so we never cut a table/details in half).
	const detailsBlocks: string[] = [];
	let preamble = restLines.join("\n");

	const firstDetailsIdx = restLines.findIndex((l) => l.trim() === "<details>");
	if (firstDetailsIdx >= 0) {
		const prefixLines = restLines.slice(0, firstDetailsIdx);
		preamble = prefixLines.join("\n").trimEnd();

		let i = firstDetailsIdx;
		while (i < restLines.length) {
			const line = restLines[i] ?? "";
			if (line.trim() !== "<details>") {
				i++;
				continue;
			}
			const block: string[] = [line];
			i++;
			while (i < restLines.length) {
				block.push(restLines[i] ?? "");
				if ((restLines[i] ?? "").trim() === "</details>") {
					i++;
					// Attach any immediate blank line after </details> so spacing stays correct.
					while (i < restLines.length && (restLines[i] ?? "").trim() === "") {
						block.push(restLines[i] ?? "");
						i++;
					}
					break;
				}
				i++;
			}
			detailsBlocks.push(block.join("\n").trimEnd());
		}
	}

	// If there were no <details> blocks, fall back to paragraph splitting.
	const blocks =
		detailsBlocks.length > 0
			? detailsBlocks
			: restLines
					.join("\n")
					.split(/\n{2,}/)
					.map((p) => p.trimEnd())
					.filter(Boolean);

	const headerFirst = `${markerLine}\n${preamble}\n`.trimEnd();
	const headerContinued = `${markerLine}\n\n_Continued…_\n`;

	const pages: string[] = [];
	const footerFor = (n: number, m: number) =>
		`\n---\n_Part ${n}/${m} • Updated ${now}_\n`;

	// Conservative estimate; we’ll add the real footer after we know total parts.
	const footerEstimateLen = footerFor(999, 999).length;
	const maxBodyChars = Math.max(1000, opts.maxChars - footerEstimateLen);

	const headerFirstTrim = headerFirst.trimEnd();
	const headerContinuedTrim = headerContinued.trimEnd();

	let cur = headerFirstTrim;

	const flush = () => {
		const trimmed = cur.trimEnd();
		// Avoid emitting empty continuation-only pages.
		if (trimmed.trim() && trimmed !== headerContinuedTrim) pages.push(trimmed);
		cur = headerContinuedTrim;
	};

	for (const b of blocks) {
		const block = b.trimEnd();
		const candidate = `${cur}\n\n${block}`.trimEnd();

		// If it won't fit and we already have content beyond the header, start a new page.
		if (candidate.length > maxBodyChars && cur !== headerFirstTrim) {
			flush();
		}

		const candidate2 = `${cur}\n\n${block}`.trimEnd();
		// Still too large (single block too big). Fall back to truncating this block.
		if (candidate2.length > maxBodyChars) {
			const available = Math.max(0, maxBodyChars - cur.length - 2);
			const truncated = available > 0 ? `${block.slice(0, available)}\n\n_…truncated (see artifact for full output)._` : "_…truncated (see artifact for full output)._";
			cur = `${cur}\n\n${truncated}`.trimEnd();
			flush();
			continue;
		}

		cur = candidate2;
	}
	if (cur.trimEnd().trim() && cur.trimEnd() !== headerContinuedTrim) pages.push(cur.trimEnd());

	const total = pages.length;
	return pages.map((p, idx) => {
		const withFooter = `${p}${footerFor(idx + 1, total)}`;
		// Hard cap safety: if we somehow exceed maxChars, slice the tail.
		if (withFooter.length <= opts.maxChars) return withFooter;
		return `${withFooter.slice(0, opts.maxChars - 100)}\n\n_…truncated._\n${footerFor(idx + 1, total)}`;
	});
}

export function buildInlineReviewComments(opts: {
	workspacePath: string;
	diagnostics: EngineDiagnostic[];
	changedLinesByFile: Map<string, Set<number>>;
	maxComments: number;
}): Array<{ path: string; line: number; body: string }> {
	const out: Array<{ path: string; line: number; body: string }> = [];
	const seen = new Set<string>();

	for (const d of opts.diagnostics) {
		if (out.length >= opts.maxComments) break;

		const rel = repoRelativePathFromDiagnostic(d, opts.workspacePath);
		if (!rel) continue;
		const line = (d.range?.start?.line ?? 0) + 1;
		const changedLines = opts.changedLinesByFile.get(rel);
		if (!changedLines || !changedLines.has(line)) continue;

		const code = d.code?.toString() ?? "unknown";
		const sev = d.severity === 1 ? "error" : d.severity === 2 ? "warning" : "notice";
		const key = `${rel}:${line}:${code}:${d.message ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);

		out.push({
			path: rel,
			line,
			body: `**Telescope (${sev})** \`${code}\`\n\n${d.message ?? ""}`,
		});
	}

	return out;
}


