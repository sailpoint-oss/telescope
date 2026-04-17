package generation

import (
	"context"
	"errors"
	"log/slog"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

// Config is the per-root configuration for a single Loop instance.
type Config struct {
	// Root is the workspace root directory the Loop extracts from.
	Root string
	// ConfigDir is an optional override for the .cartographer directory;
	// defaults to <Root>/.cartographer when empty.
	ConfigDir string
	// OutputPath, when non-empty, controls where DiskWriter persists the spec.
	OutputPath string
	// Lang overrides cartographer's language auto-detection.
	Lang string

	// DebounceWindow is the idle duration used by the debouncer. Defaults to
	// 500ms when zero.
	DebounceWindow time.Duration
	// SlowExtractionThreshold, when non-zero, causes the loop to drop to
	// save-only triggering after any single extraction exceeds this duration.
	SlowExtractionThreshold time.Duration

	// WriteMode / WriteSourceMap control DiskWriter behaviour.
	WriteMode      WriteMode
	WriteSourceMap bool

	// TriggerMode: "always" (debounce + save) or "save" (save-only).
	TriggerMode string
}

// EventKind identifies a Loop lifecycle event.
type EventKind string

const (
	GenerationStarted   EventKind = "started"
	GenerationSucceeded EventKind = "succeeded"
	GenerationFailed    EventKind = "failed"
	GenerationSkipped   EventKind = "skipped"
)

// Event is emitted on every loop iteration and broadcast to all subscribers.
type Event struct {
	Kind     EventKind
	Root     string
	Duration time.Duration
	Err      error
	Result   *Result
}

// Loop is the per-workspace generation supervisor. It owns an Extractor, a
// debouncer, a DiskWriter, and a cache of the last-good Result.
type Loop struct {
	cfg       Config
	logger    *slog.Logger
	extractor *Extractor
	cache     *cache
	writer    *DiskWriter
	debouncer *debouncer

	started    atomic.Bool
	stopped    atomic.Bool
	rootCtx    context.Context
	rootCancel context.CancelFunc
	inFlight   sync.Mutex // one extraction at a time per workspace

	subsMu sync.RWMutex
	subs   []func(Event)

	// saveOnly is set to true when an extraction exceeds SlowExtractionThreshold.
	saveOnly atomic.Bool

	// last on-disk spec hash, used for skew detection.
	lastHashMu sync.Mutex
	lastHash   string
}

// NewLoop constructs a new Loop for a single workspace root.
func NewLoop(cfg Config, logger *slog.Logger) *Loop {
	if logger == nil {
		logger = slog.Default()
	}
	if cfg.DebounceWindow <= 0 {
		cfg.DebounceWindow = 500 * time.Millisecond
	}
	if cfg.SlowExtractionThreshold <= 0 {
		cfg.SlowExtractionThreshold = 5 * time.Second
	}
	hasOutput := cfg.OutputPath != ""
	mode := normalizeWriteMode(string(cfg.WriteMode), hasOutput)
	writer := NewDiskWriter(cfg.OutputPath, cfg.WriteSourceMap, mode)
	return &Loop{
		cfg:       cfg,
		logger:    logger.With("component", "generation.loop", "root", cfg.Root),
		extractor: NewExtractor(),
		cache:     newCache(),
		writer:    writer,
		debouncer: newDebouncer(cfg.DebounceWindow),
	}
}

// Start begins listening for change notifications. The returned error is only
// non-nil for configuration issues; transient extraction errors are surfaced
// via Events.
func (l *Loop) Start(ctx context.Context) error {
	if l == nil {
		return errors.New("nil loop")
	}
	if !l.started.CompareAndSwap(false, true) {
		return nil
	}
	l.rootCtx, l.rootCancel = context.WithCancel(ctx)
	l.logger.Debug("generation loop started")
	return nil
}

// Stop cancels the loop's root context and waits up to drain for any
// in-flight extraction. Safe to call multiple times.
func (l *Loop) Stop(drain time.Duration) error {
	if l == nil {
		return nil
	}
	if !l.stopped.CompareAndSwap(false, true) {
		return nil
	}
	if l.rootCancel != nil {
		l.rootCancel()
	}
	l.debouncer.stop()
	if drain <= 0 {
		drain = 500 * time.Millisecond
	}
	done := make(chan struct{})
	go func() {
		l.inFlight.Lock()
		l.inFlight.Unlock() //nolint:staticcheck // drain barrier
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(drain):
		l.logger.Warn("generation loop stop drain timeout", "drain", drain)
	}
	return nil
}

// Subscribe registers a listener that is invoked for every lifecycle Event.
func (l *Loop) Subscribe(fn func(Event)) {
	if l == nil || fn == nil {
		return
	}
	l.subsMu.Lock()
	l.subs = append(l.subs, fn)
	l.subsMu.Unlock()
}

func (l *Loop) broadcast(ev Event) {
	l.subsMu.RLock()
	subs := append([]func(Event){}, l.subs...)
	l.subsMu.RUnlock()
	for _, fn := range subs {
		func(fn func(Event)) {
			defer func() { _ = recover() }()
			fn(ev)
		}(fn)
	}
}

// Writer returns the loop's DiskWriter. Callers should not mutate it.
func (l *Loop) Writer() *DiskWriter {
	if l == nil {
		return nil
	}
	return l.writer
}

// Root returns the workspace root this Loop was constructed for.
func (l *Loop) Root() string {
	if l == nil {
		return ""
	}
	return l.cfg.Root
}

// Current returns the most recent successful extraction, if any.
func (l *Loop) Current() (*Result, bool) {
	if l == nil {
		return nil, false
	}
	return l.cache.get(l.cfg.Root)
}

// NotifyChange schedules a debounced regeneration in response to a didChange
// on a watched source file.
func (l *Loop) NotifyChange(sourceURI string) {
	if l == nil || !l.started.Load() || l.stopped.Load() {
		return
	}
	if l.cfg.TriggerMode == "save" || l.saveOnly.Load() {
		return
	}
	l.debouncer.trigger(l.cfg.Root, func() {
		_ = l.regenerateCtx(l.rootCtx, TriggerAuto)
	})
}

// NotifySave forces an immediate regeneration (bypassing the debounce window)
// and, if WriteMode permits, triggers an onSave disk write.
func (l *Loop) NotifySave(sourceURI string) {
	if l == nil || !l.started.Load() || l.stopped.Load() {
		return
	}
	l.debouncer.flush(l.cfg.Root, func() {
		_ = l.regenerateCtx(l.rootCtx, TriggerOnSave)
	})
}

// RegenerateNow runs an extraction synchronously.
func (l *Loop) RegenerateNow(ctx context.Context, trigger Trigger) (*Result, error) {
	if l == nil {
		return nil, errors.New("nil loop")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := l.regenerateCtx(ctx, trigger); err != nil {
		return nil, err
	}
	r, _ := l.Current()
	return r, nil
}

// WriteNow forces a disk write using the last good extraction, ignoring the
// configured WriteMode. Backs `Telescope: Write Spec to Disk Now`.
func (l *Loop) WriteNow() error {
	if l == nil {
		return errors.New("nil loop")
	}
	r, ok := l.Current()
	if !ok {
		return errors.New("no extraction result available to write")
	}
	forced := &DiskWriter{
		outputPath:     l.writer.outputPath,
		writeSourceMap: l.writer.writeSourceMap,
		mode:           WriteAlways,
	}
	return forced.Write(r, TriggerOnDemand)
}

func (l *Loop) regenerateCtx(ctx context.Context, trigger Trigger) error {
	if ctx == nil {
		ctx = context.Background()
	}
	l.inFlight.Lock()
	defer l.inFlight.Unlock()

	l.broadcast(Event{Kind: GenerationStarted, Root: l.cfg.Root})
	started := time.Now()

	opts := ExtractorOptions{
		RootDir:    l.cfg.Root,
		ConfigDir:  l.configDir(),
		Lang:       l.cfg.Lang,
		OutputPath: l.cfg.OutputPath,
	}
	er, err := l.extractor.Extract(ctx, opts)
	dur := time.Since(started)
	if err != nil {
		l.broadcast(Event{Kind: GenerationFailed, Root: l.cfg.Root, Duration: dur, Err: err})
		return err
	}

	result := &Result{
		Root:        l.cfg.Root,
		SpecBytes:   er.SpecBytes,
		SpecMap:     er.SpecMap,
		SourceMap:   er.SourceMap,
		OutputPath:  er.OutputPath,
		GeneratedAt: er.GeneratedAt,
		Duration:    dur,
		Operations:  er.Operations,
		Types:       er.Types,
	}
	l.cache.store(result)

	if dur > l.cfg.SlowExtractionThreshold && !l.saveOnly.Load() {
		l.saveOnly.Store(true)
		l.logger.Warn("extraction exceeded threshold; dropping to save-only trigger",
			"duration", dur, "threshold", l.cfg.SlowExtractionThreshold)
	}

	if err := l.writer.Write(result, trigger); err != nil {
		l.logger.Warn("disk write failed", "err", err)
	} else if l.writer.ShouldWrite(trigger) {
		if h, ok, _ := l.writer.OnDiskHash(result); ok {
			l.lastHashMu.Lock()
			l.lastHash = h
			l.lastHashMu.Unlock()
		}
	}

	l.broadcast(Event{Kind: GenerationSucceeded, Root: l.cfg.Root, Duration: dur, Result: result})
	return nil
}

func (l *Loop) configDir() string {
	if l.cfg.ConfigDir != "" {
		return l.cfg.ConfigDir
	}
	return filepath.Join(l.cfg.Root, ".cartographer")
}

// SkewHash returns the last recorded on-disk hash for skew detection.
func (l *Loop) SkewHash() string {
	l.lastHashMu.Lock()
	defer l.lastHashMu.Unlock()
	return l.lastHash
}

// DetectSkew returns true when the on-disk spec differs from the last one the
// Loop wrote, signalling a manual edit.
func (l *Loop) DetectSkew() (bool, error) {
	if l == nil {
		return false, nil
	}
	r, ok := l.Current()
	if !ok {
		return false, nil
	}
	h, present, err := l.writer.OnDiskHash(r)
	if err != nil || !present {
		return false, err
	}
	l.lastHashMu.Lock()
	last := l.lastHash
	l.lastHashMu.Unlock()
	return last != "" && h != last, nil
}
