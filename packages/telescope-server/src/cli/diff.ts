import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitDiffOptions {
	cwd: string;
	base: string;
	head: string;
}

export interface ChangedLinesResult {
	changedFiles: Set<string>;
	changedLinesByFile: Map<string, Set<number>>;
}

function normalizeGitPath(p: string): string {
	// Git paths in diff are repo-relative with forward slashes.
	return p.replace(/^\.?\//, "").replace(/\\/g, "/");
}

export async function computeChangedLinesFromGitDiff(
	opts: GitDiffOptions,
): Promise<ChangedLinesResult> {
	// -U0 gives only the changed lines (no context).
	const { stdout } = await execFileAsync(
		"git",
		["diff", "-U0", `${opts.base}...${opts.head}`],
		{ cwd: opts.cwd, maxBuffer: 50 * 1024 * 1024 },
	);

	const changedFiles = new Set<string>();
	const changedLinesByFile = new Map<string, Set<number>>();

	let currentFile: string | null = null;

	const lines = stdout.split(/\r?\n/);
	for (const line of lines) {
		// Identify file boundaries via "+++ b/<path>" (skip deletions: +++ /dev/null)
		if (line.startsWith("+++ ")) {
			const m = /^\+\+\+\s+(.*)$/.exec(line);
			const rhs = m?.[1]?.trim() ?? "";
			if (rhs === "/dev/null") {
				currentFile = null;
				continue;
			}
			if (rhs.startsWith("b/")) {
				currentFile = normalizeGitPath(rhs.slice(2));
				changedFiles.add(currentFile);
				if (!changedLinesByFile.has(currentFile)) {
					changedLinesByFile.set(currentFile, new Set());
				}
			} else {
				currentFile = normalizeGitPath(rhs);
				changedFiles.add(currentFile);
				if (!changedLinesByFile.has(currentFile)) {
					changedLinesByFile.set(currentFile, new Set());
				}
			}
			continue;
		}

		// Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
		if (line.startsWith("@@") && currentFile) {
			const m = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);
			if (!m) continue;
			const newStart = Number.parseInt(m[1] ?? "0", 10);
			const newCount = Number.parseInt(m[2] ?? "1", 10);
			if (!Number.isFinite(newStart) || !Number.isFinite(newCount)) continue;
			if (newCount <= 0) continue; // pure deletion

			const set = changedLinesByFile.get(currentFile) ?? new Set<number>();
			for (let i = 0; i < newCount; i++) set.add(newStart + i);
			changedLinesByFile.set(currentFile, set);
		}
	}

	return { changedFiles, changedLinesByFile };
}


