// Package cli implements the Telescope command-line interface using cobra.
package cli

import (
	"fmt"
	"os"

	"github.com/sailpoint-oss/telescope/server/lsp"
	"github.com/spf13/cobra"
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
	cmd.AddCommand(newValidateCmd())
	cmd.AddCommand(newCICmd())
	cmd.AddCommand(newServeCmd())
	cmd.AddCommand(newBundleCmd())
	cmd.AddCommand(newContractCmd())

	return cmd
}

// Execute runs the CLI. Call from main.go.
func Execute() {
	if err := newRootCmd().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
