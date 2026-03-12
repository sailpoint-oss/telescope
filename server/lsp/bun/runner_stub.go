//go:build !embed_runner

package bun

// runnerBinary is nil when built without the embed_runner tag. The manager
// will fall back to dev-mode (TELESCOPE_DEV=1 + bun on PATH) or report
// unavailable. Library consumers (e.g. cartographer) that only use the
// lint/analysis SDK do not need the embedded runner binary.
var runnerBinary []byte
