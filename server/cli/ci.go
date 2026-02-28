package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	diffBase  string
	diffHead  string
	reportMD  string
	reportJSON string
	commentPR bool
	ciFailOn  string
)

func newCICmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "ci",
		Short: "Run CI-mode linting with diff awareness",
		Long:  "Lint OpenAPI files with diff-aware checking, quality gating, and optional GitHub PR integration.",
		RunE:  runCI,
	}

	cmd.Flags().StringVar(&diffBase, "diff-base", "main", "Git ref for base")
	cmd.Flags().StringVar(&diffHead, "diff-head", "HEAD", "Git ref for head")
	cmd.Flags().StringVar(&reportMD, "report-md", "", "Write markdown report to file")
	cmd.Flags().StringVar(&reportJSON, "report-json", "", "Write JSON report to file")
	cmd.Flags().BoolVar(&commentPR, "comment-pr", false, "Post comment to GitHub PR (requires GITHUB_TOKEN)")
	cmd.Flags().StringVar(&ciFailOn, "fail-on", "error", "Quality gate severity")

	return cmd
}

func runCI(cmd *cobra.Command, args []string) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}

	files, err := collectFiles([]string{"."}, cfg)
	if err != nil {
		return err
	}

	if len(files) == 0 {
		fmt.Fprintln(os.Stderr, "No OpenAPI files found")
		return nil
	}

	// TODO: implement diff-aware linting
	// 1. Get changed files between diffBase and diffHead
	// 2. Lint only changed files
	// 3. Generate reports
	// 4. Post PR comment if enabled

	fmt.Fprintf(os.Stderr, "CI mode: checking %d files (base: %s, head: %s)\n", len(files), diffBase, diffHead)

	return runLint(cmd, args)
}
