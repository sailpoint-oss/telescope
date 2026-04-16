package diff

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/pb33f/libopenapi/what-changed/model"
)

// FormatOpts controls text output.
type FormatOpts struct {
	BreakingOnly bool
}

// FormatText writes a human-readable summary of changes.
func FormatText(r *Result, w io.Writer, opts FormatOpts) error {
	if r == nil || r.Changes == nil {
		_, err := fmt.Fprintln(w, "No changes.")
		return err
	}
	all := r.Changes.GetAllChanges()
	if len(all) == 0 {
		_, err := fmt.Fprintln(w, "No changes.")
		return err
	}
	for _, c := range all {
		if opts.BreakingOnly && !c.Breaking {
			continue
		}
		line := describeChange(c)
		_, err := fmt.Fprintln(w, line)
		if err != nil {
			return err
		}
	}
	return nil
}

func describeChange(c *model.Change) string {
	if c == nil {
		return ""
	}
	prefix := "change"
	if c.Breaking {
		prefix = "BREAKING"
	}
	prop := c.Property
	if prop == "" {
		prop = "(property)"
	}
	return fmt.Sprintf("[%s] %s: %s -> %s (%s)", prefix, prop, c.Original, c.New, changeTypeName(c.ChangeType))
}

// FormatJSON writes a JSON summary compatible with machine-readable reports.
func FormatJSON(r *Result, w io.Writer) error {
	type row struct {
		Property string `json:"property"`
		Breaking bool   `json:"breaking"`
		Original string `json:"original,omitempty"`
		New      string `json:"new,omitempty"`
		Type     string `json:"changeType,omitempty"`
	}
	out := struct {
		TotalChanges         int    `json:"totalChanges"`
		TotalBreakingChanges int    `json:"totalBreakingChanges"`
		Changes              []row  `json:"changes"`
		CompareErrors        string `json:"compareErrors,omitempty"`
	}{
		TotalChanges:         r.TotalChanges(),
		TotalBreakingChanges: r.TotalBreakingChanges(),
	}
	if r != nil && r.Changes != nil {
		for _, c := range r.Changes.GetAllChanges() {
			if c == nil {
				continue
			}
			out.Changes = append(out.Changes, row{
				Property: c.Property,
				Breaking: c.Breaking,
				Original: c.Original,
				New:      c.New,
				Type:     changeTypeName(c.ChangeType),
			})
		}
	}
	if r != nil && r.CompareErrs != nil {
		out.CompareErrors = r.CompareErrs.Error()
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(out)
}

// FormatMarkdown writes a markdown table of changes.
func FormatMarkdown(r *Result, w io.Writer, opts FormatOpts) error {
	if r == nil || r.Changes == nil {
		_, err := fmt.Fprintln(w, "_No changes._")
		return err
	}
	fmt.Fprintf(w, "**Total changes:** %d  **Breaking:** %d\n\n", r.TotalChanges(), r.TotalBreakingChanges())
	fmt.Fprintln(w, "| Breaking | Property | Original | New |")
	fmt.Fprintln(w, "|----------|----------|----------|-----|")
	for _, c := range r.Changes.GetAllChanges() {
		if c == nil {
			continue
		}
		if opts.BreakingOnly && !c.Breaking {
			continue
		}
		b := "no"
		if c.Breaking {
			b = "yes"
		}
		fmt.Fprintf(w, "| %s | %s | %s | %s |\n", b, escapeMD(c.Property), escapeMD(c.Original), escapeMD(c.New))
	}
	return nil
}

func changeTypeName(t int) string {
	switch t {
	case model.Modified:
		return "modified"
	case model.PropertyAdded:
		return "property_added"
	case model.ObjectAdded:
		return "object_added"
	case model.ObjectRemoved:
		return "object_removed"
	case model.PropertyRemoved:
		return "property_removed"
	default:
		return "unknown"
	}
}

func escapeMD(s string) string {
	s = strings.ReplaceAll(s, "|", "\\|")
	s = strings.ReplaceAll(s, "\n", " ")
	return s
}

// FormatSARIF writes SARIF 2.1.0 with one result per breaking change (and optionally all changes).
func FormatSARIF(r *Result, w io.Writer, opts FormatOpts) error {
	// Minimal SARIF for CI consumption.
	results := []map[string]any{}
	if r != nil && r.Changes != nil {
		for _, c := range r.Changes.GetAllChanges() {
			if c == nil {
				continue
			}
			if opts.BreakingOnly && !c.Breaking {
				continue
			}
			level := "note"
			if c.Breaking {
				level = "error"
			}
			msg := describeChange(c)
			results = append(results, map[string]any{
				"ruleId": "openapi-diff",
				"level":  level,
				"message": map[string]any{"text": msg},
			})
		}
	}
	sarif := map[string]any{
		"$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
		"version": "2.1.0",
		"runs": []any{
			map[string]any{
				"tool": map[string]any{
					"driver": map[string]any{
						"name":    "telescope-diff",
						"version": "1.0.0",
					},
				},
				"results": results,
			},
		},
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(sarif)
}
