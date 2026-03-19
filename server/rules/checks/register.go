// Package checks implements syntactic diagnostic rules. These operate on
// raw source content and tree-sitter trees without needing the OpenAPI index.
package checks

import (
	"github.com/LukasParke/gossip"
	"github.com/sailpoint-oss/barrelman"
	barrelChecks "github.com/sailpoint-oss/barrelman/checks"
	"github.com/sailpoint-oss/telescope/server/bridge"
)

// RegisterAll registers all syntactic checks by delegating to barrelman's
// check registry, then wrapping each rule for gossip.
func RegisterAll(s *gossip.Server) {
	reg := barrelman.NewRegistry()
	barrelChecks.RegisterAll(reg)
	barrelChecks.RegisterAll(barrelman.DefaultRegistry)
	for _, rule := range reg.AllRules() {
		s.Analyze(rule.ID, bridge.WrapForGossip(rule))
	}
}
