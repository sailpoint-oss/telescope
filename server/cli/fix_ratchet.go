package cli

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sailpoint-oss/barrelman"
)

// codemodLogPath is where the fix subcommand records pre-fix SHA-256
// hashes. One line per (file, timestamp, sha256) tuple. The log lives
// inside .telescope/ so it is per-repo and easy to ignore or commit
// depending on policy.
const codemodLogPath = ".telescope/codemod.log"

// noteFixApplied appends a ratchet entry for a single file about to
// be written. Matches against existing entries warn that a file is
// being fixed a second time without reverting the earlier change.
// Errors writing the log are surfaced as warnings: the ratchet is
// an advisory safety net, not a hard gate.
func noteFixApplied(file string, pre, post []byte) {
	root, err := findRepoRoot(file)
	if err != nil {
		return
	}
	logPath := filepath.Join(root, codemodLogPath)
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		return
	}
	preHash := sha256hex(pre)

	if collision := scanRatchetLog(logPath, file, preHash); collision != "" {
		fmt.Fprintf(os.Stderr, "warning: %s was previously fixed at %s (same pre-fix hash); the earlier fix may be getting undone\n", file, collision)
	}

	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	rel, _ := filepath.Rel(root, file)
	if rel == "" {
		rel = file
	}
	fmt.Fprintf(f, "%s\t%s\t%s\t%s\n",
		time.Now().UTC().Format(time.RFC3339),
		rel,
		preHash,
		sha256hex(post),
	)
}

// scanRatchetLog returns the timestamp of the most recent matching
// entry for (file, preHash), or "" when no match exists. The log is
// small (one line per fixed file) so a linear scan is adequate for
// the lifetime of a fix session.
func scanRatchetLog(logPath, file, preHash string) string {
	f, err := os.Open(logPath)
	if err != nil {
		return ""
	}
	defer f.Close()
	root, _ := findRepoRoot(file)
	rel, _ := filepath.Rel(root, file)
	if rel == "" {
		rel = file
	}
	scanner := bufio.NewScanner(f)
	var match string
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Split(line, "\t")
		if len(fields) < 3 {
			continue
		}
		if fields[1] != rel && fields[1] != file {
			continue
		}
		if fields[2] == preHash {
			match = fields[0]
		}
	}
	return match
}

// findRepoRoot walks up from file to locate the directory containing
// a .git entry (file or dir). Falls back to the file's parent when no
// .git is found, so the log ends up somewhere reasonable for test
// scratch directories.
func findRepoRoot(file string) (string, error) {
	abs, err := filepath.Abs(file)
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(abs)
	for {
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return filepath.Dir(abs), nil
		}
		dir = parent
	}
}

func sha256hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// guardFixResults inspects the FixResult set before writes and
// returns an error when any patch would delete bytes (size < 0).
// The barrelman driver already rejects shrinks under its default
// AllowShrink=false policy; this is a second-layer check for patches
// constructed outside the driver (for example future LLM-authored
// fixes).
func guardFixResults(results []barrelman.FixResult) error {
	for _, r := range results {
		for _, p := range r.Patches {
			if p.Size() < 0 {
				return fmt.Errorf("rejected shrinking patch from rule %q on %s (len %d)", p.RuleID, r.File, p.Size())
			}
		}
	}
	return nil
}
