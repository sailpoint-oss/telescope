package project

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/sailpoint-oss/telescope/server/openapi"
)

// FileRole classifies a file's role in an OpenAPI project.
type FileRole int

const (
	RoleUnknown  FileRole = iota
	RoleRoot              // Has openapi/swagger version key + paths (entry point)
	RoleFragment          // Referenced via $ref, no root version key, or no paths
)

// DiscoveredFile holds information about a file found during workspace scanning.
type DiscoveredFile struct {
	Path  string // absolute filesystem path
	URI   string // file:// URI
	Role  FileRole
	MTime int64 // modification time (Unix nanos) for cache invalidation
}

// Discovery scans workspace directories for YAML/JSON files and classifies
// them as OpenAPI roots or fragments. Results are cached by mtime.
type Discovery struct {
	mu      sync.RWMutex
	files   map[string]*DiscoveredFile // path -> file
	roots   []string                   // URIs of root documents
	exclude []string                   // glob patterns to skip
}

// NewDiscovery creates a Discovery with the given exclude patterns.
// Patterns follow filepath.Match syntax (e.g., "node_modules/**").
func NewDiscovery(exclude []string) *Discovery {
	return &Discovery{
		files:   make(map[string]*DiscoveredFile),
		exclude: exclude,
	}
}

// Scan walks the given workspace root, discovering and classifying all YAML
// and JSON files. Files matching exclude patterns are skipped. The scan
// replaces any previous results.
func (d *Discovery) Scan(workspaceRoot string) error {
	found := make(map[string]*DiscoveredFile)
	var roots []string

	err := filepath.WalkDir(workspaceRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries
		}

		if entry.IsDir() {
			name := entry.Name()
			if name == ".git" || name == "node_modules" || name == "vendor" || name == ".telescope" {
				return filepath.SkipDir
			}
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".yaml" && ext != ".yml" && ext != ".json" {
			return nil
		}

		rel, _ := filepath.Rel(workspaceRoot, path)
		if d.shouldExclude(rel) {
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			return nil
		}

		uri := pathToURI(path)
		role := classifyFromDisk(path)

		df := &DiscoveredFile{
			Path:  path,
			URI:   uri,
			Role:  role,
			MTime: info.ModTime().UnixNano(),
		}
		found[path] = df

		if role == RoleRoot {
			roots = append(roots, uri)
		}

		return nil
	})
	if err != nil {
		return err
	}

	d.mu.Lock()
	d.files = found
	d.roots = roots
	d.mu.Unlock()

	return nil
}

// Roots returns the URIs of all discovered root documents.
func (d *Discovery) Roots() []string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := make([]string, len(d.roots))
	copy(out, d.roots)
	return out
}

// AllFiles returns all discovered files.
func (d *Discovery) AllFiles() []*DiscoveredFile {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := make([]*DiscoveredFile, 0, len(d.files))
	for _, f := range d.files {
		out = append(out, f)
	}
	return out
}

// FileByURI returns the discovered file for a URI, or nil.
func (d *Discovery) FileByURI(uri string) *DiscoveredFile {
	d.mu.RLock()
	defer d.mu.RUnlock()
	path := uriToPath(uri)
	return d.files[path]
}

// FileByPath returns the discovered file for a filesystem path, or nil.
func (d *Discovery) FileByPath(path string) *DiscoveredFile {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.files[path]
}

// IsRoot reports whether the given URI is a root document.
func (d *Discovery) IsRoot(uri string) bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	for _, r := range d.roots {
		if r == uri {
			return true
		}
	}
	return false
}

