//go:build darwin && arm64

package bun

import _ "embed"

//go:embed runner/dist/telescope-runner-darwin-arm64
var runnerBinary []byte
