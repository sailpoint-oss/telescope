package generation

import (
	"sync"
	"time"
)

// debouncer coalesces a burst of NotifyChange calls into a single fire.
//
// A new NotifyChange resets a running timer; the fire callback runs at most
// once per idle window. The debouncer is safe to use across goroutines and
// holds at most one pending timer per key.
type debouncer struct {
	window   time.Duration
	newTimer func(time.Duration, func()) *time.Timer

	mu     sync.Mutex
	timers map[string]*time.Timer
	closed bool
}

func newDebouncer(window time.Duration) *debouncer {
	return &debouncer{
		window:   window,
		newTimer: time.AfterFunc,
		timers:   make(map[string]*time.Timer),
	}
}

func (d *debouncer) trigger(key string, fire func()) {
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return
	}
	if t, ok := d.timers[key]; ok {
		t.Stop()
	}
	d.timers[key] = d.newTimer(d.window, func() {
		d.mu.Lock()
		delete(d.timers, key)
		d.mu.Unlock()
		fire()
	})
	d.mu.Unlock()
}

// flush cancels any scheduled fire for the given key and invokes fire
// synchronously. Used on didSave to bypass the idle window.
func (d *debouncer) flush(key string, fire func()) {
	d.mu.Lock()
	if t, ok := d.timers[key]; ok {
		t.Stop()
		delete(d.timers, key)
	}
	d.mu.Unlock()
	fire()
}

func (d *debouncer) stop() {
	d.mu.Lock()
	d.closed = true
	for _, t := range d.timers {
		t.Stop()
	}
	d.timers = make(map[string]*time.Timer)
	d.mu.Unlock()
}
