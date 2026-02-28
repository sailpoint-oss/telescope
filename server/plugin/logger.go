package plugin

import (
	"io"
	"log"
	"log/slog"

	hclog "github.com/hashicorp/go-hclog"
)

// newHCLogger wraps an slog.Logger as a hashicorp hclog.Logger.
func newHCLogger(l *slog.Logger) hclog.Logger {
	return &slogAdapter{l: l}
}

type slogAdapter struct {
	l    *slog.Logger
	name string
	args []interface{}
}

func (s *slogAdapter) Log(level hclog.Level, msg string, args ...interface{}) {
	switch level {
	case hclog.Error:
		s.l.Error(msg, mergeArgs(s.args, args)...)
	case hclog.Warn:
		s.l.Warn(msg, mergeArgs(s.args, args)...)
	case hclog.Info:
		s.l.Info(msg, mergeArgs(s.args, args)...)
	default:
		s.l.Debug(msg, mergeArgs(s.args, args)...)
	}
}

func (s *slogAdapter) Trace(msg string, args ...interface{}) {
	s.l.Debug(msg, mergeArgs(s.args, args)...)
}
func (s *slogAdapter) Debug(msg string, args ...interface{}) {
	s.l.Debug(msg, mergeArgs(s.args, args)...)
}
func (s *slogAdapter) Info(msg string, args ...interface{}) {
	s.l.Info(msg, mergeArgs(s.args, args)...)
}
func (s *slogAdapter) Warn(msg string, args ...interface{}) {
	s.l.Warn(msg, mergeArgs(s.args, args)...)
}
func (s *slogAdapter) Error(msg string, args ...interface{}) {
	s.l.Error(msg, mergeArgs(s.args, args)...)
}

func (s *slogAdapter) IsTrace() bool { return false }
func (s *slogAdapter) IsDebug() bool { return true }
func (s *slogAdapter) IsInfo() bool  { return true }
func (s *slogAdapter) IsWarn() bool  { return true }
func (s *slogAdapter) IsError() bool { return true }

func (s *slogAdapter) ImpliedArgs() []interface{} { return s.args }

func (s *slogAdapter) With(args ...interface{}) hclog.Logger {
	return &slogAdapter{l: s.l, name: s.name, args: mergeArgs(s.args, args)}
}

func (s *slogAdapter) Name() string { return s.name }

func (s *slogAdapter) Named(name string) hclog.Logger {
	n := name
	if s.name != "" {
		n = s.name + "." + name
	}
	return &slogAdapter{l: s.l, name: n, args: s.args}
}

func (s *slogAdapter) ResetNamed(name string) hclog.Logger {
	return &slogAdapter{l: s.l, name: name, args: s.args}
}

func (s *slogAdapter) SetLevel(hclog.Level)                {}
func (s *slogAdapter) GetLevel() hclog.Level                { return hclog.Info }
func (s *slogAdapter) StandardLogger(*hclog.StandardLoggerOptions) *log.Logger {
	return log.Default()
}
func (s *slogAdapter) StandardWriter(*hclog.StandardLoggerOptions) io.Writer {
	return io.Discard
}

func mergeArgs(a, b []interface{}) []interface{} {
	if len(a) == 0 {
		return b
	}
	if len(b) == 0 {
		return a
	}
	out := make([]interface{}, 0, len(a)+len(b))
	out = append(out, a...)
	out = append(out, b...)
	return out
}
