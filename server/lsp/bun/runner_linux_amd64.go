//go:build embed_runner && linux && amd64

package bun

import _ "embed"

//go:embed runner/dist/telescope-runner-linux-x64
var runnerBinary []byte
