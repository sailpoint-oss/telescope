import { writeFile, readFile } from "node:fs/promises";
import type { Diagnostic as EngineDiagnostic } from "../engine/index.js";
import {
	maybeWriteGithubSummary,
	runLint,
	toGithubAnnotation,
} from "./lint.js";
import { computeChangedLinesFromGitDiff } from "./diff.js";
import { computeGates } from "./gating.js";
import { writeMarkdownReport } from "./report.js";
import {
	buildPrSummaryComment,
	GitHubClient,
	readPullRequestContextFromEnv,
	splitCommentIntoParts,
} from "./github.js";

export interface CiCommandArgs {
	workspace: string;
	reportMdPath: string;
	commentPr: boolean;
	commentReview: boolean;
	diffBase?: string;
	diffHead?: string;
	maxInline: number;
	maxPrCommentChars: number;
	maxSummaryPerFile: number;
}

export function parseCiArgs(argv: string[]): CiCommandArgs {
	let workspace = process.cwd();
	let reportMdPath = "telescope-report.md";
	let commentPr = false;
	let commentReview = false;
	let diffBase: string | undefined;
	let diffHead: string | undefined;
	let maxInline = 50;
	// GitHub PR comments get hard to scan when too long; keep pages compact.
	let maxPrCommentChars = 18000;
	let maxSummaryPerFile = 20;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a) continue;
		if (a === "--workspace") {
			const v = argv[i + 1];
			if (!v) throw new Error("--workspace requires a value");
			workspace = v;
			i++;
			continue;
		}
		if (a === "--report-md") {
			const v = argv[i + 1];
			if (!v) throw new Error("--report-md requires a path");
			reportMdPath = v;
			i++;
			continue;
		}
		if (a === "--comment-pr") {
			commentPr = true;
			continue;
		}
		if (a === "--comment-review") {
			commentReview = true;
			continue;
		}
		if (a === "--diff-base") {
			const v = argv[i + 1];
			if (!v) throw new Error("--diff-base requires a ref");
			diffBase = v;
			i++;
			continue;
		}
		if (a === "--diff-head") {
			const v = argv[i + 1];
			if (!v) throw new Error("--diff-head requires a ref");
			diffHead = v;
			i++;
			continue;
		}
		if (a === "--max-inline") {
			const v = argv[i + 1];
			if (!v) throw new Error("--max-inline requires a number");
			maxInline = Number.parseInt(v, 10);
			if (!Number.isFinite(maxInline) || maxInline < 0) {
				throw new Error("--max-inline must be a non-negative integer");
			}
			i++;
			continue;
		}
		if (a === "--max-pr-comment-chars") {
			const v = argv[i + 1];
			if (!v) throw new Error("--max-pr-comment-chars requires a number");
			maxPrCommentChars = Number.parseInt(v, 10);
			if (!Number.isFinite(maxPrCommentChars) || maxPrCommentChars < 1000) {
				throw new Error("--max-pr-comment-chars must be >= 1000");
			}
			i++;
			continue;
		}
		if (a === "--max-summary-per-file") {
			const v = argv[i + 1];
			if (!v) throw new Error("--max-summary-per-file requires a number");
			maxSummaryPerFile = Number.parseInt(v, 10);
			if (!Number.isFinite(maxSummaryPerFile) || maxSummaryPerFile < 0) {
				throw new Error("--max-summary-per-file must be a non-negative integer");
			}
			i++;
			continue;
		}
		if (a === "--help" || a === "-h") {
			process.exit(0);
		}
	}

	return {
		workspace,
		reportMdPath,
		commentPr,
		commentReview,
		diffBase,
		diffHead,
		maxInline,
		maxPrCommentChars,
		maxSummaryPerFile,
	};
}

function hasAnyErrors(diags: EngineDiagnostic[]): boolean {
	return diags.some((d) => d.severity === 1);
}

