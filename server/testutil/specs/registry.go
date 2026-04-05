// Package specs provides embedded OpenAPI test specifications for use in
// tests and benchmarks. Specs are sourced from the original Telescope
// TypeScript test-files collection and cover multiple OpenAPI versions,
// formats, sizes, and error conditions.
package specs

import (
	"bytes"
	"embed"
	"path/filepath"
	"strings"

	"github.com/sailpoint-oss/telescope/server/openapi"
)

//go:embed *.yaml *.json
var specFS embed.FS

// SpecSize categorises a specification by approximate line count.
type SpecSize int

const (
	Small  SpecSize = iota // <100 lines
	Medium                 // 100-500 lines
	Large                  // 500-2000 lines
	XLarge                 // >2000 lines
)

func (s SpecSize) String() string {
	switch s {
	case Small:
		return "Small"
	case Medium:
		return "Medium"
	case Large:
		return "Large"
	case XLarge:
		return "XLarge"
	default:
		return "Unknown"
	}
}

// Spec is a single embedded OpenAPI test specification with metadata.
type Spec struct {
	Name    string
	Content []byte
	Format  openapi.FileFormat
	Version openapi.Version
	Lines   int
	Size    SpecSize
	Tags    []string
}

var registry []Spec

func init() {
	entries, err := specFS.ReadDir(".")
	if err != nil {
		panic("specs: failed to read embedded directory: " + err.Error())
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		content, err := specFS.ReadFile(name)
		if err != nil {
			continue
		}
		s := Spec{
			Name:    strings.TrimSuffix(name, filepath.Ext(name)),
			Content: content,
			Format:  openapi.FormatFromURI(name),
			Lines:   bytes.Count(content, []byte("\n")) + 1,
		}

		s.Version = detectVersion(content, s.Format)
		s.Size = sizeFromLines(s.Lines)
		s.Tags = tagsForSpec(name)
		registry = append(registry, s)
	}
}

func detectVersion(content []byte, format openapi.FileFormat) openapi.Version {
	text := string(content)
	if format == openapi.FormatJSON {
		// Crude but sufficient for metadata: look for "openapi":"X.Y.Z"
		if idx := strings.Index(text, `"openapi"`); idx >= 0 {
			rest := text[idx:]
			if qi := strings.Index(rest, ":"); qi >= 0 {
				return extractVersion(rest[qi+1:])
			}
		}
		return openapi.VersionUnknown
	}
	for _, line := range strings.SplitN(text, "\n", 20) {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "openapi:") {
			return extractVersion(trimmed[len("openapi:"):])
		}
		if strings.HasPrefix(trimmed, "swagger:") {
			return openapi.Version20
		}
	}
	return openapi.VersionUnknown
}

func extractVersion(raw string) openapi.Version {
	raw = strings.TrimSpace(raw)
	raw = strings.Trim(raw, `"'`)
	raw = strings.TrimSpace(raw)
	return openapi.VersionFromString(raw)
}

func sizeFromLines(n int) SpecSize {
	switch {
	case n < 100:
		return Small
	case n < 500:
		return Medium
	case n < 2000:
		return Large
	default:
		return XLarge
	}
}

func tagsForSpec(name string) []string {
	var tags []string
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, ".json") {
		tags = append(tags, "json")
	}
	if strings.Contains(lower, "invalid") || strings.Contains(lower, "error") {
		tags = append(tags, "invalid")
	}
	if strings.Contains(lower, "valid") && !strings.Contains(lower, "invalid") {
		tags = append(tags, "valid")
	}
	if strings.Contains(lower, "warning") {
		tags = append(tags, "warnings")
	}
	if strings.Contains(lower, "multi-file") {
		tags = append(tags, "multi-file")
	}
	if strings.Contains(lower, "minimal") {
		tags = append(tags, "minimal")
	}
	if strings.Contains(lower, "ascii") {
		tags = append(tags, "ascii")
	}
	if strings.Contains(lower, "duplicate") {
		tags = append(tags, "duplicates")
	}
	return tags
}

// All returns every registered spec.
func All() []Spec { return registry }

// ByName returns the spec with the given base name (without extension).
// Returns an empty Spec if not found.
func ByName(name string) Spec {
	for _, s := range registry {
		if s.Name == name {
			return s
		}
	}
	return Spec{}
}

// BySize returns all specs of the given size category.
func BySize(size SpecSize) []Spec {
	var out []Spec
	for _, s := range registry {
		if s.Size == size {
			out = append(out, s)
		}
	}
	return out
}

// ByTag returns all specs that have the given tag.
func ByTag(tag string) []Spec {
	var out []Spec
	for _, s := range registry {
		for _, t := range s.Tags {
			if t == tag {
				out = append(out, s)
				break
			}
		}
	}
	return out
}

// YAML returns all YAML-format specs.
func YAML() []Spec {
	var out []Spec
	for _, s := range registry {
		if s.Format == openapi.FormatYAML {
			out = append(out, s)
		}
	}
	return out
}

// JSON returns all JSON-format specs.
func JSON() []Spec {
	var out []Spec
	for _, s := range registry {
		if s.Format == openapi.FormatJSON {
			out = append(out, s)
		}
	}
	return out
}

// BenchmarkSpecs returns a curated set of specs for benchmarking: one per size
// tier (Small, Medium, Large, XLarge). These are self-contained specs that
// parse and index without external $ref resolution.
func BenchmarkSpecs() []Spec {
	picks := map[SpecSize]string{
		Small:  "api-standalone",
		Medium: "OpenAPI-example",
		Large:  "test-valid",
		XLarge: "Plex-API",
	}
	var out []Spec
	for _, size := range []SpecSize{Small, Medium, Large, XLarge} {
		s := ByName(picks[size])
		if len(s.Content) > 0 {
			out = append(out, s)
		}
	}
	return out
}

// URI returns a file:// URI for this spec, suitable for use with gossip's
// document store.
func (s Spec) URI() string {
	ext := ".yaml"
	if s.Format == openapi.FormatJSON {
		ext = ".json"
	}
	return "file:///testutil/specs/" + s.Name + ext
}

// LanguageID returns the LSP language ID for this spec's format.
func (s Spec) LanguageID() string {
	if s.Format == openapi.FormatJSON {
		return "json"
	}
	return "yaml"
}
