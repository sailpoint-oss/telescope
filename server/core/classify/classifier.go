package classify

import (
	"path/filepath"
	"regexp"
	"strings"

	navigator "github.com/sailpoint-oss/navigator"
)

// Signal represents a single classification signal with its weight.
type Signal struct {
	Name   string
	Score  float64
	Weight float64
}

// FileClassification is the result of classifying a file.
type FileClassification struct {
	IsOpenAPI      bool
	DocumentKind   navigator.DocumentKind
	Version        string   // OpenAPI or Arazzo version when detected
	Confidence     float64  // 0.0-1.0
	OpenAPIVersion string   // "2.0", "3.0", "3.1", "3.2" or empty
	IsFragment     bool     // referenced via $ref, no root version
	Signals        []Signal // individual signal contributions
}

// FileClassifier uses scored heuristics to determine if a file is an OpenAPI document.
type FileClassifier struct {
	configOverrides map[string]bool   // URI glob -> forced classification
	knownRootDirs   map[string]bool   // directories containing known root specs
	includePatterns []string          // config include globs (files that should be considered)
	excludePatterns []string          // config exclude globs (files that should be excluded)
}

// NewFileClassifier creates a new FileClassifier with no overrides.
func NewFileClassifier() *FileClassifier {
	return &FileClassifier{
		configOverrides: make(map[string]bool),
		knownRootDirs:   make(map[string]bool),
	}
}

// SetIncludeExclude configures include/exclude patterns from the workspace config.
// Files matching an exclude pattern are never classified as OpenAPI.
// Files matching an include pattern receive a confidence boost.
func (c *FileClassifier) SetIncludeExclude(include, exclude []string) {
	c.includePatterns = include
	c.excludePatterns = exclude
}

// Per-key weights from the roadmap
var rootKeyWeights = map[string]float64{
	"openapi":      0.95,
	"swagger":      0.95,
	"paths":        0.60,
	"components":   0.60,
	"webhooks":     0.50,
	"servers":      0.40,
	"info":         0.30,
	"security":     0.30,
	"externalDocs": 0.30,
	"tags":         0.20,
}

// Fragment key weights for files that look like OpenAPI fragments
var fragmentKeyWeights = map[string]float64{
	"allOf":      0.50,
	"oneOf":      0.50,
	"anyOf":      0.50,
	"$ref":       0.40,
	"schema":     0.40,
	"parameters": 0.40,
	"responses":  0.40,
	"properties": 0.30,
}

// Known OpenAPI file extensions that get a bonus
var oasExtensions = map[string]bool{
	".openapi.yaml": true,
	".openapi.json": true,
	".oas.yaml":     true,
	".oas.json":     true,
}

// RegisterRootDir marks a directory as containing a known root spec for proximity scoring.
func (c *FileClassifier) RegisterRootDir(dir string) {
	if c.knownRootDirs == nil {
		c.knownRootDirs = make(map[string]bool)
	}
	c.knownRootDirs[filepath.ToSlash(dir)] = true
}

