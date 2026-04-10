#!/usr/bin/env python3
"""Summarize Go statement coverage per package from a cover profile.

Usage (from repo root):
  cd server && go test -race -coverprofile=coverage.out -covermode=atomic ./...
  python3 ../scripts/coverage-go-packages.py coverage.out

Optional: pass a prefix filter (e.g. lsp/ for packages under server/lsp/).
"""
from __future__ import annotations

import sys
from collections import defaultdict


def load_coverage(path: str) -> dict[str, tuple[int, int]]:
    """Return map pkg -> (total_statements, covered_statements)."""
    by_pkg: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if i == 0 or not line:
                continue
            parts = line.rsplit(" ", 2)
            if len(parts) != 3:
                continue
            loc, nstmt_s, cnt_s = parts
            try:
                nstmt = int(nstmt_s)
                cnt = int(cnt_s)
            except ValueError:
                continue
            if ":" not in loc:
                continue
            file_path = loc.split(":", 1)[0]
            marker = "/telescope/server/"
            if marker not in file_path:
                continue
            rel = file_path.split(marker, 1)[1]
            pkg = "/".join(rel.split("/")[:-1])
            # server/main.go and other root-level files use empty pkg key
            if not pkg:
                pkg = ""
            by_pkg[pkg][0] += nstmt
            if cnt > 0:
                by_pkg[pkg][1] += nstmt
    return {k: (v[0], v[1]) for k, v in by_pkg.items()}


def pct(total: int, covered: int) -> float:
    return 100.0 * covered / total if total else 0.0


def main() -> int:
    argv = sys.argv[1:]
    if not argv:
        print(
            "usage: coverage-go-packages.py <coverage.out> [prefix-filter] "
            "[--min-pct N] [--skip-package PKG ...]]",
            file=sys.stderr,
        )
        return 2
    path = argv[0]
    prefix = ""
    min_pct: float | None = None
    skip_packages: set[str] = set()
    i = 1
    while i < len(argv):
        if argv[i] == "--min-pct" and i + 1 < len(argv):
            min_pct = float(argv[i + 1])
            i += 2
            continue
        if argv[i] == "--skip-package":
            i += 1
            while i < len(argv) and not argv[i].startswith("--"):
                skip_packages.add(argv[i])
                i += 1
            continue
        if not argv[i].startswith("--"):
            prefix = argv[i]
        i += 1

    if min_pct is not None:
        # Root main.go, helper-only packages (see docs/coverage-targets.md).
        skip_packages |= {"", ".", "rules/testing", "testutil"}

    data = load_coverage(path)
    rows: list[tuple[float, str, int, int]] = []
    for pkg, (total, covered) in sorted(data.items()):
        if pkg in skip_packages:
            continue
        if prefix and not (pkg == prefix.rstrip("/") or pkg.startswith(prefix.rstrip("/") + "/")):
            continue
        rows.append((pct(total, covered), pkg, covered, total))
    rows.sort(key=lambda r: (r[0], r[1]))

    print(f"{'coverage':>8}  {'pkg':<50}  (covered/total stmts)")
    for p, pkg, cv, t in rows:
        print(f"{p:7.1f}%  {pkg:<50}  ({cv}/{t})")

    agg_t = sum(r[3] for r in rows)
    agg_c = sum(r[2] for r in rows)
    print("-" * 72)
    print(f"{pct(agg_t, agg_c):7.1f}%  {'(filtered total)':<50}  ({agg_c}/{agg_t})")

    if min_pct is not None:
        bad = [(p, pkg) for p, pkg, _, t in rows if t > 0 and p + 1e-9 < min_pct]
        if bad:
            print(f"\nFAIL: packages below {min_pct}%:", file=sys.stderr)
            for p, pkg in sorted(bad, key=lambda x: x[0]):
                print(f"  {pkg}: {p:.1f}%", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
