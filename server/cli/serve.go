package cli

import (
	"errors"
	"io"
	"log/slog"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/LukasParke/gossip"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/lsp"
)

var (
	transport string
	tcpAddr   string
	sockPath  string
	logLevel  string
)

func newServeCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Start the LSP server",
		Long:  "Start the Telescope language server. Defaults to stdio transport.",
		RunE:  runServe,
		// Prevent cobra from writing usage or errors to stdout, which would
		// corrupt the LSP JSON-RPC stream when using stdio transport.
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	cmd.Flags().StringVar(&transport, "transport", "stdio", "Transport: stdio, tcp, socket")
	cmd.Flags().StringVar(&tcpAddr, "tcp", "", "TCP address (e.g., :9257)")
	cmd.Flags().StringVar(&sockPath, "socket", "", "Unix socket path")
	cmd.Flags().StringVar(&logLevel, "log-level", "", "Log level: debug, info, warn, error (defaults to TELESCOPE_LOG_LEVEL or info)")

	return cmd
}

func runServe(cmd *cobra.Command, args []string) error {
	level := parseServeLogLevel(logLevel, os.Getenv("TELESCOPE_LOG_LEVEL"))
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))

	cfg, err := loadConfig()
	if err != nil {
		logger.Warn("failed to load config, using defaults", "error", err)
		cfg = config.DefaultConfig()
	}

	server, cleanup := lsp.NewServer(cfg, logger)
	defer cleanup()

	var serveOpts []gossip.ServeOption
	switch {
	case tcpAddr != "":
		serveOpts = append(serveOpts, gossip.WithTCP(tcpAddr))
	case sockPath != "":
		serveOpts = append(serveOpts, gossip.WithSocket(sockPath))
	default:
		serveOpts = append(serveOpts, gossip.WithStdio())
	}

	if err := gossip.Serve(server, serveOpts...); err != nil {
		// EOF from the transport indicates the client disconnected —
		// a normal lifecycle event, not an error.
		if errors.Is(err, io.EOF) || strings.Contains(err.Error(), "EOF") {
			logger.Info("client disconnected")
			return nil
		}
		logger.Error("server error", "error", err)
		return err
	}
	return nil
}

func parseServeLogLevel(flagLevel, envLevel string) slog.Level {
	candidate := strings.TrimSpace(flagLevel)
	if candidate == "" {
		candidate = strings.TrimSpace(envLevel)
	}
	if candidate == "" {
		return slog.LevelInfo
	}

	value := strings.ToLower(candidate)
	switch value {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		// Invalid values are ignored to preserve current behavior.
		return slog.LevelInfo
	}
}