// Classify analyzes content and metadata to produce a classification.
func (c *FileClassifier) Classify(uri string, content []byte, isGraphMember bool) FileClassification {
	var signals []Signal

	// 1. Config override — check first, can short-circuit
	for pattern, isOpenAPI := range c.configOverrides {
		if matchGlob(pattern, uri) {
			score := 0.0
			if isOpenAPI {
				score = 1.0
			}
			signals = append(signals, Signal{Name: "config-override", Score: score, Weight: 1.0})
			kind := navigator.DocumentKindUnknown
			if isOpenAPI {
				kind = navigator.DocumentKindOpenAPI
			}
			return c.finalize(signals, "", false, &isOpenAPI, kind)
		}
	}

	// 2. Exclude patterns — if the file matches an exclude, never classify as OpenAPI
	for _, pat := range c.excludePatterns {
		if matchGlob(pat, uri) {
			signals = append(signals, Signal{Name: "config-exclude", Score: 0.0, Weight: 1.0})
			forceFalse := false
			return c.finalize(signals, "", false, &forceFalse, navigator.DocumentKindUnknown)
		}
	}

	// 3. Graph membership — if referenced by known OpenAPI, it's a fragment
	if isGraphMember {
		signals = append(signals, Signal{Name: "graph-membership", Score: 1.0, Weight: 1.0})
		forceTrue := true
		return c.finalize(signals, "", true, &forceTrue, navigator.DocumentKindOpenAPI)
	}

	scanLen := len(content)
	if scanLen > 4096 {
		scanLen = 4096
	}
	var head string
	if scanLen > 0 {
		head = string(content[:scanLen])
	}

	// 3. Arazzo root detection
	arazzoVersion, arazzoFound := detectArazzoRoot(head)
	if arazzoFound {
		signals = append(signals, Signal{Name: "arazzo-root-key", Score: 1.0, Weight: 1.0})
		forceFalse := false
		return c.finalize(signals, arazzoVersion, false, &forceFalse, navigator.DocumentKindArazzo)
	}

	// 4. Root key detection (definitive version detection)
	rootVersion, rootFound := detectRootKey(head)
	if rootFound {
		signals = append(signals, Signal{Name: "root-key", Score: 1.0, Weight: 0.95})
	}

	// 5. Per-key weighted scoring: sum all matching key weights
	keyScore := computeKeyScore(head)
	if keyScore > 0 {
		signals = append(signals, Signal{Name: "key-score", Score: keyScore, Weight: 1.0})
	}

	// 6. File extension bonus for .openapi.yaml, .oas.yaml, etc.
	if hasOASExtension(uri) {
		signals = append(signals, Signal{Name: "oas-extension", Score: 1.0, Weight: 0.15})
	} else {
		ext := fileExtFromURI(uri)
		if ext == ".yaml" || ext == ".yml" || ext == ".json" {
			signals = append(signals, Signal{Name: "file-extension", Score: 1.0, Weight: 0.05})
		}
	}

	// 7. Include patterns: +0.10 if file matches configured include globs
	for _, pat := range c.includePatterns {
		if matchGlob(pat, uri) {
			signals = append(signals, Signal{Name: "config-include", Score: 1.0, Weight: 0.10})
			break
		}
	}

	// 8. Workspace proximity: +0.10 if directory contains a known root spec
	if c.isNearKnownRoot(uri) {
		signals = append(signals, Signal{Name: "workspace-proximity", Score: 1.0, Weight: 0.10})
	}

	kind := navigator.DocumentKindUnknown
	if rootFound {
		kind = navigator.DocumentKindOpenAPI
	}
	return c.finalize(signals, rootVersion, false, nil, kind)
}

// AddOverride adds a config-driven classification override (glob pattern -> isOpenAPI).
func (c *FileClassifier) AddOverride(pattern string, isOpenAPI bool) {
	if c.configOverrides == nil {
		c.configOverrides = make(map[string]bool)
	}
	c.configOverrides[pattern] = isOpenAPI
}

func (c *FileClassifier) finalize(signals []Signal, version string, isFragment bool, explicitIsOpenAPI *bool, explicitKind navigator.DocumentKind) FileClassification {
	if len(signals) == 0 {
		var isOpenAPI bool
		if explicitIsOpenAPI != nil {
			isOpenAPI = *explicitIsOpenAPI
		}
		kind := explicitKind
		if kind == navigator.DocumentKindUnknown && isOpenAPI {
			kind = navigator.DocumentKindOpenAPI
		}
		return FileClassification{
			IsOpenAPI:      isOpenAPI,
			DocumentKind:   kind,
			Version:        version,
			Confidence:     0,
			OpenAPIVersion: openAPIVersionForKind(kind, version),
			IsFragment:     isFragment,
			Signals:        nil,
		}
	}

	// Sum all signal weights, capped at 1.0
	var totalScore float64
	for _, s := range signals {
		totalScore += s.Score * s.Weight
	}
	if totalScore > 1.0 {
		totalScore = 1.0
	}

	confidence := totalScore

	// Determine IsOpenAPI
	var isOpenAPI bool
	if explicitIsOpenAPI != nil {
		isOpenAPI = *explicitIsOpenAPI
	} else {
		isOpenAPI = confidence >= 0.60
	}

	kind := explicitKind
	if kind == navigator.DocumentKindUnknown && isOpenAPI {
		kind = navigator.DocumentKindOpenAPI
	}

	return FileClassification{
		IsOpenAPI:      isOpenAPI,
		DocumentKind:   kind,
		Version:        version,
		Confidence:     confidence,
		OpenAPIVersion: openAPIVersionForKind(kind, version),
		IsFragment:     isFragment,
		Signals:        signals,
	}
}

func openAPIVersionForKind(kind navigator.DocumentKind, version string) string {
	if kind != navigator.DocumentKindOpenAPI {
		return ""
	}
	return version
}

