# Telescope LSP Trace Runbook

This runbook captures a full extension-host debug session so Telescope behavior can be replayed and compared.

## Scope

Use this when an issue only reproduces in the VS Code extension development host and not in isolated unit/integration tests.

## Prerequisites

- Repository opened at `telescope` root.
- `go`, `bun`, and VS Code/Cursor debug support installed.
- Launch configuration present in `.vscode/launch.json` (`Launch Extension`).

## 1) Start a trace session

1. Open settings for the extension host workspace and set:
   - `telescope.trace = "verbose"`
2. In `.vscode/launch.json` debug config env, set:
   - `TELESCOPE_LOG_LEVEL=debug`
3. Start `Launch Extension` (F5).
4. In the Extension Development Host window, open the target workspace/file that reproduces the issue.

## 2) Capture all three log streams

Keep these visible while reproducing:

1. **Telescope output channel**
   - Output panel -> `Telescope Language Server`
   - Contains extension lifecycle + LSP trace from client side.
2. **Extension host log**
   - Output panel -> `Log (Extension Host)`
   - Contains extension host runtime events and errors.
3. **Server stderr/debug**
   - Debug Console for the launched extension host session.
   - Contains Go `slog` output from `telescope serve`.

## 3) Reproduce with an action checklist

Use a deterministic script while reproducing:

1. Open file.
2. Click exact symbol/line.
3. Trigger command (if applicable).
4. Trigger language feature (hover/definition/completion/references/etc.).
5. Record expected result vs actual result.

Repeat the same sequence twice to validate reproducibility.

## 4) Stop and export logs

1. Stop debugging.
2. Save/export:
   - Telescope output
   - Extension host log
   - Debug console output
3. Preserve the file under a run folder such as:
   - `.telescope/debug-runs/<timestamp>/`
4. Merge all streams into one timeline artifact:
   - `pnpm run trace:merge -- --telescope-output <...> --extension-host <...> --server-log <...> --out <...>`
   - See `docs/LSP-TRACE-TIMELINE.md` for schema and examples.

## 5) Required metadata for each run

Always include:

- Commit SHA for `telescope`.
- Workspace fixture or repo path used.
- OS + editor version.
- `telescope.trace` value.
- `TELESCOPE_LOG_LEVEL` value.
- Exact action script (the ordered interaction checklist).

## 6) Correlation tips

- Match LSP method names from client trace to server request logs.
- Compare timestamps around:
  - `didOpen`, `didChange`, `didClose`
  - request handlers (`hover`, `definition`, `completion`, etc.)
  - `publishDiagnostics`
- If behavior differs across runs, diff by timestamp window around the first divergent user action.

## 7) Fast sanity checklist

- Server process started from expected binary path.
- Correct workspace folder/session selected in multi-root mode.
- Target file classified as OpenAPI (`openapi-yaml`/`openapi-json`) when expected.
- Trace level still set to `verbose` after reload/restart.
