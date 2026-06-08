#!/usr/bin/env bash
set -euo pipefail

write_output() {
	local key="$1"
	local value="$2"
	{
		echo "$key<<EOF"
		echo "$value"
		echo "EOF"
	} >>"$GITHUB_OUTPUT"
}

resolve_path() {
	local root="$1"
	local value="$2"
	if [ -z "$value" ]; then
		return 0
	fi
	if [[ "$value" = /* ]]; then
		printf '%s\n' "$value"
	else
		printf '%s\n' "$root/$value"
	fi
}

resolve_optional_path() {
	local root="$1"
	local value="$2"
	if [ -z "$value" ]; then
		printf '%s\n' ""
		return 0
	fi
	resolve_path "$root" "$value"
}

resolve_diff_arg() {
	local root="$1"
	local value="$2"
	if [ -z "$value" ]; then
		return 0
	fi
	if [[ "$value" == *:* && "$value" != /* && ! -e "$value" ]]; then
		printf '%s\n' "$value"
	elif [[ "$value" = /* ]]; then
		printf '%s\n' "$value"
	else
		printf '%s\n' "$root/$value"
	fi
}

bool_true() {
	case "${1:-}" in
		true|TRUE|True|1|yes|YES|on|ON) return 0 ;;
		*) return 1 ;;
	esac
}

workspace_dir="$(resolve_path "$GITHUB_WORKSPACE" "${WORKING_DIRECTORY:-.}")"
report_md_path="$(resolve_path "$workspace_dir" "${REPORT_MD:-telescope-report.md}")"
report_json_path="$(resolve_path "$workspace_dir" "${REPORT_JSON:-telescope-report.json}")"
report_sarif_path="$(resolve_optional_path "$workspace_dir" "${REPORT_SARIF:-}")"
diff_out_path="$(resolve_path "$workspace_dir" "${DIFF_OUTPUT:-telescope-breaking.json}")"
docs_output_path="$(resolve_path "$workspace_dir" "${DOCS_OUTPUT:-telescope-docs}")"

mkdir -p "$(dirname "$report_md_path")" "$(dirname "$report_json_path")" "$(dirname "$diff_out_path")"
if [ -n "$report_sarif_path" ]; then
	mkdir -p "$(dirname "$report_sarif_path")"
fi
if [ -n "$docs_output_path" ]; then
	mkdir -p "$(dirname "$docs_output_path")"
fi

cd "$workspace_dir"

tmpdir="$(mktemp -d)"
stderr_file="$tmpdir/stderr.log"
errors_file="$tmpdir/errors.log"
counts_file="$tmpdir/counts.json"
lint_json_file="$tmpdir/lint.json"
validate_json_file="$tmpdir/validate.json"
diff_json_file="$tmpdir/diff.json"
diff_ci_json_file="$tmpdir/diff-ci.json"
contract_json_file="$tmpdir/contract.json"
diff_sarif_file="$tmpdir/diff.sarif"
: >"$stderr_file"
: >"$errors_file"
trap 'rm -rf "$tmpdir"' EXIT

# shellcheck disable=SC2206
path_args=(${PATHS:-.})
if [ "${#path_args[@]}" -eq 0 ]; then
	path_args=(.)
fi

effective_ruleset="${RULESET_PATH:-}"
if [ -z "$effective_ruleset" ] && [ -n "${VACUUM_RULESET:-}" ]; then
	effective_ruleset="$VACUUM_RULESET"
fi

declare -a requested_modes=()
declare -A requested_seen=()
add_requested_mode() {
	local mode="$1"
	if [ -z "$mode" ]; then
		return
	fi
	if [ -z "${requested_seen[$mode]:-}" ]; then
		requested_modes+=("$mode")
		requested_seen[$mode]=1
	fi
}
for raw in ${MODE//,/ }; do
	mode="${raw,,}"
	mode="${mode// /}"
	add_requested_mode "$mode"
done
if [ "${#requested_modes[@]}" -eq 0 ]; then
	add_requested_mode "ci"
fi

legacy_ci_only=false
if [ "${#requested_modes[@]}" -eq 1 ] && [ "${requested_modes[0]}" = "ci" ] && [ -z "${REPORT_SARIF:-}" ]; then
	legacy_ci_only=true
fi

append_common_analysis_flags() {
	local -n arr="$1"
	if [ -n "${CONFIG_PATH:-}" ]; then
		arr+=(--config "$(resolve_path "$workspace_dir" "$CONFIG_PATH")")
	fi
	if [ -n "$effective_ruleset" ]; then
		arr+=(--ruleset "$(resolve_path "$workspace_dir" "$effective_ruleset")")
	fi
	if [ -n "${SEVERITY:-}" ]; then
		arr+=(--severity "$SEVERITY")
	fi
	if bool_true "${NO_EXTERNAL_LSP:-false}"; then
		arr+=(--no-external-lsp)
	fi
}

append_breaking_flags() {
	local -n arr="$1"
	if [ -n "${BREAKING_CONFIG:-}" ]; then
		arr+=(--breaking-config "$(resolve_path "$workspace_dir" "$BREAKING_CONFIG")")
	fi
	if ! bool_true "${FAIL_ON_BREAKING:-true}"; then
		arr+=(--fail-on-breaking=false)
	fi
}

overall_exit=0

run_plain() {
	local label="$1"
	shift
	if ! "$@" 2> >(tee -a "$stderr_file" >&2); then
		overall_exit=1
		printf '%s\n' "$label failed" >>"$errors_file"
	fi
}

run_capture_stdout() {
	local outfile="$1"
	local label="$2"
	shift 2
	local cmd_stderr="$tmpdir/${label// /-}.stderr"
	: >"$outfile"
	: >"$cmd_stderr"
	if ! "$@" >"$outfile" 2>"$cmd_stderr"; then
		cat "$cmd_stderr" >&2
		cat "$cmd_stderr" >>"$stderr_file"
		overall_exit=1
		printf '%s\n' "$label failed" >>"$errors_file"
		if [ -s "$cmd_stderr" ]; then
			printf '\n--- %s stderr (last 50 lines) ---\n' "$label" >>"$errors_file"
			tail -n 50 "$cmd_stderr" >>"$errors_file"
		fi
	fi
}

if $legacy_ci_only; then
	cmd=("$TELESCOPE_BIN" ci)
	cmd+=("${path_args[@]}")
	if [ -n "${CONFIG_PATH:-}" ]; then
		cmd+=(--config "$(resolve_path "$workspace_dir" "$CONFIG_PATH")")
	fi
	if [ -n "$effective_ruleset" ]; then
		cmd+=(--ruleset "$(resolve_path "$workspace_dir" "$effective_ruleset")")
	fi
	if [ -n "${SEVERITY:-}" ]; then
		cmd+=(--severity "$SEVERITY")
	fi
	if bool_true "${NO_EXTERNAL_LSP:-false}"; then
		cmd+=(--no-external-lsp)
	fi
	cmd+=(
		--diff-base "${DIFF_BASE:-main}"
		--diff-head "${DIFF_HEAD:-HEAD}"
		--report-scope "${REPORT_SCOPE:-changed}"
		--fail-on "${FAIL_ON:-error}"
		--report-md "$report_md_path"
		--report-json "$report_json_path"
	)
	if bool_true "${COMMENT_PR:-true}"; then
		cmd+=(--comment-pr)
	fi
	append_breaking_flags cmd
	run_plain "ci" "${cmd[@]}"

	if [ -f "$report_json_path" ]; then
		read -r lint_findings breaking_changes < <(
			python3 - "$report_json_path" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data = json.load(fh)
diag = int(data.get("diagnosticCount", 0))
breaking = sum(int(item.get("totalBreakingChanges", 0)) for item in data.get("breakingChanges", []))
print(diag, breaking)
PY
		)
	else
		lint_findings=0
		breaking_changes=0
	fi
	exit_code="$overall_exit"
	error_text="$(tr -d '\000' <"$errors_file" 2>/dev/null || true)"
	write_output "report-md" "$report_md_path"
	write_output "report-json" "$report_json_path"
	write_output "report-sarif" "$report_sarif_path"
	write_output "lint-findings" "${lint_findings:-0}"
	write_output "breaking-changes" "${breaking_changes:-0}"
	write_output "contract-passed" "0"
	write_output "contract-failed" "0"
	write_output "exit-code" "$exit_code"
	write_output "error" "$error_text"
	if [ "$overall_exit" -ne 0 ]; then
		exit "$overall_exit"
	fi
	exit 0
fi

if bool_true "${COMMENT_PR:-false}"; then
	echo "Warning: comment-pr is only supported in ci-only mode; skipping PR comment in unified mode." >&2
fi

declare -a pipeline_modes=()
declare -A pipeline_seen=()
add_pipeline_mode() {
	local mode="$1"
	if [ -z "$mode" ]; then
		return
	fi
	if [ -z "${pipeline_seen[$mode]:-}" ]; then
		pipeline_modes+=("$mode")
		pipeline_seen[$mode]=1
	fi
}

for mode in "${requested_modes[@]}"; do
	case "$mode" in
		ci)
			add_pipeline_mode "lint"
			add_pipeline_mode "validate"
			if [ -n "${DIFF_LEFT:-}" ] || [ -n "${DIFF_RIGHT:-}" ] || [ -n "${DIFF_BASE:-}" ]; then
				add_pipeline_mode "diff"
			fi
			;;
		generate-and-lint)
			add_pipeline_mode "generate"
			add_pipeline_mode "lint"
			;;
		lint|validate|diff|contract|docs|generate)
			add_pipeline_mode "$mode"
			;;
		*)
			echo "unsupported Telescope action mode: $mode" >&2
			overall_exit=1
			printf 'unsupported mode: %s\n' "$mode" >>"$errors_file"
			;;
	esac
done

pipeline_csv="$(IFS=,; echo "${pipeline_modes[*]}")"

if [ -z "$pipeline_csv" ]; then
	echo "no action modes selected" >&2
	overall_exit=1
	printf 'no action modes selected\n' >>"$errors_file"
fi

for mode in "${pipeline_modes[@]}"; do
	case "$mode" in
		lint)
			cmd=("$TELESCOPE_BIN" lint)
			cmd+=("${path_args[@]}")
			append_common_analysis_flags cmd
			if [ -n "${LINT_ENGINE:-}" ]; then
				cmd+=(--engine "$LINT_ENGINE")
			fi
			cmd+=(--format json --fail-on "${FAIL_ON:-error}")
			run_capture_stdout "$lint_json_file" "lint" "${cmd[@]}"
			;;
		validate)
			cmd=("$TELESCOPE_BIN" validate)
			cmd+=("${path_args[@]}")
			append_common_analysis_flags cmd
			cmd+=(--format json --fail-on "${FAIL_ON:-error}")
			run_capture_stdout "$validate_json_file" "validate" "${cmd[@]}"
			;;
		diff)
			explicit_left=""
			explicit_right=""
			if [ -n "${DIFF_LEFT:-}" ] || [ -n "${DIFF_RIGHT:-}" ]; then
				if [ -z "${DIFF_LEFT:-}" ] || [ -z "${DIFF_RIGHT:-}" ]; then
					echo "diff mode requires both diff-left and diff-right" >&2
					overall_exit=1
					printf 'diff mode requires both diff-left and diff-right\n' >>"$errors_file"
					continue
				fi
				explicit_left="$(resolve_diff_arg "$workspace_dir" "$DIFF_LEFT")"
				explicit_right="$(resolve_diff_arg "$workspace_dir" "$DIFF_RIGHT")"
			elif [ "${#path_args[@]}" -eq 1 ] && [ -f "${path_args[0]}" ] && [ -n "${DIFF_BASE:-}" ]; then
				explicit_left="${DIFF_BASE}:${path_args[0]}"
				explicit_right="${path_args[0]}"
			fi
			if [ -n "$explicit_left" ] && [ -n "$explicit_right" ]; then
				cmd=("$TELESCOPE_BIN" diff "$explicit_left" "$explicit_right" --format json -o "$diff_json_file")
				if bool_true "${FAIL_ON_BREAKING:-true}"; then
					cmd+=(--fail-on-breaking)
				fi
				if [ -n "${BREAKING_CONFIG:-}" ]; then
					cmd+=(--breaking-config "$(resolve_path "$workspace_dir" "$BREAKING_CONFIG")")
				fi
				run_plain "diff" "${cmd[@]}"
				if [ -n "$report_sarif_path" ]; then
					cmd=("$TELESCOPE_BIN" diff "$explicit_left" "$explicit_right" --format sarif -o "$diff_sarif_file")
					if bool_true "${FAIL_ON_BREAKING:-true}"; then
						cmd+=(--fail-on-breaking)
					fi
					if [ -n "${BREAKING_CONFIG:-}" ]; then
						cmd+=(--breaking-config "$(resolve_path "$workspace_dir" "$BREAKING_CONFIG")")
					fi
					run_plain "diff sarif" "${cmd[@]}"
				fi
			elif [ -n "${DIFF_BASE:-}" ]; then
				cmd=("$TELESCOPE_BIN" ci)
				cmd+=("${path_args[@]}")
				append_common_analysis_flags cmd
				cmd+=(
					--diff-base "${DIFF_BASE:-main}"
					--diff-head "${DIFF_HEAD:-HEAD}"
					--report-scope "${REPORT_SCOPE:-changed}"
					--fail-on "${FAIL_ON:-error}"
					--report-md "$tmpdir/diff-ci.md"
					--report-json "$diff_ci_json_file"
				)
				append_breaking_flags cmd
				run_plain "diff fallback" "${cmd[@]}"
			else
				echo "diff mode requires diff-left/diff-right or diff-base with a single file path" >&2
				overall_exit=1
				printf 'diff mode requires explicit inputs or diff-base with a single file path\n' >>"$errors_file"
			fi
			;;
		contract)
			contract_spec="${CONTRACT_SPEC:-}"
			if [ -z "$contract_spec" ]; then
				contract_spec="${path_args[0]}"
			fi
			if [ -z "$contract_spec" ]; then
				echo "contract mode requires contract-spec or paths" >&2
				overall_exit=1
				printf 'contract mode requires contract-spec or paths\n' >>"$errors_file"
				continue
			fi
			cmd=("$TELESCOPE_BIN" contract test "$(resolve_path "$workspace_dir" "$contract_spec")")
			if [ -n "${CONTRACT_BASE_URL:-}" ]; then
				cmd+=(--base-url "$CONTRACT_BASE_URL")
			fi
			if bool_true "${CONTRACT_WIRETAP:-false}"; then
				cmd+=(--wiretap)
			fi
			if [ -n "${CONFIG_PATH:-}" ]; then
				cmd+=(--config "$(resolve_path "$workspace_dir" "$CONFIG_PATH")")
			fi
			run_capture_stdout "$contract_json_file" "contract" "${cmd[@]}"
			;;
		docs)
			docs_spec="${CONTRACT_SPEC:-}"
			if [ -z "$docs_spec" ]; then
				docs_spec="${path_args[0]}"
			fi
			if [ -z "$docs_spec" ]; then
				echo "docs mode requires a spec path via paths or contract-spec" >&2
				overall_exit=1
				printf 'docs mode requires a spec path\n' >>"$errors_file"
				continue
			fi
			cmd=("$TELESCOPE_BIN" docs "$(resolve_path "$workspace_dir" "$docs_spec")" --output "$docs_output_path")
			if bool_true "${DOCS_PUBLISH:-false}"; then
				cmd+=(--publish)
			fi
			if [ -n "${CONFIG_PATH:-}" ]; then
				cmd+=(--config "$(resolve_path "$workspace_dir" "$CONFIG_PATH")")
			fi
			run_plain "docs" "${cmd[@]}"
			;;
		generate)
			cmd=("$TELESCOPE_BIN" generate)
			if [ -n "${GENERATE_ROOT:-}" ]; then
				cmd+=(--root "$(resolve_path "$workspace_dir" "$GENERATE_ROOT")")
			fi
			if [ -n "${GENERATE_LANG:-}" ]; then
				cmd+=(--lang "$GENERATE_LANG")
			fi
			if [ -n "${GENERATE_OUTPUT:-}" ]; then
				cmd+=(--output "$(resolve_path "$workspace_dir" "$GENERATE_OUTPUT")")
			fi
			if [ -n "${GENERATE_CONFIG:-}" ]; then
				cmd+=(--config "$(resolve_path "$workspace_dir" "$GENERATE_CONFIG")")
			fi
			if bool_true "${GENERATE_SOURCEMAP:-false}"; then
				cmd+=(--write-sourcemap)
			fi
			run_plain "generate" "${cmd[@]}"
			;;
	esac
done

if [ -s "$diff_json_file" ]; then
	cp "$diff_json_file" "$diff_out_path"
elif [ -s "$diff_ci_json_file" ]; then
	python3 - "$diff_ci_json_file" "$diff_out_path" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data = json.load(fh)
with open(sys.argv[2], "w", encoding="utf-8") as fh:
    json.dump(data.get("breakingChanges", []), fh, indent=2)
    fh.write("\n")
PY
fi

export PIPELINE_MODES="$pipeline_csv"
export LINT_JSON_FILE="$lint_json_file"
export VALIDATE_JSON_FILE="$validate_json_file"
export DIFF_JSON_FILE="$diff_json_file"
export DIFF_CI_JSON_FILE="$diff_ci_json_file"
export CONTRACT_JSON_FILE="$contract_json_file"
export REPORT_JSON_PATH="$report_json_path"
export REPORT_MD_PATH="$report_md_path"
export REPORT_SARIF_PATH="$report_sarif_path"
export COUNTS_FILE="$counts_file"
export DOCS_OUTPUT_PATH="$docs_output_path"

python3 <<'PY'
import json
import os
from pathlib import Path

def load_json(path: str):
    if not path:
        return None
    p = Path(path)
    if not p.exists() or p.stat().st_size == 0:
        return None
    with p.open("r", encoding="utf-8") as fh:
        return json.load(fh)

def severity_level(sev):
    if sev == 1:
        return "error"
    if sev == 2:
        return "warning"
    return "note"

def file_diagnostic_entries(data):
    return data if isinstance(data, list) else []

def file_path(fd):
    return fd.get("path") or fd.get("Path") or ""

def file_diagnostics_list(fd):
    return fd.get("diagnostics") or fd.get("Diagnostics") or []

def count_file_diagnostics(data):
    return sum(len(file_diagnostics_list(fd)) for fd in file_diagnostic_entries(data))

def count_breaking_changes(diff_data, ci_data):
    if isinstance(diff_data, dict):
        return int(diff_data.get("totalBreakingChanges", 0))
    return sum(int(item.get("totalBreakingChanges", 0)) for item in ((ci_data or {}).get("breakingChanges") or []))

def normalized_contract_payload(data):
    if not isinstance(data, dict):
        return None, None, []
    if "result" in data:
        result = data.get("result") or {}
        base = data
    else:
        result = data
        base = {}
    findings = base.get("wiretapFindings") or []
    return result, base, findings

lint_data = load_json(os.environ.get("LINT_JSON_FILE", ""))
validate_data = load_json(os.environ.get("VALIDATE_JSON_FILE", ""))
diff_data = load_json(os.environ.get("DIFF_JSON_FILE", ""))
diff_ci_data = load_json(os.environ.get("DIFF_CI_JSON_FILE", ""))
contract_data = load_json(os.environ.get("CONTRACT_JSON_FILE", ""))

contract_result, contract_base, wiretap_findings = normalized_contract_payload(contract_data)
openapi_result = (contract_result or {}).get("openapi") or {}
arazzo_result = (contract_result or {}).get("arazzo") or {}
contract_passed = int(openapi_result.get("passed", 0)) + int(arazzo_result.get("passed", 0))
contract_total = int(openapi_result.get("total", 0)) + int(arazzo_result.get("total", 0))
contract_failed = max(contract_total - contract_passed, 0)
if contract_total == 0 and isinstance(contract_data, dict) and contract_data.get("error"):
    contract_failed = 1

lint_findings = count_file_diagnostics(lint_data) + count_file_diagnostics(validate_data)
breaking_changes = count_breaking_changes(diff_data, diff_ci_data)

modes = [m for m in os.environ.get("PIPELINE_MODES", "").split(",") if m]
summary = {
    "modes": modes,
    "lint": {"findings": count_file_diagnostics(lint_data)} if "lint" in modes else None,
    "validate": {"findings": count_file_diagnostics(validate_data)} if "validate" in modes else None,
    "diff": {"breakingChanges": breaking_changes} if "diff" in modes else None,
    "contract": {
        "passed": contract_passed,
        "failed": contract_failed,
        "baseUrl": contract_base.get("baseUrl"),
    } if "contract" in modes else None,
    "docs": {"output": os.environ.get("DOCS_OUTPUT_PATH", "")} if "docs" in modes else None,
}

with open(os.environ["REPORT_JSON_PATH"], "w", encoding="utf-8") as fh:
    json.dump(summary, fh, indent=2)
    fh.write("\n")

lines = ["## Telescope Report", ""]
if modes:
    lines.append(f"- Modes: {', '.join(modes)}")
if summary["lint"] is not None:
    lines.append(f"- Lint findings: {summary['lint']['findings']}")
if summary["validate"] is not None:
    lines.append(f"- Validation findings: {summary['validate']['findings']}")
if summary["diff"] is not None:
    lines.append(f"- Breaking changes: {summary['diff']['breakingChanges']}")
if summary["contract"] is not None:
    lines.append(f"- Contract tests: {summary['contract']['passed']} passed, {summary['contract']['failed']} failed")
if summary["docs"] is not None:
    lines.append(f"- Documentation output: {summary['docs']['output']}")
lines.append("")
with open(os.environ["REPORT_MD_PATH"], "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))

report_sarif = os.environ.get("REPORT_SARIF_PATH", "")
if report_sarif:
    results = []

    def add_diag_results(data, default_rule):
        for fd in file_diagnostic_entries(data):
            path = file_path(fd)
            for diag in file_diagnostics_list(fd):
                start = ((diag.get("range") or {}).get("start") or {})
                end = ((diag.get("range") or {}).get("end") or {})
                results.append({
                    "ruleId": str(diag.get("code") or default_rule),
                    "level": severity_level(diag.get("severity")),
                    "message": {"text": diag.get("message", "")},
                    "locations": [{
                        "physicalLocation": {
                            "artifactLocation": {"uri": path},
                            "region": {
                                "startLine": int(start.get("line", 0)) + 1,
                                "startColumn": int(start.get("character", 0)) + 1,
                                "endLine": int(end.get("line", 0)) + 1,
                                "endColumn": int(end.get("character", 0)) + 1,
                            },
                        }
                    }],
                })

    add_diag_results(lint_data, "telescope-lint")
    add_diag_results(validate_data, "telescope-validate")

    if isinstance(diff_data, dict):
        for change in diff_data.get("changes") or []:
            if not change.get("breaking"):
                continue
            prop = change.get("property") or "(property)"
            original = change.get("original") or ""
            new = change.get("new") or ""
            results.append({
                "ruleId": "openapi-diff",
                "level": "error",
                "message": {"text": f"Breaking API change: {prop} ({original} -> {new})"},
            })
    else:
        for item in ((diff_ci_data or {}).get("breakingChanges") or []):
            total = int(item.get("totalBreakingChanges", 0))
            if total <= 0:
                continue
            results.append({
                "ruleId": "openapi-diff",
                "level": "error",
                "message": {"text": f"{total} breaking API change(s) detected"},
                "locations": [{
                    "physicalLocation": {
                        "artifactLocation": {"uri": item.get("path", "")},
                    }
                }],
            })

    for item in openapi_result.get("results") or []:
        if item.get("pass", False):
            continue
        label = " ".join(part for part in [item.get("method"), item.get("path")] if part)
        detail = item.get("error") or "Contract test failed"
        results.append({
            "ruleId": "contract-test",
            "level": "error",
            "message": {"text": f"{label}: {detail}" if label else detail},
        })

    for workflow in arazzo_result.get("workflows") or []:
        if workflow.get("pass", False):
            continue
        detail = workflow.get("error") or "Arazzo workflow failed"
        results.append({
            "ruleId": "contract-workflow",
            "level": "error",
            "message": {"text": f"{workflow.get('workflowId') or 'workflow'}: {detail}"},
        })

    for finding in wiretap_findings or []:
        msg = " ".join(part for part in [finding.get("method"), finding.get("path"), finding.get("message")] if part)
        results.append({
            "ruleId": finding.get("ruleId") or "wiretap",
            "level": "error" if (finding.get("severity") or "error") == "error" else "warning",
            "message": {"text": msg or "Wiretap validation finding"},
        })

    sarif = {
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {"name": "telescope-action", "version": "1.0.0"}},
            "results": results,
        }],
    }
    with open(report_sarif, "w", encoding="utf-8") as fh:
        json.dump(sarif, fh, indent=2)
        fh.write("\n")

with open(os.environ["COUNTS_FILE"], "w", encoding="utf-8") as fh:
    json.dump({
        "lint_findings": lint_findings,
        "breaking_changes": breaking_changes,
        "contract_passed": contract_passed,
        "contract_failed": contract_failed,
    }, fh)
PY

lint_findings="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["lint_findings"])' "$counts_file")"
breaking_changes="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["breaking_changes"])' "$counts_file")"
contract_passed="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["contract_passed"])' "$counts_file")"
contract_failed="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["contract_failed"])' "$counts_file")"

findings_exit=0
if [ "${lint_findings:-0}" -gt 0 ]; then
	findings_exit=1
fi
if bool_true "${FAIL_ON_BREAKING:-true}" && [ "${breaking_changes:-0}" -gt 0 ]; then
	findings_exit=1
fi
if [ "${contract_failed:-0}" -gt 0 ]; then
	findings_exit=1
fi

effective_exit=0
if [ "$findings_exit" -ne 0 ]; then
	effective_exit=1
elif [ "$overall_exit" -ne 0 ]; then
	if [ -s "$errors_file" ] || [ -s "$stderr_file" ]; then
		effective_exit=1
		if [ -s "$stderr_file" ] && ! grep -q 'stderr (last 50 lines)' "$errors_file" 2>/dev/null; then
			printf '\n--- CLI stderr (last 50 lines) ---\n' >>"$errors_file"
			tail -n 50 "$stderr_file" >>"$errors_file"
		fi
	fi
fi

error_text="$(tr -d '\000' <"$errors_file" 2>/dev/null || true)"

write_output "report-md" "$report_md_path"
write_output "report-json" "$report_json_path"
write_output "report-sarif" "$report_sarif_path"
write_output "lint-findings" "$lint_findings"
write_output "breaking-changes" "$breaking_changes"
write_output "contract-passed" "$contract_passed"
write_output "contract-failed" "$contract_failed"
write_output "exit-code" "$effective_exit"
write_output "error" "$error_text"

if [ "$effective_exit" -ne 0 ]; then
	exit "$effective_exit"
fi
