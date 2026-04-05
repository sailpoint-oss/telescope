package bun

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type recordingConn struct {
	mu       sync.Mutex
	writes   [][]byte
	writeErr error
}

func (c *recordingConn) Read(_ []byte) (int, error) { return 0, io.EOF }

func (c *recordingConn) Write(p []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.writeErr != nil {
		return 0, c.writeErr
	}
	c.writes = append(c.writes, append([]byte(nil), p...))
	return len(p), nil
}

func (c *recordingConn) Close() error                       { return nil }
func (c *recordingConn) LocalAddr() net.Addr                { return dummyAddr("local") }
func (c *recordingConn) RemoteAddr() net.Addr               { return dummyAddr("remote") }
func (c *recordingConn) SetDeadline(_ time.Time) error      { return nil }
func (c *recordingConn) SetReadDeadline(_ time.Time) error  { return nil }
func (c *recordingConn) SetWriteDeadline(_ time.Time) error { return nil }

func (c *recordingConn) joinedWrites() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	parts := make([]string, 0, len(c.writes))
	for _, write := range c.writes {
		parts = append(parts, string(write))
	}
	return strings.Join(parts, "")
}

type dummyAddr string

func (a dummyAddr) Network() string { return string(a) }
func (a dummyAddr) String() string  { return string(a) }

