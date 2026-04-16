package cli

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/sailpoint-oss/telescope/server/diff"
)

var (
	diffFormat         string
	diffBreakingOnly   bool
	diffFailOnBreaking bool
	diffBreakingConfig string
	diffOutput         string
)

func newDiffCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "diff <original> <updated>",
		Short: "Compare two OpenAPI documents for semantic and breaking changes",
		Long:  "Uses libopenapi to detect changes between two specs. Arguments may be file paths or git refs as REF:path (e.g. main:api/openapi.yaml).",
		Args:  cobra.ExactArgs(2),
		RunE:  runDiff,
	}
	cmd.Flags().StringVarP(&diffFormat, "format", "f", "text", "Output format: text, json, markdown, sarif")
	cmd.Flags().BoolVar(&diffBreakingOnly, "breaking-only", false, "Only show breaking changes")
	cmd.Flags().BoolVar(&diffFailOnBreaking, "fail-on-breaking", false, "Exit with code 1 if any breaking changes exist")
	cmd.Flags().StringVar(&diffBreakingConfig, "breaking-config", "", "Path to changes-rules.yaml (openapi-changes format)")
	cmd.Flags().StringVarP(&diffOutput, "output", "o", "", "Write output to file (default: stdout)")
	return cmd
}

func runDiff(cmd *cobra.Command, args []string) error {
	repoRoot := gitRepoRoot()
	if repoRoot == "" {
		repoRoot, _ = os.Getwd()
	}
	left, err := diff.ResolveArg(args[0], repoRoot)
	if err != nil {
		return err
	}
	right, err := diff.ResolveArg(args[1], repoRoot)
	if err != nil {
		return err
	}

	res, err := diff.Compare(left, right, diff.CompareOpts{BreakingRulesPath: diffBreakingConfig})
	if err != nil {
		return err
	}
	if res.CompareErrs != nil {
		fmt.Fprintf(os.Stderr, "warning: compare completed with model errors: %v\n", res.CompareErrs)
	}

	out := os.Stdout
	if diffOutput != "" {
		f, err := os.Create(diffOutput)
		if err != nil {
			return err
		}
		defer f.Close()
		out = f
	}

	opts := diff.FormatOpts{BreakingOnly: diffBreakingOnly}
	switch strings.ToLower(diffFormat) {
	case "text":
		if err := diff.FormatText(res, out, opts); err != nil {
			return err
		}
	case "json":
		if err := diff.FormatJSON(res, out); err != nil {
			return err
		}
	case "markdown", "md":
		if err := diff.FormatMarkdown(res, out, opts); err != nil {
			return err
		}
	case "sarif":
		if err := diff.FormatSARIF(res, out, opts); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unknown format %q", diffFormat)
	}

	if diffFailOnBreaking && res.TotalBreakingChanges() > 0 {
		os.Exit(1)
	}
	return nil
}
