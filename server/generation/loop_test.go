package generation

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestDebouncer_Coalesces(t *testing.T) {
	d := newDebouncer(20 * time.Millisecond)
	defer d.stop()

	var count atomic.Int32
	for i := 0; i < 10; i++ {
		d.trigger("k", func() { count.Add(1) })
	}
	time.Sleep(80 * time.Millisecond)
	if got := count.Load(); got != 1 {
		t.Fatalf("expected 1 fire, got %d", got)
	}
}

func TestDebouncer_FlushSkipsTimer(t *testing.T) {
	d := newDebouncer(1 * time.Second)
	defer d.stop()

	var count atomic.Int32
	d.trigger("k", func() { count.Add(1) })
	d.flush("k", func() { count.Add(1) })
	time.Sleep(50 * time.Millisecond)
	if got := count.Load(); got != 1 {
		t.Fatalf("expected 1 fire after flush, got %d", got)
	}
}

func TestNormalizeWriteMode(t *testing.T) {
	cases := []struct {
		raw       string
		hasOutput bool
		want      WriteMode
	}{
		{"", false, WriteNever},
		{"", true, WriteOnDemand},
		{"onSave", true, WriteOnSave},
		{"always", true, WriteAlways},
		{"bogus", true, WriteOnDemand},
		{"bogus", false, WriteNever},
	}
	for _, c := range cases {
		got := normalizeWriteMode(c.raw, c.hasOutput)
		if got != c.want {
			t.Errorf("normalizeWriteMode(%q,%v)=%q want %q", c.raw, c.hasOutput, got, c.want)
		}
	}
}

func TestDiskWriter_ShouldWriteMatrix(t *testing.T) {
	cases := []struct {
		mode    WriteMode
		trigger Trigger
		output  string
		want    bool
	}{
		{WriteNever, TriggerOnDemand, "/out.yaml", false},
		{WriteOnDemand, TriggerOnDemand, "/out.yaml", true},
		{WriteOnDemand, TriggerAuto, "/out.yaml", false},
		{WriteOnSave, TriggerAuto, "/out.yaml", false},
		{WriteOnSave, TriggerOnSave, "/out.yaml", true},
		{WriteAlways, TriggerAuto, "/out.yaml", true},
		{WriteAlways, TriggerAuto, "", false},
	}
	for _, c := range cases {
		w := NewDiskWriter(c.output, false, c.mode)
		if got := w.ShouldWrite(c.trigger); got != c.want {
			t.Errorf("mode=%s trigger=%s output=%q -> %v, want %v", c.mode, c.trigger, c.output, got, c.want)
		}
	}
}

func TestLoop_StartStopIdempotent(t *testing.T) {
	l := NewLoop(Config{Root: "/tmp/noop"}, nil)
	if err := l.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := l.Start(context.Background()); err != nil {
		t.Fatalf("second Start: %v", err)
	}
	if err := l.Stop(10 * time.Millisecond); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if err := l.Stop(10 * time.Millisecond); err != nil {
		t.Fatalf("second Stop: %v", err)
	}
}
