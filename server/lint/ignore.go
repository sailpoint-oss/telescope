package lint

import (
	"strings"

	"github.com/LukasParke/gossip/protocol"
)

// IgnoreComment is the comment prefix used to suppress rules inline.
const IgnoreComment = "x-telescope-ignore"

// FilterIgnored removes diagnostics that have been suppressed by inline comments.
// Lines containing "x-telescope-ignore" or "x-telescope-ignore: rule-id" suppress
// diagnostics on the following line.
func FilterIgnored(diags []protocol.Diagnostic, text string) []protocol.Diagnostic {
	ignoreLines := parseIgnoreComments(text)
	if len(ignoreLines) == 0 {
		return diags
	}

	var filtered []protocol.Diagnostic
	for _, d := range diags {
		line := d.Range.Start.Line
		if shouldIgnore(line, d.Code, ignoreLines) {
			continue
		}
		filtered = append(filtered, d)
	}
	return filtered
}

type ignoreDirective struct {
	Line    uint32
	RuleIDs []string // empty means ignore all
}

func parseIgnoreComments(text string) []ignoreDirective {
	var directives []ignoreDirective
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		idx := strings.Index(trimmed, IgnoreComment)
		if idx < 0 {
			continue
		}

		rest := trimmed[idx+len(IgnoreComment):]
		var ruleIDs []string
		if strings.HasPrefix(rest, ":") {
			parts := strings.Split(rest[1:], ",")
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p != "" {
					ruleIDs = append(ruleIDs, p)
				}
			}
		}

		directives = append(directives, ignoreDirective{
			Line:    uint32(i),
			RuleIDs: ruleIDs,
		})
	}
	return directives
}

func shouldIgnore(diagLine uint32, code interface{}, directives []ignoreDirective) bool {
	codeStr := ""
	if code != nil {
		if s, ok := code.(string); ok {
			codeStr = s
		}
	}

	for _, d := range directives {
		// Ignore directive on the line before the diagnostic
		if d.Line+1 == diagLine || d.Line == diagLine {
			if len(d.RuleIDs) == 0 {
				return true
			}
			for _, id := range d.RuleIDs {
				if id == codeStr {
					return true
				}
			}
		}
	}
	return false
}
