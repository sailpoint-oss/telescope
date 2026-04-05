# Telescope Trace Timeline Artifact

This document defines the merged timeline artifact used for extension-only bug reports.

## Goal

Produce one sorted JSONL file that combines:

- Telescope output channel logs
- Extension host logs
- Telescope server logs (debug console / stderr)

## Merge command

Run from repository root:

```bash
pnpm run trace:merge -- \
  --telescope-output /path/to/telescope-output.log \
  --extension-host /path/to/extension-host.log \
  --server-log /path/to/server.log \
  --out .telescope/debug-runs/2026-03-12/trace.timeline.jsonl
```

Input flags are optional except `--out`. If a source is omitted, it is skipped.

## Output schema

Each line is one JSON object:

```json
{
  "ts": "2026-03-12T17:21:45.123Z",
  "source": "telescope-output",
  "line": 92,
  "message": "[Setup] [trace] {\"ts\":\"2026-03-12T17:21:45.123Z\",\"event\":\"command.start\",\"command\":\"telescope.graphInfo\"}"
}
```

Fields:

- `ts`: Parsed ISO timestamp when available (empty string if not parseable)
- `source`: `telescope-output` | `extension-host` | `server-log`
- `line`: Original line number from the source file
- `message`: Original line text (unmodified)

## Sample timeline excerpt

```json
{"ts":"2026-03-12T17:21:45.123Z","source":"telescope-output","line":92,"message":"[Setup] [trace] {\"ts\":\"2026-03-12T17:21:45.123Z\",\"event\":\"command.start\",\"command\":\"telescope.graphInfo\",\"activeUri\":\"file:///repo/openapi.yaml\"}"}
{"ts":"2026-03-12T17:21:45.140Z","source":"server-log","line":301,"message":"time=2026-03-12T17:21:45.140Z level=DEBUG msg=\"lsp request\" trace_id=9a167f52d63fbf20 method=textDocument/definition"}
{"ts":"2026-03-12T17:21:45.147Z","source":"server-log","line":308,"message":"time=2026-03-12T17:21:45.147Z level=DEBUG msg=\"definition: resolved cross-file ref\" trace_id=9a167f52d63fbf20 ref=\"../schemas/pet.yaml#/Pet\" targetURI=\"file:///repo/schemas/pet.yaml\""}
{"ts":"2026-03-12T17:21:45.170Z","source":"telescope-output","line":101,"message":"[Setup] [trace] {\"ts\":\"2026-03-12T17:21:45.170Z\",\"event\":\"command.end\",\"command\":\"telescope.graphInfo\"}"}
```

## Interpreting the timeline

Use this order for triage:

1. Find the first `command.start` or `ui.selectionChanged` event.
2. Match the nearest LSP method call and `trace_id`.
3. Follow server handler logs with the same `trace_id`.
4. Confirm final client-visible output (`command.end`, diagnostics, or UI events).

## Assessment: child-LSP stderr capture

Current state:

- Child LSP subprocess stderr is discarded by `gossip/lspclient` transport.
- Telescope still captures child diagnostics via LSP notifications, and lifecycle via manager logs.

Impact:

- Runtime warnings emitted directly to child stderr are not currently present in merged timeline output.

Decision for this change set:

- Keep current behavior (no transport-level stderr plumbing change yet).
- This avoids changing cross-repo transport behavior in the same observability patch.

Follow-up option:

- Add opt-in stderr forwarding in `gossip/lspclient/transport.go` behind a debug env flag.
