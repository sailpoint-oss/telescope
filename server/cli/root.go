// Package cli implements the Telescope command-line interface using cobra.
package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/sailpoint-oss/telescope/server/lsp"
)

var (
	cfgFile    string
	rulesetArg string
)

func newRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "telescope",
		Short:   "OpenAPI linter and language server",
		Long:    "Telescope is a fast, extensible OpenAPI linter with an integrated LSP server.",
		Version: lsp.Version,
	}

	cmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "", "Config file path")
	cmd.PersistentFlags().StringVarP(&rulesetArg, "ruleset", "r", "", "Ruleset file or URL")

	cmd.AddCommand(newLintCmd())
	cmd.AddCommand(newCICmd())
	cmd.AddCommand(newServeCmd())

	return cmd
}

// Execute runs the CLI. Call from main.go.
func Execute() {
	if err := newRootCmd().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
