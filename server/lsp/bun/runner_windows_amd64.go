//go:build windows && amd64

package bun

import _ "embed"

//go:embed runner/dist/telescope-runner-windows-x64.exe
var runnerBinary []byte
