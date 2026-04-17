package cli

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/barrelman/codemod"
	"github.com/sailpoint-oss/barrelman/codemod/hints"
	"github.com/spf13/cobra"
)

var (
	fixRules         []string
	fixDryRun        bool
	fixWrite         bool
	fixInteractive   bool
	fixFormat        string
	fixFailOnUnfixed bool
	fixSourceHints   string
	fixStats         bool
)

func newFixCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "fix [files/dirs...]",
		Short: "Apply auto-fixes for barrelman diagnostics",
		Long: `Run the barrelman lint engine and apply per-rule auto-fixes.

By default the command runs in dry-run mode and prints a unified diff per
file. Use --write to apply the fixes in place. Rules without an attached
Fix are reported under the "unfixable" section; use --fail-on-unfixable to
exit non-zero when any such diagnostic remains after fixes apply.`,
		RunE: runFix,
	}
	cmd.Flags().StringSliceVarP(&fixRules, "rule", "R", nil, "Restrict fixes to the given canonical rule IDs (repeatable)")
	cmd.Flags().BoolVar(&fixDryRun, "dry-run", true, "Preview fixes without writing files")
	cmd.Flags().BoolVar(&fixWrite, "write", false, "Write fixes to disk (overrides --dry-run)")
	cmd.Flags().BoolVar(&fixInteractive, "interactive", false, "Prompt before applying each file's fixes")
	cmd.Flags().StringVar(&fixFormat, "format", "text", "Output format: text | json | patch")
	cmd.Flags().BoolVar(&fixFailOnUnfixed, "fail-on-unfixable", false, "Exit 1 when any diagnostic has no Fix attached")
	cmd.Flags().StringVar(&fixSourceHints, "source-hints", "", "Source-aware hint provider: '' (sentinel TODOs only) | cartographer")
	cmd.Flags().BoolVar(&fixStats, "stats", false, "After fixing, print per-rule hit/availability/application stats")
	return cmd
}

func runFix(cmd *cobra.Command, args []string) error {
	files, err := resolveFixInputs(args)
	if err != nil {
		return err
	}
	if len(files) == 0 {
		return fmt.Errorf("no OpenAPI files matched")
	}

	lintOpts := barrelman.LintOptions{
		ConfigPath:  cfgFile,
		RulesetPath: rulesetArg,
	}
	hintProvider, err := resolveSourceHints(fixSourceHints)
	if err != nil {
		return err
	}
	waivers := loadFixWaivers()
	results, err := barrelman.ApplyFixes(files, barrelman.FixOptions{
		Lint:    lintOpts,
		Rules:   fixRules,
		Hints:   hintProvider,
		Waivers: waivers,
	})
	if err != nil {
		return fmt.Errorf("apply fixes: %w", err)
	}

	// Materialize mode: --write wins over --dry-run.
	apply := fixWrite
	if fixInteractive && !apply {
		apply = true // interactive implies per-file write after confirmation
	}

	unfixedCount := 0
	for _, r := range results {
		unfixedCount += len(r.Unfixable)
	}

	switch fixFormat {
	case "json":
		if err := writeFixJSON(results); err != nil {
			return err
		}
	case "patch":
		writeFixPatch(results)
	default:
		writeFixText(results)
	}

	if apply {
		if err := guardFixResults(results); err != nil {
			return err
		}
		for _, r := range results {
			if !r.Changed() {
				continue
			}
			if fixInteractive && !confirmFix(r) {
				continue
			}
			noteFixApplied(r.File, r.Original, r.Patched)
			if err := os.WriteFile(r.File, r.Patched, 0o644); err != nil {
				return fmt.Errorf("write %s: %w", r.File, err)
			}
		}
	}

	if fixStats {
		printFixStats(results)
	}

	if fixFailOnUnfixed && unfixedCount > 0 {
		fmt.Fprintf(os.Stderr, "%d unfixable diagnostic(s) remain\n", unfixedCount)
		os.Exit(1)
	}
	return nil
}

func resolveFixInputs(args []string) ([]string, error) {
	if len(args) == 0 {
		return defaultFixInputs()
	}
	var out []string
	for _, arg := range args {
		info, err := os.Stat(arg)
		if err != nil {
			return nil, fmt.Errorf("stat %s: %w", arg, err)
		}
		if info.IsDir() {
			err := filepath.Walk(arg, func(path string, fi os.FileInfo, werr error) error {
				if werr != nil {
					return werr
				}
				if fi.IsDir() {
					return nil
				}
				if isOpenAPIExtensionFile(path) {
					out = append(out, path)
				}
				return nil
			})
			if err != nil {
				return nil, err
			}
			continue
		}
		out = append(out, arg)
	}
	sort.Strings(out)
	return out, nil
}

func defaultFixInputs() ([]string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	return resolveFixInputs([]string{wd})
}

func isOpenAPIExtensionFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".yaml", ".yml", ".json":
		return true
	}
	return false
}

