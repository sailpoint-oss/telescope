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

	return cmd
}

func runServe(cmd *cobra.Command, args []string) error {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := loadConfig()
	if err != nil {
		logger.Warn("failed to load config, using defaults", "error", err)
		cfg = config.DefaultConfig()
	}

	server := lsp.NewServer(cfg, logger)

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
