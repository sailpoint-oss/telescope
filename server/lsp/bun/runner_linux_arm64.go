//go:build linux && arm64

package bun

import _ "embed"

//go:embed runner/dist/telescope-runner-linux-arm64
var runnerBinary []byte
