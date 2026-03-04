package lsp

import (
	"fmt"
	"strings"

	"github.com/sailpoint-oss/telescope/server/openapi"
)

// HealthScore represents a computed API quality score breakdown.
type HealthScore struct {
	Total            int
	Documentation    int // 0-25
	Security         int // 0-25
	Completeness     int // 0-25
	Structure        int // 0-25
	PathCount        int
	SchemaCount      int
	OperationCount   int
}

// computeHealthScore analyzes an OpenAPI index and produces a quality score.
func computeHealthScore(idx *openapi.Index) HealthScore {
	score := HealthScore{}

	if idx == nil || idx.Document == nil {
		return score
	}

	score.PathCount = len(idx.Document.Paths)
	if idx.Document.Components != nil {
		score.SchemaCount = len(idx.Document.Components.Schemas)
	}

	// Count operations
	for _, item := range idx.Document.Paths {
		score.OperationCount += len(item.Operations())
	}

	score.Documentation = computeDocScore(idx)
	score.Security = computeSecurityScore(idx)
	score.Completeness = computeCompletenessScore(idx)
	score.Structure = computeStructureScore(idx)

	score.Total = score.Documentation + score.Security + score.Completeness + score.Structure
	return score
}

func computeDocScore(idx *openapi.Index) int {
	if idx.Document == nil {
		return 0
	}

	total := 0
	checked := 0

	// Info description
	checked++
	if idx.Document.Info != nil && idx.Document.Info.Description.Text != "" {
		total++
	}

	// Operation descriptions
	for _, item := range idx.Document.Paths {
		for _, mo := range item.Operations() {
			checked++
			if mo.Operation.Description.Text != "" {
				total++
			}
		}
	}

	// Schema descriptions
	if idx.Document.Components != nil {
		for _, schema := range idx.Document.Components.Schemas {
			checked++
			if schema.Description.Text != "" {
				total++
			}
		}
	}

	if checked == 0 {
		return 25
	}
	return 25 * total / checked
}

func computeSecurityScore(idx *openapi.Index) int {
	points := 0
	maxPoints := 4

	// Has security schemes defined
	if len(idx.SecuritySchemes) > 0 {
		points++
	}

	// Has global security
	if len(idx.Document.Security) > 0 {
		points++
	}

	// Operations have security
	opsWithSec := 0
	totalOps := 0
	for _, item := range idx.Document.Paths {
		for _, mo := range item.Operations() {
			totalOps++
			if len(mo.Operation.Security) > 0 {
				opsWithSec++
			}
		}
	}
	if totalOps > 0 && (opsWithSec == totalOps || len(idx.Document.Security) > 0) {
		points++
	}

	// Servers use HTTPS
	httpsCount := 0
	for _, srv := range idx.Document.Servers {
		if strings.HasPrefix(srv.URL, "https://") {
			httpsCount++
		}
	}
	if len(idx.Document.Servers) > 0 && httpsCount == len(idx.Document.Servers) {
		points++
	}
	if len(idx.Document.Servers) == 0 {
		points++ // no servers defined is not a security issue
	}

	return 25 * points / maxPoints
}

func computeCompletenessScore(idx *openapi.Index) int {
	points := 0
	maxPoints := 0

	for _, item := range idx.Document.Paths {
		for _, mo := range item.Operations() {
			// Has error responses
			maxPoints++
			for code := range mo.Operation.Responses {
				if strings.HasPrefix(code, "4") || strings.HasPrefix(code, "5") || code == "default" {
					points++
					break
				}
			}

			// Has operationId
			maxPoints++
			if mo.Operation.OperationID != "" {
				points++
			}

			// Has summary
			maxPoints++
			if mo.Operation.Summary != "" {
				points++
			}
		}
	}

	// Schemas have examples
	if idx.Document.Components != nil {
		for _, schema := range idx.Document.Components.Schemas {
			maxPoints++
			if schema.Example != nil {
				points++
			}
		}
	}

	if maxPoints == 0 {
		return 25
	}
	return 25 * points / maxPoints
}

func computeStructureScore(idx *openapi.Index) int {
	points := 0
	maxPoints := 4

	// Has info block with title
	if idx.Document.Info != nil && idx.Document.Info.Title != "" {
		points++
	}

	// Has paths
	if len(idx.Document.Paths) > 0 {
		points++
	}

	// All refs resolve
	unresolvedCount := 0
	for target := range idx.Refs {
		if _, err := idx.Resolve(target); err != nil {
			unresolvedCount++
		}
	}
	if unresolvedCount == 0 {
		points++
	}

	// Has tags defined
	if len(idx.Document.Tags) > 0 {
		points++
	}

	return 25 * points / maxPoints
}

// formatHealthSummary returns a human-readable health score string for code lens.
func formatHealthSummary(score HealthScore) string {
	return fmt.Sprintf("API Health: %d/100 | %d paths | %d schemas | doc: %d%% sec: %d%% complete: %d%%",
		score.Total,
		score.PathCount,
		score.SchemaCount,
		score.Documentation*4,
		score.Security*4,
		score.Completeness*4,
	)
}