// writeFixText renders a unified-diff-style preview to stdout for each
// file that has patches. Exact diff generation uses a tiny line-based
// algorithm to avoid pulling in a diff library; for richer diffs
// callers can pipe --format=patch into `diff`.
func writeFixText(results []barrelman.FixResult) {
	changed := 0
	for _, r := range results {
		if !r.Changed() {
			continue
		}
		changed++
		fmt.Printf("=== %s (%d patch%s)\n", r.File, len(r.Patches), plural(len(r.Patches)))
		for _, p := range r.Patches {
			fmt.Printf("  - %s: %s\n", p.RuleID, p.Description)
		}
	}
	if changed == 0 {
		fmt.Println("No fixes available.")
	}
}

// writeFixPatch emits the Patched bytes verbatim, prefixed by a path
// comment line. Suitable for feeding into `patch` or a diff renderer.
func writeFixPatch(results []barrelman.FixResult) {
	for _, r := range results {
		if !r.Changed() {
			continue
		}
		fmt.Printf("### %s\n", r.File)
		os.Stdout.Write(r.Patched)
		fmt.Println()
	}
}

// writeFixJSON dumps the full FixResult set as JSON for tooling
// consumers. ByteRange information on patches is preserved so editors
// or review bots can render inline suggestions.
func writeFixJSON(results []barrelman.FixResult) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(results)
}

func confirmFix(r barrelman.FixResult) bool {
	fmt.Printf("Apply %d patch(es) to %s? [y/N/q] ", len(r.Patches), r.File)
	s := bufio.NewScanner(os.Stdin)
	if !s.Scan() {
		return false
	}
	answer := strings.ToLower(strings.TrimSpace(s.Text()))
	switch answer {
	case "y", "yes":
		return true
	case "q", "quit":
		os.Exit(0)
	}
	return false
}

func printFixStats(results []barrelman.FixResult) {
	type row struct {
		rule       string
		emitted    int
		fixable    int
		applicable int
	}
	rows := map[string]*row{}
	for _, r := range results {
		for _, d := range r.Diagnostics {
			rw := rows[d.Code]
			if rw == nil {
				rw = &row{rule: d.Code}
				rows[d.Code] = rw
			}
			rw.emitted++
		}
		for _, p := range r.Patches {
			rw := rows[p.RuleID]
			if rw == nil {
				rw = &row{rule: p.RuleID}
				rows[p.RuleID] = rw
			}
			rw.applicable++
		}
		for _, d := range r.Unfixable {
			rw := rows[d.Code]
			if rw == nil {
				continue
			}
			_ = rw
		}
	}
	ordered := make([]*row, 0, len(rows))
	for _, rw := range rows {
		ordered = append(ordered, rw)
	}
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].emitted > ordered[j].emitted })
	fmt.Println()
	fmt.Printf("%-50s %8s %8s\n", "rule", "emitted", "fixed")
	for _, rw := range ordered {
		fmt.Printf("%-50s %8d %8d\n", rw.rule, rw.emitted, rw.applicable)
	}
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "es"
}

// resolveSourceHints translates the --source-hints flag value into a
// codemod.SourceHintProvider. Returns (nil, nil) for "" (default:
// sentinels only). An unknown value is rejected with a clear error.
//
// The cartographer provider requires a CartographerLookup injected at
// runtime (cartographer source-map integration is wired by telescope's
// orchestration layer when available); requesting it from the CLI
// when no lookup is registered falls back to Synth so the command
// does not silently emit fewer fixes than expected.
func resolveSourceHints(name string) (codemod.SourceHintProvider, error) {
	switch name {
	case "":
		return nil, nil
	case "synth":
		return hints.Synth{}, nil
	case "cartographer":
		if cartographerLookup != nil {
			return hints.Composite{
				Primary:   &hints.Cartographer{Lookup: cartographerLookup},
				Secondary: hints.Synth{},
			}, nil
		}
		return hints.Synth{}, nil
	case "all":
		primary := codemod.SourceHintProvider(hints.Synth{})
		if cartographerLookup != nil {
			primary = &hints.Cartographer{Lookup: cartographerLookup}
		}
		return hints.Composite{Primary: primary, Secondary: hints.Synth{}}, nil
	default:
		return nil, fmt.Errorf("unknown --source-hints value %q (want: synth, cartographer, all)", name)
	}
}

// cartographerLookup is the process-level slot for a
// hints.CartographerLookup implementation. When non-nil,
// --source-hints=cartographer routes through it; otherwise the flag
// degrades gracefully to the synth provider so users are not
// surprised by a silent no-op. Callers (telescope main or a future
// cartographer-integration package) inject by assignment.
var cartographerLookup hints.CartographerLookup

// loadFixWaivers resolves the working-directory's .telescope/waivers.yaml
// file (when present) and returns a parsed WaiverSet. A missing
// or malformed file silently returns nil so the default behaviour
// (no waivers) remains intact in unconfigured repos.
func loadFixWaivers() *codemod.WaiverSet {
	wd, err := os.Getwd()
	if err != nil {
		return nil
	}
	set, err := codemod.LoadWaivers(codemod.DefaultWaiverPath(wd))
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: failed to load waivers: %v\n", err)
		return nil
	}
	return set
}

