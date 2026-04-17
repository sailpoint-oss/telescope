package analyzers

import (
	"github.com/LukasParke/gossip"
	"github.com/sailpoint-oss/barrelman"
	barrelAnalyzers "github.com/sailpoint-oss/barrelman/analyzers"
	"github.com/sailpoint-oss/telescope/server/bridge"
)

// telescopeNativeRules holds analyzers that live in telescope itself (not
// upstream in barrelman) but still use the barrelman rule contract. They are
// registered into the same registry that barrelman populates so they appear in
// the same CollectAll walk and honor the same enablement map.
func telescopeNativeRules() []barrelman.Rule {
	return []barrelman.Rule{
		exampleMatchesFormatRule(),
		contactPropertiesRule(),
		licenseURLRule(),
	}
}

// RegisterAll registers all semantic analyzers by delegating to barrelman's
// analyzer registry, layering in telescope-native rules, then wrapping each
// rule for gossip.
func RegisterAll(s *gossip.Server) {
	reg := barrelman.NewRegistry()
	barrelAnalyzers.RegisterAll(reg)
	barrelAnalyzers.RegisterAll(barrelman.DefaultRegistry)
	for _, rule := range telescopeNativeRules() {
		reg.Register(rule)
		barrelman.DefaultRegistry.Register(rule)
	}
	for _, rule := range reg.AllRules() {
		s.Analyze(rule.ID, bridge.WrapForGossip(rule))
	}
}