func waitForPendingRequest(t *testing.T, m *Manager, id string) chan *Envelope {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		m.pendingMu.Lock()
		ch := m.pending[id]
		m.pendingMu.Unlock()
		if ch != nil {
			return ch
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for pending request %q", id)
	return nil
}

func TestSendRequestRoutesResponseAndWritesEnvelope(t *testing.T) {
	m := NewManager(nil)
	conn := &recordingConn{}
	m.conn = conn

	go func() {
		ch := waitForPendingRequest(t, m, "req-1")
		ch <- &Envelope{ID: "req-1", Type: MsgPong}
	}()

	resp, err := m.sendRequest(context.Background(), &Envelope{ID: "req-1", Type: MsgPing}, time.Second)
	if err != nil {
		t.Fatalf("sendRequest: %v", err)
	}
	if resp == nil || resp.Type != MsgPong {
		t.Fatalf("expected pong response, got %#v", resp)
	}
	if got := conn.joinedWrites(); !strings.Contains(got, `"type":"ping"`) {
		t.Fatalf("expected ping envelope to be written, got %q", got)
	}
}

func TestRunRulesParsesRuleResultAndRejectsUnexpectedTypes(t *testing.T) {
	t.Run("parses rule result", func(t *testing.T) {
		m := NewManager(nil)
		m.available.Store(true)
		m.conn = &recordingConn{}

		go func() {
			ch := waitForPendingRequest(t, m, "1")
			ch <- &Envelope{
				ID:   "1",
				Type: MsgRuleResult,
				Payload: RunRulesResponse{
					DocumentURI: "file:///test.yaml",
					Diagnostics: []SidecarDiagnostic{{Code: "custom-rule", Message: "boom", Source: "bun", Severity: 2}},
					RuleTimings: map[string]float64{"custom-rule": 1.5},
				},
			}
		}()

		resp, err := m.RunRules(context.Background(), &RunRulesRequest{DocumentURI: "file:///test.yaml"})
		if err != nil {
			t.Fatalf("RunRules: %v", err)
		}
		if resp == nil || len(resp.Diagnostics) != 1 || resp.Diagnostics[0].Code != "custom-rule" {
			t.Fatalf("unexpected RunRules response: %#v", resp)
		}
	})

	t.Run("rejects unexpected response type", func(t *testing.T) {
		m := NewManager(nil)
		m.available.Store(true)
		m.conn = &recordingConn{}

		go func() {
			ch := waitForPendingRequest(t, m, "1")
			ch <- &Envelope{ID: "1", Type: MsgPong, Payload: map[string]any{}}
		}()

		_, err := m.RunRules(context.Background(), &RunRulesRequest{DocumentURI: "file:///test.yaml"})
		if err == nil || !strings.Contains(err.Error(), "unexpected response type") {
			t.Fatalf("expected unexpected response type error, got %v", err)
		}
	})
}

func TestRunSpectralParsesSpectralResult(t *testing.T) {
	m := NewManager(nil)
	m.available.Store(true)
	m.conn = &recordingConn{}

	go func() {
		ch := waitForPendingRequest(t, m, "1")
		ch <- &Envelope{
			ID:   "1",
			Type: MsgSpectralResult,
			Payload: RunSpectralResponse{
				DocumentURI: "file:///test.yaml",
				Diagnostics: []SidecarDiagnostic{{Code: "spectral-rule", Message: "warn", Source: "spectral", Severity: 2}},
			},
		}
	}()

	resp, err := m.RunSpectral(context.Background(), &RunSpectralRequest{DocumentURI: "file:///test.yaml"})
	if err != nil {
		t.Fatalf("RunSpectral: %v", err)
	}
	if resp == nil || len(resp.Diagnostics) != 1 || resp.Diagnostics[0].Code != "spectral-rule" {
		t.Fatalf("unexpected RunSpectral response: %#v", resp)
	}
}

func TestLoadRulesRequiresLoadResponse(t *testing.T) {
	loadReq := &LoadRulesRequest{
		Rules: []RuleConfig{{
			ID:   "example-custom-openapi-rule",
			Path: "/tmp/example-custom-openapi-rule.ts",
			Kind: "openapi",
		}},
	}

	t.Run("accepts loadResponse", func(t *testing.T) {
		m := NewManager(nil)
		m.available.Store(true)
		m.conn = &recordingConn{}

		go func() {
			ch := waitForPendingRequest(t, m, "1")
			ch <- &Envelope{ID: "1", Type: MsgLoadResponse, Payload: map[string]any{"ruleCount": 1}}
		}()

		if err := m.LoadRules(context.Background(), loadReq); err != nil {
			t.Fatalf("LoadRules: %v", err)
		}
	})

	t.Run("surfaces rule load errors", func(t *testing.T) {
		m := NewManager(nil)
		m.available.Store(true)
		m.conn = &recordingConn{}

		go func() {
			ch := waitForPendingRequest(t, m, "1")
			ch <- &Envelope{ID: "1", Type: MsgRuleError, Payload: map[string]any{"error": "bad rule"}}
		}()

		err := m.LoadRules(context.Background(), loadReq)
		if err == nil || !strings.Contains(err.Error(), "rule load error") {
			t.Fatalf("expected rule load error, got %v", err)
		}
	})

	t.Run("rejects unexpected response type", func(t *testing.T) {
		m := NewManager(nil)
		m.available.Store(true)
		m.conn = &recordingConn{}

		go func() {
			ch := waitForPendingRequest(t, m, "1")
			ch <- &Envelope{ID: "1", Type: MsgPong}
		}()

		err := m.LoadRules(context.Background(), loadReq)
		if err == nil || !strings.Contains(err.Error(), "unexpected response type") {
			t.Fatalf("expected unexpected response type error, got %v", err)
		}
	})
}

func TestReadLoopSignalsReadyAndRoutesPendingResponses(t *testing.T) {
	m := NewManager(nil)
	client, server := net.Pipe()
	m.conn = client
	m.readDone = make(chan struct{})
	m.restartFailed.Store(true)
	respCh := make(chan *Envelope, 1)
	m.pending = map[string]chan *Envelope{"42": respCh}

	readyCh := make(chan struct{}, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go m.readLoop(ctx, readyCh)

	if _, err := io.WriteString(server, `{"id":"init","type":"ready"}`+"\n"); err != nil {
		t.Fatalf("write ready: %v", err)
	}
	if _, err := io.WriteString(server, `{"id":"42","type":"pong"}`+"\n"); err != nil {
		t.Fatalf("write response: %v", err)
	}

	select {
	case <-readyCh:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for ready signal")
	}

	select {
	case resp := <-respCh:
		if resp == nil || resp.Type != MsgPong {
			t.Fatalf("expected pong response, got %#v", resp)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for routed response")
	}

	_ = server.Close()
	select {
	case <-m.readDone:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for read loop shutdown")
	}
}

func TestWatchRulesReloadsSupportedExtensionsOnly(t *testing.T) {
	m := NewManager(nil)
	telescopeDir := t.TempDir()
	rulesDir := filepath.Join(telescopeDir, "rules")
	schemasDir := filepath.Join(telescopeDir, "schemas")
	if err := os.MkdirAll(rulesDir, 0o755); err != nil {
		t.Fatalf("mkdir rules: %v", err)
	}
	if err := os.MkdirAll(schemasDir, 0o755); err != nil {
		t.Fatalf("mkdir schemas: %v", err)
	}

	reloadCh := make(chan struct{}, 2)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	m.WatchRules(ctx, telescopeDir, func() {
		select {
		case reloadCh <- struct{}{}:
		default:
		}
	})
	time.Sleep(100 * time.Millisecond)

	if err := os.WriteFile(filepath.Join(rulesDir, "ignore.txt"), []byte("noop"), 0o644); err != nil {
		t.Fatalf("write ignore file: %v", err)
	}
	select {
	case <-reloadCh:
		t.Fatal("unexpected reload for unsupported extension")
	case <-time.After(700 * time.Millisecond):
	}

	if err := os.WriteFile(filepath.Join(rulesDir, "custom-rule.ts"), []byte("export default {}"), 0o644); err != nil {
		t.Fatalf("write rule file: %v", err)
	}
	select {
	case <-reloadCh:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for rule reload")
	}

	if err := os.WriteFile(filepath.Join(schemasDir, "schema.yaml"), []byte("type: object\n"), 0o644); err != nil {
		t.Fatalf("write schema file: %v", err)
	}
	select {
	case <-reloadCh:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for schema reload")
	}
}

func TestProtocolLoadResponseRoundTrip(t *testing.T) {
	env := Envelope{ID: "99", Type: MsgLoadResponse, Payload: map[string]any{"ruleCount": 2}}
	data, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded Envelope
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.Type != MsgLoadResponse {
		t.Fatalf("expected loadResponse type, got %q", decoded.Type)
	}
}