// UpdateFile re-classifies a single file (after a change event) and updates
// the discovery cache. Returns the updated DiscoveredFile.
func (d *Discovery) UpdateFile(path string) *DiscoveredFile {
	info, err := os.Stat(path)
	if err != nil {
		d.mu.Lock()
		delete(d.files, path)
		d.rebuildRoots()
		d.mu.Unlock()
		return nil
	}

	uri := pathToURI(path)
	role := classifyFromDisk(path)

	df := &DiscoveredFile{
		Path:  path,
		URI:   uri,
		Role:  role,
		MTime: info.ModTime().UnixNano(),
	}

	d.mu.Lock()
	d.files[path] = df
	d.rebuildRoots()
	d.mu.Unlock()

	return df
}

// RemoveFile removes a file from the discovery cache (after deletion).
func (d *Discovery) RemoveFile(path string) {
	d.mu.Lock()
	delete(d.files, path)
	d.rebuildRoots()
	d.mu.Unlock()
}

func (d *Discovery) rebuildRoots() {
	d.roots = d.roots[:0]
	for _, f := range d.files {
		if f.Role == RoleRoot {
			d.roots = append(d.roots, f.URI)
		}
	}
}

func (d *Discovery) shouldExclude(relPath string) bool {
	for _, pattern := range d.exclude {
		if matched, _ := filepath.Match(pattern, relPath); matched {
			return true
		}
		if strings.Contains(pattern, "**") {
			simple := strings.ReplaceAll(pattern, "**"+string(filepath.Separator), "")
			simple = strings.ReplaceAll(simple, "**", "")
			if simple != "" && strings.Contains(relPath, simple) {
				return true
			}
		}
	}
	return false
}

// classifyFromDisk reads a file from disk and classifies it using the
// standalone YAML parser (no tree-sitter needed).
func classifyFromDisk(path string) FileRole {
	data, err := os.ReadFile(path)
	if err != nil {
		return RoleUnknown
	}

	idx := openapi.ParseAndIndex(data)
	if idx == nil || idx.Document == nil {
		return RoleUnknown
	}

	switch idx.Document.DocType {
	case openapi.DocTypeRoot:
		return RoleRoot
	case openapi.DocTypeFragment:
		return RoleFragment
	default:
		return classifyByContent(data, path)
	}
}

// classifyByContent does a lightweight check for YAML/JSON files that might
// be OpenAPI fragments (contain $ref-able content like schemas).
func classifyByContent(data []byte, path string) FileRole {
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".yaml" && ext != ".yml" && ext != ".json" {
		return RoleUnknown
	}

	content := string(data)
	if strings.Contains(content, "$ref") ||
		strings.Contains(content, "type:") ||
		strings.Contains(content, "properties:") ||
		strings.Contains(content, "\"type\"") ||
		strings.Contains(content, "\"properties\"") {
		return RoleFragment
	}
	return RoleUnknown
}

// PathToURI converts an absolute filesystem path to a normalized file:// URI.
func PathToURI(fsPath string) string {
	abs, err := filepath.Abs(fsPath)
	if err != nil {
		abs = fsPath
	}
	p := filepath.ToSlash(filepath.Clean(abs))
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	u := &url.URL{Scheme: "file", Path: p}
	return openapi.NormalizeURI(u.String())
}

func pathToURI(fsPath string) string {
	return PathToURI(fsPath)
}

// URIToPath converts a file:// URI to an absolute filesystem path.
func URIToPath(uri string) string {
	if strings.HasPrefix(uri, "file://") {
		u, err := url.Parse(openapi.NormalizeURI(uri))
		if err == nil {
			p := u.Path
			if hasWindowsDrivePrefix(p) {
				p = p[1:]
			}
			return filepath.Clean(filepath.FromSlash(p))
		}
		return strings.TrimPrefix(uri, "file://")
	}
	return uri
}

func uriToPath(uri string) string {
	return URIToPath(uri)
}

func hasWindowsDrivePrefix(path string) bool {
	if len(path) < 3 || path[0] != '/' || path[2] != ':' {
		return false
	}
	drive := path[1]
	return (drive >= 'A' && drive <= 'Z') || (drive >= 'a' && drive <= 'z')
}
