package bridge

import (
	"github.com/sailpoint-oss/barrelman"
	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// AnalysisData bundles the per-document index with optional project-level
// cross-file resolution. Set as UserData on treesitter.AnalysisContext.
type AnalysisData struct {
	Index                        *openapi.Index
	Resolver                     barrelman.CrossRefResolver
	DocURI                       string
	TargetVersion                navigator.Version
	SuppressMalformedDiagnostics bool
}
