//go:build (!linux && !darwin && !windows) || (!amd64 && !arm64) || (windows && arm64)

package bun

// runnerBinary is nil on unsupported platforms. The manager will fall back
// to dev-mode (TELESCOPE_DEV=1 + bun on PATH) or report unavailable.
var runnerBinary []byte
