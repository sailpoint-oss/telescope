package schemas

import "embed"

//go:embed generated/*.json
var FS embed.FS
