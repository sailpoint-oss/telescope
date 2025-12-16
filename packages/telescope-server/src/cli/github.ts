import type { Diagnostic as EngineDiagnostic } from "../engine/index.js";
import { repoRelativePathFromDiagnostic } from "./gating.js";

export interface PullRequestContext {
	owner: string;
	repo: string;
	pullNumber: number;
	baseSha: string;
	headSha: string;
}

export function readPullRequestContextFromEnv(payload: unknown): PullRequestContext | null {
	const repoSlug = process.env.GITHUB_REPOSITORY ?? "";
	const [owner, repo] = repoSlug.split("/");
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
		comments: Array<{ path: string; line: number; body: string }>;
	}): Promise<void> {
		await this.request("POST", `/repos/${this.owner}/${this.repo}/pulls/${opts.pullNumber}/reviews`, {
			commit_id: opts.commitId,
			event: "COMMENT",
			body: opts.body,
			comments: opts.comments.map((c) => ({
				path: c.path,
				line: c.line,
				side: "RIGHT",
				body: c.body,
			})),
		});
	}
}

export function buildPrSummaryComment(opts: {
	marker: string;
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
	lines.push("## Telescope CI");
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
		lines.push(`| \`${f}\` | ${e} | ${w} | ${diags.length} |`);
	}
	lines.push("");

	for (const f of files) {
		lines.push(`### \`${f}\``);
		lines.push("");
		const diags = (byFile.get(f) ?? []).slice().sort((a, b) => {
			return (
				(a.range?.start?.line ?? 0) - (b.range?.start?.line ?? 0) ||
				(a.range?.start?.character ?? 0) - (b.range?.start?.character ?? 0)
			);
		});
		const limited = diags.slice(0, opts.maxPerFile);
		for (const d of limited) {
			const line = (d.range?.start?.line ?? 0) + 1;
			const code = d.code?.toString() ?? "unknown";
			const sev = d.severity === 1 ? "error" : d.severity === 2 ? "warning" : "notice";
			lines.push(`- L${line} **${sev}** \`${code}\`: ${d.message ?? ""}`);
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
	if (opts.body.length <= opts.maxChars) return [opts.body];

	const chunks: string[] = [];
	const lines = opts.body.split("\n");
	let cur: string[] = [];
	let curLen = 0;

	const pushCur = () => {
		if (cur.length === 0) return;
		chunks.push(cur.join("\n"));
		cur = [];
		curLen = 0;
	};

	for (const line of lines) {
		const addLen = line.length + 1;
		if (curLen + addLen > opts.maxChars && curLen > 0) pushCur();
		cur.push(line);
		curLen += addLen;
	}
	pushCur();

	// Re-write markers with part numbers.
	const total = chunks.length;
	return chunks.map((c, idx) => {
		const partMarker = `${opts.marker} part:${idx + 1}/${total}`;
		if (c.startsWith(opts.marker)) {
			return `${partMarker}\n${c.slice(opts.marker.length).replace(/^\s*\n?/, "")}`;
		}
		return `${partMarker}\n${c}`;
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


