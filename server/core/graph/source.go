package graph

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/fsnotify/fsnotify"
	navigator "github.com/sailpoint-oss/navigator"
)

// ClassificationHint is an alias for navigator's ClassificationHint.
type ClassificationHint = navigator.ClassificationHint

// DocumentSource is an alias for navigator's DocumentSource interface.
type DocumentSource = navigator.DocumentSource

// --- FilesystemSource ---

// FilesystemSource reads documents from the local filesystem.
type FilesystemSource struct {
	uri     string
	path    string
	hint    ClassificationHint
	mu      sync.Mutex
	version int64
}

// NewFilesystemSource creates a source for a file on disk.
func NewFilesystemSource(path string, hint ClassificationHint) *FilesystemSource {
	absPath, _ := filepath.Abs(path)
	return &FilesystemSource{
		uri:  pathToURI(absPath),
		path: absPath,
		hint: hint,
	}
}

func (s *FilesystemSource) URI() string { return s.uri }

func (s *FilesystemSource) Read(_ context.Context) ([]byte, int64, error) {
	content, err := os.ReadFile(s.path)
	if err != nil {
		return nil, 0, fmt.Errorf("read %s: %w", s.path, err)
	}
	// Derive version from file mtime (Unix nanos) for consistency
	info, err := os.Stat(s.path)
	if err != nil {
		s.mu.Lock()
		s.version++
		v := s.version
		s.mu.Unlock()
		return content, v, nil
	}
	v := info.ModTime().UnixNano()
	s.mu.Lock()
	s.version = v
	s.mu.Unlock()
	return content, v, nil
}

func (s *FilesystemSource) Watch(ctx context.Context, onChange func(string, navigator.WatchEvent)) func() {
	if onChange == nil {
		return func() {}
	}
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return func() {}
	}

	dir := filepath.Dir(s.path)
	base := filepath.Base(s.path)
	if err := watcher.Add(dir); err != nil {
		watcher.Close()
		return func() {}
	}

	done := make(chan struct{})
	go func() {
		defer watcher.Close()
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if strings.EqualFold(filepath.Base(event.Name), base) {
					var we navigator.WatchEvent
					switch {
					case event.Has(fsnotify.Create):
						we = navigator.WatchCreate
					case event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename):
						we = navigator.WatchDelete
					default:
						we = navigator.WatchModify
					}
					onChange(s.uri, we)
				}
			case _, ok := <-watcher.Errors:
				if !ok {
					return
				}
			case <-ctx.Done():
				return
			case <-done:
				return
			}
		}
	}()

	return func() { close(done) }
}

func (s *FilesystemSource) Hint() ClassificationHint { return s.hint }

// Path returns the absolute filesystem path.
func (s *FilesystemSource) Path() string { return s.path }

// --- SyntheticSource ---

// SyntheticSource provides document content programmatically without a backing
// file. Used by the SDK (e.g. Cartographer) to inject specs for analysis.
type SyntheticSource struct {
	uri     string
	hint    ClassificationHint
	mu      sync.RWMutex
	content []byte
	version int64
	onCh    []func()
}

// NewSyntheticSource creates a source with initial content.
func NewSyntheticSource(uri string, content []byte, hint ClassificationHint) *SyntheticSource {
	return &SyntheticSource{
		uri:     uri,
		content: append([]byte(nil), content...),
		version: 1,
		hint:    hint,
	}
}

func (s *SyntheticSource) URI() string { return s.uri }

func (s *SyntheticSource) Read(_ context.Context) ([]byte, int64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]byte, len(s.content))
	copy(out, s.content)
	return out, s.version, nil
}

func (s *SyntheticSource) Watch(_ context.Context, onChange func(string, navigator.WatchEvent)) func() {
	if onChange == nil {
		return func() {}
	}
	wrapped := func() { onChange(s.uri, navigator.WatchModify) }
	s.mu.Lock()
	s.onCh = append(s.onCh, wrapped)
	idx := len(s.onCh) - 1
	s.mu.Unlock()
	return func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if idx < len(s.onCh) {
			s.onCh[idx] = nil
		}
	}
}

func (s *SyntheticSource) Hint() ClassificationHint { return s.hint }

// Update replaces the content and bumps the version, notifying watchers.
func (s *SyntheticSource) Update(content []byte) {
	s.mu.Lock()
	s.content = append([]byte(nil), content...)
	s.version++
	callbacks := make([]func(), len(s.onCh))
	copy(callbacks, s.onCh)
	s.mu.Unlock()
	for _, cb := range callbacks {
		if cb != nil {
			cb()
		}
	}
}

// --- LSPSource ---

// LSPDocumentProvider abstracts gossip's document.Store for reading document
// content without importing gossip in the core package. Matches the
// navigator/graph.LSPDocumentProvider interface.
type LSPDocumentProvider interface {
	Content(uri string) (text string, version int32, ok bool)
}


// LSPSource bridges gossip's in-memory document overlays with the graph engine.
type LSPSource struct {
	uri      string
	hint     ClassificationHint
	provider LSPDocumentProvider
}

// NewLSPSource creates a source backed by an LSP document overlay.
func NewLSPSource(uri string, provider LSPDocumentProvider, hint ClassificationHint) *LSPSource {
	return &LSPSource{
		uri:      uri,
		hint:     hint,
		provider: provider,
	}
}

func (s *LSPSource) URI() string { return s.uri }

func (s *LSPSource) Read(_ context.Context) ([]byte, int64, error) {
	text, version, ok := s.provider.Content(s.uri)
	if !ok {
		return nil, 0, fmt.Errorf("document not found: %s", s.uri)
	}
	return []byte(text), int64(version), nil
}

func (s *LSPSource) Watch(_ context.Context, _ func(string, navigator.WatchEvent)) func() {
	// LSP document changes are pushed via didChange notifications;
	// the graph is invalidated directly by the LSP handler.
	return func() {}
}

func (s *LSPSource) Hint() ClassificationHint { return s.hint }

// --- Helpers ---

func pathToURI(absPath string) string {
	p := filepath.ToSlash(absPath)
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return "file://" + p
}
