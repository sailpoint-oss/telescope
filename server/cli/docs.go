package cli

import (
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/spf13/cobra"

	"github.com/sailpoint-oss/telescope/server/config"
	telescopedocs "github.com/sailpoint-oss/telescope/server/docs"
)

func newDocsCmd() *cobra.Command {
	var opts telescopedocs.GenerateOpts

	cmd := &cobra.Command{
		Use:   "docs <spec>",
		Short: "Generate API documentation with printing-press",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			opts.SpecPath = args[0]
			cfg, workspaceRoot, err := loadCommandConfig(args[0])
			if err != nil {
				return err
			}
			applyDocsConfigDefaults(cmd, cfg, workspaceRoot, &opts)
			if opts.Serve && opts.Publish {
				return fmt.Errorf("--serve and --publish cannot be used together")
			}
			if opts.Serve {
				server, err := telescopedocs.Serve(ctx, opts)
				if err != nil {
					return err
				}
				fmt.Fprintln(cmd.OutOrStdout(), server.URL())
				if err := server.Wait(); err != nil && ctx.Err() == nil {
					return err
				}
				return nil
			}
			return telescopedocs.Generate(ctx, opts)
		},
	}

	cmd.Flags().StringVarP(&opts.OutputDir, "output", "o", "./docs", "Output directory")
	cmd.Flags().BoolVar(&opts.Serve, "serve", false, "Start local preview server")
	cmd.Flags().BoolVar(&opts.Publish, "publish", false, "Build for static hosting")
	cmd.Flags().IntVar(&opts.ServePort, "port", 9090, "Port for serve mode")
	cmd.Flags().StringVar(&opts.Theme, "theme", "dark", "Terminal theme")
	cmd.Flags().StringVar(&opts.Title, "title", "", "Override API title")
	cmd.Flags().BoolVar(&opts.NoLLM, "no-llm", false, "Skip LLM output")
	cmd.Flags().BoolVar(&opts.NoJSON, "no-json", false, "Skip JSON artifacts")
	cmd.Flags().BoolVar(&opts.NoHTML, "no-html", false, "Skip HTML output")
	cmd.Flags().StringVar(&opts.BinaryPath, "binary", "", "Override the printing-press binary path")

	return cmd
}

func applyDocsConfigDefaults(cmd *cobra.Command, cfg *config.Config, workspaceRoot string, opts *telescopedocs.GenerateOpts) {
	if cfg == nil || opts == nil {
		return
	}
	pp := cfg.Documentation.PrintingPress
	flags := cmd.Flags()
	if !flags.Changed("output") && strings.TrimSpace(pp.Output) != "" {
		opts.OutputDir = config.ResolveWorkspacePath(workspaceRoot, strings.TrimSpace(pp.Output))
	}
	if !flags.Changed("publish") {
		opts.Publish = pp.Publish
	}
	if !flags.Changed("port") && pp.Preview.Port > 0 {
		opts.ServePort = pp.Preview.Port
	}
	if !flags.Changed("theme") && strings.TrimSpace(pp.Preview.Theme) != "" {
		opts.Theme = strings.TrimSpace(pp.Preview.Theme)
	}
	if !flags.Changed("title") && strings.TrimSpace(pp.Options.Title) != "" {
		opts.Title = strings.TrimSpace(pp.Options.Title)
	}
	if !flags.Changed("no-llm") {
		opts.NoLLM = pp.Options.NoLLM
	}
	if !flags.Changed("no-json") {
		opts.NoJSON = pp.Options.NoJSON
	}
	if !flags.Changed("no-html") {
		opts.NoHTML = pp.Options.NoHTML
	}
	if !flags.Changed("binary") && strings.TrimSpace(pp.Options.Binary) != "" {
		opts.BinaryPath = config.ResolveWorkspacePath(workspaceRoot, strings.TrimSpace(pp.Options.Binary))
	}
}
