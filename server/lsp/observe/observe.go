package observe

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"runtime"
	"sync"
	"time"

	"github.com/sailpoint-oss/telescope/server/core/graph"
)

// TraceAttr generates a unique trace ID attribute for structured logging.
func TraceAttr() slog.Attr {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return slog.String("trace_id", hex.EncodeToString(b[:]))
}

// GraphInfo holds pipeline-backed workspace graph statistics for the
// $/telescope/graphInfo notification.
type GraphInfo struct {
	NodeCount       int            `json:"nodeCount"`
	EdgeCount       int            `json:"edgeCount"`
	RootCount       int            `json:"rootCount"`
	DirtyNodeCount  int            `json:"dirtyNodeCount"`
	StageDurations  map[string]int `json:"stageDurations"`
	MemoryUsageMB   float64        `json:"memoryUsageMb"`
	SnapshotVersion int64          `json:"snapshotVersion"`
}

// CollectGraphInfo builds GraphInfo from a workspace graph. StageDurations is
// the aggregate of clean cached stage results across all nodes. If snap is
// non-nil, SnapshotVersion is set from the snapshot ID.
func CollectGraphInfo(g *graph.WorkspaceGraph, snap *graph.Snapshot) GraphInfo {
	info := GraphInfo{
		StageDurations: make(map[string]int),
	}
	if g == nil {
		return info
	}
	nodes := g.AllNodes()
	info.NodeCount = len(nodes)
	info.RootCount = len(g.Roots())
	for _, uri := range nodes {
		info.EdgeCount += len(g.EdgesFrom(uri))
		node := g.Node(uri)
		if node != nil {
			for stage, result := range node.StageResults {
				if result == nil || node.DirtyStages[stage] {
					continue
				}
				info.StageDurations[string(stage)] += int(result.Duration.Milliseconds())
			}
			for _, d := range node.DirtyStages {
				if d {
					info.DirtyNodeCount++
					break
				}
			}
		}
	}
	if snap != nil {
		info.SnapshotVersion = int64(snap.ID)
	}
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	info.MemoryUsageMB = float64(m.Alloc) / (1024 * 1024)
	return info
}

// RulePerf holds per-rule performance data for the $/telescope/rulePerf notification.
type RulePerf struct {
	Rules []RuleTiming `json:"rules"`
}

// RuleTiming holds timing and diagnostic count for a single rule.
type RuleTiming struct {
	RuleID   string `json:"ruleId"`
	Duration int    `json:"durationMs"`
	Count    int    `json:"count"`
}

// RulePerfTracker tracks per-rule execution timing.
type RulePerfTracker struct {
	mu      sync.RWMutex
	timings map[string]*RuleTiming
}

// NewRulePerfTracker creates a new RulePerfTracker.
func NewRulePerfTracker() *RulePerfTracker {
	return &RulePerfTracker{
		timings: make(map[string]*RuleTiming),
	}
}

// Record adds a rule execution to the tracker.
func (t *RulePerfTracker) Record(ruleID string, duration time.Duration, diagCount int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if cur, ok := t.timings[ruleID]; ok {
		cur.Duration += int(duration.Milliseconds())
		cur.Count += diagCount
	} else {
		t.timings[ruleID] = &RuleTiming{
			RuleID:   ruleID,
			Duration: int(duration.Milliseconds()),
			Count:    diagCount,
		}
	}
}

// Collect returns the current rule performance snapshot.
func (t *RulePerfTracker) Collect() RulePerf {
	t.mu.RLock()
	defer t.mu.RUnlock()
	rules := make([]RuleTiming, 0, len(t.timings))
	for _, rt := range t.timings {
		rules = append(rules, *rt)
	}
	return RulePerf{Rules: rules}
}

// Reset clears all tracked timings.
func (t *RulePerfTracker) Reset() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.timings = make(map[string]*RuleTiming)
}
