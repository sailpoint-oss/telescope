//go:build embed_runner && darwin && amd64

package bun

import _ "embed"

//go:embed runner/dist/telescope-runner-darwin-x64
var runnerBinary []byte
