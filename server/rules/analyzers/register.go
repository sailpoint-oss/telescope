package analyzers

import (
	"github.com/LukasParke/gossip"
)

// RegisterAll registers all semantic analyzers on the given server. Each rule's
// Define().Register() call handles both metadata registration and analyzer
// registration. All rules are registered unconditionally; filtering is handled
// by the DiagnosticTransformer.
func RegisterAll(s *gossip.Server) {
	registerUnresolvedRef(s)
	registerNamingAnalyzers(s)
	registerDocumentationAnalyzers(s)
	registerStructureAnalyzers(s)
	registerTypesAnalyzers(s)
	registerSecurityAnalyzers(s)
	registerServersAnalyzers(s)
	registerPathsAnalyzers(s)
	registerOWASPAnalyzers(s)
	registerExtendedAnalyzers(s)
	registerStructuralValidation(s)
	registerMarkdownAnalyzers(s)
	registerUnusedComponentAnalyzers(s)
	registerCompletenessAnalyzers(s)
	registerExampleValidationAnalyzers(s)
	registerMigrationAnalyzers(s)
}
