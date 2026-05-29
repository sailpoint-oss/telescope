package analyzers

import (
	"github.com/LukasParke/gossip"
	"github.com/sailpoint-oss/barrelman"
	barrelAnalyzers "github.com/sailpoint-oss/barrelman/analyzers"
	"github.com/sailpoint-oss/telescope/server/bridge"
)

// telescopeGenericRules are the rules that live in Telescope itself and are
// vendor-neutral (no organization-specific guideline assumptions or internal
// monorepo layout). They are always registered.
func telescopeGenericRules() []barrelman.Rule {
	return []barrelman.Rule{
		exampleMatchesFormatRule(),
		contactPropertiesRule(),
		licenseURLRule(),
	}
}

// RegisterAll registers all semantic analyzers by delegating to barrelman's
// analyzer registry, layering in telescope-native generic rules, applying
// any barrelman plug-ins (which may contribute org-flavoured rules), then
// wrapping each rule for gossip.
//
// Policy rules that previously lived here moved to a private downstream pack
// so telescope ships a fully org-neutral default surface.
func RegisterAll(s *gossip.Server) {
	reg := barrelman.NewRegistry()
	barrelAnalyzers.RegisterAll(reg)
	barrelAnalyzers.RegisterAll(barrelman.DefaultRegistry)
	for _, rule := range telescopeGenericRules() {
		reg.Register(rule)
		barrelman.DefaultRegistry.Register(rule)
	}
	barrelman.ApplyPlugins(reg)
	barrelman.ApplyPlugins(barrelman.DefaultRegistry)
	for _, rule := range reg.AllRules() {
		s.Analyze(rule.ID, bridge.WrapForGossip(rule))
	}
}
