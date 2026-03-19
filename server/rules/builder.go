package rules

import (
	"github.com/LukasParke/gossip"
	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/telescope/server/bridge"
)

type RuleBuilder = barrelman.RuleBuilder

var Define = barrelman.Define

// RegisterGossip is a convenience function for registering a barrelman rule with
// both the registry and a gossip server.
func RegisterGossip(b *barrelman.RuleBuilder, s *gossip.Server) {
	rule := b.Build()
	barrelman.DefaultRegistry.Register(rule)
	s.Analyze(rule.ID, bridge.WrapForGossip(rule))
}
