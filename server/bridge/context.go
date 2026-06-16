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
	// TargetChecked is set by the LSP UserData provider when targeting deps
	// are configured. When false, barrelman rules are not suppressed by target gates.
	TargetChecked bool
	// IsOpenAPIDiagnosticTarget is set by the LSP UserData provider when the
	// document matches pattern + content classification gates.
	IsOpenAPIDiagnosticTarget bool
}
