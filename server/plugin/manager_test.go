package plugin_test

import (
	"fmt"
	"io"
	"log/slog"
	"testing"

	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/plugin"
	"github.com/sailpoint-oss/telescope/server/rules"
)

type mockPlugin struct {
	name      string
	version   string
	analyzers map[string]treesitter.Analyzer
	checks    map[string]treesitter.Check
	metas     []rules.RuleMeta
}

func (m *mockPlugin) Name() string                              { return m.name }
func (m *mockPlugin) Version() string                           { return m.version }
func (m *mockPlugin) Checks() map[string]treesitter.Check       { return m.checks }
func (m *mockPlugin) Analyzers() map[string]treesitter.Analyzer { return m.analyzers }
func (m *mockPlugin) Meta() []rules.RuleMeta                    { return m.metas }

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestNewManager(t *testing.T) {
	m := plugin.NewManager(testLogger())
	if m == nil {
		t.Fatal("expected non-nil manager")
	}
	if len(m.Loaded()) != 0 {
		t.Fatalf("expected 0 loaded plugins, got %d", len(m.Loaded()))
	}
}

func TestManager_Register(t *testing.T) {
	m := plugin.NewManager(testLogger())
	p := &mockPlugin{name: "test", version: "1.0.0"}
	m.Register(p)

	loaded := m.Loaded()
	if len(loaded) != 1 {
		t.Fatalf("expected 1 loaded plugin, got %d", len(loaded))
	}
	if loaded[0].Name() != "test" {
		t.Fatalf("expected plugin name 'test', got %q", loaded[0].Name())
	}
}

func TestManager_RegisterMultiple(t *testing.T) {
	m := plugin.NewManager(testLogger())
	m.Register(&mockPlugin{name: "a", version: "1.0"})
	m.Register(&mockPlugin{name: "b", version: "2.0"})

	if len(m.Loaded()) != 2 {
		t.Fatalf("expected 2 plugins, got %d", len(m.Loaded()))
	}
}

func TestManager_RegisterFunc_Success(t *testing.T) {
	m := plugin.NewManager(testLogger())
	err := m.RegisterFunc(func() (plugin.Plugin, error) {
		return &mockPlugin{name: "lazy", version: "1.0"}, nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(m.Loaded()) != 1 {
		t.Fatalf("expected 1 plugin, got %d", len(m.Loaded()))
	}
}

func TestManager_RegisterFunc_Error(t *testing.T) {
	m := plugin.NewManager(testLogger())
	err := m.RegisterFunc(func() (plugin.Plugin, error) {
		return nil, fmt.Errorf("init failed")
	})
	if err == nil {
		t.Fatal("expected error from failing PluginFunc")
	}
	if len(m.Loaded()) != 0 {
		t.Fatalf("expected 0 plugins after failed init, got %d", len(m.Loaded()))
	}
}