export async function runCiCommand(argv: string[]): Promise<void> {
	const args = parseCiArgs(argv);

	// Always lint with full workspace context.
	const result = await runLint({
		workspace: args.workspace,
		format: "github",
		roots: [],
		summary: true,
	});

	// Always emit annotations in CI mode (helps in Actions logs).
	for (const d of result.diagnostics) console.log(toGithubAnnotation(d));

	// Always write the full markdown artifact (repo-relative links are fine in artifacts).
	await writeFile(args.reportMdPath, writeMarkdownReport(result), "utf8");

	// Compute changed files/lines (either from explicit refs or GitHub PR event).
	const prEventName = process.env.GITHUB_EVENT_NAME ?? "";
	const prEventPath = process.env.GITHUB_EVENT_PATH ?? "";
	let baseRef = args.diffBase;
	let headRef = args.diffHead;

	if ((!baseRef || !headRef) && prEventName === "pull_request" && prEventPath) {
		try {
			const raw = await readFile(prEventPath, "utf8");
			const payload = JSON.parse(raw) as {
				pull_request?: { base?: { sha?: string }; head?: { sha?: string } };
			};
			baseRef = baseRef ?? payload.pull_request?.base?.sha;
			headRef = headRef ?? payload.pull_request?.head?.sha;
		} catch {
			// ignore
		}
	}

	let changedFiles: Set<string> | undefined;
	let changedLinesByFile: Map<string, Set<number>> | undefined;
	if (baseRef && headRef) {
		const diff = await computeChangedLinesFromGitDiff({
			cwd: result.workspacePath,
			base: baseRef,
			head: headRef,
		});
		changedFiles = diff.changedFiles;
		changedLinesByFile = diff.changedLinesByFile;
	}

	const gates = computeGates({
		diagnostics: result.diagnostics,
		workspacePath: result.workspacePath,
		changedFiles,
	});

	// Write an enhanced GitHub step summary (short, high-signal).
	await maybeWriteGithubSummary({
		...result,
		extraLines: [
			`Changed files diagnostics: ${gates.changedFileCounts.total} (errors: ${gates.changedFileCounts.error}, warnings: ${gates.changedFileCounts.warning})`,
			`Gates: globalErrors=${gates.hasGlobalErrors ? "fail" : "pass"}, changedFileWarningsOrErrors=${gates.hasChangedFileWarnOrError ? "fail" : "pass"}`,
		],
	});

	// CI exit policy:
	// - fail on any errors anywhere
	// - fail on any warnings OR errors in changed files (PR gate)
	if (gates.hasGlobalErrors || gates.hasChangedFileWarnOrError) {
		process.exitCode = 1;
	}

	// Post/update PR feedback (only when running on a PR in GitHub Actions).
	if (
		(args.commentPr || args.commentReview) &&
		(prEventName === "pull_request" || prEventName === "pull_request_target") &&
		prEventPath
	) {
		const token = process.env.GITHUB_TOKEN ?? "";
		if (!token) {
			console.warn("telescope ci: GITHUB_TOKEN not set; skipping PR comments.");
			return;
		}
		let payload: unknown = null;
		try {
			payload = JSON.parse(await readFile(prEventPath, "utf8"));
		} catch {
			console.warn(
				"telescope ci: failed to read/parse GITHUB_EVENT_PATH; skipping PR comments.",
			);
			return;
		}
		const pr = readPullRequestContextFromEnv(payload);
		if (!pr) {
			console.warn(
				"telescope ci: could not determine PR context (owner/repo/number/base/head); skipping PR comments.",
			);
			return;
		}

		const gh = new GitHubClient({ token, owner: pr.owner, repo: pr.repo });

		const githubCtx = { owner: pr.owner, repo: pr.repo, sha: pr.headSha };

		const runId = Number.parseInt(process.env.GITHUB_RUN_ID ?? "", 10);
		const runAttempt = Number.parseInt(process.env.GITHUB_RUN_ATTEMPT ?? "1", 10);
		const runSha = process.env.GITHUB_SHA ?? pr.headSha;
		const hasRunInfo = Number.isFinite(runId) && runId > 0 && Number.isFinite(runAttempt) && runAttempt > 0;
		const runMarker = hasRunInfo ? `<!-- telescope-run:${runId}:${runAttempt}:${runSha} -->` : "<!-- telescope-run:local -->";

		const parseRunMarker = (
			body: string,
		): { runId: number; attempt: number } | null => {
			const m = /<!--\s*telescope-run:(\d+):(\d+):[a-f0-9]{7,40}\s*-->/.exec(body);
			if (!m) return null;
			const rid = Number.parseInt(m[1] ?? "0", 10);
			const att = Number.parseInt(m[2] ?? "0", 10);
			if (!Number.isFinite(rid) || !Number.isFinite(att) || rid <= 0 || att <= 0) return null;
			return { runId: rid, attempt: att };
		};

		const compareRun = (
			a: { runId: number; attempt: number },
			b: { runId: number; attempt: number },
		): number => {
			if (a.runId !== b.runId) return a.runId - b.runId;
			return a.attempt - b.attempt;
		};

		const isTelescopeComment = (body: string): boolean => {
			return (
				body.includes("<!-- telescope-ci") ||
				body.includes("<!-- telescope-run:") ||
				body.includes("<!-- telescope-ci-review") ||
				body.includes("<!-- telescope-ci -->")
			);
		};

		// Overlap safety: if we can see a newer run already posted, do nothing.
		if (hasRunInfo) {
			const existingAll = await gh.listIssueComments(pr.pullNumber);
			let newest: { runId: number; attempt: number } | null = null;
			for (const c of existingAll) {
				if (!isTelescopeComment(c.body)) continue;
				const r = parseRunMarker(c.body);
				if (!r) continue;
				if (!newest || compareRun(r, newest) > 0) newest = r;
			}
			if (newest && compareRun(newest, { runId, attempt: runAttempt }) > 0) {
				console.warn(
					`telescope ci: newer run already posted comments (runId=${newest.runId} attempt=${newest.attempt}); skipping.`,
				);
				return;
			}
		}

		const upsertPaged = async (marker: string, body: string) => {
			const bodyWithRun = `${marker}\n${runMarker}\n${body.replace(marker, "").replace(/^\s*\n?/, "")}`;
			const parts = splitCommentIntoParts({
				body: bodyWithRun,
				maxChars: args.maxPrCommentChars,
				marker,
			});

			const all = await gh.listIssueComments(pr.pullNumber);
			const existing = all
				.filter((c) => c.body.includes(marker))
				.sort((a, b) => a.id - b.id);

			const keptIds = new Set<number>();

			for (let i = 0; i < parts.length; i++) {
				const p = parts[i]!;
				if (existing[i]) {
					await gh.updateIssueComment(existing[i]!.id, p);
					keptIds.add(existing[i]!.id);
				} else {
					// create at end; ordering will be stable after first run
					await gh.createIssueComment(pr.pullNumber, p);
				}
			}

			// Re-list so we can safely delete extras (including any concurrent duplicates created while we were posting).
			const after = await gh.listIssueComments(pr.pullNumber);
			const markerComments = after
				.filter((c) => c.body.includes(marker))
				.sort((a, b) => a.id - b.id);

			// Keep the first N pages for this marker for this run; delete everything else for this marker (older runs/duplicates).
			const toKeep = markerComments.slice(0, parts.length).map((c) => c.id);
			for (const id of toKeep) keptIds.add(id);

			for (const c of markerComments.slice(parts.length)) {
				try {
					await gh.deleteIssueComment(c.id);
				} catch (err) {
					// Likely deleted by an overlapping run; ignore.
					console.warn(`telescope ci: delete comment failed (id=${c.id}): ${String(err)}`);
				}
			}

			// Delete any legacy/duplicate Telescope comments from older runs (but never delete a newer run).
			if (hasRunInfo) {
				for (const c of after) {
					if (!isTelescopeComment(c.body)) continue;
					if (keptIds.has(c.id)) continue;
					// Keep unrelated markers belonging to a newer run.
					const r = parseRunMarker(c.body);
					if (r && compareRun(r, { runId, attempt: runAttempt }) > 0) continue;
					try {
						await gh.deleteIssueComment(c.id);
					} catch (err) {
						console.warn(`telescope ci: delete legacy comment failed (id=${c.id}): ${String(err)}`);
					}
				}
			} else {
				// No run info (local); do not attempt broad cleanup.
			}
		};

		// Delta FIRST (easier mental model for PR authors), then full.
		if (args.commentPr) {
			if (!changedFiles) {
				console.warn(
					"telescope ci: unable to compute changed files; skipping delta PR comment.",
				);
			} else {
				const marker = "<!-- telescope-ci:delta -->";
				const body = buildPrSummaryComment({
					marker,
					github: githubCtx,
					workspacePath: result.workspacePath,
					diagnostics: result.diagnostics,
					changedFiles,
					maxPerFile: args.maxSummaryPerFile,
				});
				await upsertPaged(marker, body);
			}

			const marker = "<!-- telescope-ci:full -->";
			const fullReport = writeMarkdownReport(result, {
				github: githubCtx,
				// Keep PR comments readable; the artifact contains the full, untruncated report.
				maxDiagnosticsPerRule: 20,
			});
			const body = [
				marker,
				"## Telescope CI — Full workspace",
				"",
				"This report contains a full summary of the designated workspace.",
				"",
				fullReport,
			].join("\n");
			await upsertPaged(marker, body);
		}

		// Legacy flag: keep it non-blocking and non-spammy for now.
		if (args.commentReview) {
			// Intentionally no-op: review creation is not idempotent and can spam on every push.
		}
	}
}


