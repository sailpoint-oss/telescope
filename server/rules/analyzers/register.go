package analyzers

import (
	"github.com/LukasParke/gossip"
	"github.com/sailpoint-oss/barrelman"
	barrelAnalyzers "github.com/sailpoint-oss/barrelman/analyzers"
	"github.com/sailpoint-oss/telescope/server/bridge"
)

// RegisterAll registers all semantic analyzers by delegating to barrelman's
// analyzer registry, then wrapping each rule for gossip.
func RegisterAll(s *gossip.Server) {
	reg := barrelman.NewRegistry()
	barrelAnalyzers.RegisterAll(reg)
	barrelAnalyzers.RegisterAll(barrelman.DefaultRegistry)
	for _, rule := range reg.AllRules() {
		s.Analyze(rule.ID, bridge.WrapForGossip(rule))
	}
}