// computeKeyScore sums per-key weights for all matching top-level keys.
func computeKeyScore(head string) float64 {
	lower := strings.ToLower(head)
	var score float64

	for key, weight := range rootKeyWeights {
		if matchKey(lower, strings.ToLower(key)) {
			score += weight
		}
	}

	for key, weight := range fragmentKeyWeights {
		if matchKey(lower, strings.ToLower(key)) {
			score += weight
		}
	}

	if score > 1.0 {
		score = 1.0
	}
	return score
}

func matchKey(content, key string) bool {
	// YAML: key at start of line
	pat := `(?m)^` + regexp.QuoteMeta(key) + `\s*:`
	if matched, _ := regexp.MatchString(pat, content); matched {
		return true
	}
	// JSON: "key":
	pat = `"` + regexp.QuoteMeta(key) + `"\s*:`
	matched, _ := regexp.MatchString(pat, content)
	return matched
}

func hasOASExtension(uri string) bool {
	path := uri
	if strings.HasPrefix(uri, "file://") {
		path = strings.TrimPrefix(uri, "file://")
	}
	lower := strings.ToLower(filepath.Base(path))
	for ext := range oasExtensions {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}

func (c *FileClassifier) isNearKnownRoot(uri string) bool {
	if len(c.knownRootDirs) == 0 {
		return false
	}
	path := uri
	if strings.HasPrefix(uri, "file://") {
		path = strings.TrimPrefix(uri, "file://")
	}
	dir := filepath.ToSlash(filepath.Dir(path))
	return c.knownRootDirs[dir]
}

func hasSignal(signals []Signal, name string) bool {
	for _, s := range signals {
		if s.Name == name {
			return true
		}
	}
	return false
}

var (
	openAPIRe = regexp.MustCompile(`(?m)^openapi:\s*["']?(\d+\.\d+(?:\.\d+)?)["']?\s*$`)
	swaggerRe = regexp.MustCompile(`(?m)^swagger:\s*["']?(\d+\.\d+(?:\.\d+)?)["']?\s*$`)
	arazzoRe  = regexp.MustCompile(`(?m)^arazzo:\s*["']?(\d+\.\d+(?:\.\d+)?)["']?\s*$`)
)

func detectRootKey(head string) (string, bool) {
	if m := openAPIRe.FindStringSubmatch(head); m != nil {
		return normalizeVersion(m[1]), true
	}
	if m := swaggerRe.FindStringSubmatch(head); m != nil {
		return "2.0", true
	}
	jsonOpenAPIRe := regexp.MustCompile(`"openapi"\s*:\s*"(\d+\.\d+(?:\.\d+)?)"`)
	if m := jsonOpenAPIRe.FindStringSubmatch(head); m != nil {
		return normalizeVersion(m[1]), true
	}
	jsonSwaggerRe := regexp.MustCompile(`"swagger"\s*:\s*"(\d+\.\d+(?:\.\d+)?)"`)
	if m := jsonSwaggerRe.FindStringSubmatch(head); m != nil {
		return "2.0", true
	}
	return "", false
}

func detectArazzoRoot(head string) (string, bool) {
	if m := arazzoRe.FindStringSubmatch(head); m != nil {
		return m[1], true
	}
	jsonArazzoRe := regexp.MustCompile(`"arazzo"\s*:\s*"(\d+\.\d+(?:\.\d+)?)"`)
	if m := jsonArazzoRe.FindStringSubmatch(head); m != nil {
		return m[1], true
	}
	return "", false
}

func normalizeVersion(v string) string {
	switch {
	case strings.HasPrefix(v, "3.2"):
		return "3.2"
	case strings.HasPrefix(v, "3.1"):
		return "3.1"
	case strings.HasPrefix(v, "3.0"):
		return "3.0"
	case strings.HasPrefix(v, "2."):
		return "2.0"
	default:
		return v
	}
}

func fileExtFromURI(uri string) string {
	path := uri
	if strings.HasPrefix(uri, "file://") {
		path = strings.TrimPrefix(uri, "file://")
	}
	return strings.ToLower(filepath.Ext(path))
}

func matchGlob(pattern, pathOrURI string) bool {
	path := pathOrURI
	if strings.HasPrefix(pathOrURI, "file://") {
		path = strings.TrimPrefix(pathOrURI, "file://")
	}
	if strings.Contains(pattern, "**") {
		basePat := strings.TrimPrefix(pattern, "**/")
		basePat = strings.TrimPrefix(basePat, "**/")
		if matched, _ := filepath.Match(basePat, filepath.Base(path)); matched {
			return true
		}
	}
	if matched, _ := filepath.Match(pattern, path); matched {
		return true
	}
	if matched, _ := filepath.Match(pattern, filepath.Base(path)); matched {
		return true
	}
	return false
}
