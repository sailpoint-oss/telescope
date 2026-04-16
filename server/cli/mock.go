package cli

import (
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/spf13/cobra"

	"github.com/sailpoint-oss/telescope/server/config"
	telescopemock "github.com/sailpoint-oss/telescope/server/mock"
)

func newMockCmd() *cobra.Command {
	var opts telescopemock.GenerateOptions
	var port int

	cmd := &cobra.Command{
		Use:   "mock <spec>",
		Short: "Generate OpenAPI mocks or serve mock responses",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			cfg, workspaceRoot, err := loadCommandConfig(args[0])
			if err != nil {
				return err
			}
			applyMockConfigDefaults(cmd, cfg, workspaceRoot, &opts, &port)
			opts.SpecPath = args[0]
			if opts.OutputDir != "" {
				return telescopemock.Generate(opts)
			}
			server, err := telescopemock.Serve(ctx, telescopemock.ServerOptions{
				SpecPath: args[0],
				Port:     port,
			})
			if err != nil {
				return err
			}
			fmt.Fprintln(cmd.OutOrStdout(), server.URL())
			if err := server.Wait(); err != nil && ctx.Err() == nil {
				return err
			}
			return nil
		},
	}

	cmd.Flags().IntVar(&port, "port", 4010, "Port for mock server mode")
	cmd.Flags().StringVarP(&opts.OutputDir, "output", "o", "", "Output directory for generated mock files")
	cmd.Flags().StringVar(&opts.SchemaName, "schema", "", "Restrict generation to a single component schema")
	cmd.Flags().StringVarP((*string)(&opts.Format), "format", "f", string(telescopemock.FormatJSON), "Mock file format: json, yaml, or xml")

	return cmd
}

func applyMockConfigDefaults(cmd *cobra.Command, cfg *config.Config, workspaceRoot string, opts *telescopemock.GenerateOptions, port *int) {
	if cfg == nil || opts == nil || port == nil {
		return
	}
	mockCfg := cfg.Testing.Mocks
	flags := cmd.Flags()
	if !flags.Changed("output") && strings.TrimSpace(mockCfg.Generate.OutputDir) != "" {
		opts.OutputDir = config.ResolveWorkspacePath(workspaceRoot, strings.TrimSpace(mockCfg.Generate.OutputDir))
	}
	if !flags.Changed("schema") && strings.TrimSpace(mockCfg.Generate.Schema) != "" {
		opts.SchemaName = strings.TrimSpace(mockCfg.Generate.Schema)
	}
	if !flags.Changed("format") && strings.TrimSpace(mockCfg.Generate.Format) != "" {
		opts.Format = telescopemock.Format(strings.TrimSpace(mockCfg.Generate.Format))
	}
	if !flags.Changed("port") && mockCfg.Serve.Port > 0 {
		*port = mockCfg.Serve.Port
	}
}
